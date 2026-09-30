# Provider and webhook research — 2026-09-28

## Stripe Connect

Stripe’s hosted onboarding collects business and identity-verification information through a Stripe-hosted form. Requirements vary by connected-account country, business type, and requested capabilities; the platform creates the connected account and Account Link, then Stripe gathers needed requirements (including payout/bank details). Source: https://docs.stripe.com/connect/hosted-onboarding

Stripe’s public pricing page distinguishes pricing models. Under Stripe-handled pricing, Stripe bills connected accounts directly and lists no added platform fee for account/payout volume/per-payout. Under platform-handled pricing, the public page lists $2 per monthly active account and 0.25% + $0.25 per payout; cross-border payouts start at 0.25% of payout volume and Instant Payouts are 1%. Actual prices and availability depend on country, charge model, and platform agreement. Source: https://stripe.com/connect/pricing

Implication: Stripe Connect is a strong candidate where ONWHEELZ needs hosted affiliate onboarding, bank/debit payouts, and platform-managed connected-account status. It requires a Stripe platform account, country/capability decisions, server API and webhook credentials, and a clear plan for how seller transactions fund affiliate commissions.

## PayPal Payouts

PayPal’s official US help page says Payouts API access is not available to every account; a verified PayPal Business account and acceptable business justification are required, and PayPal must enable/approve access. The sender’s PayPal balance must cover both payouts and fees. Recipients receive into a PayPal account; unregistered recipients have 30 days to claim or funds return. PayPal lists 24 major currencies and says the sender pays a transaction fee, with exact current fees linked to its fee schedule. Country-specific limits may apply. Source: https://www.paypal.com/us/cshelp/article/what-is-the-payouts-api-formerly-known-as-mass-pay-and-how-to-apply-for-it-help250

Implication: PayPal can fit manual commission batches without requiring bank credentials inside ONWHEELZ, but it is recipient-account-centric, still requires an approved business account and prefunded PayPal balance, and may not fit affiliates who prefer bank payouts. The dynamic PayPal developer pages for multiparty/seller onboarding did not expose documentation through text fetch, so no claims from their search snippets are relied on here.

## Shopify/order webhook facts

Shopify webhook deliveries use HMAC-SHA256 (`X-Shopify-Hmac-SHA256`) over the raw request body with the app client secret. Shopify recommends constant-time validation and duplicate suppression by delivery ID. Source: https://shopify.dev/docs/apps/build/webhooks/verify-deliveries

Shopify’s Agent/UCP order-webhook guide says deliveries can retry up to 8 times over 4 hours and expects a quick 2xx acknowledgement. This particular page covers Agent/UCP orders, not a generic self-serve merchant webhook setup; its subscription must be registered through Shopify. Source: https://shopify.dev/docs/agents/orders/order-webhooks

Implementation implication: ONWHEELZ accepts a normalized, privacy-minimal `order.paid` payload over a per-seller HTTPS endpoint. A Shopify store would need a relay/bridge to verify Shopify’s raw-body HMAC and map its paid-order plus referral metadata into this ONWHEELZ contract; the app does not claim native Shopify HMAC verification yet.

## Verified Payouts API request and retry semantics (official reference, 2026-09-28)

The create-batch operation is `POST /v1/payments/payouts`, uses a client-credentials OAuth bearer token with the Payouts scope, and accepts a `sender_batch_header` plus an `items` array. The current schema allows 1–15,000 items per batch. PayPal documents `sender_batch_id` duplicate rejection for IDs used within the prior 30 days and says a 5xx response can be retried with the same sender batch ID. The optional `PayPal-Request-Id` header is retained for 30 days (length 1–1,000). These rules motivate persisting one stable idempotency ID before any send and never inventing a new ID after an ambiguous network result. Source: https://developer.paypal.com/api/payments.payouts-batch/v1/payouts-post
