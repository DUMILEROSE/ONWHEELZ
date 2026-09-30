# ONWHEELZ paid-order webhook integration

This endpoint creates a **pending commission-ledger entry** for a paid order associated with an approved affiliate referral. It does not collect customer payments, confirm a commission, or move money.

## Seller setup

1. Sign in and open **Seller studio → Order automation**.
2. Generate a webhook key. Copy it at creation time; ONWHEELZ stores only a one-way hash and cannot show the key again.
3. Keep the key in the order system's server-side secret store. Do not expose it in a browser, mobile app, URL, source repository, or customer-visible configuration.
4. Configure a server-side callback to the endpoint shown in Seller studio. Rotating the key immediately revokes the previous key.
5. Store the ONWHEELZ referral code in the order/cart metadata when the affiliate referral enters the store. Only codes for approved partnerships with this seller are accepted.

## Request

Send an HTTPS `POST` to the seller-specific endpoint with JSON content type and the key header:

```http
POST https://YOUR-ONWHEELZ-DOMAIN/api/webhooks/orders/SELLER_ID
Content-Type: application/json
X-ONWHEELZ-Webhook-Key: YOUR_SERVER_SIDE_SECRET
```

Payload shape (no extra fields are accepted):

```json
{
  "eventId": "evt_unique_order_1048",
  "eventType": "order.paid",
  "orderReference": "ORDER-1048",
  "referralCode": "YOUR_APPROVED_REFERRAL_CODE",
  "saleAmount": 249.00,
  "currency": "USD"
}
```

`eventId` must be stable across retries and unique for the order event. `orderReference` must be stable for the sale. Both are used for duplicate suppression. Amounts are rounded to cents. The current ledger contract accepts USD only, consistent with the marketplace's current USD offer-entry controls.

A successful first delivery returns HTTP 200 and a response similar to:

```json
{
  "received": true,
  "duplicate": false,
  "commissionAmount": "29.88"
}
```

A retry returns HTTP 200 with `duplicate: true` and does not create a second conversion. The new row begins as **pending**; the seller confirms or rejects it in the Conversion ledger. Do not interpret an HTTP 200 as a payout or commission approval.

## Safe retry behavior

- Retry transient network failures and HTTP 5xx responses using the **same** event ID and order reference.
- Do not retry malformed payloads (400), failed authentication (401), or an unknown/unapproved referral code (404) until the configuration is corrected.
- The request body limit is 32 KB. Only completed `order.paid` events are accepted; buyer names, email addresses, addresses, payment data, and other customer fields are intentionally rejected.
- Treat this endpoint as an HTTPS server-to-server integration. Never store the key in customer-visible client code.

## Shopify and other commerce platforms

Shopify supports signed webhook deliveries and recommends verifying its HMAC over the **raw** request body and suppressing duplicate deliveries by delivery ID. A Shopify store therefore needs a server-side relay/bridge that verifies Shopify's signature, maps the paid order to the minimal ONWHEELZ payload above, adds the already-stored approved referral code, and sends the ONWHEELZ key only on the server-to-server request. The ONWHEELZ endpoint does **not** directly verify Shopify's `X-Shopify-Hmac-SHA256` signature. Do not forward Shopify's full customer-bearing payload.

Official references:

- [Shopify webhook delivery verification](https://shopify.dev/docs/apps/build/webhooks/verify-deliveries)
- [Shopify order webhook guidance](https://shopify.dev/docs/agents/orders/order-webhooks)

## Payout provider boundary

Webhook records are attribution and ledger automation only. ONWHEELZ does not yet onboard payout recipients or move affiliate commissions. That separate integration needs a payout-provider decision, merchant/platform authorization, credentials stored in managed server secrets, regional eligibility review, and a separately tested approval/reconciliation flow.
