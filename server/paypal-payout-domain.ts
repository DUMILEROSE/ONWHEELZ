import type {
  PayPalPayoutItemResult,
  PayPalPayoutBatchSnapshot,
} from "./paypal-client";

export type LocalPayPalItemStatus =
  | "draft"
  | "pending"
  | "succeeded"
  | "failed"
  | "blocked"
  | "returned"
  | "unclaimed"
  | "unknown";

export type LocalPayPalBatchStatus =
  | "draft"
  | "submitting"
  | "submitted"
  | "processing"
  | "succeeded"
  | "partially_succeeded"
  | "failed"
  | "unknown"
  | "cancelled";

/** Parse a database decimal/string into integer cents without floating-point drift. */
export function usdCents(value: string | number): number {
  const normalized =
    typeof value === "number" ? value.toFixed(2) : value.trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match)
    throw new Error("Commission amount must be a non-negative USD decimal");
  const cents =
    Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0") || 0);
  if (!Number.isSafeInteger(cents))
    throw new Error("Commission amount exceeds the safe limit");
  return cents;
}

export function centsToUsd(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new Error("Invalid USD cent amount");
  }
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

/** PayPal request/batch idempotency is time-bounded; stop retries one day early. */
export const PAYPAL_AMBIGUOUS_RETRY_WINDOW_MS = 29 * 24 * 60 * 60 * 1000;

export function canRetryAmbiguousPayPalBatch(
  firstAttemptAt: Date | null | undefined,
  now = Date.now()
): boolean {
  if (!firstAttemptAt) return false;
  const firstAttemptMs = firstAttemptAt.getTime();
  if (!Number.isFinite(firstAttemptMs)) return false;
  return now - firstAttemptMs < PAYPAL_AMBIGUOUS_RETRY_WINDOW_MS;
}

export function mapPayPalItemStatus(status?: string): LocalPayPalItemStatus {
  switch ((status ?? "").toUpperCase()) {
    case "SUCCESS":
    case "SUCCEEDED":
      return "succeeded";
    case "FAILED":
    case "DENIED":
      return "failed";
    case "BLOCKED":
      return "blocked";
    case "RETURNED":
      return "returned";
    case "UNCLAIMED":
      return "unclaimed";
    case "PENDING":
    case "PROCESSING":
    case "ONHOLD":
    case "ON_HOLD":
      return "pending";
    default:
      return "unknown";
  }
}

export function summarizeBatchStatus(
  itemStatuses: LocalPayPalItemStatus[],
  providerStatus?: string
): LocalPayPalBatchStatus {
  if (itemStatuses.length === 0) return "unknown";
  if (itemStatuses.every(status => status === "succeeded")) return "succeeded";
  const finalFailures = new Set<LocalPayPalItemStatus>([
    "failed",
    "blocked",
    "returned",
  ]);
  const terminal = itemStatuses.every(
    status => status === "succeeded" || finalFailures.has(status)
  );
  if (terminal) {
    return itemStatuses.some(status => status === "succeeded")
      ? "partially_succeeded"
      : "failed";
  }
  const knownProviderStatus = (providerStatus ?? "").toUpperCase();
  if (
    knownProviderStatus === "PENDING" ||
    knownProviderStatus === "PROCESSING"
  ) {
    return "processing";
  }
  if (knownProviderStatus === "DENIED" || knownProviderStatus === "CANCELED") {
    return "failed";
  }
  return "processing";
}

export interface MinimalPayPalWebhookEvent {
  id: string;
  event_type: string;
  resource?: {
    payout_item_id?: string;
    payout_batch_id?: string;
    batch_header?: { payout_batch_id?: string };
  };
}

export function parseMinimalPayPalWebhookEvent(
  value: unknown
): MinimalPayPalWebhookEvent {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid PayPal webhook event");
  }
  const event = value as Partial<MinimalPayPalWebhookEvent>;
  if (
    typeof event.id !== "string" ||
    event.id.length < 1 ||
    event.id.length > 80 ||
    typeof event.event_type !== "string" ||
    event.event_type.length < 1 ||
    event.event_type.length > 120
  ) {
    throw new Error("Invalid PayPal webhook event metadata");
  }
  const resource =
    event.resource && typeof event.resource === "object"
      ? event.resource
      : undefined;
  return {
    id: event.id,
    event_type: event.event_type,
    resource: resource
      ? {
          payout_item_id: resource.payout_item_id,
          payout_batch_id: resource.payout_batch_id,
          batch_header: resource.batch_header
            ? { payout_batch_id: resource.batch_header.payout_batch_id }
            : undefined,
        }
      : undefined,
  };
}

export function matchPayPalItems(
  snapshot: PayPalPayoutBatchSnapshot
): Map<string, PayPalPayoutItemResult> {
  const matched = new Map<string, PayPalPayoutItemResult>();
  for (const item of snapshot.items ?? []) {
    if (item.sender_item_id) matched.set(item.sender_item_id, item);
  }
  return matched;
}
