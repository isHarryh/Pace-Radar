CREATE TABLE IF NOT EXISTS collector_leases (
  name       TEXT PRIMARY KEY,
  holder     TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
