-- Existing imports remain historical; new uploads carry a stable request identity.
ALTER TABLE adjustment_imports ADD COLUMN request_key text;
ALTER TABLE adjustment_imports ADD COLUMN request_hash text;
CREATE UNIQUE INDEX adjustment_imports_request_key_unique ON adjustment_imports(request_key);
