# PayPal Payouts operator runbook

This runbook documents the ONWHEELZ PayPal Payouts integration. It is **manual and disabled by default**. It does not execute a payout in this document.

## Before setup

1. Confirm ONWHEELZ’s legal sender country, intended recipient countries, USD payout strategy, and business funding/approval requirements with PayPal.
2. Use an eligible verified PayPal Business account and obtain Payouts API approval. PayPal’s availability, recipient restrictions, fees, and supported features depend on sender and recipient country/account status. The app does not claim that every affiliate is eligible.
3. Create and test a PayPal REST app in **sandbox**. Configure a PayPal payout webhook for `https://<ONWHEELZ-host>/api/webhooks/paypal/payouts`, with at least the batch and item success/failure/blocked/returned/unclaimed event types in the PayPal dashboard. Save the PayPal-issued webhook ID.
4. Add the PayPal app values and a newly generated AES encryption key directly to the app’s managed **server-side** secret store, not in chat or Git. Keep `PAYPAL_PAYOUTS_ENABLED` unset/false while verifying setup.
5. Back up `PAYPAL_RECIPIENT_ENCRYPTION_KEY` securely. Existing affiliate recipient ciphertext cannot be decrypted after this key is lost or rotated.

Configuration is described in the root [`README.md`](../README.md). No PayPal credentials are included in this repository. The app’s setup status reports only missing variable names, never their values.

## Affiliate setup

A signed-in affiliate can save a PayPal email from the affiliate workspace. The server validates and normalizes it, encrypts it with AES-256-GCM, and persists ciphertext; raw email is not returned by the workspace or admin overview. The affiliate can remove the saved recipient unless an unsent/ambiguous batch references it. A draft snapshots recipients until cancellation or PayPal acceptance.

## Prepare and review a batch

An ONWHEELZ admin opens the network payout desk and selects eligible, seller-approved USD commissions for internally verified affiliates who have saved a recipient email. The server performs the reservation in a database transaction, groups the amount per affiliate using integer cents, and assigns a stable provider/idempotency reference before any HTTP request.

The draft displays affiliate name, amount, conversion count, USD total, count of recipients, and sandbox/live environment. Review the selected records and environment. Canceling an unsent draft releases its commissions and erases the encrypted recipient snapshots. A submitted batch cannot be cancelled from this interface.

## Submit and reconcile

1. Keep the endpoint in sandbox until the end-to-end test has passed. Live sending additionally requires a two-letter `PAYPAL_PAYOUT_COUNTRY`, all required server settings, and `PAYPAL_PAYOUTS_ENABLED=true`.
2. The admin explicitly confirms the displayed batch/environment in the app. The integration sends at most 100 affiliates per batch, using `recipient_type: EMAIL` on each payout item, USD values with two decimal places, and the pre-persisted PayPal batch/request ID.
3. If PayPal accepts the batch, its returned batch ID is persisted before the app attempts a best-effort status read. The transient encrypted recipient snapshot is erased at acceptance.
4. If the response is ambiguous, **do not create a new batch with a new identifier**. Retry only the same persisted batch/request ID or inspect PayPal and use the admin-only “Link & refresh” control with the already-existing PayPal batch ID. An active submission lock prevents a second simultaneous send; after a stale lock, retries retain the same identifier. ONWHEELZ records the first submission time and closes same-ID retries after a conservative 29 days (one day before PayPal’s documented 30-day request-ID retention); after that, reconcile by linking the existing provider batch and never resend the unresolved batch.
5. PayPal webhooks are verified via PayPal’s verification API and configured webhook ID. The application stores event ID/type only, de-duplicates events, and retrieves the bounded batch status snapshot from PayPal rather than persisting the raw webhook body.
6. A conversion becomes `paid` only after a corresponding PayPal item reports success. Failed/blocked/returned unpaid items are released back to approved status; a return after an item was shown paid goes to seller review before another attempt. Unclaimed items remain unpaid until PayPal reports a terminal result.

An HTTP 200 from the seller order-ingestion route only acknowledges ledger ingestion. It is not a payout, seller approval, or PayPal confirmation.

## Boundaries

- This release does not initiate a payout automatically, on a schedule, or as part of a customer checkout.
- The app only supports USD payout items. PayPal may reject a sender/recipient/currency/account combination; an admin must resolve eligibility with PayPal.
- It does not collect bank details, tax forms, or KYC documentation. ONWHEELZ’s internal profile review is not provider onboarding or legal identity verification.
- Provider API errors are stored as bounded non-sensitive error codes; raw response bodies, tokens, and recipient emails are never put in logs or Git.
- No live credentials have been configured or tested in this session; tests use stubbed PayPal responses only.

## Official references

- [PayPal Payouts API overview](https://developer.paypal.com/docs/payouts/)
- [Create a payout batch](https://developer.paypal.com/api/payments.payouts-batch/v1/payouts-post)
- [Show payout batch details](https://developer.paypal.com/api/payments.payouts-batch/v1/payouts-get)
- [Payouts API access and fees (PayPal help)](https://www.paypal.com/us/cshelp/article/what-is-the-payouts-api-formerly-known-as-mass-pay-and-how-to-apply-for-it-help250)
- [PayPal Payouts supported features](https://developer.paypal.com/payouts/supported-features)
