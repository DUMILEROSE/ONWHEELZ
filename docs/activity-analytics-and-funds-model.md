# Activity analytics and funds model

**Status:** analytics dashboards are implemented; vendor-funded wallets, deposits, withdrawals, and escrow are not implemented.

## What the dashboards measure

Seller and affiliate workspaces support **7-, 30-, and 90-day** windows. The start date is midnight UTC for the inclusive reporting period.

| Metric | Definition | Important limitation |
| --- | --- | --- |
| Offer views | A catalog offer card that reached at least 50% visibility in the browser viewport. Each rendered card sends one idempotent event. | Counts recorded visibility events, not distinct people. Browser blocking, rapid navigation, or event retries can affect completeness. |
| Affiliate clicks | Persistent server-side referral redirect events linked to an approved promotion application. | A click is not a unique visitor or proof that a person viewed the destination page. |
| Reported orders | Conversion rows entered by a seller or received through the seller's order webhook. | A reported order remains pending until seller review; this is not an independently verified checkout event. |
| Confirmed sales | Conversion values in approved, batched, or paid states. | A confirmed commission is not necessarily settled; only the paid state indicates a payout item was reported successful by PayPal. |
| Pending sales / commission | Seller-reported conversion values awaiting review. | These are provisional and must not be treated as a payable balance. |

The dashboard is an operational record of **events captured by ONWHEELZ**, not a guarantee that every real-world visit or purchase is captured. Event counts are stored without automatic expiry. Offer-view events contain an offer ID, event UUID, and UTC timestamp only: no visitor account ID, IP address, cookie identifier, or user-agent string is collected. Dashboard query results are scoped to the authenticated affiliate or the seller organization owned by the authenticated user.

## Wallet, escrow, and payout boundaries

The current PayPal integration is an **outgoing affiliate Payouts workflow**. It does not accept vendor deposits, maintain a vendor cash wallet, offer vendor withdrawals, or hold a vendor's marketing budget in escrow. A dashboard balance without corresponding provider-held funds would be misleading, and platform custody would introduce materially different legal, reconciliation, access-control, and recovery obligations. No such balance or transfer feature is enabled in this release.

The PayPal Payouts API is a disbursement product, not a seller-funded wallet or inbound-funding flow. PayPal documents that its delayed-disbursement checkout option is available to approved partners with the `DELAY_FUNDS_DISBURSEMENT` seller feature; funds are automatically disbursed to sellers after 28 days. That is a short, transaction-specific delay, **not indefinite escrow** and not a vendor-prefunded commission budget. PayPal seller onboarding is also country- and product-dependent. Review the current PayPal terms with PayPal and qualified legal/compliance advisers before designing funds flow.

PayPal client secrets, webhook identifiers, and encryption keys belong only in the project's managed server-side secret store. Do not request or transmit these values through chat, source files, GitHub, or client code. The app remains fail-closed for outgoing payout sends until required secrets and country settings are supplied and the sandbox flow is validated.

## Official PayPal documentation

- [Delayed disbursement](https://developer.paypal.com/platforms/checkout/delayed-disbursement) — partner and seller-feature eligibility, 28-day automatic disbursement, and order-based checkout flow.
- [Seller onboarding](https://developer.paypal.com/platforms/seller-onboarding) — seller onboarding methods and country eligibility.
- [Payouts API](https://developer.paypal.com/api/payouts/) — outbound batch disbursements.
- [PayPal Help: Payouts API and applying for access](https://www.paypal.com/us/cshelp/article/what-is-the-payouts-api-formerly-known-as-mass-pay-and-how-do-i-apply-for-it-help250).

## Possible next architectures

These are options for a future, separately scoped funds-movement feature; none is enabled by this release.

| Approach | Tradeoffs | Cost | Setup complexity |
| --- | --- | --- | --- |
| PayPal Multiparty Checkout with delayed disbursement | Uses PayPal seller onboarding and order-level payments; requires PayPal partner approval and eligible countries; automatic release after 28 days means it is not a general escrow or vendor-prefunded budget. | PayPal transaction/partner fees vary by country and contract. | High: partner approval, seller onboarding, checkout integration, eligibility review, reconciliation, and legal review. |
| Licensed marketplace PSP with connected seller accounts and provider-held balances | Best fit for prefunding, seller sub-balances, split settlement, and controlled withdrawals if the provider explicitly supports the use case in the chosen countries. Custody remains with the provider, subject to its contract and local law. | Provider, payout, FX, and possible account/balance fees are quote- and country-dependent. | High: provider underwriting, legal/compliance review, connected-account onboarding, double-entry ledger, reconciliation, reserves, disputes, and payout controls. |
| Non-custodial commission-budget ledger | Can track a seller's declared or allocated marketing budget without receiving or representing money held by ONWHEELZ. Actual funding and affiliate payment stay outside the platform. | No platform-held-funds fee; implementation and operating costs still apply. | Low to medium, but it does **not** satisfy deposits, withdrawals, or escrow. |
