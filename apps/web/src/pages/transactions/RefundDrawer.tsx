import { useState } from "react";
import { formatBhd, parseBhdToFils, toFils } from "@filspay/money";
import { describeError, request } from "../../api/client.js";
import { useDashboardAuth } from "../../auth/DashboardAuthContext.js";
import { RequireRole } from "../../auth/RequireRole.js";
import { bhd } from "../../format.js";
import type { TransactionDto } from "../../types.js";

interface RefundResponse {
  id: string;
  transactionId: string;
  amountFils: number;
  feeReversedFils: number;
  status: string;
  transactionStatus: string;
  refundedTotalFils: number;
  occurredAt: string;
}

interface RefundDrawerProps {
  txn: TransactionDto;
  onRefunded: () => Promise<void>;
}

const REFUNDABLE_STATUSES = new Set(["captured", "partially_captured", "partially_refunded"]);

/** Refund control. The amount is typed in BD; one Idempotency-Key per attempt so a retry can't refund twice. */
export function RefundDrawer({ txn, onRefunded }: RefundDrawerProps) {
  const { me } = useDashboardAuth();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attemptKey, setAttemptKey] = useState(() => crypto.randomUUID());

  const merchantId = me?.merchant.id;
  const refundableFils = txn.capturedFils - txn.refundedFils;
  if (!REFUNDABLE_STATUSES.has(txn.status) || refundableFils <= 0) return null;

  function changeAmount(value: string): void {
    setAmount(value);
    // A different amount is a different request: it needs its own key.
    setAttemptKey(crypto.randomUUID());
  }

  async function handleRefund(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!merchantId) return;

    const trimmed = amount.trim();
    let amountFils: number | undefined;
    if (trimmed !== "") {
      try {
        amountFils = parseBhdToFils(trimmed);
      } catch {
        setError("Enter the amount in BD, e.g. 4.750");
        return;
      }
      if (amountFils <= 0 || amountFils > refundableFils) {
        setError(`Enter an amount between 0.001 and ${bhd(refundableFils)}`);
        return;
      }
    }
    const shown = bhd(amountFils ?? refundableFils);
    if (!window.confirm(`Refund ${shown}? The money goes back to the cardholder and cannot be recalled.`)) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      // Left blank, amountFils is omitted and the API refunds everything
      // still refundable.
      const body = amountFils === undefined ? { transactionId: txn.id } : { transactionId: txn.id, amountFils };
      await request<RefundResponse>(`/v1/merchants/${encodeURIComponent(merchantId)}/refunds`, {
        method: "POST",
        headers: { "Idempotency-Key": attemptKey },
        body: JSON.stringify(body),
      });

      setOpen(false);
      setAmount("");
      setAttemptKey(crypto.randomUUID());
      // Refetch: the refund wrote a new transaction_events row server-side.
      await onRefunded();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <RequireRole allow={["owner", "finance"]}>
      <div className="dash-actions">
        {error ? <p className="dash-error">{error}</p> : null}
        {open ? (
          <form className="dash-form dash-form-inline" onSubmit={(e) => void handleRefund(e)}>
            <label>
              Amount in BD (blank refunds everything still refundable)
              <input
                type="text"
                inputMode="decimal"
                placeholder={formatBhd(toFils(refundableFils))}
                value={amount}
                onChange={(e) => changeAmount(e.target.value)}
              />
            </label>
            <p className="dash-muted">Still refundable: {bhd(refundableFils)}</p>
            <button type="submit" className="dash-button" disabled={submitting}>
              {submitting ? "Refunding..." : "Refund"}
            </button>
            <button type="button" className="dash-button" disabled={submitting} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </form>
        ) : (
          <button type="button" className="dash-button" onClick={() => setOpen(true)}>
            Refund
          </button>
        )}
      </div>
    </RequireRole>
  );
}
