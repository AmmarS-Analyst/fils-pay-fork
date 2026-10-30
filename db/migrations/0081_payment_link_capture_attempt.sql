-- Keep in-flight provider identity independently of the final paid transaction.
-- An interrupted checkout must recover this authorization, never charge a new
-- buyer while the previous capture result might already have moved money.
ALTER TABLE payment_links ADD COLUMN capture_transaction_id UUID REFERENCES transactions (id);
