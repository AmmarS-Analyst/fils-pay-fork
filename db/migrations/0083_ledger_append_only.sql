-- Financial corrections are new balanced entries; journal history is immutable.
CREATE FUNCTION reject_ledger_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries is append-only; post a correcting entry instead' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER ledger_history_is_append_only
BEFORE UPDATE OR DELETE ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION reject_ledger_history_mutation();
