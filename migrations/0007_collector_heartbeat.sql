-- Reuse collector_leases for async heartbeat: account state (with cookie md5) + egress IP geo
-- Keep single latest row (name='heartbeat'), do not increase table count
ALTER TABLE collector_leases ADD COLUMN cookie_md5 TEXT;
ALTER TABLE collector_leases ADD COLUMN cookie_mid INTEGER;
ALTER TABLE collector_leases ADD COLUMN cookie_uname TEXT;
ALTER TABLE collector_leases ADD COLUMN is_login INTEGER;
ALTER TABLE collector_leases ADD COLUMN nav_code INTEGER;
ALTER TABLE collector_leases ADD COLUMN valid INTEGER;
ALTER TABLE collector_leases ADD COLUMN error TEXT;
ALTER TABLE collector_leases ADD COLUMN egress_ip TEXT;
ALTER TABLE collector_leases ADD COLUMN egress_geo TEXT;
ALTER TABLE collector_leases ADD COLUMN cookie_checked_at TEXT;
ALTER TABLE collector_leases ADD COLUMN egress_checked_at TEXT;
