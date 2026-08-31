import type { Account } from '@pace-radar/shared';

export interface SnapshotRow {
  comment_count: number;
  like_count: number;
  share_count: number;
  ratio_c_l: number;
  updated_at: string;
}

export interface AccountRow extends Account {
  avatar: string | null;
}

export interface RequestLogRow {
  id: number;
  account_id: number;
  account_name: string | null;
  target_type: string;
  target_id: string | null;
  comment_count: number;
  like_count: number;
  status_code: string;
  endpoint: string;
  updated_at: string;
}

export async function listAccounts(db: D1Database): Promise<AccountRow[]> {
  const { results } = await db
    .prepare('SELECT id, mid, name, threshold, enabled, avatar FROM accounts WHERE id > 0 ORDER BY id')
    .all<AccountRow>();
  return results;
}

export async function currentTargetId(db: D1Database, accountId: number): Promise<string | null> {
  const row = await db
    .prepare(`SELECT target_id AS t FROM snapshots WHERE account_id = ? AND status_code = 'ok' ORDER BY updated_at DESC, id DESC LIMIT 1`)
    .bind(accountId)
    .first<{ t: string }>();
  return row?.t ?? null;
}

export async function recentRatios(db: D1Database, accountId: number, targetId: string | null = null): Promise<number[]> {
  const tid = targetId ?? (await currentTargetId(db, accountId));
  const where = tid ? 'AND target_id = ?' : '';
  const params = tid ? [accountId, tid] : [accountId];
  const sql = `SELECT ratio_c_l FROM snapshots WHERE account_id = ? ${where} AND status_code = 'ok' ORDER BY updated_at DESC, id DESC LIMIT 10`;
  const { results } = await db.prepare(sql).bind(...params).all<{ ratio_c_l: number }>();
  return results.map((r) => r.ratio_c_l).reverse();
}

export async function latestSnapshots(
  db: D1Database,
  accountId: number,
  limit: number,
  targetId: string | null = null,
): Promise<SnapshotRow[]> {
  const tid = targetId ?? (await currentTargetId(db, accountId));
  const where = tid ? 'AND target_id = ?' : '';
  const params = tid ? [accountId, tid, limit] : [accountId, limit];
  const sql = `SELECT comment_count, like_count, share_count, ratio_c_l, updated_at FROM snapshots WHERE account_id = ? ${where} AND status_code = 'ok' ORDER BY updated_at DESC, id DESC LIMIT ?`;
  const { results } = await db.prepare(sql).bind(...params).all<SnapshotRow>();
  return results.reverse();
}

export interface SeriesPoint {
  updated_at: string;
  comment_count: number;
  like_count: number;
  ratio_c_l: number;
}
export async function series(
  db: D1Database,
  accountId: number,
  bucketSeconds: number,
  offset: string,
  targetId: string | null = null,
): Promise<SeriesPoint[]> {
  const tid = targetId ?? (await currentTargetId(db, accountId));
  const where = tid ? 'AND target_id = ?' : '';
  const params = tid ? [bucketSeconds, accountId, tid, offset] : [bucketSeconds, accountId, offset];
  const sql = `SELECT comment_count, like_count, ratio_c_l, updated_at FROM (
      SELECT comment_count, like_count, ratio_c_l, updated_at,
        ROW_NUMBER() OVER (PARTITION BY CAST(strftime('%s', updated_at) AS INTEGER) / ? ORDER BY updated_at DESC, id DESC) AS rn
      FROM snapshots WHERE account_id = ? ${where} AND status_code = 'ok' AND updated_at >= datetime('now', ?)
    ) WHERE rn = 1 ORDER BY updated_at`;
  const { results } = await db.prepare(sql).bind(...params).all<SeriesPoint>();
  return results;
}

/** 最近 N 条请求日志（含成功与失败），按写入倒序。 */
export async function requestLogs(db: D1Database, limit: number): Promise<RequestLogRow[]> {
  const { results } = await db
    .prepare(
      `SELECT s.id, s.account_id, s.target_type, s.target_id, s.comment_count, s.like_count,
              s.status_code, s.endpoint, s.updated_at, a.name AS account_name
       FROM snapshots s LEFT JOIN accounts a ON a.id = s.account_id
       ORDER BY s.id DESC LIMIT ?`,
    )
    .bind(limit)
    .all<RequestLogRow>();
  return results;
}