import { useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import { toast } from "sonner";
import {
  Check,
  Clock3,
  Copy,
  KeyRound,
  Link2,
  RotateCw,
  ShieldCheck,
} from "lucide-react";
import type { AppRouter } from "../../../server/routers";
import { trpc } from "@/lib/trpc";

type SellerWorkspace = inferRouterOutputs<AppRouter>["seller"]["workspace"];
type SellerApplication = SellerWorkspace["applications"][number];
type WebhookIntegration = NonNullable<SellerWorkspace["webhookIntegration"]>;

export function SellerWebhookPanel({
  sellerId,
  applications,
  integration,
}: {
  sellerId: number;
  applications: SellerApplication[];
  integration: WebhookIntegration | null;
}) {
  const [secret, setSecret] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const rotateMutation = trpc.seller.rotateWebhookKey.useMutation({
    onSuccess: async result => {
      setSecret(result.secret);
      toast.success(
        "Webhook key created. Copy it now; it cannot be viewed again."
      );
      await utils.seller.workspace.invalidate();
    },
    onError: error => toast.error(error.message),
  });

  const endpointPath =
    integration?.endpoint ?? `/api/webhooks/orders/${sellerId}`;
  const endpoint = `${window.location.origin}${endpointPath}`;
  const approvedApplications = applications.filter(
    application => application.status === "approved" && application.trackingCode
  );
  const exampleReferralCode =
    approvedApplications[0]?.trackingCode ?? "REPLACE_WITH_APPROVED_CODE";

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied.`);
    } catch {
      toast.error(
        `Could not copy ${label.toLowerCase()}. Select and copy it manually.`
      );
    }
  }

  function rotateKey() {
    if (
      integration &&
      !window.confirm(
        "Rotating this key immediately disables the current key. Update your order-system integration with the new key. Continue?"
      )
    )
      return;
    setSecret(null);
    rotateMutation.mutate();
  }

  const examplePayload = JSON.stringify(
    {
      eventId: "evt_unique_order_1048",
      eventType: "order.paid",
      orderReference: "ORDER-1048",
      referralCode: exampleReferralCode,
      saleAmount: 249.0,
      currency: "USD",
    },
    null,
    2
  );

  return (
    <section className="workspace-card webhook-setup-card">
      <div className="webhook-card-heading">
        <div>
          <div className="card-kicker">
            <span className="kicker-icon">
              <Link2 size={16} />
            </span>
            <span>ORDER AUTOMATION</span>
          </div>
          <h2>Connect paid-order events.</h2>
          <p>
            Send a minimal paid-order callback to record affiliate-attributed
            sales automatically. Each event is matched to an approved referral
            and enters your normal commission review queue.
          </p>
        </div>
        <span
          className={`webhook-status${integration ? " webhook-status-on" : ""}`}
        >
          {integration ? <Check size={13} /> : <Clock3 size={13} />}
          {integration ? "ENDPOINT READY" : "NOT CONNECTED"}
        </span>
      </div>

      <div className="webhook-endpoint-row">
        <div>
          <span className="webhook-label">YOUR SECURE ENDPOINT</span>
          <code>{endpoint}</code>
        </div>
        <button
          className="copy-link-button"
          type="button"
          onClick={() => void copy(endpoint, "Endpoint URL")}
        >
          <Copy size={14} /> Copy
        </button>
      </div>

      {integration?.lastReceivedAt && (
        <p className="webhook-last-seen">
          <Check size={13} /> Last event received{" "}
          {new Date(integration.lastReceivedAt).toLocaleString()}.
        </p>
      )}

      <div className="webhook-security-row">
        <div>
          <ShieldCheck size={17} />
          <span>
            The key is shown only once. ONWHEELZ stores a one-way hash; rotating
            it revokes the old key immediately.
          </span>
        </div>
        <button
          className="button button-dark webhook-key-button"
          type="button"
          onClick={rotateKey}
          disabled={rotateMutation.isPending}
        >
          {rotateMutation.isPending ? (
            <RotateCw size={15} className="webhook-spin" />
          ) : (
            <KeyRound size={15} />
          )}
          {rotateMutation.isPending
            ? "Creating key…"
            : integration
              ? "Rotate webhook key"
              : "Generate webhook key"}
        </button>
      </div>

      {secret && (
        <div className="webhook-secret-reveal" role="status">
          <div>
            <strong>Copy your new key now</strong>
            <span>
              It disappears when you leave this page or generate another key.
            </span>
          </div>
          <code>{secret}</code>
          <button
            className="copy-link-button"
            type="button"
            onClick={() => void copy(secret, "Webhook key")}
          >
            <Copy size={14} /> Copy key
          </button>
        </div>
      )}

      <details className="webhook-payload-details">
        <summary>View the event format and setup notes</summary>
        <p>
          Submit only completed USD orders; do not include names, addresses,
          email, payment credentials, or other customer data. The event ID and
          order reference are both deduplicated. A repeated delivery is
          acknowledged without creating a second commission record.
        </p>
        <div className="webhook-code-heading">
          <span>JSON BODY</span>
          {approvedApplications.length > 0 && (
            <span>
              {approvedApplications.length} approved referral code(s) available
            </span>
          )}
        </div>
        <pre>{examplePayload}</pre>
        <div className="webhook-code-heading">
          <span>AUTHENTICATION HEADER</span>
        </div>
        <pre>X-ONWHEELZ-Webhook-Key: $ONWHEELZ_WEBHOOK_KEY</pre>
        <p className="webhook-shopify-note">
          Shopify stores need a small relay to validate Shopify’s raw-body HMAC
          and transform the paid order into this privacy-minimal ONWHEELZ
          format; this endpoint is not a native Shopify HMAC endpoint.
        </p>
      </details>
    </section>
  );
}
