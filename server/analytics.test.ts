import { describe, expect, it } from "vitest";
import { analyticsSinceDate, summarizeConversions } from "./analytics";

describe("summarizeConversions", () => {
  it("separates pending, confirmed, rejected, and paid values", () => {
    const result = summarizeConversions([
      {
        status: "pending",
        orders: 2,
        saleAmount: "100.00",
        commissionAmount: "10.00",
      },
      {
        status: "approved",
        orders: 1,
        saleAmount: "80.00",
        commissionAmount: "8.00",
      },
      {
        status: "batched",
        orders: 1,
        saleAmount: "90.00",
        commissionAmount: "9.00",
      },
      {
        status: "paid",
        orders: 2,
        saleAmount: "200.00",
        commissionAmount: "20.00",
      },
      {
        status: "rejected",
        orders: 1,
        saleAmount: "50.00",
        commissionAmount: "5.00",
      },
    ]);

    expect(result).toEqual({
      orderCount: 7,
      pendingOrderCount: 2,
      confirmedOrderCount: 4,
      rejectedOrderCount: 1,
      reportedSales: 520,
      pendingSales: 100,
      confirmedSales: 370,
      pendingCommission: 10,
      confirmedCommission: 37,
      paidCommission: 20,
    });
  });

  it("treats malformed aggregate values as zero", () => {
    expect(
      summarizeConversions([
        {
          status: "pending",
          orders: "not-a-count",
          saleAmount: "NaN",
          commissionAmount: "Infinity",
        },
      ])
    ).toMatchObject({
      orderCount: 0,
      reportedSales: 0,
      pendingCommission: 0,
    });
  });
});

describe("analyticsSinceDate", () => {
  it("returns an inclusive UTC-midnight start date", () => {
    expect(
      analyticsSinceDate(7, new Date("2026-09-30T23:50:00.000Z")).toISOString()
    ).toBe("2026-09-24T00:00:00.000Z");
  });

  it("rejects unsupported reporting windows", () => {
    expect(() => analyticsSinceDate(14 as 7, new Date())).toThrow(RangeError);
  });
});
