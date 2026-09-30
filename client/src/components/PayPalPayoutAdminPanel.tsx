import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import {
  AlertTriangle,
  BadgeCheck,
  CircleDollarSign,
  Clock3,
  LockKeyhole,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
} from "lucide-react";

type Outputs = inferRouterOutputs<AppRouter>;
type PayoutOverview = Outputs["network"]["paypalPayoutOverview"];
type PayoutDraft = Outputs["network"]["preparePaypalPayout"];

function money(value: string | number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function titleStatus(status: string) {
  return status
    .replaceAll("_", " ")
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

export function PayPalPayoutAdminPanel() {
  const [selectedProfiles, setSelectedProfiles] = useState<number[]>([]);
  const [draft, setDraft] = useState<PayoutDraft | null>(null);
  const [openDraftId, setOpenDraftId] = useState<number | null>(null);
  const [externalIds, setExternalIds] = useState<Record<number, string>>({});
  const [confirmSend, setConfirmSend] = useState(false);
  const [acknowledgeLive, setAcknowledgeLive] = useState(false);
  const utils = trpc.useUtils();
  const overviewQuery = trpc.network.paypalPayoutOverview.useQuery();
  const openDraftQuery = trpc.network.paypalDraftReview.useQuery(
    { batchId: openDraftId ?? 0 },
    { enabled: openDraftId !== null }
  );
  useEffect(() => {
    if (openDraftQuery.data) {
      setDraft(openDraftQuery.data);
      setOpenDraftId(null);
    }
  }, [openDraftQuery.data]);
  useEffect(() => {
    if (openDraftQuery.error) toast.error(openDraftQuery.error.message);
  }, [openDraftQuery.error]);
  const prepare = trpc.network.preparePaypalPayout.useMutation({
    onSuccess: async result => {
      setDraft(result);
      setConfirmSend(false);
      setSelectedProfiles([]);
      await utils.network.paypalPayoutOverview.invalidate();
      toast.success("PayPal payout draft prepared");
    },
    onError: error => toast.error(error.message),
  });
  const send = trpc.network.sendPaypalPayout.useMutation({
    onSuccess: async () => {
      setDraft(null);
      setConfirmSend(false);
      setAcknowledgeLive(false);
      await utils.network.paypalPayoutOverview.invalidate();
      toast.success(
        "PayPal accepted the payout submission; refresh to reconcile final item statuses"
      );
    },
    onError: async error => {
      await utils.network.paypalPayoutOverview.invalidate();
      toast.error(error.message);
    },
  });
  const cancel = trpc.network.cancelPaypalPayoutDraft.useMutation({
    onSuccess: async () => {
      setDraft(null);
      await utils.network.paypalPayoutOverview.invalidate();
      toast.success("Unsent draft cancelled; commissions are available again");
    },
    onError: error => toast.error(error.message),
  });
  const refresh = trpc.network.refreshPaypalPayout.useMutation({
    onSuccess: async () => {
      await utils.network.paypalPayoutOverview.invalidate();
      toast.success("PayPal status refreshed");
    },
    onError: error => toast.error(error.message),
  });
  const reconcile = trpc.network.reconcilePaypalBatch.useMutation({
    onSuccess: async () => {
      await utils.network.paypalPayoutOverview.invalidate();
      toast.success("PayPal batch linked; provider status has been refreshed");
    },
    onError: error => toast.error(error.message),
  });

  const overview = overviewQuery.data as PayoutOverview | undefined;
  const eligible = overview?.eligible ?? [];
  const selected = useMemo(
    () =>
      eligible.filter(
        item => selectedProfiles.includes(item.affiliateProfileId) && item.ready
      ),
    [eligible, selectedProfiles]
  );
  const selectedConversionIds = selected.flatMap(item => item.conversionIds);
  const selectedTotal = selected.reduce(
    (sum, item) => sum + Number(item.amount),
    0
  );

  function toggleProfile(id: number) {
    setSelectedProfiles(current =>
      current.includes(id)
        ? current.filter(existing => existing !== id)
        : [...current, id]
    );
  }

  return (
    <section className="workspace-card paypal-admin-card">
      <div className="extension-heading">
        <div>
          <span className="eyebrow">
            <span className="eyebrow-rule" /> OWNER PAYOUT CONTROLS
          </span>
          <h2>
            PayPal <em>commission runs.</em>
          </h2>
        </div>
        <span className="extension-caption">
          Manual batches only · no automatic or recurring sends
        </span>
      </div>

      <div className="paypal-safety-banner">
        <ShieldCheck size={18} />
        <span>
          Only seller-approved commissions from internally verified affiliates
          can be batched. This is not PayPal KYC, and the recipient email is
          never shown in this desk.
        </span>
      </div>

      {overviewQuery.isLoading ? (
        <div className="small-empty">Loading payout eligibility…</div>
      ) : overviewQuery.error ? (
        <div className="small-empty">{overviewQuery.error.message}</div>
      ) : overview ? (
        <>
          <div className="paypal-setup-grid">
            <div className="paypal-setup-item">
              <span>PAYPAL ENVIRONMENT</span>
              <strong>{overview.setup.environment.toUpperCase()}</strong>
            </div>
            <div className="paypal-setup-item">
              <span>FIRST PAYOUT COUNTRY</span>
              <strong>
                {overview.setup.senderCountry ?? "Not configured"}
              </strong>
            </div>
            <div className="paypal-setup-item">
              <span>OUTBOUND PAYOUTS</span>
              <strong
                className={
                  overview.setup.ready ? "setup-ready" : "setup-blocked"
                }
              >
                {overview.setup.ready ? "Enabled" : "Paused"}
              </strong>
            </div>
          </div>
          {!overview.setup.ready && (
            <div className="paypal-setup-warning">
              <AlertTriangle size={16} />
              <div>
                <strong>Sending is locked until setup is complete.</strong>
                <span>
                  Missing server configuration:{" "}
                  {overview.setup.missing.join(", ") ||
                    "PAYPAL_PAYOUTS_ENABLED"}
                  . Use PayPal Sandbox first; turn on live mode only after
                  testing and confirming regional eligibility.
                </span>
              </div>
            </div>
          )}

          {draft && (
            <div className="paypal-draft-preview">
              <div className="draft-preview-heading">
                <div>
                  <span className="eyebrow">
                    <span className="eyebrow-rule" /> REVIEW BEFORE SENDING
                  </span>
                  <h3>
                    {draft.environment.toUpperCase()} batch ·{" "}
                    {money(draft.totalAmount)}
                  </h3>
                </div>
                <span>
                  {draft.itemCount} PayPal recipients · {draft.conversionCount}{" "}
                  commissions
                </span>
              </div>
              <div className="draft-recipient-list">
                {draft.recipients.map((recipient, index) => (
                  <div
                    className="draft-recipient-row"
                    key={`${recipient.name}-${index}`}
                  >
                    <span>{recipient.name}</span>
                    <small>
                      {recipient.conversionCount} commission
                      {recipient.conversionCount === 1 ? "" : "s"}
                    </small>
                    <strong>{money(recipient.amount)}</strong>
                  </div>
                ))}
              </div>
              <div className="draft-actions">
                <button
                  className="button button-outline-dark"
                  type="button"
                  onClick={() => cancel.mutate({ batchId: draft.id })}
                  disabled={cancel.isPending || send.isPending}
                >
                  <Trash2 size={15} /> Cancel unsent draft
                </button>
                <button
                  className="button button-orange"
                  type="button"
                  onClick={() => setConfirmSend(true)}
                  disabled={
                    !overview.setup.ready || send.isPending || cancel.isPending
                  }
                >
                  <Send size={15} /> Review and send in PayPal
                </button>
              </div>
            </div>
          )}

          <div className="paypal-eligible-heading">
            <div>
              <h3>Approved commissions</h3>
              <p>
                USD only · grouped into one recipient item per affiliate · rows
                are reserved as soon as a draft is prepared.
              </p>
            </div>
            <span className="count-badge">
              {eligible.filter(item => item.ready).length} ready
            </span>
          </div>
          {eligible.length === 0 ? (
            <div className="small-empty compact-empty">
              No approved commission records are waiting for a payout batch.
            </div>
          ) : (
            <div className="paypal-eligible-list">
              {eligible.map(item => (
                <label
                  className={`paypal-eligible-row ${item.ready ? "" : "is-ineligible"}`}
                  key={item.affiliateProfileId}
                >
                  <input
                    type="checkbox"
                    checked={selectedProfiles.includes(item.affiliateProfileId)}
                    onChange={() => toggleProfile(item.affiliateProfileId)}
                    disabled={!item.ready || Boolean(draft)}
                  />
                  <span className="paypal-eligible-name">
                    <strong>{item.affiliateName}</strong>
                    <small>
                      {item.conversionCount} approved commission
                      {item.conversionCount === 1 ? "" : "s"} ·{" "}
                      {item.hasPayPalRecipient
                        ? "recipient saved"
                        : "PayPal recipient missing"}
                    </small>
                  </span>
                  {!item.ready && (
                    <small className="paypal-missing-tag">
                      {!item.eligible
                        ? "Verification / USD required"
                        : "Not ready"}
                    </small>
                  )}
                  <strong>{money(item.amount)}</strong>
                </label>
              ))}
            </div>
          )}
          <div className="paypal-prepare-row">
            <span>
              {selected.length} affiliates selected · {money(selectedTotal)}
            </span>
            <button
              className="button button-dark"
              type="button"
              onClick={() =>
                prepare.mutate({ conversionIds: selectedConversionIds })
              }
              disabled={
                !selectedConversionIds.length ||
                Boolean(draft) ||
                prepare.isPending
              }
            >
              {prepare.isPending ? "Preparing…" : "Prepare payout draft"}
              <CircleDollarSign size={16} />
            </button>
          </div>

          <div className="paypal-batch-history">
            <div className="paypal-eligible-heading">
              <div>
                <h3>Recent payout batches</h3>
                <p>
                  PayPal confirmations are reconciled by secure API refresh and
                  verified webhooks.
                </p>
              </div>
            </div>
            {overview.batches.length === 0 ? (
              <div className="small-empty compact-empty">
                No payout batches yet.
              </div>
            ) : (
              <div className="paypal-batch-list">
                {overview.batches.map(batch => (
                  <article className="paypal-batch-row" key={batch.id}>
                    <div className="paypal-batch-copy">
                      <strong>
                        {money(batch.totalAmount)} · {batch.itemCount} recipient
                        {batch.itemCount === 1 ? "" : "s"}
                      </strong>
                      <small>
                        {batch.environment.toUpperCase()} ·{" "}
                        {batch.createdAt
                          ? new Date(batch.createdAt).toLocaleString()
                          : ""}
                      </small>
                      {batch.failureCode && (
                        <small className="paypal-failure-code">
                          {batch.failureCode}
                        </small>
                      )}
                    </div>
                    <span className={`status-pill status-${batch.status}`}>
                      {titleStatus(batch.status)}
                    </span>
                    <details className="paypal-batch-details">
                      <summary>
                        Recipient item details ({batch.items.length})
                      </summary>
                      <div className="paypal-batch-item-list">
                        {batch.items.map(item => (
                          <div key={item.id}>
                            <span>
                              {item.affiliateName || "ONWHEELZ affiliate"}
                            </span>
                            <small>{titleStatus(item.status)}</small>
                            <strong>{money(item.amount)}</strong>
                          </div>
                        ))}
                      </div>
                    </details>
                    {batch.status === "draft" && !draft && (
                      <button
                        className="copy-link-button"
                        type="button"
                        disabled={openDraftQuery.isFetching}
                        onClick={() => setOpenDraftId(batch.id)}
                      >
                        <Clock3 size={14} /> Review draft
                      </button>
                    )}
                    {batch.paypalBatchId &&
                      !["succeeded", "failed", "cancelled"].includes(
                        batch.status
                      ) && (
                        <button
                          className="copy-link-button"
                          type="button"
                          disabled={refresh.isPending}
                          onClick={() => refresh.mutate({ batchId: batch.id })}
                        >
                          <RefreshCw size={14} /> Refresh
                        </button>
                      )}
                    {["unknown", "submitting"].includes(batch.status) &&
                      !batch.paypalBatchId &&
                      batch.retryAllowed && (
                        <button
                          className="copy-link-button"
                          type="button"
                          disabled={send.isPending || !overview.setup.ready}
                          onClick={() => send.mutate({ batchId: batch.id })}
                        >
                          <RefreshCw size={14} /> Retry same ID
                        </button>
                      )}
                    {["unknown", "submitting"].includes(batch.status) &&
                      !batch.paypalBatchId &&
                      !batch.retryAllowed && (
                        <small className="paypal-retry-blocked">
                          Retry closed or unsafe; locate the existing PayPal
                          batch ID and link it.
                        </small>
                      )}
                    {["unknown", "submitting"].includes(batch.status) &&
                      !batch.paypalBatchId && (
                        <div className="paypal-reconcile-form">
                          <input
                            aria-label="PayPal batch ID from the PayPal dashboard"
                            value={externalIds[batch.id] ?? ""}
                            maxLength={64}
                            onChange={event =>
                              setExternalIds(current => ({
                                ...current,
                                [batch.id]: event.target.value.toUpperCase(),
                              }))
                            }
                            placeholder="PayPal batch ID"
                          />
                          <button
                            className="copy-link-button"
                            type="button"
                            disabled={
                              reconcile.isPending ||
                              !/^[A-Z0-9-]{8,64}$/.test(
                                externalIds[batch.id] ?? ""
                              )
                            }
                            onClick={() =>
                              reconcile.mutate({
                                batchId: batch.id,
                                paypalBatchId: externalIds[batch.id] ?? "",
                              })
                            }
                          >
                            Link & refresh
                          </button>
                        </div>
                      )}
                  </article>
                ))}
              </div>
            )}
          </div>

          {confirmSend && draft && (
            <div className="paypal-confirm-overlay" role="presentation">
              <section
                className="paypal-confirm-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="paypal-confirm-title"
              >
                <span className="kicker-icon">
                  <LockKeyhole size={17} />
                </span>
                <span className="eyebrow">
                  <span className="eyebrow-rule" /> PAYPAL SEND CONFIRMATION
                </span>
                <h3 id="paypal-confirm-title">
                  Send {money(draft.totalAmount)}?
                </h3>
                <p>
                  PayPal will receive {draft.itemCount} recipient payout
                  {draft.itemCount === 1 ? "" : "s"} for {draft.conversionCount}{" "}
                  approved commissions. This is a one-time{" "}
                  {draft.environment.toUpperCase()} batch from your PayPal
                  Business balance. It is not a recurring schedule.
                </p>
                <div className="paypal-confirm-summary">
                  <span>Batch reference</span>
                  <code>{draft.senderBatchId}</code>
                  <span>Recipients</span>
                  <strong>{draft.itemCount}</strong>
                  <span>Total requested</span>
                  <strong>{money(draft.totalAmount)} USD</strong>
                </div>
                {draft.environment === "live" && (
                  <label className="paypal-live-acknowledge">
                    <input
                      type="checkbox"
                      checked={acknowledgeLive}
                      onChange={event =>
                        setAcknowledgeLive(event.target.checked)
                      }
                    />
                    <span>
                      I verified the amount, affiliate recipients, PayPal
                      funding balance, and live payout market. I authorize this
                      batch submission.
                    </span>
                  </label>
                )}
                <div className="paypal-confirm-actions">
                  <button
                    className="button button-outline-dark"
                    type="button"
                    onClick={() => setConfirmSend(false)}
                    disabled={send.isPending}
                  >
                    Go back
                  </button>
                  <button
                    className="button button-orange"
                    type="button"
                    disabled={
                      send.isPending ||
                      (draft.environment === "live" && !acknowledgeLive)
                    }
                    onClick={() => send.mutate({ batchId: draft.id })}
                  >
                    {send.isPending
                      ? "Submitting…"
                      : `Send ${money(draft.totalAmount)} via PayPal`}
                    <Send size={15} />
                  </button>
                </div>
                <p className="paypal-confirm-footnote">
                  <BadgeCheck size={14} /> A successful API response records a
                  pending PayPal batch; only PayPal’s final item status marks a
                  commission paid.
                </p>
              </section>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
