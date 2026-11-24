-- The reading API no longer uses its own token (owner 2026-11-25). The table only ever held the
-- hash of a token that was never created; it belongs to this domain (reading_ prefix).
DROP TABLE IF EXISTS "reading_device";
