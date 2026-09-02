-- 缓存账号的去重动态 ID，避免每次用 GROUP BY 扫描全量 snapshots
CREATE TABLE IF NOT EXISTS account_targets (
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL,
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (account_id, target_id)
);

CREATE INDEX IF NOT EXISTS idx_account_targets_account ON account_targets(account_id);

-- 回填历史数据（仅 ok 且非空 target）
INSERT OR IGNORE INTO account_targets (account_id, target_id, first_seen_at, last_seen_at)
SELECT account_id, target_id, MIN(updated_at), MAX(updated_at)
FROM snapshots
WHERE status_code = 'ok' AND target_id != ''
GROUP BY account_id, target_id;
