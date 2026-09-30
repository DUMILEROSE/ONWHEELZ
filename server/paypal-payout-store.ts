import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  affiliateApplications,
  affiliateConversions,
  affiliateProfiles,
  offers,
  paypalPayoutBatches,
  paypalPayoutConversions,
  paypalPayoutItems,
  paypalWebhookEvents,
  users,
} from "../drizzle/schema";
import { getDb } from "./db";
import { decryptPayPalRecipientEmail } from "./paypal-crypto";
import {
  canRetryAmbiguousPayPalBatch,
  centsToUsd,
  mapPayPalItemStatus,
  matchPayPalItems,
  summarizeBatchStatus,
  usdCents,
} from "./paypal-payout-domain";
import type {
  PayPalEnvironment,
  PayPalPayoutBatchSnapshot,
} from "./paypal-client";

export async function saveAffiliatePayPalRecipient(
  userId: number,
  encryptedEmail: string | null
) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [profile] = await db
    .select({ id: affiliateProfiles.id })
    .from(affiliateProfiles)
    .where(eq(affiliateProfiles.userId, userId))
    .limit(1);
  if (!profile)
    throw new Error("Save your affiliate profile before setting PayPal");
  await db
    .update(affiliateProfiles)
    .set({ paypalRecipientCiphertext: encryptedEmail, updatedAt: new Date() })
    .where(eq(affiliateProfiles.id, profile.id));
}

export async function removeAffiliatePayPalRecipient(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.transaction(async tx => {
    const [profile] = await tx
      .select({ id: affiliateProfiles.id })
      .from(affiliateProfiles)
      .where(eq(affiliateProfiles.userId, userId))
      .for("update")
      .limit(1);
    if (!profile) throw new Error("Affiliate profile not found");
    const [activeItem] = await tx
      .select({ id: paypalPayoutItems.id })
      .from(paypalPayoutItems)
      .innerJoin(
        paypalPayoutBatches,
        eq(paypalPayoutItems.batchId, paypalPayoutBatches.id)
      )
      .where(
        and(
          eq(paypalPayoutItems.affiliateProfileId, profile.id),
          inArray(paypalPayoutBatches.status, [
            "draft",
            "submitting",
            "unknown",
          ])
        )
      )
      .limit(1);
    if (activeItem) {
      throw new Error(
        "Cancel or reconcile the unsent PayPal batch before unlinking your recipient"
      );
    }
    await tx
      .update(affiliateProfiles)
      .set({ paypalRecipientCiphertext: null, updatedAt: new Date() })
      .where(eq(affiliateProfiles.id, profile.id));
  });
}

export async function getPayPalPayoutOverview() {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const rows = await db
    .select({
      conversionId: affiliateConversions.id,
      affiliateProfileId: affiliateProfiles.id,
      affiliateName: users.name,
      recipientConfigured: affiliateProfiles.paypalRecipientCiphertext,
      verificationStatus: affiliateProfiles.verificationStatus,
      amount: affiliateConversions.commissionAmount,
      currency: offers.currency,
      createdAt: affiliateConversions.createdAt,
    })
    .from(affiliateConversions)
    .innerJoin(
      affiliateApplications,
      eq(affiliateConversions.applicationId, affiliateApplications.id)
    )
    .innerJoin(
      affiliateProfiles,
      eq(affiliateApplications.affiliateUserId, affiliateProfiles.userId)
    )
    .innerJoin(users, eq(affiliateProfiles.userId, users.id))
    .innerJoin(offers, eq(affiliateApplications.offerId, offers.id))
    .where(eq(affiliateConversions.status, "approved"))
    .orderBy(desc(affiliateConversions.createdAt));

  const groups = new Map<
    number,
    {
      affiliateProfileId: number;
      affiliateName: string;
      hasPayPalRecipient: boolean;
      conversionIds: number[];
      conversionCount: number;
      amountCents: number;
      currency: string;
      eligible: boolean;
    }
  >();
  for (const row of rows) {
    const cents = usdCents(row.amount);
    const group = groups.get(row.affiliateProfileId) ?? {
      affiliateProfileId: row.affiliateProfileId,
      affiliateName: row.affiliateName || "ONWHEELZ affiliate",
      hasPayPalRecipient: Boolean(row.recipientConfigured),
      conversionIds: [],
      conversionCount: 0,
      amountCents: 0,
      currency: row.currency,
      eligible: row.verificationStatus === "verified" && row.currency === "USD",
    };
    group.conversionIds.push(row.conversionId);
    group.conversionCount += 1;
    group.amountCents += cents;
    group.eligible &&=
      row.verificationStatus === "verified" && row.currency === "USD";
    groups.set(row.affiliateProfileId, group);
  }

  return Array.from(groups.values())
    .sort((a, b) => b.amountCents - a.amountCents)
    .map(({ amountCents, ...group }) => ({
      ...group,
      amount: centsToUsd(amountCents),
      ready: group.eligible && group.hasPayPalRecipient && amountCents > 0,
    }));
}

export async function createPayPalPayoutDraft(
  adminUserId: number,
  conversionIds: number[],
  environment: PayPalEnvironment
) {
  if (!conversionIds.length || conversionIds.length > 1000) {
    throw new Error("Select between 1 and 1,000 approved commissions");
  }
  const uniqueIds = Array.from(new Set(conversionIds));
  if (uniqueIds.length !== conversionIds.length) {
    throw new Error("A commission may only be selected once");
  }

  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");

  return db.transaction(async tx => {
    const rows = await tx
      .select({
        conversionId: affiliateConversions.id,
        amount: affiliateConversions.commissionAmount,
        status: affiliateConversions.status,
        affiliateProfileId: affiliateProfiles.id,
        affiliateName: users.name,
        verificationStatus: affiliateProfiles.verificationStatus,
        recipientCiphertext: affiliateProfiles.paypalRecipientCiphertext,
        currency: offers.currency,
      })
      .from(affiliateConversions)
      .innerJoin(
        affiliateApplications,
        eq(affiliateConversions.applicationId, affiliateApplications.id)
      )
      .innerJoin(
        affiliateProfiles,
        eq(affiliateApplications.affiliateUserId, affiliateProfiles.userId)
      )
      .innerJoin(users, eq(affiliateProfiles.userId, users.id))
      .innerJoin(offers, eq(affiliateApplications.offerId, offers.id))
      .where(inArray(affiliateConversions.id, uniqueIds))
      .for("update");

    if (
      rows.length !== uniqueIds.length ||
      rows.some(row => row.status !== "approved")
    ) {
      throw new Error(
        "One or more commissions are no longer approved and available"
      );
    }
    if (rows.some(row => row.verificationStatus !== "verified")) {
      throw new Error(
        "Only internally verified affiliates can enter a payout batch"
      );
    }
    if (rows.some(row => row.currency !== "USD")) {
      throw new Error(
        "This PayPal batch currently supports USD commissions only"
      );
    }
    if (rows.some(row => !row.recipientCiphertext)) {
      throw new Error(
        "Every selected affiliate must save a PayPal recipient email first"
      );
    }

    const grouped = new Map<
      number,
      {
        name: string;
        emailCiphertext: string;
        conversionIds: number[];
        cents: number;
      }
    >();
    for (const row of rows) {
      const existing = grouped.get(row.affiliateProfileId) ?? {
        name: row.affiliateName || "ONWHEELZ affiliate",
        emailCiphertext: row.recipientCiphertext!,
        conversionIds: [],
        cents: 0,
      };
      const amount = usdCents(row.amount);
      if (amount <= 0) throw new Error("Zero-value commissions cannot be paid");
      existing.conversionIds.push(row.conversionId);
      existing.cents += amount;
      grouped.set(row.affiliateProfileId, existing);
    }
    if (grouped.size > 100) {
      throw new Error(
        "PayPal batches are limited to 100 affiliates in ONWHEELZ"
      );
    }

    const groupedValues = Array.from(grouped.values());
    const totalCents = groupedValues.reduce((sum, item) => sum + item.cents, 0);
    const senderBatchId = nanoid(24);
    await tx.insert(paypalPayoutBatches).values({
      createdByUserId: adminUserId,
      senderBatchId,
      environment,
      status: "draft",
      currency: "USD",
      totalAmount: centsToUsd(totalCents),
      itemCount: grouped.size,
    });
    const [batch] = await tx
      .select({ id: paypalPayoutBatches.id })
      .from(paypalPayoutBatches)
      .where(eq(paypalPayoutBatches.senderBatchId, senderBatchId))
      .limit(1);
    if (!batch) throw new Error("Unable to create payout draft");

    for (const [affiliateProfileId, group] of Array.from(grouped.entries())) {
      const senderItemId = nanoid(24);
      await tx.insert(paypalPayoutItems).values({
        batchId: batch.id,
        affiliateProfileId,
        senderItemId,
        recipientCiphertext: group.emailCiphertext,
        amount: centsToUsd(group.cents),
        currency: "USD",
        status: "draft",
      });
      const [item] = await tx
        .select({ id: paypalPayoutItems.id })
        .from(paypalPayoutItems)
        .where(
          and(
            eq(paypalPayoutItems.batchId, batch.id),
            eq(paypalPayoutItems.senderItemId, senderItemId)
          )
        )
        .limit(1);
      if (!item) throw new Error("Unable to create payout recipient item");
      await tx.insert(paypalPayoutConversions).values(
        group.conversionIds.map((conversionId: number) => ({
          payoutItemId: item.id,
          conversionId,
        }))
      );
    }

    await tx
      .update(affiliateConversions)
      .set({ status: "batched", updatedAt: new Date() })
      .where(inArray(affiliateConversions.id, uniqueIds));

    return {
      id: batch.id,
      senderBatchId,
      environment,
      status: "draft" as const,
      currency: "USD",
      totalAmount: centsToUsd(totalCents),
      itemCount: grouped.size,
      conversionCount: uniqueIds.length,
      recipients: groupedValues.map(item => ({
        name: item.name,
        amount: centsToUsd(item.cents),
        conversionCount: item.conversionIds.length,
      })),
    };
  });
}

export async function getPayPalBatchForSend(batchId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [batch] = await db
    .select()
    .from(paypalPayoutBatches)
    .where(eq(paypalPayoutBatches.id, batchId))
    .limit(1);
  if (!batch) throw new Error("Payout batch not found");
  const items = await db
    .select({
      id: paypalPayoutItems.id,
      senderItemId: paypalPayoutItems.senderItemId,
      recipientCiphertext: paypalPayoutItems.recipientCiphertext,
      amount: paypalPayoutItems.amount,
      currency: paypalPayoutItems.currency,
    })
    .from(paypalPayoutItems)
    .where(eq(paypalPayoutItems.batchId, batchId));
  return { batch, items };
}

export async function getPayPalPayoutBatches(limit = 25) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const batches = await db
    .select()
    .from(paypalPayoutBatches)
    .orderBy(desc(paypalPayoutBatches.createdAt))
    .limit(limit);
  const result = [];
  for (const batch of batches) {
    const items = await db
      .select({
        id: paypalPayoutItems.id,
        amount: paypalPayoutItems.amount,
        status: paypalPayoutItems.status,
        affiliateName: users.name,
      })
      .from(paypalPayoutItems)
      .innerJoin(
        affiliateProfiles,
        eq(paypalPayoutItems.affiliateProfileId, affiliateProfiles.id)
      )
      .innerJoin(users, eq(affiliateProfiles.userId, users.id))
      .where(eq(paypalPayoutItems.batchId, batch.id));
    const retryAllowed =
      !batch.paypalBatchId &&
      ["unknown", "submitting"].includes(batch.status) &&
      canRetryAmbiguousPayPalBatch(batch.firstAttemptAt) &&
      (batch.status !== "submitting" ||
        Date.now() - batch.updatedAt.getTime() >= 10 * 60 * 1000);
    result.push({ ...batch, retryAllowed, items });
  }
  return result;
}

export async function getPayPalPayoutDraftReview(batchId: number) {
  const batch = await getPayPalBatchById(batchId);
  if (batch.status !== "draft")
    throw new Error("Only unsent drafts can be reopened");
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const countRows = await db
    .select({
      payoutItemId: paypalPayoutConversions.payoutItemId,
      conversionCount: count(),
    })
    .from(paypalPayoutConversions)
    .innerJoin(
      paypalPayoutItems,
      eq(paypalPayoutConversions.payoutItemId, paypalPayoutItems.id)
    )
    .where(eq(paypalPayoutItems.batchId, batchId))
    .groupBy(paypalPayoutConversions.payoutItemId);
  const countByItem = new Map(
    countRows.map(row => [row.payoutItemId, Number(row.conversionCount)])
  );
  const recipients = batch.items.map(item => ({
    name: item.affiliateName || "ONWHEELZ affiliate",
    amount: item.amount,
    conversionCount: countByItem.get(item.id) ?? 0,
  }));
  return {
    id: batch.id,
    senderBatchId: batch.senderBatchId,
    environment: batch.environment,
    status: "draft" as const,
    currency: batch.currency,
    totalAmount: batch.totalAmount,
    itemCount: batch.itemCount,
    conversionCount: recipients.reduce(
      (sum, item) => sum + item.conversionCount,
      0
    ),
    recipients,
  };
}

export async function getPayPalBatchById(batchId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [batch] = await db
    .select()
    .from(paypalPayoutBatches)
    .where(eq(paypalPayoutBatches.id, batchId))
    .limit(1);
  if (!batch) throw new Error("Payout batch not found");
  const items = await db
    .select({
      id: paypalPayoutItems.id,
      amount: paypalPayoutItems.amount,
      status: paypalPayoutItems.status,
      affiliateName: users.name,
    })
    .from(paypalPayoutItems)
    .innerJoin(
      affiliateProfiles,
      eq(paypalPayoutItems.affiliateProfileId, affiliateProfiles.id)
    )
    .innerJoin(users, eq(affiliateProfiles.userId, users.id))
    .where(eq(paypalPayoutItems.batchId, batchId));
  return { ...batch, items };
}

export async function setPayPalBatchSending(batchId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db.transaction(async tx => {
    const [batch] = await tx
      .select({
        id: paypalPayoutBatches.id,
        status: paypalPayoutBatches.status,
        paypalBatchId: paypalPayoutBatches.paypalBatchId,
        firstAttemptAt: paypalPayoutBatches.firstAttemptAt,
        updatedAt: paypalPayoutBatches.updatedAt,
      })
      .from(paypalPayoutBatches)
      .where(eq(paypalPayoutBatches.id, batchId))
      .for("update")
      .limit(1);
    if (!batch) throw new Error("Payout batch not found");
    if (batch.paypalBatchId)
      throw new Error("Refresh this already-submitted PayPal batch");
    const ambiguous =
      batch.status === "unknown" || batch.status === "submitting";
    if (ambiguous && !canRetryAmbiguousPayPalBatch(batch.firstAttemptAt)) {
      throw new Error(
        "The safe PayPal retry window has expired or has no recorded first attempt. Do not resend; locate the existing batch in PayPal and use Link & refresh."
      );
    }
    if (
      batch.status === "submitting" &&
      Date.now() - batch.updatedAt.getTime() < 10 * 60 * 1000
    ) {
      throw new Error(
        "This payout batch is still being submitted; wait before retrying"
      );
    }
    if (!["draft", "unknown", "submitting"].includes(batch.status)) {
      throw new Error("This payout batch is already submitted or closed");
    }
    await tx
      .update(paypalPayoutBatches)
      .set({
        status: "submitting",
        firstAttemptAt: batch.firstAttemptAt ?? new Date(),
        failureCode: null,
        updatedAt: new Date(),
      })
      .where(eq(paypalPayoutBatches.id, batchId));
  });
}

export async function markPayPalBatchSubmitted(
  batchId: number,
  paypalBatchId: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db
    .update(paypalPayoutBatches)
    .set({
      paypalBatchId,
      status: "submitted",
      failureCode: null,
      updatedAt: new Date(),
    })
    .where(eq(paypalPayoutBatches.id, batchId));
  await db
    .update(paypalPayoutItems)
    .set({ recipientCiphertext: "", updatedAt: new Date() })
    .where(eq(paypalPayoutItems.batchId, batchId));
}

export async function attachKnownPayPalBatchId(
  batchId: number,
  paypalBatchId: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db.transaction(async tx => {
    const [batch] = await tx
      .select({
        id: paypalPayoutBatches.id,
        status: paypalPayoutBatches.status,
        paypalBatchId: paypalPayoutBatches.paypalBatchId,
      })
      .from(paypalPayoutBatches)
      .where(eq(paypalPayoutBatches.id, batchId))
      .for("update")
      .limit(1);
    if (!batch) throw new Error("Payout batch not found");
    if (batch.paypalBatchId && batch.paypalBatchId !== paypalBatchId) {
      throw new Error("A different PayPal batch ID is already attached");
    }
    if (
      !["unknown", "submitting", "submitted", "processing"].includes(
        batch.status
      )
    ) {
      throw new Error("Only a possibly submitted batch can be reconciled");
    }
    await tx
      .update(paypalPayoutBatches)
      .set({
        paypalBatchId,
        status: "submitted",
        failureCode: null,
        updatedAt: new Date(),
      })
      .where(eq(paypalPayoutBatches.id, batchId));
    await tx
      .update(paypalPayoutItems)
      .set({ recipientCiphertext: "", updatedAt: new Date() })
      .where(eq(paypalPayoutItems.batchId, batchId));
  });
}

export async function markPayPalBatchUnknown(
  batchId: number,
  failureCode: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  await db
    .update(paypalPayoutBatches)
    .set({
      status: "unknown",
      failureCode: failureCode.slice(0, 255),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(paypalPayoutBatches.id, batchId),
        isNull(paypalPayoutBatches.paypalBatchId)
      )
    );
}

export async function savePayPalBatchSnapshot(
  batchId: number,
  snapshot: PayPalPayoutBatchSnapshot
) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [batch] = await db
    .select()
    .from(paypalPayoutBatches)
    .where(eq(paypalPayoutBatches.id, batchId))
    .limit(1);
  if (!batch) throw new Error("Payout batch not found");
  const localItems = await db
    .select({
      id: paypalPayoutItems.id,
      senderItemId: paypalPayoutItems.senderItemId,
    })
    .from(paypalPayoutItems)
    .where(eq(paypalPayoutItems.batchId, batchId));
  const remoteBySenderId = matchPayPalItems(snapshot);
  const refreshedAt = new Date();
  const finalStatuses = new Set(["succeeded", "failed", "blocked", "returned"]);
  const seenStatuses: Array<ReturnType<typeof mapPayPalItemStatus>> = [];

  for (const local of localItems) {
    const remote = remoteBySenderId.get(local.senderItemId);
    if (!remote) {
      seenStatuses.push("unknown");
      continue;
    }
    const itemStatus = mapPayPalItemStatus(remote.transaction_status);
    seenStatuses.push(itemStatus);
    await db
      .update(paypalPayoutItems)
      .set({
        paypalItemId: remote.payout_item_id ?? null,
        status: itemStatus,
        failureCode: remote.errors?.name?.slice(0, 255) ?? null,
        updatedAt: refreshedAt,
      })
      .where(eq(paypalPayoutItems.id, local.id));

    const links = await db
      .select({ conversionId: paypalPayoutConversions.conversionId })
      .from(paypalPayoutConversions)
      .where(eq(paypalPayoutConversions.payoutItemId, local.id));
    const linkedIds = links.map(link => link.conversionId);
    if (itemStatus === "succeeded" && linkedIds.length) {
      await db
        .update(affiliateConversions)
        .set({ status: "paid", paidAt: refreshedAt, updatedAt: refreshedAt })
        .where(
          and(
            inArray(affiliateConversions.id, linkedIds),
            eq(affiliateConversions.status, "batched")
          )
        );
    } else if (finalStatuses.has(itemStatus) && linkedIds.length) {
      await db
        .update(affiliateConversions)
        .set({ status: "approved", paidAt: null, updatedAt: refreshedAt })
        .where(
          and(
            inArray(affiliateConversions.id, linkedIds),
            eq(affiliateConversions.status, "batched")
          )
        );
      await db
        .update(affiliateConversions)
        .set({
          status: "pending",
          paidAt: null,
          sellerNote:
            "PayPal reported a returned or unsuccessful payout. Review this commission before retrying.",
          updatedAt: refreshedAt,
        })
        .where(
          and(
            inArray(affiliateConversions.id, linkedIds),
            eq(affiliateConversions.status, "paid")
          )
        );
    }
  }

  const batchStatus = summarizeBatchStatus(
    seenStatuses,
    snapshot.batch_header?.batch_status
  );
  const terminalItemFailures = new Set([
    "unknown",
    "failed",
    "blocked",
    "returned",
  ]);
  if (
    batchStatus === "failed" &&
    seenStatuses.every(status => terminalItemFailures.has(status))
  ) {
    const links = await db
      .select({ conversionId: paypalPayoutConversions.conversionId })
      .from(paypalPayoutConversions)
      .innerJoin(
        paypalPayoutItems,
        eq(paypalPayoutConversions.payoutItemId, paypalPayoutItems.id)
      )
      .where(eq(paypalPayoutItems.batchId, batchId));
    const ids = links.map(link => link.conversionId);
    if (ids.length) {
      await db
        .update(affiliateConversions)
        .set({ status: "approved", updatedAt: refreshedAt })
        .where(
          and(
            inArray(affiliateConversions.id, ids),
            eq(affiliateConversions.status, "batched")
          )
        );
    }
  }
  await db
    .update(paypalPayoutBatches)
    .set({
      paypalBatchId:
        snapshot.batch_header?.payout_batch_id ?? batch.paypalBatchId,
      status: batchStatus,
      statusCheckedAt: refreshedAt,
      failureCode: null,
      updatedAt: refreshedAt,
    })
    .where(eq(paypalPayoutBatches.id, batchId));
  return getPayPalBatchById(batchId);
}

export async function cancelPayPalPayoutDraft(batchId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db.transaction(async tx => {
    const [batch] = await tx
      .select({
        id: paypalPayoutBatches.id,
        status: paypalPayoutBatches.status,
      })
      .from(paypalPayoutBatches)
      .where(eq(paypalPayoutBatches.id, batchId))
      .for("update")
      .limit(1);
    if (!batch) throw new Error("Payout batch not found");
    if (batch.status !== "draft")
      throw new Error("Only unsent payout drafts can be cancelled");
    const links = await tx
      .select({ conversionId: paypalPayoutConversions.conversionId })
      .from(paypalPayoutConversions)
      .innerJoin(
        paypalPayoutItems,
        eq(paypalPayoutConversions.payoutItemId, paypalPayoutItems.id)
      )
      .where(eq(paypalPayoutItems.batchId, batchId));
    const ids = links.map(link => link.conversionId);
    if (ids.length) {
      await tx
        .update(affiliateConversions)
        .set({ status: "approved", updatedAt: new Date() })
        .where(
          and(
            inArray(affiliateConversions.id, ids),
            eq(affiliateConversions.status, "batched")
          )
        );
    }
    await tx
      .update(paypalPayoutItems)
      .set({
        status: "failed",
        failureCode: "CANCELLED_BEFORE_SEND",
        recipientCiphertext: "",
        updatedAt: new Date(),
      })
      .where(eq(paypalPayoutItems.batchId, batchId));
    await tx
      .update(paypalPayoutBatches)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(paypalPayoutBatches.id, batchId));
    return { success: true } as const;
  });
}

export async function recordPayPalWebhookEvent(
  eventId: string,
  eventType: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  try {
    await db.insert(paypalWebhookEvents).values({ eventId, eventType });
    return true;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "ER_DUP_ENTRY"
    ) {
      return false;
    }
    throw error;
  }
}

export async function findPayPalBatchByExternalId(paypalBatchId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [batch] = await db
    .select({ id: paypalPayoutBatches.id })
    .from(paypalPayoutBatches)
    .where(eq(paypalPayoutBatches.paypalBatchId, paypalBatchId))
    .limit(1);
  return batch?.id ?? null;
}

export function decryptPayoutRecipient(ciphertext: string) {
  return decryptPayPalRecipientEmail(ciphertext);
}
