import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import {
  affiliateConversions,
  sellerBudgetPlans,
  sellerBudgetRevisions,
  sellerOrganizations,
} from "../drizzle/schema";
import { getDb } from "./db";
import {
  normalizeBudgetAmount,
  parseBudgetMonth,
  summarizeBudgetExposure,
} from "./budget-domain";

export async function getSellerBudgetWorkspace(userId: number, month: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const period = parseBudgetMonth(month);
  const [organization] = await db
    .select({ id: sellerOrganizations.id })
    .from(sellerOrganizations)
    .where(eq(sellerOrganizations.ownerId, userId))
    .limit(1);
  if (!organization) throw new Error("Create a seller profile first");

  const [plan] = await db
    .select({
      id: sellerBudgetPlans.id,
      plannedAmount: sellerBudgetPlans.plannedAmount,
      currency: sellerBudgetPlans.currency,
      updatedAt: sellerBudgetPlans.updatedAt,
    })
    .from(sellerBudgetPlans)
    .where(
      and(
        eq(sellerBudgetPlans.sellerId, organization.id),
        eq(sellerBudgetPlans.periodStart, period.periodStart)
      )
    )
    .limit(1);

  const exposureRows = await db
    .select({
      status: affiliateConversions.status,
      amount: sql<string>`COALESCE(SUM(${affiliateConversions.commissionAmount}), 0)`,
    })
    .from(affiliateConversions)
    .where(
      and(
        eq(affiliateConversions.sellerId, organization.id),
        gte(affiliateConversions.createdAt, period.periodStart),
        lt(affiliateConversions.createdAt, period.periodEnd)
      )
    )
    .groupBy(affiliateConversions.status);

  const history = plan
    ? await db
        .select({
          id: sellerBudgetRevisions.id,
          priorAmount: sellerBudgetRevisions.priorAmount,
          newAmount: sellerBudgetRevisions.newAmount,
          createdAt: sellerBudgetRevisions.createdAt,
        })
        .from(sellerBudgetRevisions)
        .where(eq(sellerBudgetRevisions.planId, plan.id))
        .orderBy(desc(sellerBudgetRevisions.createdAt))
        .limit(8)
    : [];

  return {
    month: period.month,
    currency: plan?.currency ?? "USD",
    plan: plan
      ? {
          id: plan.id,
          plannedAmount: plan.plannedAmount,
          updatedAt: plan.updatedAt,
        }
      : null,
    ...summarizeBudgetExposure(
      exposureRows.map(row => ({
        status: row.status,
        amount: row.amount ?? "0",
      })),
      plan?.plannedAmount ?? null
    ),
    history,
  };
}

export async function saveSellerMonthlyBudgetPlan(
  userId: number,
  month: string,
  plannedAmountInput: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  const period = parseBudgetMonth(month);
  const plannedAmount = normalizeBudgetAmount(plannedAmountInput);

  return db.transaction(async tx => {
    // Serialize changes for one seller so concurrent edits cannot reorder history.
    const [organization] = await tx
      .select({ id: sellerOrganizations.id })
      .from(sellerOrganizations)
      .where(eq(sellerOrganizations.ownerId, userId))
      .for("update")
      .limit(1);
    if (!organization) throw new Error("Create a seller profile first");

    const planFilter = and(
      eq(sellerBudgetPlans.sellerId, organization.id),
      eq(sellerBudgetPlans.periodStart, period.periodStart)
    );
    const [existing] = await tx
      .select({
        id: sellerBudgetPlans.id,
        plannedAmount: sellerBudgetPlans.plannedAmount,
      })
      .from(sellerBudgetPlans)
      .where(planFilter)
      .for("update")
      .limit(1);

    if (existing) {
      if (existing.plannedAmount === plannedAmount) {
        return { success: true, changed: false };
      }
      await tx
        .update(sellerBudgetPlans)
        .set({ plannedAmount, currency: "USD", updatedAt: new Date() })
        .where(eq(sellerBudgetPlans.id, existing.id));
      await tx.insert(sellerBudgetRevisions).values({
        planId: existing.id,
        priorAmount: existing.plannedAmount,
        newAmount: plannedAmount,
      });
      return { success: true, changed: true };
    }

    await tx.insert(sellerBudgetPlans).values({
      sellerId: organization.id,
      periodStart: period.periodStart,
      plannedAmount,
      currency: "USD",
    });
    const [created] = await tx
      .select({ id: sellerBudgetPlans.id })
      .from(sellerBudgetPlans)
      .where(planFilter)
      .limit(1);
    if (!created) throw new Error("Unable to save the monthly budget plan");
    await tx.insert(sellerBudgetRevisions).values({
      planId: created.id,
      priorAmount: null,
      newAmount: plannedAmount,
    });
    return { success: true, changed: true };
  });
}
