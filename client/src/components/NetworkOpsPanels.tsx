import { useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import {
  ArrowUpRight,
  BadgeCheck,
  CircleDollarSign,
  Copy,
  Link2,
  MousePointerClick,
  ShieldCheck,
  Store,
  Users,
} from "lucide-react";

type Outputs = inferRouterOutputs<AppRouter>;
type AffiliateApplication =
  Outputs["affiliate"]["workspace"]["applications"][number];
type AffiliateConversion =
  Outputs["affiliate"]["workspace"]["conversions"][number];
type SellerApplication = Outputs["seller"]["workspace"]["applications"][number];
type SellerConversion = Outputs["seller"]["workspace"]["conversions"][number];
type VerificationQueue = Outputs["network"]["verificationQueue"];
type VerificationStatus = "verified" | "more_details" | "rejected";

type VerificationReview = (
  entityType: "seller" | "affiliate",
  entityId: number,
  status: VerificationStatus,
  note?: string
) => void;

function money(value: string | number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function StatusPill({ status }: { status: string }) {
  const labels: Record<string, string> = {
    pending: "In review",
    more_details: "Details requested",
    approved: "Approved",
    verified: "Verified",
    declined: "Declined",
    rejected: "Rejected",
    batched: "In payout batch",
    paid: "Paid",
  };
  return (
    <span className={`status-pill status-${status}`}>
      {labels[status] ?? status}
    </span>
  );
}

export function AffiliateAttributionPanel({
  applications,
  conversions,
  onCopy,
}: {
  applications: AffiliateApplication[];
  conversions: AffiliateConversion[];
  onCopy: (code: string) => void;
}) {
  const trackingApplications = applications.filter(
    application => application.status === "approved" && application.trackingCode
  );
  const totalClicks = applications.reduce(
    (sum, application) => sum + application.clickCount,
    0
  );
  const pendingAmount = conversions
    .filter(row => row.status === "pending")
    .reduce((sum, row) => sum + Number(row.commissionAmount), 0);
  const confirmedAmount = conversions
    .filter(
      row =>
        row.status === "approved" ||
        row.status === "batched" ||
        row.status === "paid"
    )
    .reduce((sum, row) => sum + Number(row.commissionAmount), 0);

  return (
    <div className="extension-panels attribution-extension">
      <div className="extension-heading">
        <div>
          <span className="eyebrow">
            <span className="eyebrow-rule" /> ATTRIBUTION & EARNINGS
          </span>
          <h2>
            Every click has a <em>route.</em>
          </h2>
        </div>
        <span className="extension-caption">
          Seller-reported sales · no payout details stored
        </span>
      </div>
      <div className="attribution-summary">
        <div className="attribution-metric">
          <MousePointerClick size={16} />
          <span>TRACKED CLICKS</span>
          <strong>{totalClicks.toLocaleString()}</strong>
        </div>
        <div className="attribution-metric">
          <CircleDollarSign size={16} />
          <span>AWAITING REVIEW</span>
          <strong>{money(pendingAmount)}</strong>
        </div>
        <div className="attribution-metric attribution-metric-confirmed">
          <BadgeCheck size={16} />
          <span>CONFIRMED COMMISSION</span>
          <strong>{money(confirmedAmount)}</strong>
        </div>
      </div>
      <div className="workspace-grid attribution-grid">
        <section className="workspace-card referral-links-card">
          <div className="card-kicker">
            <span className="kicker-icon">
              <Link2 size={16} />
            </span>
            <span>YOUR REFERRAL LINKS</span>
          </div>
          <div className="card-title-row">
            <h2>Approved offers</h2>
            <span className="count-badge">{trackingApplications.length}</span>
          </div>
          {trackingApplications.length === 0 ? (
            <div className="small-empty compact-empty">
              <p>
                Once a seller approves a request, your shareable tracking link
                will appear here.
              </p>
            </div>
          ) : (
            <div className="tracking-link-list">
              {trackingApplications.map(application => (
                <article className="tracking-link-row" key={application.id}>
                  <div className="tracking-link-copy">
                    <strong>{application.title}</strong>
                    <span>
                      {application.companyName} ·{" "}
                      {application.clickCount.toLocaleString()} clicks
                    </span>
                    <code>/r/{application.trackingCode}</code>
                  </div>
                  <button
                    className="copy-link-button"
                    onClick={() => onCopy(application.trackingCode!)}
                  >
                    <Copy size={14} /> Copy
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
        <section className="workspace-card affiliate-conversions-card">
          <div className="card-kicker">
            <span className="kicker-icon">
              <CircleDollarSign size={16} />
            </span>
            <span>COMMISSION ACTIVITY</span>
          </div>
          <div className="card-title-row">
            <h2>Conversion ledger</h2>
            <span className="count-badge">{conversions.length}</span>
          </div>
          {conversions.length === 0 ? (
            <div className="small-empty compact-empty">
              <p>
                When a seller records a sale against your approved partnership,
                its status and commission estimate will show here.
              </p>
            </div>
          ) : (
            <div className="conversion-list">
              {conversions.map(conversion => (
                <article className="conversion-row" key={conversion.id}>
                  <div className="conversion-main">
                    <div>
                      <strong>{conversion.offerTitle}</strong>
                      <span>
                        {conversion.companyName} · order{" "}
                        {conversion.orderReference}
                      </span>
                      <span
                        className={`source-type-pill source-type-${conversion.sourceType}`}
                      >
                        {conversion.sourceType === "webhook"
                          ? "AUTOMATED WEBHOOK"
                          : "SELLER ENTERED"}
                      </span>
                    </div>
                    <StatusPill status={conversion.status} />
                  </div>
                  <div className="conversion-values">
                    <span>Sale {money(conversion.saleAmount)}</span>
                    <strong>{money(conversion.commissionAmount)}</strong>
                  </div>
                  {conversion.sellerNote && (
                    <p className="conversion-note">{conversion.sellerNote}</p>
                  )}
                </article>
              ))}
            </div>
          )}
          <div className="payout-readiness-note">
            <ShieldCheck size={15} />
            <span>
              <strong>Payout setup:</strong> this ledger never moves money.
              ONWHEELZ needs a selected, configured payout provider before any
              commission can be transferred.
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}

export function SellerConversionPanel({
  applications,
  conversions,
  onRecord,
  onReview,
  isReviewing,
}: {
  applications: SellerApplication[];
  conversions: SellerConversion[];
  onRecord: (application: SellerApplication) => void;
  onReview: (conversionId: number, status: "approved" | "rejected") => void;
  isReviewing: boolean;
}) {
  const approvedApplications = applications.filter(
    application => application.status === "approved"
  );
  return (
    <section className="workspace-card conversion-operations-card">
      <div className="card-kicker">
        <span className="kicker-icon">
          <CircleDollarSign size={16} />
        </span>
        <span>SALES & COMMISSION REVIEW</span>
      </div>
      <div className="card-title-row">
        <h2>Conversion ledger</h2>
        <span className="count-badge">{conversions.length} recorded</span>
      </div>
      <p>
        Report a completed order manually or connect your paid-order webhook.
        Every conversion still enters review before commission is confirmed.
      </p>
      {approvedApplications.length > 0 && (
        <div className="approved-partnership-list">
          {approvedApplications.map(application => (
            <div className="approved-partnership-row" key={application.id}>
              <div>
                <strong>
                  {application.affiliateName || "ONWHEELZ affiliate"}
                </strong>
                <span>
                  {application.title} · {Number(application.commissionPercent)}%
                  commission
                </span>
              </div>
              <button
                className="small-add-button"
                onClick={() => onRecord(application)}
              >
                <CircleDollarSign size={14} /> Record sale
              </button>
            </div>
          ))}
        </div>
      )}
      {conversions.length === 0 ? (
        <div className="small-empty compact-empty">
          <p>No sales have been reported for your partnerships yet.</p>
        </div>
      ) : (
        <div className="conversion-list">
          {conversions.map(conversion => (
            <article className="conversion-row" key={conversion.id}>
              <div className="conversion-main">
                <div>
                  <strong>
                    {conversion.affiliateName ||
                      conversion.affiliateEmail ||
                      "Affiliate"}{" "}
                    · {conversion.offerTitle}
                  </strong>
                  <span>
                    Order {conversion.orderReference} ·{" "}
                    {new Date(conversion.createdAt).toLocaleDateString()}
                  </span>
                  <span
                    className={`source-type-pill source-type-${conversion.sourceType}`}
                  >
                    {conversion.sourceType === "webhook"
                      ? "AUTOMATED WEBHOOK"
                      : "SELLER ENTERED"}
                  </span>
                </div>
                <StatusPill status={conversion.status} />
              </div>
              <div className="conversion-values">
                <span>Sale {money(conversion.saleAmount)}</span>
                <strong>{money(conversion.commissionAmount)}</strong>
              </div>
              {conversion.status === "pending" && (
                <div className="review-actions">
                  <button
                    className="review-button review-approve"
                    onClick={() => onReview(conversion.id, "approved")}
                    disabled={isReviewing}
                  >
                    Confirm commission
                  </button>
                  <button
                    className="review-button review-decline"
                    onClick={() => onReview(conversion.id, "rejected")}
                    disabled={isReviewing}
                  >
                    Reject
                  </button>
                </div>
              )}
              {conversion.sellerNote && (
                <p className="conversion-note">{conversion.sellerNote}</p>
              )}
            </article>
          ))}
        </div>
      )}
      <div className="payout-readiness-note">
        <ShieldCheck size={15} />
        <span>
          Webhook events only prepare a commission record; the seller still
          reviews it. ONWHEELZ does not process payments or payouts in this
          release.
        </span>
      </div>
    </section>
  );
}

function VerificationCard({
  entityType,
  entityId,
  title,
  subtitle,
  details,
  note,
  previousNote,
  isSaving,
  onNote,
  onReview,
}: {
  entityType: "seller" | "affiliate";
  entityId: number;
  title: string;
  subtitle: string;
  details: string;
  note: string;
  previousNote: string | null;
  isSaving: boolean;
  onNote: (value: string) => void;
  onReview: VerificationReview;
}) {
  return (
    <article className="verification-card">
      <div className="verification-card-heading">
        <span className="verification-icon">
          {entityType === "seller" ? <Store size={17} /> : <Users size={17} />}
        </span>
        <div>
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </div>
      </div>
      {details && <p className="verification-details">{details}</p>}
      {previousNote && (
        <div className="seller-note">
          <strong>Previous request</strong>
          <span>{previousNote}</span>
        </div>
      )}
      <label className="form-field">
        <span>Internal review note</span>
        <textarea
          className="field-input field-textarea"
          rows={2}
          value={note}
          onChange={event => onNote(event.target.value)}
          placeholder="For a details request, say what is missing…"
        />
      </label>
      <div className="review-actions">
        <button
          className="review-button review-approve"
          onClick={() => onReview(entityType, entityId, "verified", note)}
          disabled={isSaving}
        >
          <BadgeCheck size={14} /> Verify
        </button>
        <button
          className="review-button review-more"
          onClick={() => onReview(entityType, entityId, "more_details", note)}
          disabled={isSaving}
        >
          Need details
        </button>
        <button
          className="review-button review-decline"
          onClick={() => onReview(entityType, entityId, "rejected", note)}
          disabled={isSaving}
        >
          Decline
        </button>
      </div>
    </article>
  );
}

export function NetworkVerificationDesk({
  data,
  isLoading,
  isAuthenticated,
  isAdmin,
  isSaving,
  onReview,
}: {
  data?: VerificationQueue;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isSaving: boolean;
  onReview: VerificationReview;
}) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const sellers = data?.sellerVerifications ?? [];
  const affiliates = data?.affiliateVerifications ?? [];

  return (
    <section className="workspace-section network-workspace">
      <div className="workspace-topline">
        <span className="eyebrow">
          <span className="eyebrow-rule" /> NETWORK OPERATIONS
        </span>
        <span className="workspace-crumb">ONWHEELZ / NETWORK DESK</span>
      </div>
      <div className="workspace-heading">
        <div>
          <h1>
            Network <em>desk.</em>
          </h1>
          <p>
            Review seller and affiliate profiles before awarding ONWHEELZ
            verification.
          </p>
        </div>
        <span className="network-verification-stamp">
          <ShieldCheck size={17} /> MANUAL PROFILE REVIEW
        </span>
      </div>
      {!isAuthenticated ? (
        <div className="workspace-gate">
          <div className="gate-icon">
            <ShieldCheck size={22} />
          </div>
          <h2>Sign in to continue.</h2>
          <p>The network desk is restricted to ONWHEELZ administrators.</p>
        </div>
      ) : !isAdmin ? (
        <div className="workspace-gate">
          <div className="gate-icon">
            <ShieldCheck size={22} />
          </div>
          <h2>Administrator access required.</h2>
          <p>
            This review queue is private to ONWHEELZ network administrators.
          </p>
        </div>
      ) : (
        <>
          <div className="stats-grid network-stats">
            <div className="stat-card">
              <span>SELLERS TO REVIEW</span>
              <strong>{sellers.length.toString().padStart(2, "0")}</strong>
              <small>Business profiles awaiting a decision</small>
            </div>
            <div className="stat-card stat-card-accent">
              <span>AFFILIATES TO REVIEW</span>
              <strong>{affiliates.length.toString().padStart(2, "0")}</strong>
              <small>Audience profiles awaiting a decision</small>
            </div>
            <div className="stat-card">
              <span>REVIEW STANDARD</span>
              <strong>01</strong>
              <small>Manual directory review · no ID uploads</small>
            </div>
          </div>
          <div className="network-review-grid">
            <section className="workspace-card">
              <div className="card-kicker">
                <span className="kicker-icon">
                  <Store size={16} />
                </span>
                <span>SELLER PARTNERS</span>
              </div>
              <div className="card-title-row">
                <h2>Business verification</h2>
                <span className="count-badge">{sellers.length}</span>
              </div>
              <p>
                Check the business name, website, contact and offer category;
                verification is an ONWHEELZ directory decision, not a formal
                identity/KYC check.
              </p>
              {isLoading ? (
                <div className="small-empty compact-empty">
                  <p>Loading seller reviews…</p>
                </div>
              ) : sellers.length === 0 ? (
                <div className="small-empty compact-empty">
                  <p>No seller profiles are waiting for review.</p>
                </div>
              ) : (
                <div className="verification-list">
                  {sellers.map(seller => (
                    <VerificationCard
                      key={`seller-${seller.id}`}
                      entityType="seller"
                      entityId={seller.id}
                      title={seller.businessName}
                      subtitle={
                        seller.website ||
                        seller.contactEmail ||
                        seller.ownerEmail ||
                        seller.ownerName ||
                        "Seller account"
                      }
                      details={
                        seller.description ??
                        "No business description supplied."
                      }
                      note={notes[`seller-${seller.id}`] ?? ""}
                      previousNote={seller.verificationNote}
                      isSaving={isSaving}
                      onNote={value =>
                        setNotes(current => ({
                          ...current,
                          [`seller-${seller.id}`]: value,
                        }))
                      }
                      onReview={onReview}
                    />
                  ))}
                </div>
              )}
            </section>
            <section className="workspace-card">
              <div className="card-kicker">
                <span className="kicker-icon">
                  <Users size={16} />
                </span>
                <span>AFFILIATE PARTNERS</span>
              </div>
              <div className="card-title-row">
                <h2>Audience verification</h2>
                <span className="count-badge">{affiliates.length}</span>
              </div>
              <p>
                Review the public channels and audience description. Never
                collect identity documents or payout credentials in this manual
                review flow.
              </p>
              {isLoading ? (
                <div className="small-empty compact-empty">
                  <p>Loading affiliate reviews…</p>
                </div>
              ) : affiliates.length === 0 ? (
                <div className="small-empty compact-empty">
                  <p>No affiliate profiles are waiting for review.</p>
                </div>
              ) : (
                <div className="verification-list">
                  {affiliates.map(affiliate => (
                    <VerificationCard
                      key={`affiliate-${affiliate.id}`}
                      entityType="affiliate"
                      entityId={affiliate.id}
                      title={affiliate.affiliateName || "ONWHEELZ affiliate"}
                      subtitle={affiliate.affiliateEmail || "Affiliate account"}
                      details={`${affiliate.channels} · ${Number(affiliate.audienceSize).toLocaleString()} audience${affiliate.bio ? ` · ${affiliate.bio}` : ""}`}
                      note={notes[`affiliate-${affiliate.id}`] ?? ""}
                      previousNote={affiliate.verificationNote}
                      isSaving={isSaving}
                      onNote={value =>
                        setNotes(current => ({
                          ...current,
                          [`affiliate-${affiliate.id}`]: value,
                        }))
                      }
                      onReview={onReview}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
          <div className="verification-disclaimer">
            <ShieldCheck size={15} />
            <span>
              ONWHEELZ verification is an internal profile and business review
              only. It does not certify a seller, affiliate, product, or
              transaction.
            </span>
          </div>
        </>
      )}
    </section>
  );
}
