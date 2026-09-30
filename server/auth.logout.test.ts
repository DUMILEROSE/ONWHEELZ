import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

type CookieCall = {
  name: string;
  options: Record<string, unknown>;
};

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): {
  ctx: TrpcContext;
  clearedCookies: CookieCall[];
} {
  const clearedCookies: CookieCall[] = [];
  const user: AuthenticatedUser = {
    id: 1,
    openId: "sample-user",
    email: "sample@example.com",
    name: "Sample User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };
  return { ctx, clearedCookies };
}

function createAnonymousContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

describe("auth.logout", () => {
  it("clears the session cookie and reports success", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    expect(clearedCookies[0]?.options).toMatchObject({
      maxAge: -1,
      secure: true,
      sameSite: "none",
      httpOnly: true,
      path: "/",
    });
  });
});

describe("ONWHEELZ workspace access", () => {
  it("requires authentication to read an affiliate workspace", async () => {
    const caller = appRouter.createCaller(createAnonymousContext());
    await expect(caller.affiliate.workspace()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("requires authentication before a seller profile can be created", async () => {
    const caller = appRouter.createCaller(createAnonymousContext());
    await expect(
      caller.seller.register({
        businessName: "Northline Mobility",
        contactEmail: "hello@example.com",
        website: "https://example.com",
        description: "Mobility products and services.",
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("requires authentication before a seller webhook key can be generated", async () => {
    const caller = appRouter.createCaller(createAnonymousContext());
    await expect(caller.seller.rotateWebhookKey()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("rejects unsupported offer regions before attempting a database write", async () => {
    const caller = appRouter.createCaller(createAuthContext().ctx);
    await expect(
      caller.seller.createOffer({
        title: "Mobility service plan",
        category: "Services",
        region: "Moonbase" as never,
        description: "A roadside support plan for long distance drivers.",
        price: 99,
        commissionPercent: 10,
        destinationUrl: "https://example.com/plan",
        status: "draft",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("requires authentication before an affiliate request can be submitted", async () => {
    const caller = appRouter.createCaller(createAnonymousContext());
    await expect(
      caller.affiliate.requestToPromote({
        offerId: 1,
        channels: "Instagram",
        audienceSize: 1000,
        message: "This offer fits my mobility-focused audience well.",
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("requires authentication before a seller can record or review a conversion", async () => {
    const caller = appRouter.createCaller(createAnonymousContext());
    await expect(
      caller.seller.recordConversion({
        applicationId: 1,
        orderReference: "order-1001",
        saleAmount: 249.99,
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      caller.seller.reviewConversion({
        conversionId: 1,
        status: "approved",
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("restricts seller and affiliate verification decisions to administrators", async () => {
    const caller = appRouter.createCaller(createAuthContext().ctx);
    await expect(caller.network.verificationQueue()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      caller.network.reviewVerification({
        entityType: "seller",
        entityId: 1,
        status: "verified",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects malformed public referral codes before database access", async () => {
    const caller = appRouter.createCaller(createAnonymousContext());
    await expect(
      caller.marketplace.trackReferral({ code: "short" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
