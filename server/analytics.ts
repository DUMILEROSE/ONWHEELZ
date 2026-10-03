export const ANALYTICS_WINDOWS = [7, 30, 90] as const;
export type AnalyticsWindow = (typeof ANALYTICS_WINDOWS)[number];

export type ConversionStatusAggregate = {
  status: string;
  orders: number | string;
  saleAmount: number | string;
  commissionAmount: number | string;
};

export type ConversionMetrics = {
  orderCount: number;
  pendingOrderCount: number;
  confirmedOrderCount: number;
  rejectedOrderCount: number;
  reportedSales: number;
  pendingSales: number;
  confirmedSales: number;
  pendingCommission: number;
  confirmedCommission: number;
  paidCommission: number;
};

const CONFIRMED_STATUSES = new Set(["approved", "batched", "paid"]);

function finiteNumber(value: number | string): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

/** Summarize only recorded conversion rows; this does not imply payment settlement. */
export function summarizeConversions(
  rows: ConversionStatusAggregate[]
): ConversionMetrics {
  const metrics: ConversionMetrics = {
    orderCount: 0,
    pendingOrderCount: 0,
    confirmedOrderCount: 0,
    rejectedOrderCount: 0,
    reportedSales: 0,
    pendingSales: 0,
    confirmedSales: 0,
    pendingCommission: 0,
    confirmedCommission: 0,
    paidCommission: 0,
  };

  for (const row of rows) {
    const orders = finiteNumber(row.orders);
    const sales = finiteNumber(row.saleAmount);
    const commission = finiteNumber(row.commissionAmount);
    metrics.orderCount += orders;
    metrics.reportedSales += sales;

    if (row.status === "pending") {
      metrics.pendingOrderCount += orders;
      metrics.pendingSales += sales;
      metrics.pendingCommission += commission;
    }
    if (CONFIRMED_STATUSES.has(row.status)) {
      metrics.confirmedOrderCount += orders;
      metrics.confirmedSales += sales;
      metrics.confirmedCommission += commission;
    }
    if (row.status === "paid") metrics.paidCommission += commission;
    if (row.status === "rejected") metrics.rejectedOrderCount += orders;
  }

  return metrics;
}

/** Returns an inclusive UTC-midnight start for a 7/30/90-day reporting window. */
export function analyticsSinceDate(
  days: AnalyticsWindow,
  now = new Date()
): Date {
  if (!ANALYTICS_WINDOWS.includes(days)) {
    throw new RangeError("Analytics window must be 7, 30, or 90 days");
  }
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  start.setUTCDate(start.getUTCDate() - days + 1);
  return start;
}
