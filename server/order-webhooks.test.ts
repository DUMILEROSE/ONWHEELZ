import { describe, expect, it } from "vitest";
import {
  calculateCommission,
  hashWebhookSecret,
  processOrderWebhook,
  type OrderWebhookPayload,
  type OrderWebhookRepository,
} from "./order-webhooks";

const sellerId = 42;
const secret = "unit-test-secret-that-is-long-and-random-enough";
const validPayload: OrderWebhookPayload = {
  eventId: "evt_order_1048_unique",
  eventType: "order.paid",
  orderReference: "ORDER-1048",
  referralCode: "referralCode123",
  saleAmount: 250,
  currency: "USD",
};

function createRepository(overrides: Partial<OrderWebhookRepository> = {}) {
  const conversions: Parameters<
    OrderWebhookRepository["insertConversion"]
  >[0][] = [];
  const seenEvents = new Set<string>();
  const seenOrders = new Set<string>();
  let lastTouched: Date | null = null;

  const repository: OrderWebhookRepository = {
    getSecretHash: async () => hashWebhookSecret(secret),
    getApprovedPartnership: async (_id, referralCode) =>
      referralCode === validPayload.referralCode
        ? { applicationId: 17, commissionPercent: 12.5 }
        : undefined,
    hasDuplicate: async (_id, eventId, orderReference) =>
      seenEvents.has(eventId) || seenOrders.has(orderReference),
    insertConversion: async input => {
      conversions.push(input);
      seenEvents.add(input.eventId);
      seenOrders.add(input.orderReference);
    },
    touchIntegration: async (_id, at) => {
      lastTouched = at;
    },
    ...overrides,
  };
  return {
    repository,
    conversions,
    wasTouched: () => lastTouched instanceof Date,
  };
}

describe("ONWHEELZ order webhooks", () => {
  it("records a paid order against its approved referral and rounds commission to cents", async () => {
    const store = createRepository();
    const result = await processOrderWebhook(
      sellerId,
      secret,
      validPayload,
      store.repository
    );

    expect(result).toMatchObject({
      received: true,
      duplicate: false,
      commissionAmount: "31.25",
    });
    expect(store.conversions).toEqual([
      {
        sellerId,
        applicationId: 17,
        eventId: validPayload.eventId,
        orderReference: validPayload.orderReference,
        saleAmount: "250.00",
        commissionAmount: "31.25",
      },
    ]);
    expect(store.wasTouched()).toBe(true);
  });

  it("acknowledges repeated deliveries without creating another conversion", async () => {
    const store = createRepository();
    await processOrderWebhook(sellerId, secret, validPayload, store.repository);
    const duplicate = await processOrderWebhook(
      sellerId,
      secret,
      validPayload,
      store.repository
    );

    expect(duplicate).toEqual({ received: true, duplicate: true });
    expect(store.conversions).toHaveLength(1);
  });

  it("acknowledges a duplicate that races between the precheck and insert", async () => {
    const store = createRepository({
      insertConversion: async () => {
        throw Object.assign(new Error("duplicate key"), {
          code: "ER_DUP_ENTRY",
        });
      },
    });

    await expect(
      processOrderWebhook(sellerId, secret, validPayload, store.repository)
    ).resolves.toEqual({ received: true, duplicate: true });
    expect(store.wasTouched()).toBe(true);
  });

  it("rejects an invalid secret without exposing whether a referral exists", async () => {
    const store = createRepository();

    await expect(
      processOrderWebhook(
        sellerId,
        "wrong-secret",
        validPayload,
        store.repository
      )
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it("rejects extra customer fields and unsupported events before database lookup", async () => {
    let secretLookups = 0;
    const store = createRepository({
      getSecretHash: async () => {
        secretLookups += 1;
        return hashWebhookSecret(secret);
      },
    });

    await expect(
      processOrderWebhook(
        sellerId,
        secret,
        { ...validPayload, customerEmail: "buyer@example.com" },
        store.repository
      )
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      processOrderWebhook(
        sellerId,
        secret,
        { ...validPayload, eventType: "order.created" },
        store.repository
      )
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(secretLookups).toBe(0);
  });

  it("accepts only a seller's approved referral code", async () => {
    const store = createRepository();
    await expect(
      processOrderWebhook(
        sellerId,
        secret,
        { ...validPayload, referralCode: "unapprovedCode123" },
        store.repository
      )
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("uses integer-cent arithmetic for commission estimates", () => {
    expect(calculateCommission(119.99, 12.5)).toEqual({
      saleAmount: "119.99",
      commissionAmount: "15.00",
    });
  });
});
