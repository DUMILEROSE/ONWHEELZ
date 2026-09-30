import { TRPCError } from "@trpc/server";
import {
  attachKnownPayPalBatchId,
  decryptPayoutRecipient,
  findPayPalBatchByExternalId,
  getPayPalBatchForSend,
  getPayPalBatchById,
  getPayPalPayoutBatches,
  getPayPalPayoutOverview,
  markPayPalBatchSubmitted,
  markPayPalBatchUnknown,
  recordPayPalWebhookEvent,
  savePayPalBatchSnapshot,
  setPayPalBatchSending,
  createPayPalPayoutDraft,
} from "./paypal-payout-store";
import {
  getPayPalRuntimeConfig,
  getPayPalSetupState,
  PayPalApiError,
  PayPalClient,
} from "./paypal-client";
import { parseMinimalPayPalWebhookEvent } from "./paypal-payout-domain";
import type { PayPalEnvironment } from "./paypal-client";

export function getPayoutAdminOverview() {
  return Promise.all([
    getPayPalPayoutOverview(),
    getPayPalPayoutBatches(25),
  ]).then(([eligible, batches]) => ({
    setup: getPayPalSetupState(),
    eligible,
    batches,
  }));
}

export function preparePayPalPayout(
  adminUserId: number,
  conversionIds: number[]
) {
  const config = getPayPalRuntimeConfig();
  return createPayPalPayoutDraft(
    adminUserId,
    conversionIds,
    config.environment
  );
}

function requirePayoutSetup(environment: PayPalEnvironment, readOnly = false) {
  const config = getPayPalRuntimeConfig();
  const setup = getPayPalSetupState();
  if (config.environment !== environment) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "The payout draft’s PayPal mode does not match the configured environment.",
    });
  }
  if (!config.clientId || !config.clientSecret) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "PayPal API credentials are required to check payout status.",
    });
  }
  if (!readOnly && !config.payoutsEnabled) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "PayPal payout sending is disabled. Enable it only after testing in Sandbox.",
    });
  }
  if (!readOnly && !setup.ready) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `PayPal is not fully configured (${setup.missing.join(", ")}).`,
    });
  }
  return config;
}

export async function sendPayPalPayout(batchId: number) {
  const record = await getPayPalBatchForSend(batchId);
  const config = requirePayoutSetup(record.batch.environment);
  if (record.batch.paypalBatchId) {
    return refreshPayPalPayout(batchId);
  }
  if (!["draft", "unknown", "submitting"].includes(record.batch.status)) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "This payout batch is already submitted or closed.",
    });
  }
  const items = record.items.map(item => ({
    recipient_type: "EMAIL" as const,
    sender_item_id: item.senderItemId,
    receiver: decryptPayoutRecipient(item.recipientCiphertext),
    amount: { value: item.amount, currency: "USD" as const },
    note: "Approved ONWHEELZ affiliate commission",
  }));

  await setPayPalBatchSending(batchId);
  let response;
  try {
    response = await new PayPalClient(config).createPayoutBatch(
      record.batch.senderBatchId,
      items
    );
  } catch (error) {
    const failureCode =
      error instanceof PayPalApiError
        ? `PAYPAL_HTTP_${error.status || "NETWORK"}`
        : "PAYPAL_SUBMISSION_UNKNOWN";
    // The remote request may have succeeded despite a lost response. Keep the
    // conversions reserved and retry only with the same sender batch ID.
    await markPayPalBatchUnknown(batchId, failureCode);
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "PayPal’s response was not conclusive. Commissions remain reserved; retry only with this same batch so PayPal’s idempotency check prevents a duplicate.",
    });
  }

  const paypalBatchId = response.batch_header?.payout_batch_id;
  if (!paypalBatchId) {
    await markPayPalBatchUnknown(batchId, "PAYPAL_RESPONSE_MISSING_BATCH_ID");
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "PayPal accepted no confirmable batch ID. This batch is reserved for manual reconciliation; do not create a replacement batch.",
    });
  }
  await markPayPalBatchSubmitted(batchId, paypalBatchId);
  // Immediate GET is best-effort; the successful POST and external batch ID
  // are already persisted before making any additional network request.
  try {
    const snapshot = await new PayPalClient(config).getPayoutBatch(
      paypalBatchId
    );
    return await savePayPalBatchSnapshot(batchId, snapshot);
  } catch {
    return getPayPalBatchById(batchId);
  }
}

export async function refreshPayPalPayout(batchId: number) {
  const record = await getPayPalBatchForSend(batchId);
  if (!record.batch.paypalBatchId) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "PayPal has not returned a batch ID. Use the same idempotent batch to retry, or reconcile it in PayPal before taking another action.",
    });
  }
  const config = requirePayoutSetup(record.batch.environment, true);
  const snapshot = await new PayPalClient(config).getPayoutBatch(
    record.batch.paypalBatchId
  );
  return savePayPalBatchSnapshot(batchId, snapshot);
}

export async function reconcileKnownPayPalBatch(
  batchId: number,
  paypalBatchId: string
) {
  await attachKnownPayPalBatchId(batchId, paypalBatchId);
  return refreshPayPalPayout(batchId);
}

export async function handleVerifiedPayPalWebhook(rawEvent: unknown) {
  const event = parseMinimalPayPalWebhookEvent(rawEvent);
  if (
    !event.event_type.startsWith("PAYMENT.PAYOUTSBATCH.") &&
    !event.event_type.startsWith("PAYMENT.PAYOUTS-ITEM.")
  ) {
    return { accepted: true, ignored: true } as const;
  }
  const paypalBatchId =
    event.resource?.payout_batch_id ??
    event.resource?.batch_header?.payout_batch_id;
  if (!paypalBatchId) return { accepted: true, ignored: true } as const;
  const batchId = await findPayPalBatchByExternalId(paypalBatchId);
  if (!batchId) throw new Error("The payout batch has not been recorded yet");

  const config = getPayPalRuntimeConfig();
  const localBatch = await getPayPalBatchForSend(batchId);
  if (localBatch.batch.environment !== config.environment) {
    throw new Error(
      "PayPal webhook environment does not match the saved payout batch"
    );
  }
  const snapshot = await new PayPalClient(config).getPayoutBatch(paypalBatchId);
  const result = await savePayPalBatchSnapshot(batchId, snapshot);
  await recordPayPalWebhookEvent(event.id, event.event_type);
  return { accepted: true, ignored: false, batchId: result.id } as const;
}
