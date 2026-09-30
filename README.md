# ONWHEELZ Affiliate Network

**ONWHEELZ** connects companies selling mobility products and services with independent affiliates. The catalog spans vehicles, parts, maintenance, commercial transport, aircraft, marine craft, and other things that move.

## What’s included

- Public mobility marketplace, category photography/lookbook, and worldwide/region filtering.
- Seller and affiliate onboarding, product offers, affiliate applications, seller decisions, and internal profile review.
- Referral redirects, persistent click events, and a privacy-minimal paid-order webhook for seller systems.
- Seller-reviewed commission records and an admin payout desk integrated with **PayPal Payouts**.
- Encrypted PayPal recipient email storage, exact-cent batch accounting, idempotent batch IDs, explicit admin confirmation, status refresh, PayPal webhook verification, and an audit ledger.

The site is built with React, TypeScript, Tailwind, Express, tRPC, Drizzle ORM, and MySQL/TiDB. Authentication uses the configured Manus OAuth service.

## Local development

Use Node.js 22 and pnpm from the repository root:

```bash
pnpm install
pnpm dev
```

Before accepting changes, run:

```bash
pnpm check
pnpm test
pnpm build
```

Database changes are defined in `drizzle/schema.ts`; generate a migration with `pnpm drizzle-kit generate` and apply its reviewed SQL through the managed WebDev database migration workflow. Do not run destructive schema resets against production data.

## PayPal setup

Payouts are **disabled by default**. To use the integration, the ONWHEELZ operator must have a verified PayPal Business account, obtain PayPal approval for Payouts API access, register the payout status webhook, and configure the following variables in the app’s **server-side managed secret store**:

| Variable                          | Purpose                                                                                                                                                                                                               |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PAYPAL_ENVIRONMENT`              | `sandbox` (default) or `live`. Begin with sandbox.                                                                                                                                                                    |
| `PAYPAL_CLIENT_ID`                | PayPal REST app client ID.                                                                                                                                                                                            |
| `PAYPAL_CLIENT_SECRET`            | PayPal REST app secret.                                                                                                                                                                                               |
| `PAYPAL_WEBHOOK_ID`               | PayPal-issued ID for the endpoint `/api/webhooks/paypal/payouts`.                                                                                                                                                     |
| `PAYPAL_RECIPIENT_ENCRYPTION_KEY` | Base64-encoded, stable 32-byte AES key for affiliate recipient emails. Generate a new key with `openssl rand -base64 32`. **Back it up securely and do not rotate it without re-encrypting saved recipient records.** |
| `PAYPAL_PAYOUT_COUNTRY`           | ONWHEELZ sender’s two-letter country code; required for live mode.                                                                                                                                                    |
| `PAYPAL_PAYOUTS_ENABLED`          | Must be exactly `true` before the payout desk will permit a send. Otherwise no outgoing payout request can be submitted.                                                                                              |

Never place live credentials or the encryption key in client code, Git, a committed `.env` file, issue, chat, or public document. Add them directly to the project’s managed server-side secrets after provider approval. This repository contains no PayPal credentials.

### Transfer safeguards and limits

- Use PayPal **sandbox** first; verify onboarding, a test batch, webhooks, duplicate deliveries, and reconciliation before considering live mode.
- All commissions paid through this release are USD; batches are capped at 100 affiliates per batch by ONWHEELZ.
- Only seller-approved conversions belonging to internally verified affiliates are eligible. Affiliates must set their own PayPal recipient email; ONWHEELZ encrypts it at rest.
- A draft reserves commissions, shows exact recipients and totals, and requires an explicit admin action. Accepted batches use one persisted PayPal idempotency identifier; ambiguous responses are reconciled rather than sent with a fresh identifier.
- A conversion is marked paid only after PayPal reports an item success. Failures/returns are not reported as successful. An unsuccessful return after a prior paid state is sent back to seller review.
- Transfers are **not automatic or recurring**. PayPal approval, sender balance, eligible countries/currencies, recipient restrictions, current fees, and platform obligations must be confirmed with PayPal and the business’s advisers.

See [`docs/paypal-payouts.md`](docs/paypal-payouts.md) for the operating runbook, and [`research-provider-webhooks.md`](research-provider-webhooks.md) for the official-source comparison. The PayPal integration is implemented, but it remains unconfigured and disabled until the operator configures the server secrets and performs the required testing/review.

## Order-event webhooks

Sellers can set up an ONWHEELZ-specific webhook from their seller workspace. It accepts only a minimal paid-order payload using a one-time per-seller key; the key is hashed in storage and rotation revokes the old key. Requests that include extra fields (especially customer data) are rejected. Ingested records stay pending until the seller reviews them; receiving an HTTP acknowledgement is not a payout or commission approval.

See [`docs/order-webhook-integration.md`](docs/order-webhook-integration.md) for the exact payload and retry behavior. A Shopify store needs an adapter that verifies Shopify’s raw-body HMAC and maps its event into ONWHEELZ’s minimal payload; native Shopify signature verification is not included.

## Project safety notes

- Network-wide payout routes are administrator-only; affiliate recipient routes operate only on the authenticated user’s own profile.
- Raw PayPal webhook bodies and customer order data are not persisted. PayPal webhook storage contains event ID/type only.
- Referral click records are retained without automatic expiry and do not include IP or user-agent fingerprints.
- Never treat internal profile verification as legal identity/KYC verification.

## Managed media assets

The refined logo and generated category photographs are referenced from managed WebDev object storage rather than checked into `client/public` or bundled into the repo. The source repo includes the app-side references; a standalone host must upload the same assets to its own object storage and update those URLs.
