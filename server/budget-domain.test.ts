import { describe, expect, it } from "vitest";
import {
  normalizeBudgetAmount,
  parseBudgetMonth,
  summarizeBudgetExposure,
} from "./budget-domain";

describe("seller monthly budget planning", () => {
  it("uses UTC calendar-month boundaries", () => {
    const period = parseBudgetMonth("2026-10");
    expect(period.periodStart.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(period.periodEnd.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  it.each(["2026-00", "2026-13", "26-01", "2026/01", "1999-12", "2101-01"])(
    "rejects invalid budget month %s",
    month => expect(() => parseBudgetMonth(month)).toThrow()
  );

  it("normalizes safe USD values to exact cents", () => {
    expect(normalizeBudgetAmount("0")).toBe("0.00");
    expect(normalizeBudgetAmount("1250.5")).toBe("1250.50");
    expect(normalizeBudgetAmount("9999999999.99")).toBe("9999999999.99");
  });

  it.each(["-1", "1.001", "1,000", "$2.00", "10000000000", "1e3"])(
    "rejects invalid or ambiguous USD value %s",
    amount => expect(() => normalizeBudgetAmount(amount)).toThrow()
  );

  it("separates pending review, confirmed exposure, paid amounts, and plan variance", () => {
    expect(
      summarizeBudgetExposure(
        [
          { status: "pending", amount: "20.00" },
          { status: "approved", amount: "31.25" },
          { status: "batched", amount: "8.75" },
          { status: "paid", amount: "40.00" },
          { status: "rejected", amount: "100.00" },
        ],
        "100.00"
      )
    ).toEqual({
      pendingCommission: "20.00",
      confirmedCommission: "80.00",
      paidCommission: "40.00",
      variance: "20.00",
    });
  });

  it("allows negative plan variance and keeps it undefined until a plan exists", () => {
    expect(
      summarizeBudgetExposure(
        [{ status: "approved", amount: "12.34" }],
        "10.00"
      )
    ).toMatchObject({ confirmedCommission: "12.34", variance: "-2.34" });
    expect(
      summarizeBudgetExposure([{ status: "paid", amount: "12.34" }], null)
    ).toMatchObject({ variance: null });
  });
});
