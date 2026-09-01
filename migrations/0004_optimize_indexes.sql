-- 优化公开 API 高频查询的复合索引

CREATE INDEX IF NOT EXISTS idx_snapshots_account_status_target_time
  ON snapshots (account_id, status_code, target_id, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_snapshots_account_status_time
  ON snapshots (account_id, status_code, updated_at DESC, id DESC);
