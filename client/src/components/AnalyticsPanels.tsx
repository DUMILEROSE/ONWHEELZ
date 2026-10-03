import type { inferRouterOutputs } from "@trpc/server";
import type { ReactNode } from "react";
import {
  Activity,
  BadgeCheck,
  Eye,
  MousePointerClick,
  ShoppingBag,
} from "lucide-react";
import type { AppRouter } from "../../../server/routers";

type Outputs = inferRouterOutputs<AppRouter>;
type AffiliateAnalytics = Outputs["affiliate"]["analytics"];
type SellerAnalytics = Outputs["seller"]["analytics"];
type AnalyticsWindow = 7 | 30 | 90;

type WindowProps = {
  days: AnalyticsWindow;
  onDaysChange: (days: AnalyticsWindow) => void;
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function WindowSelect({ days, onDaysChange }: WindowProps) {
  return (
    <label className="activity-window">
      <span>PERIOD</span>
      <select
        aria-label="Analytics date range"
        value={days}
        onChange={event =>
          onDaysChange(Number(event.target.value) as AnalyticsWindow)
        }
      >
        <option value={7}>Last 7 days</option>
        <option value={30}>Last 30 days</option>
        <option value={90}>Last 90 days</option>
      </select>
    </label>
  );
}

function Metric({
  icon,
  label,
  value,
  hint,
  accent = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint: string;
  accent?: boolean;
}) {
  return (
    <article
      className={`activity-metric${accent ? " activity-metric-accent" : ""}`}
    >
      <span className="activity-metric-icon">{icon}</span>
      <span className="activity-metric-label">{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}

function ActivityNote() {
  return (
    <div className="activity-definition">
      <Activity size={15} />
      <p>
        Views count offer cards that were at least half visible; clicks count
        tracked affiliate-link redirects. Neither is a unique-person count.
        Orders come from seller-entered reports or the seller order webhook and
        remain estimates until the seller confirms them. No visitor identity, IP
        address, or user-agent is stored for view events.
      </p>
    </div>
  );
}

export function AffiliateAnalyticsPanel({
  data,
  isLoading,
  days,
  onDaysChange,
}: WindowProps & {
  data: AffiliateAnalytics | undefined;
  isLoading: boolean;
}) {
  const metrics = data?.conversions;
  const partnerships = data?.partnerships ?? [];
  return (
    <section className="workspace-card activity-panel">
      <div className="activity-heading">
        <div>
          <div className="card-kicker">
            <span className="kicker-icon">
              <Activity size={16} />
            </span>
            <span>YOUR BUSINESS · AFFILIATE PERFORMANCE</span>
          </div>
          <h2>
            Activity that <em>moves.</em>
          </h2>
          <p>
            Referral traffic, attributed orders, and commission status in one
            view.
          </p>
        </div>
        <WindowSelect days={days} onDaysChange={onDaysChange} />
      </div>

      <div className="activity-metrics-grid">
        <Metric
          icon={<MousePointerClick size={17} />}
          label="TRACKED CLICKS"
          value={(data?.clickCount ?? 0).toLocaleString()}
          hint="Referral link visits"
        />
        <Metric
          icon={<ShoppingBag size={17} />}
          label="REPORTED ORDERS"
          value={(metrics?.orderCount ?? 0).toLocaleString()}
          hint={`${metrics?.confirmedOrderCount ?? 0} seller-confirmed`}
        />
        <Metric
          icon={<BadgeCheck size={17} />}
          label="CONFIRMED SALES"
          value={money(metrics?.confirmedSales ?? 0)}
          hint="Approved, batched, or paid"
          accent
        />
        <Metric
          icon={<Activity size={17} />}
          label="COMMISSION IN REVIEW"
          value={money(metrics?.pendingCommission ?? 0)}
          hint={`${money(metrics?.confirmedCommission ?? 0)} confirmed`}
        />
      </div>

      <div className="activity-detail-heading">
        <div>
          <span className="eyebrow">
            <span className="eyebrow-rule" /> PARTNERSHIPS
          </span>
          <h3>Top referral links</h3>
        </div>
        <span>{days}-day window</span>
      </div>
      {isLoading && !data ? (
        <div className="small-empty compact-empty">
          Loading your performance…
        </div>
      ) : partnerships.length === 0 ? (
        <div className="small-empty compact-empty">
          <p>
            Tracked performance will appear after a seller approves a referral
            link and it receives activity.
          </p>
        </div>
      ) : (
        <div className="activity-table-wrap">
          <table className="activity-table">
            <thead>
              <tr>
                <th>Offer</th>
                <th>Clicks</th>
                <th>Orders</th>
                <th>Confirmed sales</th>
              </tr>
            </thead>
            <tbody>
              {partnerships.map(row => (
                <tr key={row.applicationId}>
                  <td>
                    <strong>{row.offerTitle}</strong>
                    <span>{row.companyName}</span>
                  </td>
                  <td>{row.clicks.toLocaleString()}</td>
                  <td>{row.orderCount.toLocaleString()}</td>
                  <td>{money(row.confirmedSales)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ActivityNote />
    </section>
  );
}

export function SellerAnalyticsPanel({
  data,
  isLoading,
  days,
  onDaysChange,
}: WindowProps & {
  data: SellerAnalytics | undefined;
  isLoading: boolean;
}) {
  const metrics = data?.conversions;
  const offers = data?.offers ?? [];
  return (
    <section className="workspace-card activity-panel">
      <div className="activity-heading">
        <div>
          <div className="card-kicker">
            <span className="kicker-icon">
              <Activity size={16} />
            </span>
            <span>YOUR BUSINESS · SELLER PERFORMANCE</span>
          </div>
          <h2>
            See the whole <em>route.</em>
          </h2>
          <p>
            Offer visibility, affiliate referrals, reported orders, and
            confirmed sales.
          </p>
        </div>
        <WindowSelect days={days} onDaysChange={onDaysChange} />
      </div>

      <div className="activity-metrics-grid">
        <Metric
          icon={<Eye size={17} />}
          label="OFFER VIEWS"
          value={(data?.viewCount ?? 0).toLocaleString()}
          hint="Visible catalog cards"
        />
        <Metric
          icon={<MousePointerClick size={17} />}
          label="AFFILIATE CLICKS"
          value={(data?.clickCount ?? 0).toLocaleString()}
          hint="Tracked referral redirects"
        />
        <Metric
          icon={<ShoppingBag size={17} />}
          label="REPORTED ORDERS"
          value={(metrics?.orderCount ?? 0).toLocaleString()}
          hint={`${metrics?.pendingOrderCount ?? 0} awaiting review`}
        />
        <Metric
          icon={<BadgeCheck size={17} />}
          label="CONFIRMED SALES"
          value={money(metrics?.confirmedSales ?? 0)}
          hint={`${money(metrics?.pendingSales ?? 0)} pending review`}
          accent
        />
      </div>

      <div className="activity-detail-heading">
        <div>
          <span className="eyebrow">
            <span className="eyebrow-rule" /> OFFER BREAKDOWN
          </span>
          <h3>What is getting traction</h3>
        </div>
        <span>{days}-day window</span>
      </div>
      {isLoading && !data ? (
        <div className="small-empty compact-empty">
          Loading your performance…
        </div>
      ) : offers.length === 0 ? (
        <div className="small-empty compact-empty">
          <p>
            Add a live offer to start measuring catalog views, affiliate clicks,
            and attributed orders.
          </p>
        </div>
      ) : (
        <div className="activity-table-wrap">
          <table className="activity-table">
            <thead>
              <tr>
                <th>Offer</th>
                <th>Views</th>
                <th>Clicks</th>
                <th>Orders</th>
                <th>Confirmed sales</th>
              </tr>
            </thead>
            <tbody>
              {offers.map(row => (
                <tr key={row.offerId}>
                  <td>
                    <strong>{row.title}</strong>
                    <span>{row.status}</span>
                  </td>
                  <td>{row.views.toLocaleString()}</td>
                  <td>{row.clicks.toLocaleString()}</td>
                  <td>{row.orderCount.toLocaleString()}</td>
                  <td>{money(row.confirmedSales)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ActivityNote />
    </section>
  );
}
