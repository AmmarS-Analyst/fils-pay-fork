-- Additional suspense accounts for future reconciliation lanes.
-- Written against columns chart_of_accounts never had (code, account_type,
-- description) and a kind its CHECK rejects ('suspense'), so it could not
-- apply. Suspense accounts are assets here, like scheme_rounding_residue.

INSERT INTO chart_of_accounts (id, name, kind)
VALUES
  ('fx_rounding_difference', 'FX Rounding Difference', 'asset'),
  ('chargeback_suspense', 'Chargeback Suspense', 'asset')
ON CONFLICT (id) DO NOTHING;
