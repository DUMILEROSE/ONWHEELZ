export interface BudgetPeriod {
  month: string;
  periodStart: Date;
  periodEnd: Date;
}

export function parseBudgetMonth(month: string): BudgetPeriod {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error("Choose a valid calendar month");
  }
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthNumber = Number(monthText);
  if (year < 2000 || year > 2100) {
    throw new Error("Budget month must be between 2000 and 2100");
  }
  return {
    month,
    periodStart: new Date(Date.UTC(year, monthNumber - 1, 1)),
    periodEnd: new Date(Date.UTC(year, monthNumber, 1)),
  };
}

/** Validate and canonicalize a USD amount for DECIMAL(12, 2) storage. */
export function normalizeBudgetAmount(amount: string): string {
  const normalized = amount.trim();
  if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error("Enter a USD amount with no more than two decimal places");
  }
  const [whole, fraction = ""] = normalized.split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}

function toCents(amount: string | number): number {
  const value = Number(amount);
  if (!Number.isFinite(value))
    throw new Error("Invalid budget amount in storage");
  return Math.round(value * 100);
}

function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

export interface BudgetExposureRow {
  status: string;
  amount: string | number;
}

/**
 * Summarize seller-reported commission exposure; these values are estimates,
 * not cash held, settled, or reserved by ONWHEELZ.
 */
export function summarizeBudgetExposure(
  rows: BudgetExposureRow[],
  plannedAmount: string | null
) {
  let pendingCents = 0;
  let confirmedCents = 0;
  let paidCents = 0;

  for (const row of rows) {
    const amountCents = toCents(row.amount);
    if (row.status === "pending") pendingCents += amountCents;
    if (["approved", "batched", "paid"].includes(row.status)) {
      confirmedCents += amountCents;
    }
    if (row.status === "paid") paidCents += amountCents;
  }

  return {
    pendingCommission: fromCents(pendingCents),
    confirmedCommission: fromCents(confirmedCents),
    paidCommission: fromCents(paidCents),
    variance:
      plannedAmount === null
        ? null
        : fromCents(toCents(plannedAmount) - confirmedCents),
  };
}
