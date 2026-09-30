import { describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";
import {
  decryptPayPalRecipientEmail,
  encryptPayPalRecipientEmail,
} from "./paypal-crypto";
import {
  getPayPalSetupState,
  PayPalApiError,
  PayPalClient,
  type PayPalRuntimeConfig,
} from "./paypal-client";
import {
  canRetryAmbiguousPayPalBatch,
  centsToUsd,
  mapPayPalItemStatus,
  parseMinimalPayPalWebhookEvent,
  summarizeBatchStatus,
  usdCents,
} from "./paypal-payout-domain";

const encryptionEnv = {
  PAYPAL_RECIPIENT_ENCRYPTION_KEY: Buffer.alloc(32, 0x71).toString("base64"),
};

const clientConfig: PayPalRuntimeConfig = {
  environment: "sandbox",
  apiBaseUrl: "https://api-m.sandbox.paypal.com",
  clientId: "sandbox-client",
  clientSecret: "sandbox-secret",
  webhookId: "sandbox-webhook-id",
  senderCountry: "",
  payoutsEnabled: true,
};

function createUserContext(): TrpcContext {
  return {
    user: {
      id: 28,
      openId: "regular-onwheelz-user",
      name: "Affiliate",
      email: "affiliate@example.test",
      loginMethod: "test",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
}

function response(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("PayPal recipient encryption", () => {
  it("encrypts with fresh authenticated ciphertext and normalizes on decrypt", () => {
    const first = encryptPayPalRecipientEmail(
      "  Affiliate@Example.com ",
      encryptionEnv
    );
    const second = encryptPayPalRecipientEmail(
      "affiliate@example.com",
      encryptionEnv
    );
    expect(first).not.toBe(second);
    expect(first).not.toContain("affiliate@example.com");
    expect(decryptPayPalRecipientEmail(first, encryptionEnv)).toBe(
      "affiliate@example.com"
    );
  });

  it("rejects tampering, malformed email, and missing encryption keys", () => {
    const encrypted = encryptPayPalRecipientEmail(
      "affiliate@example.com",
      encryptionEnv
    );
    const parts = encrypted.split(".");
    parts[2] = `${parts[2]?.startsWith("A") ? "B" : "A"}${parts[2]?.slice(1)}`;
    expect(() =>
      decryptPayPalRecipientEmail(parts.join("."), encryptionEnv)
    ).toThrow();
    expect(() =>
      encryptPayPalRecipientEmail("not-an-email", encryptionEnv)
    ).toThrow();
    expect(() =>
      encryptPayPalRecipientEmail("affiliate@example.com", {})
    ).toThrow("PayPal recipient encryption is not configured");
  });
});

describe("PayPal payout domain", () => {
  it("allows only ambiguous retries within the conservative 29-day window", () => {
    const now = Date.UTC(2026, 8, 30, 9, 0, 0);
    expect(
      canRetryAmbiguousPayPalBatch(
        new Date(now - 28 * 24 * 60 * 60 * 1000),
        now
      )
    ).toBe(true);
    expect(
      canRetryAmbiguousPayPalBatch(
        new Date(now - 29 * 24 * 60 * 60 * 1000),
        now
      )
    ).toBe(false);
    expect(canRetryAmbiguousPayPalBatch(null, now)).toBe(false);
  });

  it("uses exact integer USD cents for aggregation and formatting", () => {
    expect(usdCents("19.90") + usdCents("0.10")).toBe(2000);
    expect(centsToUsd(usdCents("19.90"))).toBe("19.90");
    expect(() => usdCents("1.234")).toThrow();
    expect(() => usdCents("-4.00")).toThrow();
  });

  it("maps provider item results and partially successful batch statuses", () => {
    expect(mapPayPalItemStatus("SUCCESS")).toBe("succeeded");
    expect(mapPayPalItemStatus("UNCLAIMED")).toBe("unclaimed");
    expect(mapPayPalItemStatus("BLOCKED")).toBe("blocked");
    expect(summarizeBatchStatus(["succeeded", "failed"])).toBe(
      "partially_succeeded"
    );
    expect(summarizeBatchStatus(["failed", "returned"])).toBe("failed");
    expect(summarizeBatchStatus(["blocked"])).toBe("failed");
    expect(summarizeBatchStatus(["pending"], "PROCESSING")).toBe("processing");
  });

  it("keeps only PayPal event metadata and enforces bounded identifiers", () => {
    expect(
      parseMinimalPayPalWebhookEvent({
        id: "WH-100",
        event_type: "PAYMENT.PAYOUTSBATCH.SUCCESS",
        resource: {
          payout_batch_id: "PAYOUT-123",
          recipient_email: "must-not-persist@example.com",
        },
      })
    ).toEqual({
      id: "WH-100",
      event_type: "PAYMENT.PAYOUTSBATCH.SUCCESS",
      resource: { payout_batch_id: "PAYOUT-123" },
    });
    expect(() =>
      parseMinimalPayPalWebhookEvent({
        id: "",
        event_type: "PAYMENT.PAYOUTSBATCH.SUCCESS",
      })
    ).toThrow();
  });
});

describe("PayPal REST client", () => {
  it("reuses OAuth and sends a stable idempotency key with the exact batch reference", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fakeFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.endsWith("/v1/oauth2/token")) {
        return response({
          access_token: "sandbox-access-token",
          expires_in: 3600,
        });
      }
      return response({ batch_header: { payout_batch_id: "BATCH-900" } }, 201);
    };
    const client = new PayPalClient(clientConfig, fakeFetch);
    const created = await client.createPayoutBatch("stable_batch_012345", [
      {
        recipient_type: "EMAIL",
        sender_item_id: "stable_item_012345",
        receiver: "affiliate@example.test",
        amount: { value: "25.50", currency: "USD" },
        note: "Approved ONWHEELZ affiliate commission",
      },
    ]);
    expect(created.batch_header?.payout_batch_id).toBe("BATCH-900");
    const apiCall = calls[1];
    expect(apiCall?.url).toBe(
      "https://api-m.sandbox.paypal.com/v1/payments/payouts"
    );
    expect(
      (apiCall?.init?.headers as Record<string, string>)["PayPal-Request-Id"]
    ).toBe("stable_batch_012345");
    expect(JSON.parse(String(apiCall?.init?.body)).items[0].amount).toEqual({
      value: "25.50",
      currency: "USD",
    });
    expect(
      JSON.parse(String(apiCall?.init?.body)).items[0].recipient_type
    ).toBe("EMAIL");
    expect(
      calls.filter(call => call.url.endsWith("/v1/oauth2/token"))
    ).toHaveLength(1);
  });

  it("verifies webhooks through PayPal and treats 5xx create responses as retryable", async () => {
    let callIndex = 0;
    const fakeFetch: typeof fetch = async () => {
      callIndex += 1;
      if (callIndex === 1)
        return response({ access_token: "token", expires_in: 900 });
      return response({ verification_status: "SUCCESS" });
    };
    const client = new PayPalClient(clientConfig, fakeFetch);
    await expect(
      client.verifyWebhookSignature(
        {
          authAlgo: "SHA256withRSA",
          certUrl: "https://api.paypal.com/cert",
          transmissionId: "transmission-1",
          transmissionSignature: "signature",
          transmissionTime: "2026-09-28T10:00:00Z",
        },
        { id: "event-1", event_type: "PAYMENT.PAYOUTSBATCH.SUCCESS" }
      )
    ).resolves.toBe(true);

    let failureCall = 0;
    const failingFetch: typeof fetch = async () => {
      failureCall += 1;
      return failureCall === 1
        ? response({ access_token: "token", expires_in: 900 })
        : response({ name: "INTERNAL_SERVER_ERROR" }, 503);
    };
    const failingClient = new PayPalClient(clientConfig, failingFetch);
    await expect(
      failingClient.createPayoutBatch("stable_batch_987654", [
        {
          recipient_type: "EMAIL",
          sender_item_id: "stable_item_987654",
          receiver: "affiliate@example.test",
          amount: { value: "5.00", currency: "USD" },
          note: "Approved ONWHEELZ affiliate commission",
        },
      ])
    ).rejects.toMatchObject<Partial<PayPalApiError>>({
      retryable: true,
      status: 503,
    });
  });

  it("keeps outbound sending paused by default and reports only missing setting names", () => {
    const state = getPayPalSetupState({
      PAYPAL_ENVIRONMENT: "sandbox",
      PAYPAL_CLIENT_ID: "client-id",
      PAYPAL_CLIENT_SECRET: "secret",
      PAYPAL_WEBHOOK_ID: "hook-id",
      PAYPAL_RECIPIENT_ENCRYPTION_KEY:
        encryptionEnv.PAYPAL_RECIPIENT_ENCRYPTION_KEY,
    });
    expect(state.environment).toBe("sandbox");
    expect(state.payoutsEnabled).toBe(false);
    expect(state.ready).toBe(false);
    expect(state.missing).toEqual([]);
  });

  it("marks a malformed recipient-encryption key as missing without revealing it", () => {
    const state = getPayPalSetupState({
      PAYPAL_CLIENT_ID: "client-id",
      PAYPAL_CLIENT_SECRET: "secret",
      PAYPAL_WEBHOOK_ID: "hook-id",
      PAYPAL_RECIPIENT_ENCRYPTION_KEY: "not-a-valid-key",
      PAYPAL_PAYOUTS_ENABLED: "true",
    });
    expect(state.ready).toBe(false);
    expect(state.missing).toEqual(["PAYPAL_RECIPIENT_ENCRYPTION_KEY"]);
    expect(JSON.stringify(state)).not.toContain("not-a-valid-key");
  });
});

describe("PayPal access controls", () => {
  it("rejects regular users from all network payout procedures before database access", async () => {
    const caller = appRouter.createCaller(createUserContext());
    await expect(caller.network.paypalPayoutOverview()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      caller.network.preparePaypalPayout({ conversionIds: [1] })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller.network.sendPaypalPayout({ batchId: 1 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller.network.reconcilePaypalBatch({
        batchId: 1,
        paypalBatchId: "PAYOUT-12345",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller.affiliate.savePayPalRecipient({ email: "affiliate@example.test" })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});
