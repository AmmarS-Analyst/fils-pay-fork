-- Ordinary batches claim journal-only payable corrections exactly once.
-- Claim receipts preserve the immutable journal and identify the payout batch.
CREATE TABLE settlement_adjustment_claims (
  ledger_entry_id BIGINT PRIMARY KEY REFERENCES ledger_entries(id),
  settlement_batch_id UUID NOT NULL REFERENCES settlement_batches(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX settlement_adjustment_claims_batch ON settlement_adjustment_claims(settlement_batch_id);

ALTER TABLE settlement_batches
  ADD COLUMN adjustment_fils BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN carry_in_fils BIGINT NOT NULL DEFAULT 0 CHECK (carry_in_fils <= 0),
  ADD COLUMN carry_out_fils BIGINT NOT NULL DEFAULT 0 CHECK (carry_out_fils <= 0);

-- Negative net settlement is withheld from subsequent proceeds, never paid
-- as a negative bank instruction and never silently discarded.
CREATE TABLE settlement_carry_balances (
  merchant_id UUID PRIMARY KEY REFERENCES merchants(id),
  amount_fils BIGINT NOT NULL DEFAULT 0 CHECK (amount_fils <= 0),
  last_batch_date DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
