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

export type PublicAccountRow = Omit<AccountRow, 'avatar'>;

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

export interface SeriesPoint {
  updated_at: string;
  comment_count: number;
  like_count: number;
  ratio_c_l: number;
}

function placeholders(ids: number[]): string {
  return ids.map(() => '?').join(',');
}

function latestTargetCte(ph: string): string {
  return `SELECT account_id, target_id FROM (
    SELECT account_id, target_id, ROW_NUMBER() OVER (PARTITION BY account_id ORDER BY updated_at DESC, id DESC) AS rn
    FROM snapshots WHERE account_id IN (${ph}) AND status_code = 'ok'
  ) WHERE rn = 1`;
}

export async function listAccounts(db: D1Database): Promise<AccountRow[]> {
  const { results } = await db
    .prepare('SELECT id, mid, name, threshold, enabled, avatar FROM accounts WHERE id > 0 ORDER BY id')
    .all<AccountRow>();
  return results;
}

export async function listPublicAccounts(db: D1Database): Promise<PublicAccountRow[]> {
  const { results } = await db
    .prepare('SELECT id, mid, name, threshold, enabled FROM accounts WHERE id > 0 AND enabled = 1 ORDER BY id')
    .all<PublicAccountRow>();
  return results;
}

export async function getAccountByMid(db: D1Database, mid: number): Promise<PublicAccountRow | null> {
  const row = await db
    .prepare('SELECT id, mid, name, threshold, enabled FROM accounts WHERE mid = ? LIMIT 1')
    .bind(mid)
    .first<PublicAccountRow>();
  return row ?? null;
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
        ROW_NUMBER() OVER (PARTITION BY CAST(CAST(strftime('%s', updated_at) AS INTEGER) / ? AS INTEGER) ORDER BY updated_at DESC, id DESC) AS rn
      FROM snapshots WHERE account_id = ? ${where} AND status_code = 'ok' AND updated_at >= datetime('now', ?)
    ) WHERE rn = 1 ORDER BY updated_at`;
  const { results } = await db.prepare(sql).bind(...params).all<SeriesPoint>();
  return results;
}

export async function recentRatiosBatch(db: D1Database, accountIds: number[]): Promise<Map<number, number[]>> {
  const map = new Map<number, number[]>();
  for (const id of accountIds) map.set(id, []);
  if (accountIds.length === 0) return map;
  const ph = placeholders(accountIds);
  const sql = `WITH latest_target AS (${latestTargetCte(ph)}),
    ranked AS (
      SELECT s.account_id, s.ratio_c_l, s.updated_at, s.id,
             ROW_NUMBER() OVER (PARTITION BY s.account_id ORDER BY s.updated_at DESC, s.id DESC) AS rn
      FROM snapshots s
      JOIN latest_target lt ON lt.account_id = s.account_id AND lt.target_id = s.target_id
      WHERE s.status_code = 'ok' AND s.account_id IN (${ph})
    )
    SELECT account_id, ratio_c_l, updated_at, id FROM ranked WHERE rn <= 10 ORDER BY account_id ASC, updated_at ASC, id ASC`;
  const { results } = await db
    .prepare(sql)
    .bind(...accountIds, ...accountIds)
    .all<{ account_id: number; ratio_c_l: number; updated_at: string; id: number }>();
  for (const row of results) map.get(row.account_id)!.push(row.ratio_c_l);
  return map;
}

export async function latestSnapshotsBatch(
  db: D1Database,
  accountIds: number[],
  limit: number,
): Promise<Map<number, SnapshotRow[]>> {
  const map = new Map<number, SnapshotRow[]>();
  for (const id of accountIds) map.set(id, []);
  if (accountIds.length === 0) return map;
  const ph = placeholders(accountIds);
  const sql = `WITH latest_target AS (${latestTargetCte(ph)}),
    ranked AS (
      SELECT s.account_id, s.comment_count, s.like_count, s.share_count, s.ratio_c_l, s.updated_at, s.id,
             ROW_NUMBER() OVER (PARTITION BY s.account_id ORDER BY s.updated_at DESC, s.id DESC) AS rn
      FROM snapshots s
      JOIN latest_target lt ON lt.account_id = s.account_id AND lt.target_id = s.target_id
      WHERE s.status_code = 'ok' AND s.account_id IN (${ph})
    )
    SELECT account_id, comment_count, like_count, share_count, ratio_c_l, updated_at FROM ranked WHERE rn <= ? ORDER BY account_id ASC, updated_at ASC, id ASC`;
  const { results } = await db
    .prepare(sql)
    .bind(...accountIds, ...accountIds, limit)
    .all<{ account_id: number } & SnapshotRow>();
  for (const row of results) {
    const { account_id, ...snap } = row as { account_id: number } & SnapshotRow;
    map.get(account_id)!.push(snap);
  }
  return map;
}

export async function seriesBatch(
  db: D1Database,
  accountIds: number[],
  bucketSeconds: number,
  offset: string,
): Promise<Map<number, SeriesPoint[]>> {
  const map = new Map<number, SeriesPoint[]>();
  for (const id of accountIds) map.set(id, []);
  if (accountIds.length === 0) return map;
  const ph = placeholders(accountIds);
  const sql = `WITH latest_target AS (${latestTargetCte(ph)}),
    bucketed AS (
      SELECT s.account_id, s.comment_count, s.like_count, s.ratio_c_l, s.updated_at, s.id,
             ROW_NUMBER() OVER (PARTITION BY s.account_id, CAST(CAST(strftime('%s', s.updated_at) AS INTEGER) / ? AS INTEGER) ORDER BY s.updated_at DESC, s.id DESC) AS rn
      FROM snapshots s
      JOIN latest_target lt ON lt.account_id = s.account_id AND lt.target_id = s.target_id
      WHERE s.status_code = 'ok' AND s.account_id IN (${ph}) AND s.updated_at >= datetime('now', ?)
    )
    SELECT account_id, comment_count, like_count, ratio_c_l, updated_at FROM bucketed WHERE rn = 1 ORDER BY account_id ASC, updated_at ASC`;
  const { results } = await db
    .prepare(sql)
    .bind(...accountIds, bucketSeconds, ...accountIds, offset)
    .all<{ account_id: number } & SeriesPoint>();
  for (const row of results) {
    const { account_id, ...pt } = row as { account_id: number } & SeriesPoint;
    map.get(account_id)!.push(pt);
  }
  return map;
}

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
