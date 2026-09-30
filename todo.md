# ONWHEELZ release status — 2026-09-30

## Code release — complete
- [x] Built the ONWHEELZ mobility marketplace with category and region filters, polished category photography, responsive layouts, and the refined logo mark.
- [x] Implemented seller and affiliate onboarding, offers, promotion requests and review, referral links, persistent click tracking, and conversion attribution.
- [x] Implemented seller paid-order webhooks with per-seller revocable keys, strict minimal payload validation, duplicate protection, and seller review before commission approval.
- [x] Implemented PayPal Payouts with encrypted recipient-email storage, exact-cent batch accounting, reservations, idempotency controls, explicit admin confirmation, provider reconciliation, signed status webhooks, and audit history.
- [x] Added repository setup instructions and PayPal/order-webhook operations guides.
- [x] Verified fail-closed payout setup: sending remains disabled until required server-side settings and the first payout country are configured; unsigned PayPal webhook requests receive HTTP 401.
- [x] Validation passed: 32 Vitest tests, `pnpm check`, and `pnpm build`. Local `GET /` returned HTTP 200. Desktop, mobile, and authenticated admin payout-desk previews were reviewed.

## Operational prerequisites before real money movement

The code is delivered sandbox-first and disabled for outgoing payouts by default. This is an intentional safety default, not an unfinished code task. Before any live transfer, the ONWHEELZ operator must select the first payout country, verify PayPal account and regional eligibility/approval, configure the required PayPal credentials, webhook ID, and stable encryption key in managed server-side secrets, and complete end-to-end sandbox tests. Live sends remain manual and must be explicitly enabled only after those steps.

## Product and data decisions

Seller webhook events create pending conversion records; sellers review them before commission approval. Shopify needs a server-side relay that validates Shopify's raw-body HMAC and maps the event to ONWHEELZ's minimal payload; native Shopify signature verification is not included. Referral click events persist without automatic expiry and store only application ID and UTC timestamp, with no IP or user-agent data. Internal profile verification is a directory/business review, not legal identity or KYC verification.
