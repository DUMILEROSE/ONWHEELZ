export type PayPalEnvironment = "sandbox" | "live";

export interface PayPalPayoutItemRequest {
  recipient_type: "EMAIL";
  sender_item_id: string;
  receiver: string;
  amount: { value: string; currency: "USD" };
  note: string;
}

export interface PayPalPayoutItemResult {
  sender_item_id?: string;
  payout_item_id?: string;
  transaction_status?: string;
  errors?: { name?: string; message?: string };
}

export interface PayPalPayoutBatchSnapshot {
  batch_header?: {
    payout_batch_id?: string;
    batch_status?: string;
    sender_batch_header?: { sender_batch_id?: string };
  };
  items?: PayPalPayoutItemResult[];
  links?: Array<{ href: string; rel: string; method: string }>;
}

export interface PayPalWebhookHeaders {
  authAlgo: string;
  certUrl: string;
  transmissionId: string;
  transmissionSignature: string;
  transmissionTime: string;
}

export interface PayPalRuntimeConfig {
  environment: PayPalEnvironment;
  apiBaseUrl: string;
  clientId: string;
  clientSecret: string;
  webhookId: string;
  senderCountry: string;
  payoutsEnabled: boolean;
}

export class PayPalApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean
  ) {
    super(message);
    this.name = "PayPalApiError";
  }
}

export function getPayPalRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env
): PayPalRuntimeConfig {
  const environment: PayPalEnvironment =
    env.PAYPAL_ENVIRONMENT === "live" ? "live" : "sandbox";
  return {
    environment,
    apiBaseUrl:
      environment === "live"
        ? "https://api-m.paypal.com"
        : "https://api-m.sandbox.paypal.com",
    clientId: env.PAYPAL_CLIENT_ID ?? "",
    clientSecret: env.PAYPAL_CLIENT_SECRET ?? "",
    webhookId: env.PAYPAL_WEBHOOK_ID ?? "",
    senderCountry: (env.PAYPAL_PAYOUT_COUNTRY ?? "").trim().toUpperCase(),
    payoutsEnabled: env.PAYPAL_PAYOUTS_ENABLED === "true",
  };
}

export function getPayPalSetupState(env: NodeJS.ProcessEnv = process.env) {
  const config = getPayPalRuntimeConfig(env);
  const missing: string[] = [];
  if (!config.clientId) missing.push("PAYPAL_CLIENT_ID");
  if (!config.clientSecret) missing.push("PAYPAL_CLIENT_SECRET");
  const encryptionKey = env.PAYPAL_RECIPIENT_ENCRYPTION_KEY ?? "";
  const validEncryptionKey =
    /^[A-Za-z0-9+/]{43}=$/.test(encryptionKey) &&
    Buffer.from(encryptionKey, "base64").length === 32;
  if (!validEncryptionKey) missing.push("PAYPAL_RECIPIENT_ENCRYPTION_KEY");
  if (!config.webhookId) missing.push("PAYPAL_WEBHOOK_ID");
  if (
    config.environment === "live" &&
    !/^[A-Z]{2}$/.test(config.senderCountry)
  ) {
    missing.push("PAYPAL_PAYOUT_COUNTRY");
  }
  return {
    environment: config.environment,
    senderCountry: config.senderCountry || null,
    payoutsEnabled: config.payoutsEnabled,
    ready: missing.length === 0 && config.payoutsEnabled,
    missing,
  };
}

function requireApiConfig(config: PayPalRuntimeConfig) {
  if (!config.clientId || !config.clientSecret) {
    throw new Error("PayPal API credentials are not configured");
  }
  if (
    config.environment === "live" &&
    !/^[A-Z]{2}$/.test(config.senderCountry)
  ) {
    throw new Error("Set the PayPal payout country before enabling live mode");
  }
}

function safeErrorText(status: number, payload: unknown): string {
  if (payload && typeof payload === "object" && "name" in payload) {
    const name = String((payload as { name?: unknown }).name ?? "");
    if (/^[A-Z_]{1,80}$/.test(name))
      return `PayPal API returned ${name} (HTTP ${status})`;
  }
  return `PayPal API request failed (HTTP ${status})`;
}

export class PayPalClient {
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(
    private readonly config: PayPalRuntimeConfig = getPayPalRuntimeConfig(),
    private readonly request: typeof fetch = fetch
  ) {}

  private async getAccessToken(): Promise<string> {
    requireApiConfig(this.config);
    if (this.accessToken && this.tokenExpiresAt > Date.now() + 60_000) {
      return this.accessToken;
    }
    const response = await this.request(
      `${this.config.apiBaseUrl}/v1/oauth2/token`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: "grant_type=client_credentials",
        signal: AbortSignal.timeout(10_000),
      }
    );
    const payload = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      name?: string;
    };
    if (!response.ok || !payload.access_token) {
      throw new PayPalApiError(
        safeErrorText(response.status, payload),
        response.status,
        response.status >= 500
      );
    }
    this.accessToken = payload.access_token;
    this.tokenExpiresAt =
      Date.now() + Math.max(60, payload.expires_in ?? 300) * 1000;
    return this.accessToken;
  }

  private async api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.getAccessToken();
    let response: Response;
    try {
      response = await this.request(`${this.config.apiBaseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...init.headers,
        },
        signal: init.signal ?? AbortSignal.timeout(15_000),
      });
    } catch (error) {
      if (error instanceof PayPalApiError) throw error;
      throw new PayPalApiError(
        "PayPal API connection failed; safely retry with the same batch ID",
        0,
        true
      );
    }
    const payload = (await response.json().catch(() => ({}))) as T & {
      name?: string;
    };
    if (!response.ok) {
      throw new PayPalApiError(
        safeErrorText(response.status, payload),
        response.status,
        response.status >= 500 || response.status === 429
      );
    }
    return payload;
  }

  createPayoutBatch(
    senderBatchId: string,
    items: PayPalPayoutItemRequest[]
  ): Promise<PayPalPayoutBatchSnapshot> {
    if (!/^[A-Za-z0-9_-]{1,30}$/.test(senderBatchId)) {
      throw new Error("The payout batch id has an invalid format");
    }
    if (items.length < 1 || items.length > 100) {
      throw new Error(
        "A payout batch must contain between 1 and 100 affiliates"
      );
    }
    return this.api<PayPalPayoutBatchSnapshot>("/v1/payments/payouts", {
      method: "POST",
      headers: { "PayPal-Request-Id": senderBatchId },
      body: JSON.stringify({
        sender_batch_header: {
          sender_batch_id: senderBatchId,
          email_subject: "Your ONWHEELZ affiliate commission",
          email_message:
            "Your approved ONWHEELZ affiliate commission is being sent via PayPal.",
        },
        items,
      }),
    });
  }

  getPayoutBatch(paypalBatchId: string): Promise<PayPalPayoutBatchSnapshot> {
    if (!paypalBatchId || paypalBatchId.length > 80) {
      throw new Error("The PayPal batch ID is invalid");
    }
    return this.api<PayPalPayoutBatchSnapshot>(
      `/v1/payments/payouts/${encodeURIComponent(paypalBatchId)}?page=1&page_size=100&total_required=true`
    );
  }

  async verifyWebhookSignature(
    headers: PayPalWebhookHeaders,
    webhookEvent: unknown
  ): Promise<boolean> {
    if (!this.config.webhookId)
      throw new Error("PayPal webhook ID is not configured");
    const payload = await this.api<{ verification_status?: string }>(
      "/v1/notifications/verify-webhook-signature",
      {
        method: "POST",
        body: JSON.stringify({
          auth_algo: headers.authAlgo,
          cert_url: headers.certUrl,
          transmission_id: headers.transmissionId,
          transmission_sig: headers.transmissionSignature,
          transmission_time: headers.transmissionTime,
          webhook_id: this.config.webhookId,
          webhook_event: webhookEvent,
        }),
      }
    );
    return payload.verification_status === "SUCCESS";
  }
}
