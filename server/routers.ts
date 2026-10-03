import { COOKIE_NAME, MARKET_REGIONS } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import {
  adminProcedure,
  protectedProcedure,
  publicProcedure,
  router,
} from "./_core/trpc";
import { systemRouter } from "./_core/systemRouter";
import { encryptPayPalRecipientEmail } from "./paypal-crypto";
import {
  cancelPayPalPayoutDraft,
  getPayPalPayoutDraftReview,
  removeAffiliatePayPalRecipient,
  saveAffiliatePayPalRecipient,
} from "./paypal-payout-store";
import {
  getPayoutAdminOverview,
  preparePayPalPayout,
  reconcileKnownPayPalBatch,
  refreshPayPalPayout,
  sendPayPalPayout,
} from "./paypal-payout-service";
import {
  createAffiliateApplication,
  createSellerOffer,
  createSellerWebhookKey,
  getAffiliateWorkspace,
  getNetworkVerificationQueue,
  getSellerWorkspace,
  listMarketplaceOffers,
  recordSellerConversion,
  reviewAffiliateApplication,
  reviewNetworkVerification,
  reviewSellerConversion,
  saveAffiliateProfile,
  saveSellerOrganization,
  trackAffiliateClick,
} from "./db";
import {
  getAffiliateAnalytics,
  getSellerAnalytics,
  recordOfferImpression,
} from "./analytics-db";

const marketplaceRouter = router({
  list: publicProcedure
    .input(
      z
        .object({
          category: z.string().optional(),
          search: z.string().optional(),
          region: z.enum(MARKET_REGIONS).optional(),
        })
        .optional()
    )
    .query(({ input }) => listMarketplaceOffers(input ?? {})),
  trackReferral: publicProcedure
    .input(z.object({ code: z.string().regex(/^[A-Za-z0-9_-]{12,32}$/) }))
    .query(async ({ input }) => {
      try {
        return await trackAffiliateClick(input.code);
      } catch (error) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            error instanceof Error
              ? error.message
              : "This referral link is not available",
        });
      }
    }),
  trackOfferImpression: publicProcedure
    .input(
      z.object({
        offerId: z.number().int().positive(),
        eventKey: z.string().uuid(),
      })
    )
    .mutation(({ input }) =>
      recordOfferImpression(input.offerId, input.eventKey)
    ),
});

const affiliateRouter = router({
  workspace: protectedProcedure.query(({ ctx }) =>
    getAffiliateWorkspace(ctx.user.id)
  ),
  analytics: protectedProcedure
    .input(
      z.object({
        days: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(30),
      })
    )
    .query(({ ctx, input }) => getAffiliateAnalytics(ctx.user.id, input.days)),
  saveProfile: protectedProcedure
    .input(
      z.object({
        channels: z.string().trim().min(2).max(500),
        audienceSize: z.number().int().min(0).max(100000000),
        bio: z.string().trim().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await saveAffiliateProfile(ctx.user.id, {
          ...input,
          bio: input.bio ?? null,
        });
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Unable to save affiliate profile",
        });
      }
    }),
  savePayPalRecipient: protectedProcedure
    .input(z.object({ email: z.string().trim().email().max(320) }))
    .mutation(async ({ ctx, input }) => {
      try {
        const encryptedEmail = encryptPayPalRecipientEmail(input.email);
        await saveAffiliatePayPalRecipient(ctx.user.id, encryptedEmail);
        return { success: true, hasPayPalRecipient: true } as const;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to save PayPal recipient";
        throw new TRPCError({
          code: message.includes("encryption is not configured")
            ? "PRECONDITION_FAILED"
            : "BAD_REQUEST",
          message: message.includes("encryption is not configured")
            ? "Secure PayPal recipient storage is not configured yet."
            : message,
        });
      }
    }),
  removePayPalRecipient: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      await removeAffiliatePayPalRecipient(ctx.user.id);
      return { success: true, hasPayPalRecipient: false } as const;
    } catch (error) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          error instanceof Error
            ? error.message
            : "Unable to remove PayPal recipient",
      });
    }
  }),
  requestToPromote: protectedProcedure
    .input(
      z.object({
        offerId: z.number().int().positive(),
        channels: z.string().trim().min(2).max(500),
        audienceSize: z.number().int().min(0).max(100000000),
        bio: z.string().trim().max(2000).optional(),
        message: z.string().trim().min(20).max(3000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await createAffiliateApplication(ctx.user.id, input);
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error
              ? error.message
              : "Unable to submit application",
        });
      }
    }),
});

const sellerRouter = router({
  workspace: protectedProcedure.query(({ ctx }) =>
    getSellerWorkspace(ctx.user.id)
  ),
  analytics: protectedProcedure
    .input(
      z.object({
        days: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(30),
      })
    )
    .query(({ ctx, input }) => getSellerAnalytics(ctx.user.id, input.days)),
  register: protectedProcedure
    .input(
      z.object({
        businessName: z.string().trim().min(2).max(180),
        website: z.string().trim().max(500).optional(),
        contactEmail: z.string().trim().email().max(320),
        description: z.string().trim().max(3000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await saveSellerOrganization(ctx.user.id, input);
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Unable to save seller profile",
        });
      }
    }),
  createOffer: protectedProcedure
    .input(
      z.object({
        title: z.string().trim().min(3).max(200),
        category: z.string().trim().min(2).max(64),
        region: z.enum(MARKET_REGIONS).default("Global"),
        description: z.string().trim().min(10).max(5000),
        price: z.number().positive().max(999999999),
        commissionPercent: z.number().min(0).max(100),
        destinationUrl: z
          .string()
          .trim()
          .url()
          .max(1000)
          .optional()
          .or(z.literal("")),
        imageUrl: z
          .string()
          .trim()
          .url()
          .max(1000)
          .optional()
          .or(z.literal("")),
        status: z.enum(["active", "draft"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await createSellerOffer(ctx.user.id, input);
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error ? error.message : "Unable to create offer",
        });
      }
    }),
  rotateWebhookKey: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      return await createSellerWebhookKey(ctx.user.id);
    } catch (error) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          error instanceof Error
            ? error.message
            : "Unable to create webhook key",
      });
    }
  }),
  reviewApplication: protectedProcedure
    .input(
      z.object({
        applicationId: z.number().int().positive(),
        status: z.enum(["approved", "more_details", "declined"]),
        sellerNote: z.string().trim().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await reviewAffiliateApplication(ctx.user.id, input);
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error
              ? error.message
              : "Unable to update application",
        });
      }
    }),
  recordConversion: protectedProcedure
    .input(
      z.object({
        applicationId: z.number().int().positive(),
        orderReference: z.string().trim().min(2).max(120),
        saleAmount: z.number().positive().max(999999999),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await recordSellerConversion(ctx.user.id, input);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error
              ? error.message
              : "Unable to record conversion",
        });
      }
    }),
  reviewConversion: protectedProcedure
    .input(
      z.object({
        conversionId: z.number().int().positive(),
        status: z.enum(["approved", "rejected"]),
        sellerNote: z.string().trim().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await reviewSellerConversion(ctx.user.id, input);
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error
              ? error.message
              : "Unable to update conversion",
        });
      }
    }),
});

const networkRouter = router({
  paypalPayoutOverview: adminProcedure.query(() => getPayoutAdminOverview()),
  paypalDraftReview: adminProcedure
    .input(z.object({ batchId: z.number().int().positive() }))
    .query(({ input }) => getPayPalPayoutDraftReview(input.batchId)),
  preparePaypalPayout: adminProcedure
    .input(
      z.object({
        conversionIds: z
          .array(z.number().int().positive())
          .min(1)
          .max(1000)
          .refine(
            ids => new Set(ids).size === ids.length,
            "Select each commission only once"
          ),
      })
    )
    .mutation(({ ctx, input }) =>
      preparePayPalPayout(ctx.user.id, input.conversionIds)
    ),
  sendPaypalPayout: adminProcedure
    .input(z.object({ batchId: z.number().int().positive() }))
    .mutation(({ input }) => sendPayPalPayout(input.batchId)),
  refreshPaypalPayout: adminProcedure
    .input(z.object({ batchId: z.number().int().positive() }))
    .mutation(({ input }) => refreshPayPalPayout(input.batchId)),
  reconcilePaypalBatch: adminProcedure
    .input(
      z.object({
        batchId: z.number().int().positive(),
        paypalBatchId: z
          .string()
          .trim()
          .regex(/^[A-Z0-9-]{8,64}$/),
      })
    )
    .mutation(({ input }) =>
      reconcileKnownPayPalBatch(input.batchId, input.paypalBatchId)
    ),
  cancelPaypalPayoutDraft: adminProcedure
    .input(z.object({ batchId: z.number().int().positive() }))
    .mutation(({ input }) => cancelPayPalPayoutDraft(input.batchId)),
  verificationQueue: adminProcedure.query(() => getNetworkVerificationQueue()),
  reviewVerification: adminProcedure
    .input(
      z
        .object({
          entityType: z.enum(["seller", "affiliate"]),
          entityId: z.number().int().positive(),
          status: z.enum(["verified", "more_details", "rejected"]),
          note: z.string().trim().max(2000).optional(),
        })
        .superRefine((input, context) => {
          if (input.status === "more_details" && !input.note) {
            context.addIssue({
              code: "custom",
              path: ["note"],
              message: "Add a note explaining what details are needed",
            });
          }
        })
    )
    .mutation(async ({ input }) => {
      try {
        await reviewNetworkVerification(input);
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error
              ? error.message
              : "Unable to update verification",
        });
      }
    }),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  marketplace: marketplaceRouter,
  affiliate: affiliateRouter,
  seller: sellerRouter,
  network: networkRouter,
});

export type AppRouter = typeof appRouter;
