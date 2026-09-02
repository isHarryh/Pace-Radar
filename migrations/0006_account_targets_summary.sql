-- 扩展 account_targets 以缓存动态标题/正文摘要，供前端展示（位于 target_id 后）
-- SQLite 不支持在指定位置 ADD COLUMN，需重建表以保证列序：account_id, target_id, summary, first_seen_at, last_seen_at
CREATE TABLE IF NOT EXISTS account_targets_new (
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL,
  summary TEXT,
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (account_id, target_id)
);

INSERT OR IGNORE INTO account_targets_new (account_id, target_id, summary, first_seen_at, last_seen_at)
SELECT account_id, target_id, NULL, first_seen_at, last_seen_at FROM account_targets;

DROP TABLE account_targets;
ALTER TABLE account_targets_new RENAME TO account_targets;

CREATE INDEX IF NOT EXISTS idx_account_targets_account ON account_targets(account_id);
