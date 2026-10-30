-- Deliberately no transaction FK: the fence is committed on a separate
-- connection while the financial transaction holds its transaction-row lock.
-- A FK key-share lock would deadlock those two connections.
CREATE TABLE provider_operation_fences (
  transaction_id UUID PRIMARY KEY,
  operation TEXT NOT NULL CHECK (operation IN ('capture', 'refund')),
  provider_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
