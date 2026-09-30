import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { ArrowUpRight, LockKeyhole, Trash2 } from "lucide-react";

export function AffiliatePayPalSettingsPanel({
  hasRecipient,
}: {
  hasRecipient: boolean;
}) {
  const [email, setEmail] = useState("");
  const utils = trpc.useUtils();
  const save = trpc.affiliate.savePayPalRecipient.useMutation({
    onSuccess: async () => {
      setEmail("");
      await utils.affiliate.workspace.invalidate();
      toast.success("PayPal recipient saved securely");
    },
    onError: error => toast.error(error.message),
  });
  const remove = trpc.affiliate.removePayPalRecipient.useMutation({
    onSuccess: async () => {
      await utils.affiliate.workspace.invalidate();
      toast.success("Saved PayPal recipient removed");
    },
    onError: error => toast.error(error.message),
  });

  return (
    <section className="workspace-card paypal-recipient-card">
      <div className="card-kicker">
        <span className="kicker-icon">
          <LockKeyhole size={16} />
        </span>
        <span>PAYPAL PAYOUT PREFERENCE</span>
      </div>
      <h2>Where should approved commissions go?</h2>
      <p>
        Add the PayPal account email you use for payouts. ONWHEELZ encrypts it in
        storage and never shows it to sellers or other affiliates. PayPal still
        applies its own account, country, and recipient eligibility rules.
      </p>
      {hasRecipient ? (
        <div className="paypal-recipient-saved">
          <span>
            <LockKeyhole size={15} /> PayPal recipient saved (encrypted)
          </span>
          <button
            className="copy-link-button paypal-unlink-button"
            type="button"
            disabled={remove.isPending || save.isPending}
            onClick={() => {
              if (
                window.confirm(
                  "Remove your saved PayPal recipient? This will not cancel a payout that PayPal has already accepted."
                )
              ) {
                remove.mutate();
              }
            }}
          >
            <Trash2 size={14} /> Remove
          </button>
        </div>
      ) : null}
      <form
        className="paypal-recipient-form"
        onSubmit={event => {
          event.preventDefault();
          save.mutate({ email });
        }}
      >
        <label className="field-label" htmlFor="paypal-recipient-email">
          PayPal account email
        </label>
        <input
          id="paypal-recipient-email"
          type="email"
          autoComplete="email"
          required
          maxLength={320}
          className="field-input"
          value={email}
          onChange={event => setEmail(event.target.value)}
          placeholder={hasRecipient ? "Enter a replacement PayPal email" : "name@example.com"}
        />
        <div className="paypal-recipient-actions">
          <button
            className="button button-dark"
            type="submit"
            disabled={save.isPending || remove.isPending || !email.trim()}
          >
            {save.isPending ? "Saving securely…" : hasRecipient ? "Replace recipient" : "Save recipient"}
            <ArrowUpRight size={15} />
          </button>
          <span>PayPal commissions are sent only after ONWHEELZ admin review.</span>
        </div>
      </form>
    </section>
  );
}
