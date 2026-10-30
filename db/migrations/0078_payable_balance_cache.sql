-- Payable balances follow committed journal entries, rather than batch totals.
-- Rebuild the cache once on installation; as with the documented rebuild,
-- cache-only display corrections must be reapplied afterward if still needed.
LOCK TABLE ledger_entries IN SHARE ROW EXCLUSIVE MODE;
INSERT INTO merchant_balances (merchant_id, cached_payable_fils, updated_at)
SELECT m.id, COALESCE(SUM(CASE WHEN l.direction = 'credit' THEN l.amount_fils ELSE -l.amount_fils END), 0), now()
FROM merchants m
LEFT JOIN ledger_entries l ON l.merchant_id = m.id AND l.account_id = 'merchant_payable'
GROUP BY m.id
ON CONFLICT (merchant_id) DO UPDATE
SET cached_payable_fils = EXCLUDED.cached_payable_fils, updated_at = now();

CREATE FUNCTION maintain_payable_balance_cache() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.account_id = 'merchant_payable' THEN
    INSERT INTO merchant_balances (merchant_id, cached_payable_fils, updated_at)
    VALUES (NEW.merchant_id,
            CASE WHEN NEW.direction = 'credit' THEN NEW.amount_fils ELSE -NEW.amount_fils END, now())
    ON CONFLICT (merchant_id) DO UPDATE
    SET cached_payable_fils = merchant_balances.cached_payable_fils + EXCLUDED.cached_payable_fils,
        updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ledger_payable_balance_cache
AFTER INSERT ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION maintain_payable_balance_cache();
