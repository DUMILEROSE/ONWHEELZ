import { randomBytes } from "node:crypto";
import { and, count, desc, eq, inArray, like, or, sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { nanoid } from "nanoid";
import type { InsertUser } from "../drizzle/schema";
import {
  affiliateApplications,
  affiliateClicks,
  affiliateConversions,
  affiliateProfiles,
  offers,
  sellerOrganizations,
  sellerWebhookKeys,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import {
  calculateCommission,
  hashWebhookSecret,
  processOrderWebhook,
  type OrderWebhookRepository,
} from "./order-webhooks";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

type ProfileVerificationStatus =
  | "pending"
  | "more_details"
  | "verified"
  | "rejected";

export function getProfileResubmissionPatch(
  status: ProfileVerificationStatus | null | undefined
): Partial<{
  verificationStatus: "pending";
  verificationNote: null;
}> {
  return status && status !== "verified"
    ? { verificationStatus: "pending", verificationNote: null }
    : {};
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db
    .insert(users)
    .values(values)
    .onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);
  return result[0];
}

export async function listMarketplaceOffers(filters: {
  category?: string;
  search?: string;
  region?: string;
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions: SQL[] = [
    eq(offers.status, "active"),
    eq(sellerOrganizations.verificationStatus, "verified"),
  ];
  if (filters.category && filters.category !== "All")
    conditions.push(eq(offers.category, filters.category));
  if (filters.region)
    conditions.push(
      filters.region === "Global"
        ? eq(offers.region, "Global")
        : or(eq(offers.region, filters.region), eq(offers.region, "Global"))!
    );
  const search = filters.search?.trim();
  if (search) {
    const term = `%${search}%`;
    conditions.push(
      or(
        like(offers.title, term),
        like(offers.description, term),
        like(offers.category, term),
        like(sellerOrganizations.businessName, term)
      )!
    );
  }
  return db
    .select({
      id: offers.id,
      sellerId: offers.sellerId,
      title: offers.title,
      category: offers.category,
      region: offers.region,
      description: offers.description,
      price: offers.price,
      currency: offers.currency,
      commissionPercent: offers.commissionPercent,
      destinationUrl: offers.destinationUrl,
      imageUrl: offers.imageUrl,
      companyName: sellerOrganizations.businessName,
      createdAt: offers.createdAt,
    })
    .from(offers)
    .innerJoin(sellerOrganizations, eq(offers.sellerId, sellerOrganizations.id))
    .where(and(...conditions))
    .orderBy(desc(offers.createdAt));
}

export async function getAffiliateWorkspace(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [profileRows, applicationRows, clickRows, conversionRows] =
    await Promise.all([
      db
        .select({
          id: affiliateProfiles.id,
          userId: affiliateProfiles.userId,
          channels: affiliateProfiles.channels,
          audienceSize: affiliateProfiles.audienceSize,
          bio: affiliateProfiles.bio,
          hasPayPalRecipient: sql<boolean>`${affiliateProfiles.paypalRecipientCiphertext} IS NOT NULL`,
          verificationStatus: affiliateProfiles.verificationStatus,
          verificationNote: affiliateProfiles.verificationNote,
          createdAt: affiliateProfiles.createdAt,
          updatedAt: affiliateProfiles.updatedAt,
        })
        .from(affiliateProfiles)
        .where(eq(affiliateProfiles.userId, userId))
        .limit(1),
      db
        .select({
          id: affiliateApplications.id,
          offerId: affiliateApplications.offerId,
          message: affiliateApplications.message,
          status: affiliateApplications.status,
          sellerNote: affiliateApplications.sellerNote,
          trackingCode: affiliateApplications.trackingCode,
          createdAt: affiliateApplications.createdAt,
          title: offers.title,
          category: offers.category,
          companyName: sellerOrganizations.businessName,
          commissionPercent: offers.commissionPercent,
        })
        .from(affiliateApplications)
        .innerJoin(offers, eq(affiliateApplications.offerId, offers.id))
        .innerJoin(
          sellerOrganizations,
          eq(offers.sellerId, sellerOrganizations.id)
        )
        .where(eq(affiliateApplications.affiliateUserId, userId))
        .orderBy(desc(affiliateApplications.createdAt)),
      db
        .select({
          applicationId: affiliateClicks.applicationId,
          clicks: count(),
        })
        .from(affiliateClicks)
        .innerJoin(
          affiliateApplications,
          eq(affiliateClicks.applicationId, affiliateApplications.id)
        )
        .where(eq(affiliateApplications.affiliateUserId, userId))
        .groupBy(affiliateClicks.applicationId),
      db
        .select({
          id: affiliateConversions.id,
          applicationId: affiliateConversions.applicationId,
          orderReference: affiliateConversions.orderReference,
          saleAmount: affiliateConversions.saleAmount,
          commissionAmount: affiliateConversions.commissionAmount,
          sourceType: affiliateConversions.sourceType,
          status: affiliateConversions.status,
          sellerNote: affiliateConversions.sellerNote,
          createdAt: affiliateConversions.createdAt,
          paidAt: affiliateConversions.paidAt,
          offerTitle: offers.title,
          companyName: sellerOrganizations.businessName,
        })
        .from(affiliateConversions)
        .innerJoin(
          affiliateApplications,
          eq(affiliateConversions.applicationId, affiliateApplications.id)
        )
        .innerJoin(offers, eq(affiliateApplications.offerId, offers.id))
        .innerJoin(
          sellerOrganizations,
          eq(offers.sellerId, sellerOrganizations.id)
        )
        .where(eq(affiliateApplications.affiliateUserId, userId))
        .orderBy(desc(affiliateConversions.createdAt)),
    ]);
  const clickCounts = new Map(
    clickRows.map(row => [row.applicationId, row.clicks])
  );
  return {
    profile: profileRows[0] ?? null,
    applications: applicationRows.map(row => ({
      ...row,
      clickCount: clickCounts.get(row.id) ?? 0,
    })),
    conversions: conversionRows,
  };
}

export async function saveAffiliateProfile(
  userId: number,
  profile: { channels: string; audienceSize: number; bio: string | null }
) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [existing] = await db
    .select({ verificationStatus: affiliateProfiles.verificationStatus })
    .from(affiliateProfiles)
    .where(eq(affiliateProfiles.userId, userId))
    .limit(1);
  const resubmissionPatch = getProfileResubmissionPatch(
    existing?.verificationStatus
  );
  await db
    .insert(affiliateProfiles)
    .values({ userId, ...profile })
    .onDuplicateKeyUpdate({
      set: {
        ...profile,
        ...resubmissionPatch,
        updatedAt: new Date(),
      },
    });
}

export async function createAffiliateApplication(
  userId: number,
  input: {
    offerId: number;
    channels: string;
    audienceSize: number;
    bio?: string;
    message: string;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [offer] = await db
    .select({
      id: offers.id,
      status: offers.status,
      ownerId: sellerOrganizations.ownerId,
      verificationStatus: sellerOrganizations.verificationStatus,
    })
    .from(offers)
    .innerJoin(sellerOrganizations, eq(offers.sellerId, sellerOrganizations.id))
    .where(eq(offers.id, input.offerId))
    .limit(1);
  if (
    !offer ||
    offer.status !== "active" ||
    offer.verificationStatus !== "verified"
  )
    throw new Error("This offer is no longer accepting applications");
  if (offer.ownerId === userId)
    throw new Error("You cannot apply to promote your own offer");

  await saveAffiliateProfile(userId, {
    channels: input.channels,
    audienceSize: input.audienceSize,
    bio: input.bio ?? null,
  });
  await db
    .insert(affiliateApplications)
    .values({
      offerId: input.offerId,
      affiliateUserId: userId,
      message: input.message,
      status: "pending",
    })
    .onDuplicateKeyUpdate({
      set: {
        message: input.message,
        status: "pending",
        sellerNote: null,
        trackingCode: null,
        reviewedAt: null,
        updatedAt: new Date(),
      },
    });
}

export async function getSellerWorkspace(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [organization] = await db
    .select()
    .from(sellerOrganizations)
    .where(eq(sellerOrganizations.ownerId, userId))
    .limit(1);
  if (!organization)
    return {
      organization: null,
      offers: [],
      applications: [],
      conversions: [],
      webhookIntegration: null,
    };
  const [sellerOffers, applicationRows, conversionRows, webhookRows] =
    await Promise.all([
      db
        .select()
        .from(offers)
        .where(eq(offers.sellerId, organization.id))
        .orderBy(desc(offers.createdAt)),
      db
        .select({
          id: affiliateApplications.id,
          offerId: affiliateApplications.offerId,
          status: affiliateApplications.status,
          message: affiliateApplications.message,
          sellerNote: affiliateApplications.sellerNote,
          trackingCode: affiliateApplications.trackingCode,
          createdAt: affiliateApplications.createdAt,
          affiliateName: users.name,
          affiliateEmail: users.email,
          channels: affiliateProfiles.channels,
          audienceSize: affiliateProfiles.audienceSize,
          affiliateVerificationStatus: affiliateProfiles.verificationStatus,
          title: offers.title,
          commissionPercent: offers.commissionPercent,
        })
        .from(affiliateApplications)
        .innerJoin(offers, eq(affiliateApplications.offerId, offers.id))
        .innerJoin(users, eq(affiliateApplications.affiliateUserId, users.id))
        .leftJoin(
          affiliateProfiles,
          eq(affiliateApplications.affiliateUserId, affiliateProfiles.userId)
        )
        .where(eq(offers.sellerId, organization.id))
        .orderBy(desc(affiliateApplications.createdAt)),
      db
        .select({
          id: affiliateConversions.id,
          applicationId: affiliateConversions.applicationId,
          orderReference: affiliateConversions.orderReference,
          saleAmount: affiliateConversions.saleAmount,
          commissionAmount: affiliateConversions.commissionAmount,
          sourceType: affiliateConversions.sourceType,
          status: affiliateConversions.status,
          sellerNote: affiliateConversions.sellerNote,
          createdAt: affiliateConversions.createdAt,
          affiliateName: users.name,
          affiliateEmail: users.email,
          offerTitle: offers.title,
        })
        .from(affiliateConversions)
        .innerJoin(
          affiliateApplications,
          eq(affiliateConversions.applicationId, affiliateApplications.id)
        )
        .innerJoin(offers, eq(affiliateApplications.offerId, offers.id))
        .innerJoin(users, eq(affiliateApplications.affiliateUserId, users.id))
        .where(eq(affiliateConversions.sellerId, organization.id))
        .orderBy(desc(affiliateConversions.createdAt)),
      db
        .select({
          status: sellerWebhookKeys.status,
          lastReceivedAt: sellerWebhookKeys.lastReceivedAt,
          rotatedAt: sellerWebhookKeys.rotatedAt,
        })
        .from(sellerWebhookKeys)
        .where(
          and(
            eq(sellerWebhookKeys.sellerId, organization.id),
            eq(sellerWebhookKeys.status, "active")
          )
        )
        .limit(1),
    ]);
  return {
    organization,
    offers: sellerOffers,
    applications: applicationRows,
    conversions: conversionRows,
    webhookIntegration: webhookRows[0]
      ? {
          ...webhookRows[0],
          endpoint: `/api/webhooks/orders/${organization.id}`,
        }
      : null,
  };
}

export async function saveSellerOrganization(
  userId: number,
  input: {
    businessName: string;
    website?: string;
    contactEmail: string;
    description?: string;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [existing] = await db
    .select({ verificationStatus: sellerOrganizations.verificationStatus })
    .from(sellerOrganizations)
    .where(eq(sellerOrganizations.ownerId, userId))
    .limit(1);
  const resubmissionPatch = getProfileResubmissionPatch(
    existing?.verificationStatus
  );
  await db
    .insert(sellerOrganizations)
    .values({
      ownerId: userId,
      businessName: input.businessName,
      website: input.website ?? null,
      contactEmail: input.contactEmail,
      description: input.description ?? null,
    })
    .onDuplicateKeyUpdate({
      set: {
        businessName: input.businessName,
        website: input.website ?? null,
        contactEmail: input.contactEmail,
        description: input.description ?? null,
        ...resubmissionPatch,
        updatedAt: new Date(),
      },
    });
}

export async function createSellerOffer(
  userId: number,
  input: {
    title: string;
    category: string;
    region: string;
    description: string;
    price: number;
    commissionPercent: number;
    destinationUrl?: string;
    imageUrl?: string;
    status: "active" | "draft";
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [organization] = await db
    .select()
    .from(sellerOrganizations)
    .where(eq(sellerOrganizations.ownerId, userId))
    .limit(1);
  if (!organization)
    throw new Error("Create a seller profile before adding an offer");
  if (
    input.status === "active" &&
    organization.verificationStatus !== "verified"
  )
    throw new Error(
      "Complete seller verification before publishing an offer; you can save a draft for now"
    );
  if (input.status === "active" && !input.destinationUrl?.trim())
    throw new Error(
      "Add the seller’s destination URL before publishing an offer"
    );
  if (input.status === "active" && input.destinationUrl) {
    const destination = new URL(input.destinationUrl);
    if (destination.protocol !== "https:" && destination.protocol !== "http:")
      throw new Error("Offer destinations must use HTTP or HTTPS");
  }
  await db.insert(offers).values({
    sellerId: organization.id,
    title: input.title,
    category: input.category,
    region: input.region,
    description: input.description,
    price: input.price.toFixed(2),
    commissionPercent: input.commissionPercent.toFixed(2),
    destinationUrl: input.destinationUrl || null,
    imageUrl: input.imageUrl || null,
    status: input.status,
  });
}

export async function reviewAffiliateApplication(
  userId: number,
  input: {
    applicationId: number;
    status: "approved" | "more_details" | "declined";
    sellerNote?: string;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [ownedApplication] = await db
    .select({
      id: affiliateApplications.id,
      status: affiliateApplications.status,
      trackingCode: affiliateApplications.trackingCode,
    })
    .from(affiliateApplications)
    .innerJoin(offers, eq(affiliateApplications.offerId, offers.id))
    .innerJoin(sellerOrganizations, eq(offers.sellerId, sellerOrganizations.id))
    .where(
      and(
        eq(affiliateApplications.id, input.applicationId),
        eq(sellerOrganizations.ownerId, userId)
      )
    )
    .limit(1);
  if (!ownedApplication)
    throw new Error("Application not found in your seller workspace");
  if (!["pending", "more_details"].includes(ownedApplication.status))
    throw new Error("Only applications awaiting review can be changed");
  await db
    .update(affiliateApplications)
    .set({
      status: input.status,
      sellerNote: input.sellerNote ?? null,
      trackingCode:
        input.status === "approved"
          ? (ownedApplication.trackingCode ?? nanoid(12))
          : null,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(affiliateApplications.id, input.applicationId));
}

export async function trackAffiliateClick(code: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [referral] = await db
    .select({
      applicationId: affiliateApplications.id,
      destinationUrl: offers.destinationUrl,
    })
    .from(affiliateApplications)
    .innerJoin(offers, eq(affiliateApplications.offerId, offers.id))
    .innerJoin(sellerOrganizations, eq(offers.sellerId, sellerOrganizations.id))
    .where(
      and(
        eq(affiliateApplications.trackingCode, code),
        eq(affiliateApplications.status, "approved"),
        eq(offers.status, "active"),
        eq(sellerOrganizations.verificationStatus, "verified")
      )
    )
    .limit(1);
  if (!referral?.destinationUrl)
    throw new Error("This referral link is not available");
  let destination: URL;
  try {
    destination = new URL(referral.destinationUrl);
  } catch {
    throw new Error("This offer does not have a valid destination URL");
  }
  if (destination.protocol !== "https:" && destination.protocol !== "http:")
    throw new Error("This referral destination is not supported");
  await db
    .insert(affiliateClicks)
    .values({ applicationId: referral.applicationId });
  return { destinationUrl: destination.toString() };
}

export async function recordSellerConversion(
  userId: number,
  input: { applicationId: number; orderReference: string; saleAmount: number }
) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [partnership] = await db
    .select({
      applicationId: affiliateApplications.id,
      status: affiliateApplications.status,
      sellerId: sellerOrganizations.id,
      commissionPercent: offers.commissionPercent,
    })
    .from(affiliateApplications)
    .innerJoin(offers, eq(affiliateApplications.offerId, offers.id))
    .innerJoin(sellerOrganizations, eq(offers.sellerId, sellerOrganizations.id))
    .where(
      and(
        eq(affiliateApplications.id, input.applicationId),
        eq(sellerOrganizations.ownerId, userId)
      )
    )
    .limit(1);
  if (!partnership || partnership.status !== "approved")
    throw new Error(
      "Conversions can only be recorded for an approved affiliate partnership"
    );
  const amounts = calculateCommission(
    input.saleAmount,
    Number(partnership.commissionPercent)
  );
  await db.insert(affiliateConversions).values({
    applicationId: partnership.applicationId,
    sellerId: partnership.sellerId,
    orderReference: input.orderReference.trim(),
    saleAmount: amounts.saleAmount,
    commissionAmount: amounts.commissionAmount,
    status: "pending",
  });
  return { commissionAmount: amounts.commissionAmount };
}

export async function createSellerWebhookKey(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [organization] = await db
    .select({ id: sellerOrganizations.id })
    .from(sellerOrganizations)
    .where(eq(sellerOrganizations.ownerId, userId))
    .limit(1);
  if (!organization) throw new Error("Create a seller profile first");

  const secret = randomBytes(32).toString("base64url");
  const rotatedAt = new Date();
  await db
    .insert(sellerWebhookKeys)
    .values({
      sellerId: organization.id,
      secretHash: hashWebhookSecret(secret),
      status: "active",
      lastReceivedAt: null,
      rotatedAt,
    })
    .onDuplicateKeyUpdate({
      set: {
        secretHash: hashWebhookSecret(secret),
        status: "active",
        lastReceivedAt: null,
        rotatedAt,
      },
    });
  return {
    secret,
    endpoint: `/api/webhooks/orders/${organization.id}`,
    rotatedAt,
  };
}

export async function processSellerOrderWebhook(
  sellerId: number,
  providedSecret: string,
  payload: unknown
) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");

  const repository: OrderWebhookRepository = {
    async getSecretHash(id) {
      const [row] = await db
        .select({ secretHash: sellerWebhookKeys.secretHash })
        .from(sellerWebhookKeys)
        .where(
          and(
            eq(sellerWebhookKeys.sellerId, id),
            eq(sellerWebhookKeys.status, "active")
          )
        )
        .limit(1);
      return row?.secretHash;
    },
    async getApprovedPartnership(id, referralCode) {
      const [row] = await db
        .select({
          applicationId: affiliateApplications.id,
          commissionPercent: offers.commissionPercent,
        })
        .from(affiliateApplications)
        .innerJoin(offers, eq(affiliateApplications.offerId, offers.id))
        .where(
          and(
            eq(offers.sellerId, id),
            eq(affiliateApplications.trackingCode, referralCode),
            eq(affiliateApplications.status, "approved")
          )
        )
        .limit(1);
      return row
        ? {
            applicationId: row.applicationId,
            commissionPercent: Number(row.commissionPercent),
          }
        : undefined;
    },
    async hasDuplicate(id, eventId, orderReference) {
      const [row] = await db
        .select({ id: affiliateConversions.id })
        .from(affiliateConversions)
        .where(
          and(
            eq(affiliateConversions.sellerId, id),
            or(
              eq(affiliateConversions.sourceEventId, eventId),
              eq(affiliateConversions.orderReference, orderReference)
            )!
          )
        )
        .limit(1);
      return Boolean(row);
    },
    async insertConversion(input) {
      await db.insert(affiliateConversions).values({
        sellerId: input.sellerId,
        applicationId: input.applicationId,
        sourceType: "webhook",
        sourceEventId: input.eventId,
        orderReference: input.orderReference,
        saleAmount: input.saleAmount,
        commissionAmount: input.commissionAmount,
        status: "pending",
      });
    },
    async touchIntegration(id, at) {
      await db
        .update(sellerWebhookKeys)
        .set({ lastReceivedAt: at })
        .where(
          and(
            eq(sellerWebhookKeys.sellerId, id),
            eq(sellerWebhookKeys.status, "active")
          )
        );
    },
  };

  return processOrderWebhook(sellerId, providedSecret, payload, repository);
}

export async function reviewSellerConversion(
  userId: number,
  input: {
    conversionId: number;
    status: "approved" | "rejected";
    sellerNote?: string;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [row] = await db
    .select({
      id: affiliateConversions.id,
      status: affiliateConversions.status,
    })
    .from(affiliateConversions)
    .innerJoin(
      sellerOrganizations,
      eq(affiliateConversions.sellerId, sellerOrganizations.id)
    )
    .where(
      and(
        eq(affiliateConversions.id, input.conversionId),
        eq(sellerOrganizations.ownerId, userId)
      )
    )
    .limit(1);
  if (!row) throw new Error("Conversion not found in your seller workspace");
  if (row.status !== "pending")
    throw new Error("Only pending conversions can be reviewed");
  await db
    .update(affiliateConversions)
    .set({
      status: input.status,
      sellerNote: input.sellerNote ?? null,
      updatedAt: new Date(),
    })
    .where(eq(affiliateConversions.id, input.conversionId));
}

export async function getNetworkVerificationQueue() {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const [sellerVerifications, affiliateVerifications] = await Promise.all([
    db
      .select({
        id: sellerOrganizations.id,
        businessName: sellerOrganizations.businessName,
        website: sellerOrganizations.website,
        contactEmail: sellerOrganizations.contactEmail,
        description: sellerOrganizations.description,
        verificationStatus: sellerOrganizations.verificationStatus,
        verificationNote: sellerOrganizations.verificationNote,
        createdAt: sellerOrganizations.createdAt,
        ownerName: users.name,
        ownerEmail: users.email,
      })
      .from(sellerOrganizations)
      .innerJoin(users, eq(sellerOrganizations.ownerId, users.id))
      .where(
        inArray(sellerOrganizations.verificationStatus, [
          "pending",
          "more_details",
        ])
      )
      .orderBy(desc(sellerOrganizations.createdAt)),
    db
      .select({
        id: affiliateProfiles.id,
        userId: affiliateProfiles.userId,
        channels: affiliateProfiles.channels,
        audienceSize: affiliateProfiles.audienceSize,
        bio: affiliateProfiles.bio,
        verificationStatus: affiliateProfiles.verificationStatus,
        verificationNote: affiliateProfiles.verificationNote,
        createdAt: affiliateProfiles.createdAt,
        affiliateName: users.name,
        affiliateEmail: users.email,
      })
      .from(affiliateProfiles)
      .innerJoin(users, eq(affiliateProfiles.userId, users.id))
      .where(
        inArray(affiliateProfiles.verificationStatus, [
          "pending",
          "more_details",
        ])
      )
      .orderBy(desc(affiliateProfiles.createdAt)),
  ]);
  return { sellerVerifications, affiliateVerifications };
}

export async function reviewNetworkVerification(input: {
  entityType: "seller" | "affiliate";
  entityId: number;
  status: "verified" | "more_details" | "rejected";
  note?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const updatedAt = new Date();
  if (input.entityType === "seller") {
    const [row] = await db
      .select({ id: sellerOrganizations.id })
      .from(sellerOrganizations)
      .where(
        and(
          eq(sellerOrganizations.id, input.entityId),
          inArray(sellerOrganizations.verificationStatus, [
            "pending",
            "more_details",
          ])
        )
      )
      .limit(1);
    if (!row)
      throw new Error("Seller verification item is no longer awaiting review");
    await db
      .update(sellerOrganizations)
      .set({
        verificationStatus: input.status,
        verificationNote: input.note ?? null,
        updatedAt,
      })
      .where(eq(sellerOrganizations.id, input.entityId));
  } else {
    const [row] = await db
      .select({ id: affiliateProfiles.id })
      .from(affiliateProfiles)
      .where(
        and(
          eq(affiliateProfiles.id, input.entityId),
          inArray(affiliateProfiles.verificationStatus, [
            "pending",
            "more_details",
          ])
        )
      )
      .limit(1);
    if (!row)
      throw new Error(
        "Affiliate verification item is no longer awaiting review"
      );
    await db
      .update(affiliateProfiles)
      .set({
        verificationStatus: input.status,
        verificationNote: input.note ?? null,
        updatedAt,
      })
      .where(eq(affiliateProfiles.id, input.entityId));
  }
}
