-- A delivery claim survives process failure and expires for bounded recovery.
ALTER TABLE webhook_deliveries ADD COLUMN lease_token uuid;
ALTER TABLE webhook_deliveries ADD COLUMN lease_until timestamptz;
