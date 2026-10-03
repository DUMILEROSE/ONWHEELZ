import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  CalendarDays,
  CircleDollarSign,
  Clock3,
  History,
  Info,
  Save,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

function currentUtcMonth() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function money(value: string | number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function localDate(value: Date | string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function PlanMetric({
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
      className={`budget-metric${accent ? " budget-metric-accent" : ""}`}
    >
      <span className="budget-metric-icon">{icon}</span>
      <span className="budget-metric-label">{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}

export function SellerBudgetPlannerPanel() {
  const [month, setMonth] = useState(currentUtcMonth);
  const [plannedAmount, setPlannedAmount] = useState("");
  const queryInput = useMemo(() => ({ month }), [month]);
  const budgetQuery = trpc.seller.monthlyBudget.useQuery(queryInput);
  const utils = trpc.useUtils();

  useEffect(() => {
    if (budgetQuery.data?.month === month) {
      setPlannedAmount(budgetQuery.data.plan?.plannedAmount ?? "");
    }
  }, [month, budgetQuery.data?.month, budgetQuery.data?.plan?.plannedAmount]);

  const saveMutation = trpc.seller.saveMonthlyBudget.useMutation({
    onSuccess: async result => {
      toast.success(
        result.changed ? "Monthly spending plan saved" : "Plan is unchanged"
      );
      await utils.seller.monthlyBudget.invalidate({ month });
    },
    onError: error => toast.error(error.message),
  });

  const data = budgetQuery.data?.month === month ? budgetQuery.data : undefined;
  const variance = data?.variance == null ? null : Number(data.variance);
  const varianceLabel =
    variance == null
      ? "Set a plan to compare commission exposure"
      : variance >= 0
        ? `${money(variance)} below plan`
        : `${money(Math.abs(variance))} over plan`;

  function submitBudget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveMutation.mutate({ month, plannedAmount });
  }

  return (
    <section className="workspace-card budget-planner-panel">
      <div className="budget-planner-heading">
        <div>
          <div className="card-kicker">
            <span className="kicker-icon">
              <CircleDollarSign size={16} />
            </span>
            <span>SELLER PLANNING · NON-CUSTODIAL</span>
          </div>
          <h2>
            Plan your <em>spend.</em>
          </h2>
          <p>
            Set a monthly intention and compare it with commission records
            reported in ONWHEELZ during that month.
          </p>
        </div>
        <label className="budget-month-picker">
          <span>PLANNING MONTH · UTC</span>
          <span className="budget-month-input-wrap">
            <CalendarDays size={15} />
            <input
              aria-label="Budget planning month"
              type="month"
              min="2000-01"
              max="2100-12"
              value={month}
              onChange={event => setMonth(event.target.value)}
            />
          </span>
        </label>
      </div>

      <form className="budget-plan-form" onSubmit={submitBudget}>
        <label className="budget-amount-field">
          <span>INTENDED MONTHLY BUDGET · USD</span>
          <div className="budget-amount-input-wrap">
            <span aria-hidden="true">$</span>
            <input
              type="number"
              min="0"
              max="9999999999.99"
              step="0.01"
              inputMode="decimal"
              value={plannedAmount}
              onChange={event => setPlannedAmount(event.target.value)}
              placeholder="0.00"
              aria-describedby="budget-plan-help"
              required
            />
          </div>
        </label>
        <p id="budget-plan-help" className="budget-plan-help">
          This is your target for the selected month. It does not cap or block
          commissions.
        </p>
        <button
          className="button button-dark budget-save-button"
          type="submit"
          disabled={saveMutation.isPending || !plannedAmount}
        >
          <Save size={15} />
          {saveMutation.isPending ? "Saving plan…" : "Save monthly plan"}
        </button>
      </form>

      <div className="budget-metrics-grid">
        <PlanMetric
          icon={<CircleDollarSign size={16} />}
          label="INTENDED BUDGET"
          value={data?.plan ? money(data.plan.plannedAmount) : "Not set"}
          hint="Seller-entered plan · USD"
        />
        <PlanMetric
          icon={<TrendingUp size={16} />}
          label="CONFIRMED COMMISSION EXPOSURE"
          value={money(data?.confirmedCommission)}
          hint="Monthly rows approved, batched, or paid"
          accent
        />
        <PlanMetric
          icon={<Clock3 size={16} />}
          label="PENDING REVIEW"
          value={money(data?.pendingCommission)}
          hint="Seller-reported; not yet approved"
        />
        <PlanMetric
          icon={<History size={16} />}
          label="COMMISSION MARKED PAID"
          value={money(data?.paidCommission)}
          hint="For conversion rows reported this month"
        />
      </div>

      <div className="budget-variance-line">
        <strong>Variance vs. plan</strong>
        <span
          className={variance != null && variance < 0 ? "is-over-plan" : ""}
        >
          {varianceLabel}
        </span>
      </div>

      <div className="budget-history-section">
        <div className="budget-history-heading">
          <div>
            <span className="eyebrow">
              <span className="eyebrow-rule" /> CHANGE HISTORY
            </span>
            <h3>Budget plan revisions</h3>
          </div>
          <span>Latest 8 updates</span>
        </div>
        {budgetQuery.isLoading && !data ? (
          <div className="small-empty compact-empty">
            Loading this month’s plan…
          </div>
        ) : data?.history.length ? (
          <div className="budget-history-list">
            {data.history.map(revision => (
              <div className="budget-history-row" key={revision.id}>
                <span className="budget-history-icon">
                  {revision.priorAmount == null ? (
                    <CircleDollarSign size={14} />
                  ) : (
                    <History size={14} />
                  )}
                </span>
                <div>
                  <strong>
                    {revision.priorAmount == null
                      ? "Monthly plan created"
                      : "Monthly plan adjusted"}
                  </strong>
                  <small>{localDate(revision.createdAt)}</small>
                </div>
                <span className="budget-history-amount">
                  {revision.priorAmount == null
                    ? money(revision.newAmount)
                    : `${money(revision.priorAmount)} → ${money(revision.newAmount)}`}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="small-empty compact-empty">
            Save a monthly plan to start its change history.
          </div>
        )}
      </div>

      <div className="budget-safety-note">
        <Info size={15} />
        <p>
          <strong>Planning record only.</strong> ONWHEELZ does not collect,
          hold, reserve, or transfer this amount. Commission exposure is based
          on seller-reported orders and their review status; it may differ from
          actual marketing spend. This is not a wallet balance, escrow account,
          cash forecast, or enforced spending limit.
        </p>
      </div>
    </section>
  );
}
