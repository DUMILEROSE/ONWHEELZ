import {
  decimal,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/** Core user table backing the Manus OAuth flow. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/** One seller workspace per account; an owner can publish many offers. */
export const sellerOrganizations = mysqlTable(
  "seller_organizations",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    businessName: varchar("businessName", { length: 180 }).notNull(),
    website: varchar("website", { length: 500 }),
    contactEmail: varchar("contactEmail", { length: 320 }),
    description: text("description"),
    verificationStatus: mysqlEnum("verificationStatus", [
      "pending",
      "more_details",
      "verified",
      "rejected",
    ])
      .default("pending")
      .notNull(),
    verificationNote: text("verificationNote"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    ownerUnique: uniqueIndex("seller_organizations_owner_uidx").on(
      table.ownerId
    ),
  })
);

/** Flexible catalog for every product, service, vehicle, aircraft, and wheeled good. */
export const offers = mysqlTable(
  "offers",
  {
    id: int("id").autoincrement().primaryKey(),
    sellerId: int("sellerId")
      .notNull()
      .references(() => sellerOrganizations.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    category: varchar("category", { length: 64 }).notNull(),
    region: varchar("region", { length: 80 }).default("Global").notNull(),
    description: text("description").notNull(),
    price: decimal("price", { precision: 12, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).default("USD").notNull(),
    commissionPercent: decimal("commissionPercent", {
      precision: 5,
      scale: 2,
    }).notNull(),
    destinationUrl: varchar("destinationUrl", { length: 1000 }),
    imageUrl: varchar("imageUrl", { length: 1000 }),
    status: mysqlEnum("status", ["active", "paused", "draft"])
      .default("draft")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    activeCategory: index("offers_status_category_idx").on(
      table.status,
      table.category
    ),
  })
);

/** Offer-card visibility counts only; no visitor identity, IP, or user-agent data. */
export const offerImpressions = mysqlTable(
  "offer_impressions",
  {
    id: int("id").autoincrement().primaryKey(),
    offerId: int("offerId")
      .notNull()
      .references(() => offers.id, { onDelete: "cascade" }),
    eventKey: varchar("eventKey", { length: 36 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    eventKeyUnique: uniqueIndex("offer_impressions_event_uidx").on(
      table.eventKey
    ),
    offerTime: index("offer_impressions_offer_time_idx").on(
      table.offerId,
      table.createdAt
    ),
  })
);

/** Affiliate identity, audience details, and internal platform verification status. */
export const affiliateProfiles = mysqlTable(
  "affiliate_profiles",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    channels: varchar("channels", { length: 500 }).notNull(),
    audienceSize: int("audienceSize").default(0).notNull(),
    bio: text("bio"),
    paypalRecipientCiphertext: text("paypalRecipientCiphertext"),
    verificationStatus: mysqlEnum("verificationStatus", [
      "pending",
      "more_details",
      "verified",
      "rejected",
    ])
      .default("pending")
      .notNull(),
    verificationNote: text("verificationNote"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    userUnique: uniqueIndex("affiliate_profiles_user_uidx").on(table.userId),
  })
);

/** Per-offer review queue with a unique referral code once a seller approves. */
export const affiliateApplications = mysqlTable(
  "affiliate_applications",
  {
    id: int("id").autoincrement().primaryKey(),
    offerId: int("offerId")
      .notNull()
      .references(() => offers.id, { onDelete: "cascade" }),
    affiliateUserId: int("affiliateUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    message: text("message").notNull(),
    status: mysqlEnum("status", [
      "pending",
      "more_details",
      "approved",
      "declined",
    ])
      .default("pending")
      .notNull(),
    sellerNote: text("sellerNote"),
    trackingCode: varchar("trackingCode", { length: 32 }),
    reviewedAt: timestamp("reviewedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    offerAffiliateUnique: uniqueIndex(
      "affiliate_applications_offer_user_uidx"
    ).on(table.offerId, table.affiliateUserId),
    affiliateStatus: index("affiliate_applications_user_status_idx").on(
      table.affiliateUserId,
      table.status
    ),
    trackingCodeUnique: uniqueIndex(
      "affiliate_applications_tracking_code_uidx"
    ).on(table.trackingCode),
  })
);

/** Privacy-minimal click events: no IP or user-agent storage. */
export const affiliateClicks = mysqlTable(
  "affiliate_clicks",
  {
    id: int("id").autoincrement().primaryKey(),
    applicationId: int("applicationId")
      .notNull()
      .references(() => affiliateApplications.id, { onDelete: "cascade" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    applicationClicks: index("affiliate_clicks_application_idx").on(
      table.applicationId,
      table.createdAt
    ),
  })
);

/** Seller-reported conversion ledger tied to an approved affiliate partnership. */
export const affiliateConversions = mysqlTable(
  "affiliate_conversions",
  {
    id: int("id").autoincrement().primaryKey(),
    applicationId: int("applicationId")
      .notNull()
      .references(() => affiliateApplications.id, { onDelete: "cascade" }),
    sellerId: int("sellerId")
      .notNull()
      .references(() => sellerOrganizations.id, { onDelete: "cascade" }),
    orderReference: varchar("orderReference", { length: 120 }).notNull(),
    saleAmount: decimal("saleAmount", { precision: 12, scale: 2 }).notNull(),
    commissionAmount: decimal("commissionAmount", {
      precision: 12,
      scale: 2,
    }).notNull(),
    sourceType: mysqlEnum("sourceType", ["manual", "webhook"])
      .default("manual")
      .notNull(),
    sourceEventId: varchar("sourceEventId", { length: 120 }),
    status: mysqlEnum("status", [
      "pending",
      "approved",
      "rejected",
      "batched",
      "paid",
    ])
      .default("pending")
      .notNull(),
    sellerNote: text("sellerNote"),
    paidAt: timestamp("paidAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    sellerOrderUnique: uniqueIndex(
      "affiliate_conversions_seller_order_uidx"
    ).on(table.sellerId, table.orderReference),
    sellerEventUnique: uniqueIndex(
      "affiliate_conversions_seller_event_uidx"
    ).on(table.sellerId, table.sourceEventId),
    applicationStatus: index("affiliate_conversions_application_status_idx").on(
      table.applicationId,
      table.status
    ),
    sellerCreated: index("affiliate_conversions_seller_created_idx").on(
      table.sellerId,
      table.createdAt
    ),
    applicationCreated: index(
      "affiliate_conversions_application_created_idx"
    ).on(table.applicationId, table.createdAt),
  })
);

/** Per-seller API credentials for authenticated, idempotent order webhooks. */
export const sellerWebhookKeys = mysqlTable(
  "seller_webhook_keys",
  {
    id: int("id").autoincrement().primaryKey(),
    sellerId: int("sellerId")
      .notNull()
      .references(() => sellerOrganizations.id, { onDelete: "cascade" }),
    secretHash: varchar("secretHash", { length: 64 }).notNull(),
    status: mysqlEnum("status", ["active", "revoked"])
      .default("active")
      .notNull(),
    lastReceivedAt: timestamp("lastReceivedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    rotatedAt: timestamp("rotatedAt").defaultNow().notNull(),
  },
  table => ({
    sellerUnique: uniqueIndex("seller_webhook_keys_seller_uidx").on(
      table.sellerId
    ),
    statusIndex: index("seller_webhook_keys_status_idx").on(table.status),
  })
);

/** Persistent PayPal payout audit record; senderBatchId is stable for retries. */
export const paypalPayoutBatches = mysqlTable(
  "paypal_payout_batches",
  {
    id: int("id").autoincrement().primaryKey(),
    createdByUserId: int("createdByUserId")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    senderBatchId: varchar("senderBatchId", { length: 30 }).notNull().unique(),
    paypalBatchId: varchar("paypalBatchId", { length: 80 }).unique(),
    firstAttemptAt: timestamp("firstAttemptAt"),
    environment: mysqlEnum("environment", ["sandbox", "live"]).notNull(),
    status: mysqlEnum("status", [
      "draft",
      "submitting",
      "submitted",
      "processing",
      "succeeded",
      "partially_succeeded",
      "failed",
      "unknown",
      "cancelled",
    ])
      .default("draft")
      .notNull(),
    currency: varchar("currency", { length: 3 }).default("USD").notNull(),
    totalAmount: decimal("totalAmount", { precision: 12, scale: 2 }).notNull(),
    itemCount: int("itemCount").notNull(),
    statusCheckedAt: timestamp("statusCheckedAt"),
    failureCode: varchar("failureCode", { length: 255 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    statusCreated: index("paypal_payout_batches_status_created_idx").on(
      table.status,
      table.createdAt
    ),
  })
);

/** One PayPal recipient item per affiliate within a batch; address is encrypted. */
export const paypalPayoutItems = mysqlTable(
  "paypal_payout_items",
  {
    id: int("id").autoincrement().primaryKey(),
    batchId: int("batchId")
      .notNull()
      .references(() => paypalPayoutBatches.id, { onDelete: "cascade" }),
    affiliateProfileId: int("affiliateProfileId")
      .notNull()
      .references(() => affiliateProfiles.id, { onDelete: "restrict" }),
    senderItemId: varchar("senderItemId", { length: 30 }).notNull(),
    paypalItemId: varchar("paypalItemId", { length: 80 }).unique(),
    recipientCiphertext: text("recipientCiphertext").notNull(),
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).default("USD").notNull(),
    status: mysqlEnum("status", [
      "draft",
      "pending",
      "succeeded",
      "failed",
      "blocked",
      "returned",
      "unclaimed",
      "unknown",
    ])
      .default("draft")
      .notNull(),
    failureCode: varchar("failureCode", { length: 255 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    batchItemUnique: uniqueIndex("paypal_payout_items_batch_sender_uidx").on(
      table.batchId,
      table.senderItemId
    ),
    affiliateStatus: index("paypal_payout_items_affiliate_status_idx").on(
      table.affiliateProfileId,
      table.status
    ),
  })
);

/** Links the paid commissions included in each payout item; retained for audit. */
export const paypalPayoutConversions = mysqlTable(
  "paypal_payout_conversions",
  {
    id: int("id").autoincrement().primaryKey(),
    payoutItemId: int("payoutItemId")
      .notNull()
      .references(() => paypalPayoutItems.id, { onDelete: "cascade" }),
    conversionId: int("conversionId")
      .notNull()
      .references(() => affiliateConversions.id, { onDelete: "restrict" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    itemConversionUnique: uniqueIndex(
      "paypal_payout_conversions_item_conversion_uidx"
    ).on(table.payoutItemId, table.conversionId),
    conversionIndex: index("paypal_payout_conversions_conversion_idx").on(
      table.conversionId
    ),
  })
);

/** Stores event identifiers/types only, never the PayPal webhook body or email. */
export const paypalWebhookEvents = mysqlTable("paypal_webhook_events", {
  id: int("id").autoincrement().primaryKey(),
  eventId: varchar("eventId", { length: 80 }).notNull().unique(),
  eventType: varchar("eventType", { length: 120 }).notNull(),
  receivedAt: timestamp("receivedAt").defaultNow().notNull(),
});
