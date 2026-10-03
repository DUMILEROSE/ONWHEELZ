import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import {
  affiliateApplications,
  affiliateClicks,
  affiliateConversions,
  offerImpressions,
  offers,
  sellerOrganizations,
} from "../drizzle/schema";
import { getDb } from "./db";
import {
  analyticsSinceDate,
  summarizeConversions,
  type AnalyticsWindow,
  type ConversionStatusAggregate,
} from "./analytics";

function number(value: number | string | null | undefined): number {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

const emptyConversions = () => summarizeConversions([]);

export async function recordOfferImpression(offerId: number, eventKey: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");

  const [eligibleOffer] = await db
    .select({ id: offers.id })
    .from(offers)
    .innerJoin(sellerOrganizations, eq(offers.sellerId, sellerOrganizations.id))
    .where(
      and(
        eq(offers.id, offerId),
        eq(offers.status, "active"),
        eq(sellerOrganizations.verificationStatus, "verified")
      )
    )
    .limit(1);
  if (!eligibleOffer) return { tracked: false } as const;

  // The random event key makes a retried visibility event idempotent. It is not
  // connected to a user, cookie, IP address, or user-agent string.
  await db
    .insert(offerImpressions)
    .values({ offerId, eventKey })
    .onDuplicateKeyUpdate({ set: { eventKey } });
  return { tracked: true } as const;
}

export async function getAffiliateAnalytics(
  userId: number,
  days: AnalyticsWindow
) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const since = analyticsSinceDate(days);

  const [applicationRows, clickRows, conversionRows] = await Promise.all([
    db
      .select({
        applicationId: affiliateApplications.id,
        applicationStatus: affiliateApplications.status,
        trackingCode: affiliateApplications.trackingCode,
        offerTitle: offers.title,
        companyName: sellerOrganizations.businessName,
      })
      .from(affiliateApplications)
      .innerJoin(offers, eq(affiliateApplications.offerId, offers.id))
      .innerJoin(
        sellerOrganizations,
        eq(offers.sellerId, sellerOrganizations.id)
      )
      .where(eq(affiliateApplications.affiliateUserId, userId))
      .orderBy(desc(affiliateApplications.updatedAt)),
    db
      .select({
        applicationId: affiliateApplications.id,
        clicks: count(),
      })
      .from(affiliateClicks)
      .innerJoin(
        affiliateApplications,
        eq(affiliateClicks.applicationId, affiliateApplications.id)
      )
      .where(
        and(
          eq(affiliateApplications.affiliateUserId, userId),
          gte(affiliateClicks.createdAt, since)
        )
      )
      .groupBy(affiliateApplications.id),
    db
      .select({
        applicationId: affiliateApplications.id,
        status: affiliateConversions.status,
        orders: count(),
        saleAmount: sql<string>`COALESCE(SUM(${affiliateConversions.saleAmount}), 0)`,
        commissionAmount: sql<string>`COALESCE(SUM(${affiliateConversions.commissionAmount}), 0)`,
      })
      .from(affiliateConversions)
      .innerJoin(
        affiliateApplications,
        eq(affiliateConversions.applicationId, affiliateApplications.id)
      )
      .where(
        and(
          eq(affiliateApplications.affiliateUserId, userId),
          gte(affiliateConversions.createdAt, since)
        )
      )
      .groupBy(affiliateApplications.id, affiliateConversions.status),
  ]);

  const clicksByApplication = new Map(
    clickRows.map(row => [row.applicationId, number(row.clicks)])
  );
  const conversionsByApplication = new Map<
    number,
    ConversionStatusAggregate[]
  >();
  for (const row of conversionRows) {
    const current = conversionsByApplication.get(row.applicationId) ?? [];
    current.push(row);
    conversionsByApplication.set(row.applicationId, current);
  }
  const aggregateRows = conversionRows.map(
    ({ status, orders, saleAmount, commissionAmount }) => ({
      status,
      orders,
      saleAmount,
      commissionAmount,
    })
  );
  const conversions = summarizeConversions(aggregateRows);
  const clickCount = clickRows.reduce(
    (sum, row) => sum + number(row.clicks),
    0
  );
  const partnerships = applicationRows
    .filter(row => row.applicationStatus === "approved" && row.trackingCode)
    .map(row => {
      const byStatus = conversionsByApplication.get(row.applicationId) ?? [];
      return {
        applicationId: row.applicationId,
        offerTitle: row.offerTitle,
        companyName: row.companyName,
        clicks: clicksByApplication.get(row.applicationId) ?? 0,
        ...summarizeConversions(byStatus),
      };
    })
    .sort(
      (a, b) =>
        b.clicks - a.clicks || b.confirmedOrderCount - a.confirmedOrderCount
    )
    .slice(0, 10);

  return { days, clickCount, conversions, partnerships };
}

export async function getSellerAnalytics(
  userId: number,
  days: AnalyticsWindow
) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const since = analyticsSinceDate(days);
  const [organization] = await db
    .select({ id: sellerOrganizations.id })
    .from(sellerOrganizations)
    .where(eq(sellerOrganizations.ownerId, userId))
    .limit(1);

  if (!organization) {
    return {
      days,
      viewCount: 0,
      clickCount: 0,
      conversions: emptyConversions(),
      offers: [],
    };
  }

  const [offerRows, impressionRows, clickRows, conversionRows] =
    await Promise.all([
      db
        .select({ id: offers.id, title: offers.title, status: offers.status })
        .from(offers)
        .where(eq(offers.sellerId, organization.id))
        .orderBy(desc(offers.createdAt)),
      db
        .select({ offerId: offers.id, views: count() })
        .from(offerImpressions)
        .innerJoin(offers, eq(offerImpressions.offerId, offers.id))
        .where(
          and(
            eq(offers.sellerId, organization.id),
            gte(offerImpressions.createdAt, since)
          )
        )
        .groupBy(offers.id),
      db
        .select({ offerId: offers.id, clicks: count() })
        .from(affiliateClicks)
        .innerJoin(
          affiliateApplications,
          eq(affiliateClicks.applicationId, affiliateApplications.id)
        )
        .innerJoin(offers, eq(affiliateApplications.offerId, offers.id))
        .where(
          and(
            eq(offers.sellerId, organization.id),
            gte(affiliateClicks.createdAt, since)
          )
        )
        .groupBy(offers.id),
      db
        .select({
          offerId: offers.id,
          status: affiliateConversions.status,
          orders: count(),
          saleAmount: sql<string>`COALESCE(SUM(${affiliateConversions.saleAmount}), 0)`,
          commissionAmount: sql<string>`COALESCE(SUM(${affiliateConversions.commissionAmount}), 0)`,
        })
        .from(affiliateConversions)
        .innerJoin(
          affiliateApplications,
          eq(affiliateConversions.applicationId, affiliateApplications.id)
        )
        .innerJoin(offers, eq(affiliateApplications.offerId, offers.id))
        .where(
          and(
            eq(affiliateConversions.sellerId, organization.id),
            gte(affiliateConversions.createdAt, since)
          )
        )
        .groupBy(offers.id, affiliateConversions.status),
    ]);

  const viewsByOffer = new Map(
    impressionRows.map(row => [row.offerId, number(row.views)])
  );
  const clicksByOffer = new Map(
    clickRows.map(row => [row.offerId, number(row.clicks)])
  );
  const conversionsByOffer = new Map<number, ConversionStatusAggregate[]>();
  for (const row of conversionRows) {
    const current = conversionsByOffer.get(row.offerId) ?? [];
    current.push(row);
    conversionsByOffer.set(row.offerId, current);
  }
  const allConversionRows = conversionRows.map(
    ({ status, orders, saleAmount, commissionAmount }) => ({
      status,
      orders,
      saleAmount,
      commissionAmount,
    })
  );
  const offersWithStats = offerRows
    .map(offer => ({
      offerId: offer.id,
      title: offer.title,
      status: offer.status,
      views: viewsByOffer.get(offer.id) ?? 0,
      clicks: clicksByOffer.get(offer.id) ?? 0,
      ...summarizeConversions(conversionsByOffer.get(offer.id) ?? []),
    }))
    .sort(
      (a, b) =>
        b.views + b.clicks + b.orderCount - (a.views + a.clicks + a.orderCount)
    )
    .slice(0, 10);

  return {
    days,
    viewCount: impressionRows.reduce((sum, row) => sum + number(row.views), 0),
    clickCount: clickRows.reduce((sum, row) => sum + number(row.clicks), 0),
    conversions: summarizeConversions(allConversionRows),
    offers: offersWithStats,
  };
}
