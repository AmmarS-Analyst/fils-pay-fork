-- A fresh login or OTP challenge must not refill an account's guess budget.
-- One bounded row per account, reset after a ten-minute verification window.
CREATE TABLE account_otp_attempt_budgets (
  account_type TEXT NOT NULL CHECK (account_type IN ('merchant', 'admin')),
  account_id UUID NOT NULL,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempt_count INTEGER NOT NULL CHECK (attempt_count > 0),
  PRIMARY KEY (account_type, account_id)
);
