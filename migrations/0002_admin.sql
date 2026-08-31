ALTER TABLE accounts ADD COLUMN avatar TEXT;

-- 请求日志化：status_code 记录每次请求结果（'ok' / 业务码 '-101'/'-352' / HTTP 码 '412'/'-352' / 'network'）
-- endpoint 记录请求端点（'feed/space' / 'view' / 'arc/search' / 'nav'）
ALTER TABLE snapshots ADD COLUMN status_code TEXT NOT NULL DEFAULT 'ok';
ALTER TABLE snapshots ADD COLUMN endpoint TEXT NOT NULL DEFAULT 'feed/space';