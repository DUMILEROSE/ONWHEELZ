import express, { type Express } from "express";
import { getPayPalRuntimeConfig, PayPalClient } from "./paypal-client";
import { handleVerifiedPayPalWebhook } from "./paypal-payout-service";

export function registerPayPalPayoutWebhookRoute(app: Express) {
  app.post(
    "/api/webhooks/paypal/payouts",
    express.json({ limit: "64kb", type: "application/json" }),
    (req, res) => {
      const config = getPayPalRuntimeConfig();
      const headers = {
        authAlgo: req.get("PayPal-Auth-Algo") ?? "",
        certUrl: req.get("PayPal-Cert-Url") ?? "",
        transmissionId: req.get("PayPal-Transmission-Id") ?? "",
        transmissionSignature: req.get("PayPal-Transmission-Sig") ?? "",
        transmissionTime: req.get("PayPal-Transmission-Time") ?? "",
      };
      if (
        !config.webhookId ||
        !headers.authAlgo ||
        !headers.certUrl ||
        !headers.transmissionId ||
        !headers.transmissionSignature ||
        !headers.transmissionTime
      ) {
        res.status(401).json({ error: "Invalid PayPal webhook." });
        return;
      }

      void new PayPalClient(config)
        .verifyWebhookSignature(headers, req.body)
        .then(isValid => {
          if (!isValid) {
            res.status(401).json({ error: "Invalid PayPal webhook." });
            return null;
          }
          return handleVerifiedPayPalWebhook(req.body);
        })
        .then(result => {
          if (!result || res.headersSent) return;
          res.status(200).json({ accepted: true });
        })
        .catch(() => {
          // Do not log/store the raw provider event; it may contain recipient data.
          res.status(500).json({ error: "PayPal event could not be reconciled." });
        });
    }
  );
}
