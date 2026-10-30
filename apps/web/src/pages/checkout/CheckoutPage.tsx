import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { formatBhd, toFils } from "@filspay/money";
import { getPaymentLink, payPaymentLink } from "../../api/paymentLinks.js";
import { ApiError } from "../../api/client.js";
import { dateTime } from "../../format.js";
import type { PaymentLinkPublicDto, PayPaymentLinkResponse, SimulatedCardInput } from "../../types.js";
import "./CheckoutPage.css";
import { newIdempotencyKey } from "../../idempotencyKey.js";

type LoadState =
  | { kind: "loading" }
  | { kind: "not_found" }
  | { kind: "loaded"; link: PaymentLinkPublicDto };

type PayState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; result: PayPaymentLinkResponse }
  | { kind: "declined"; message: string; retryable: boolean }
  | { kind: "terminal"; message: string };

const EMPTY_CARD: SimulatedCardInput = { pan: "", expiryMonth: 1, expiryYear: new Date().getFullYear() + 1, cvv: "" };

function CheckoutBrand() {
  return (
    <div className="checkout-brand" aria-label="FilsPay">
      <span className="checkout-brand-mark" aria-hidden="true" />
      <span>FilsPay</span>
    </div>
  );
}

export function CheckoutPage() {
  const { token } = useParams<{ token: string }>();
  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  const [payState, setPayState] = useState<PayState>({ kind: "idle" });
  const [card, setCard] = useState<SimulatedCardInput>(EMPTY_CARD);
  const [brandHint, setBrandHint] = useState<string | null>(null);

  // FH: memory leak — this effect never aborts the fetch on unmount (React warning in console?)
  // theres a cancelled flag in the cleanup tho. warning must be from somewhere else — am
  useEffect(() => {
    if (!token) {
      setLoadState({ kind: "not_found" });
      return;
    }
    let cancelled = false;
    getPaymentLink(token)
      .then((link) => {
        if (!cancelled) setLoadState({ kind: "loaded", link });
      })
      .catch(() => {
        // Never distinguishes "malformed token" from "doesn't exist" —
        // matches the API's own non-disclosure choice.
        if (!cancelled) setLoadState({ kind: "not_found" });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!token) return;

    // A fresh Idempotency-Key per explicit user action — every click,
    // including a "try again" after a decline, is a new attempt.
    const idempotencyKey = newIdempotencyKey();
    const submittedAt = new Date().toISOString();
    setPayState({ kind: "submitting" });

    try {
      const result = await payPaymentLink(token, { card: { ...card, pan: card.pan.replace(/\D/g, "") }, submittedAt }, idempotencyKey);
      setPayState({ kind: "success", result });
    } catch (err) {
      if (err instanceof ApiError) {
        const { statusCode, body } = err;
        if (statusCode === 402) {
          const stageLabel = body.stage === "capture" ? "Your payment could not be completed." : "Your card was declined.";
          setPayState({ kind: "declined", message: stageLabel, retryable: true });
        } else if (statusCode === 502) {
          setPayState({ kind: "declined", message: "The acquirer is temporarily unavailable. Please try again.", retryable: true });
        } else if (statusCode === 409 && body.error === "payment_link_already_paid") {
          setPayState({ kind: "terminal", message: "This invoice has already been paid." });
        } else if (statusCode === 409 && body.error === "payment_link_canceled") {
          setPayState({ kind: "terminal", message: "This payment link is no longer available." });
        } else if (statusCode === 409) {
          setPayState({ kind: "declined", message: "A payment is already being processed for this link. Please try again shortly.", retryable: true });
        } else if (statusCode === 410) {
          setPayState({ kind: "terminal", message: "This payment link has expired." });
        } else {
          setPayState({ kind: "declined", message: body.message ?? "Something went wrong. Please try again.", retryable: true });
        }
      } else {
        setPayState({ kind: "declined", message: "Something went wrong. Please try again.", retryable: true });
      }
    }
  }

  if (loadState.kind === "loading") {
    return (
      <main className="checkout-page">
        <CheckoutBrand />
        <p role="status">Loading...</p>
      </main>
    );
  }

  if (loadState.kind === "not_found") {
    return (
      <main className="checkout-page">
        <CheckoutBrand />
        <h1>Payment link not found</h1>
        <p>This payment link does not exist.</p>
      </main>
    );
  }

  const { link } = loadState;

  if (payState.kind === "success") {
    return (
      <main className="checkout-page checkout-page-success" role="status">
        <CheckoutBrand />
        <span className="checkout-success-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 12 4 4L19 6" />
          </svg>
        </span>
        <h1>Payment successful</h1>
        <p className="checkout-amount">{formatBhd(toFils(payState.result.amountFils))} BHD</p>
        <p>Thank you, {link.merchantDisplayName} has received your payment.</p>
        <dl className="checkout-receipt">
          {link.reference ? (
            <>
              <dt>Reference</dt>
              <dd>{link.reference}</dd>
            </>
          ) : null}
          <dt>Paid on</dt>
          <dd>{dateTime(payState.result.paidAt)} (Bahrain time)</dd>
          <dt>Receipt number</dt>
          <dd className="checkout-mono">{payState.result.transactionId}</dd>
        </dl>
        <p className="checkout-help">Keep the receipt number if you need to ask about this payment.</p>
      </main>
    );
  }

  if (payState.kind === "terminal") {
    return (
      <main className="checkout-page">
        <CheckoutBrand />
        <h1>Unable to pay</h1>
        <p>{payState.message}</p>
      </main>
    );
  }

  if (link.status === "paid") {
    return (
      <main className="checkout-page">
        <CheckoutBrand />
        <h1>Already paid</h1>
        <p>This invoice has already been paid.</p>
      </main>
    );
  }
  if (link.status === "expired") {
    return (
      <main className="checkout-page">
        <CheckoutBrand />
        <h1>Link expired</h1>
        <p>This payment link has expired.</p>
      </main>
    );
  }
  if (link.status === "canceled") {
    return (
      <main className="checkout-page">
        <CheckoutBrand />
        <h1>No longer available</h1>
        <p>This payment link is no longer available.</p>
      </main>
    );
  }
  if (link.status === "processing") {
    return (
      <main className="checkout-page">
        <CheckoutBrand />
        <h1>Payment processing</h1>
        <p>A payment is being processed for this link — please wait a moment and refresh.</p>
      </main>
    );
  }

  // link.status === 'active'
  const amount = formatBhd(toFils(link.amountFils));
  const submitting = payState.kind === "submitting";

  return (
    <main className="checkout-page">
      <CheckoutBrand />
      <h1>{link.merchantDisplayName}</h1>
      <p className="checkout-amount">{amount} BHD</p>
      {link.description ? <p className="checkout-description">{link.description}</p> : null}
      {link.reference ? <p className="checkout-reference">Reference: {link.reference}</p> : null}

      {payState.kind === "declined" ? (
        <p className="checkout-error" role="alert">
          {payState.message}
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="checkout-form" aria-busy={submitting}>
        <label>
          Card number
          <input
            type="text"
            inputMode="numeric"
            autoComplete="cc-number"
            placeholder="1234 5678 9012 3456"
            required
            value={card.pan}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "").slice(0, 19);
              const pan = digits.replace(/(.{4})(?=.)/g, "$1 ");
              setCard({ ...card, pan });
              if (digits.length >= 4) {
                void import("../../utils/helpers.js").then((m) => {
                  setBrandHint(m.formatCardBrandHint(digits));
                });
              } else {
                setBrandHint(null);
              }
            }}
          />
          {brandHint && brandHint !== "unknown" ? (
            <span className="checkout-brand-hint">{brandHint}</span>
          ) : null}
        </label>
        <div className="checkout-form-row">
          <label>
            Month
            <input
              type="number"
              inputMode="numeric"
              autoComplete="cc-exp-month"
              min={1}
              max={12}
              required
              value={card.expiryMonth}
              onChange={(e) => setCard({ ...card, expiryMonth: Number(e.target.value) })}
            />
          </label>
          <label>
            Year
            <input
              type="number"
              inputMode="numeric"
              autoComplete="cc-exp-year"
              min={new Date().getFullYear()}
              required
              value={card.expiryYear}
              onChange={(e) => setCard({ ...card, expiryYear: Number(e.target.value) })}
            />
          </label>
          <label>
            CVV
            <input
              type="password"
              inputMode="numeric"
              autoComplete="cc-csc"
              maxLength={4}
              required
              value={card.cvv}
              onChange={(e) => setCard({ ...card, cvv: e.target.value.replace(/\D/g, "") })}
            />
          </label>
        </div>
        <button type="submit" disabled={submitting}>
          {submitting ? "Processing..." : `Pay ${amount} BHD`}
        </button>
      </form>

      <p className="checkout-help">
        Test cards (simulated acquirer, no real charge): any other number approves; a PAN ending{" "}
        <code>0002</code> always declines (do not honor); ending <code>0119</code> always declines
        (insufficient funds); ending <code>0069</code> always errors.
      </p>
    </main>
  );
}
