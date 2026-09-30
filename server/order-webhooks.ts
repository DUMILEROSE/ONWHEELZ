import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/** Normalized, privacy-minimal event contract; buyer/customer fields are rejected. */
export const orderWebhookPayloadSchema = z
  .object({
    eventId: z
      .string()
      .trim()
      .min(8)
      .max(120)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
    eventType: z.literal("order.paid"),
    orderReference: z.string().trim().min(2).max(120),
    referralCode: z.string().regex(/^[A-Za-z0-9_-]{12,32}$/),
    saleAmount: z
      .number()
      .positive()
      .max(999999999)
      .refine(value => Math.round(value * 100) >= 1),
    currency: z.literal("USD"),
  })
  .strict();

export type OrderWebhookPayload = z.infer<typeof orderWebhookPayloadSchema>;

export class OrderWebhookError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "OrderWebhookError";
  }
}

export function hashWebhookSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

export function verifyWebhookSecret(candidate: string, storedHash: string) {
  if (
    !candidate ||
    candidate.length > 256 ||
    !/^[a-f0-9]{64}$/i.test(storedHash)
  )
    return false;
  const candidateHash = Buffer.from(hashWebhookSecret(candidate), "hex");
  const expectedHash = Buffer.from(storedHash, "hex");
  return (
    candidateHash.length === expectedHash.length &&
    timingSafeEqual(candidateHash, expectedHash)
  );
}

export function calculateCommission(
  saleAmount: number,
  commissionPercent: number
) {
  const saleCents = Math.round(saleAmount * 100);
  const commissionCents = Math.round((saleCents * commissionPercent) / 100);
  return {
    saleAmount: (saleCents / 100).toFixed(2),
    commissionAmount: (commissionCents / 100).toFixed(2),
  };
}

export type OrderWebhookRepository = {
  getSecretHash(sellerId: number): Promise<string | undefined>;
  getApprovedPartnership(
    sellerId: number,
    referralCode: string
  ): Promise<{ applicationId: number; commissionPercent: number } | undefined>;
  hasDuplicate(
    sellerId: number,
    eventId: string,
    orderReference: string
  ): Promise<boolean>;
  insertConversion(input: {
    sellerId: number;
    applicationId: number;
    eventId: string;
    orderReference: string;
    saleAmount: string;
    commissionAmount: string;
  }): Promise<void>;
  touchIntegration(sellerId: number, at: Date): Promise<void>;
};

function isUniqueConflict(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const dbError = error as { code?: string; errno?: number };
  return dbError.code === "ER_DUP_ENTRY" || dbError.errno === 1062;
}

export async function processOrderWebhook(
  sellerId: number,
  providedSecret: string,
  input: unknown,
  repository: OrderWebhookRepository
) {
  if (!Number.isSafeInteger(sellerId) || sellerId <= 0)
    throw new OrderWebhookError(400, "Invalid seller endpoint.");

  const parsed = orderWebhookPayloadSchema.safeParse(input);
  if (!parsed.success)
    throw new OrderWebhookError(400, "Invalid order webhook payload.");

  const expectedHash = await repository.getSecretHash(sellerId);
  if (!expectedHash || !verifyWebhookSecret(providedSecret, expectedHash))
    throw new OrderWebhookError(401, "Webhook authentication failed.");

  const payload = parsed.data;
  const partnership = await repository.getApprovedPartnership(
    sellerId,
    payload.referralCode
  );
  if (!partnership)
    throw new OrderWebhookError(
      404,
      "No approved ONWHEELZ partnership matches this referral code."
    );

  const receivedAt = new Date();
  if (
    await repository.hasDuplicate(
      sellerId,
      payload.eventId,
      payload.orderReference
    )
  ) {
    await repository.touchIntegration(sellerId, receivedAt);
    return { received: true, duplicate: true } as const;
  }

  const amounts = calculateCommission(
    payload.saleAmount,
    partnership.commissionPercent
  );
  try {
    await repository.insertConversion({
      sellerId,
      applicationId: partnership.applicationId,
      eventId: payload.eventId,
      orderReference: payload.orderReference,
      saleAmount: amounts.saleAmount,
      commissionAmount: amounts.commissionAmount,
    });
  } catch (error) {
    // Unique event/order keys also make simultaneous Shopify/provider retries safe.
    if (!isUniqueConflict(error)) throw error;
    await repository.touchIntegration(sellerId, receivedAt);
    return { received: true, duplicate: true } as const;
  }

  await repository.touchIntegration(sellerId, receivedAt);
  return {
    received: true,
    duplicate: false,
    commissionAmount: amounts.commissionAmount,
  } as const;
}
