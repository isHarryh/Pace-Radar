CREATE TABLE IF NOT EXISTS accounts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  mid        INTEGER NOT NULL UNIQUE,          -- B站 UP 主 UID
  name       TEXT    NOT NULL,                 -- 展示名称
  threshold  REAL    NOT NULL DEFAULT 0.5,     -- 评论/点赞 判定阈值
  enabled    INTEGER NOT NULL DEFAULT 1,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS snapshots (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id    INTEGER NOT NULL REFERENCES accounts(id),
  target_type   TEXT    NOT NULL,              -- 'dynamic' | 'video'
  target_id     TEXT    NOT NULL,              -- 动态 id_str / 视频 bvid
  comment_count INTEGER NOT NULL,              -- 评论数（盖楼层数）
  like_count    INTEGER NOT NULL,              -- 点赞数
  share_count   INTEGER NOT NULL DEFAULT 0,    -- 转发数
  ratio_c_l     REAL    NOT NULL,              -- comment_count / like_count
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (account_id, target_type, target_id, updated_at)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_account_time
  ON snapshots (account_id, updated_at);

CREATE TABLE IF NOT EXISTS app_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);