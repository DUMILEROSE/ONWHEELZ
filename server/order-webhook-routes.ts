import express, { type Express } from "express";
import { processSellerOrderWebhook } from "./db";
import { OrderWebhookError } from "./order-webhooks";

export function registerOrderWebhookRoutes(app: Express) {
  app.post(
    "/api/webhooks/orders/:sellerId",
    express.json({ limit: "32kb" }),
    (req, res) => {
      const sellerId = Number(req.params.sellerId);
      void processSellerOrderWebhook(
        sellerId,
        req.get("X-ONWHEELZ-Webhook-Key") ?? "",
        req.body
      )
        .then(result => {
          res.status(200).json(result);
        })
        .catch(error => {
          if (error instanceof OrderWebhookError) {
            res.status(error.statusCode).json({ error: error.message });
            return;
          }
          console.error("[Order webhook] Processing failed:", error);
          res.status(500).json({ error: "Webhook could not be processed." });
        });
    }
  );
}
