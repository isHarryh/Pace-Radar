import { deriveStatus } from '@pace-radar/shared';
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
}

function placeholders<T>(ids: T[]): string {
  return ids.map(() => '?').join(',');
}

function initMap<K, V>(keys: K[], init: () => V): Map<K, V> {
  const m = new Map<K, V>();
  for (const k of keys) m.set(k, init());
  return m;
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
  const sql = `SELECT comment_count, updated_at FROM (
      SELECT comment_count, updated_at,
        ROW_NUMBER() OVER (PARTITION BY CAST(CAST(strftime('%s', updated_at) AS INTEGER) / ? AS INTEGER) ORDER BY updated_at DESC, id DESC) AS rn
      FROM snapshots WHERE account_id = ? ${where} AND status_code = 'ok' AND updated_at >= datetime('now', ?)
    ) WHERE rn = 1 ORDER BY updated_at`;
  const { results } = await db.prepare(sql).bind(...params).all<SeriesPoint>();
  return results;
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

// ---------- Multi-target helpers for full-page tracking ----------

export async function getActiveTargetIds(db: D1Database, accountId: number, threshold: number): Promise<string[]> {
  const map = await getActiveTargetsBatch(db, [{ id: accountId, threshold } as PublicAccountRow]);
  return map.get(accountId) ?? [];
}

export async function getRecentRatiosByTargets(
  db: D1Database,
  accountId: number,
  targetIds: string[],
): Promise<Map<string, number[]>> {
  const map = initMap(targetIds, () => [] as number[]);
  if (targetIds.length === 0) return map;
  const chunkSize = 5;
  const allRows: { target_id: string; ratio_c_l: number }[] = [];
  for (let i = 0; i < targetIds.length; i += chunkSize) {
    const chunk = targetIds.slice(i, i + chunkSize);
    const parts: string[] = [];
    const params: unknown[] = [];
    for (const tid of chunk) {
      parts.push(
        `SELECT * FROM (SELECT target_id, ratio_c_l FROM snapshots WHERE account_id = ? AND target_id = ? AND status_code = 'ok' ORDER BY updated_at DESC, id DESC LIMIT 10)`,
      );
      params.push(accountId, tid);
    }
    const sql = parts.join(' UNION ALL ');
    const { results } = await db.prepare(sql).bind(...params).all<{ target_id: string; ratio_c_l: number }>();
    allRows.push(...results);
  }
  const results = allRows;
  for (const row of results) map.get(row.target_id)!.push(row.ratio_c_l);
  return map;
}

export async function getActiveTargetsBatch(
  db: D1Database,
  accounts: PublicAccountRow[],
): Promise<Map<number, string[]>> {
  const map = initMap(accounts.map((a) => a.id), () => [] as string[]);
  if (accounts.length === 0) return map;
  await Promise.all(
    accounts.map(async (account) => {
      const distinct = await db
        .prepare(`SELECT target_id FROM snapshots WHERE account_id = ? AND status_code = 'ok' GROUP BY target_id`)
        .bind(account.id)
        .all<{ target_id: string }>();
      const targetIds = distinct.results.map((r) => r.target_id);
      if (targetIds.length === 0) return;
      const chunkSize = 5;
      const allRows: { target_id: string; ratio_c_l: number }[] = [];
      for (let i = 0; i < targetIds.length; i += chunkSize) {
        const chunk = targetIds.slice(i, i + chunkSize);
        const parts: string[] = [];
        const params: unknown[] = [];
        for (const tid of chunk) {
          parts.push(
            `SELECT * FROM (SELECT target_id, ratio_c_l FROM snapshots WHERE account_id = ? AND target_id = ? AND status_code = 'ok' ORDER BY updated_at DESC, id DESC LIMIT 10)`,
          );
          params.push(account.id, tid);
        }
        const sql = parts.join(' UNION ALL ');
        const { results } = await db.prepare(sql).bind(...params).all<{ target_id: string; ratio_c_l: number }>();
        allRows.push(...results);
      }
      const grouped = new Map<string, number[]>();
      for (const row of allRows) {
        const arr = grouped.get(row.target_id);
        if (arr) arr.push(row.ratio_c_l);
        else grouped.set(row.target_id, [row.ratio_c_l]);
      }
      for (const [tid, ratios] of grouped) {
        if (deriveStatus(ratios, account.threshold) !== 'normal') {
          map.get(account.id)!.push(tid);
        }
      }
    }),
  );
  return map;
}

export async function latestSnapshotsByTargets(
  db: D1Database,
  accountId: number,
  targetIds: string[],
  limit: number,
): Promise<Map<string, SnapshotRow[]>> {
  const map = initMap(targetIds, () => [] as SnapshotRow[]);
  if (targetIds.length === 0) return map;
  const chunkSize = 5;
  const allRows: ({ target_id: string } & SnapshotRow)[] = [];
  for (let i = 0; i < targetIds.length; i += chunkSize) {
    const chunk = targetIds.slice(i, i + chunkSize);
    const parts: string[] = [];
    const params: unknown[] = [];
    for (const tid of chunk) {
      parts.push(
        `SELECT * FROM (SELECT target_id, comment_count, like_count, share_count, ratio_c_l, updated_at FROM snapshots WHERE account_id = ? AND target_id = ? AND status_code = 'ok' ORDER BY updated_at DESC, id DESC LIMIT ?)`,
      );
      params.push(accountId, tid, limit);
    }
    const sql = `${parts.join(' UNION ALL ')} ORDER BY target_id ASC, updated_at ASC`;
    const { results } = await db.prepare(sql).bind(...params).all<{ target_id: string } & SnapshotRow>();
    allRows.push(...results);
  }
  for (const row of allRows) {
    const { target_id, ...snap } = row as { target_id: string } & SnapshotRow;
    map.get(target_id)!.push(snap);
  }
  return map;
}

export async function seriesByTargets(
  db: D1Database,
  accountId: number,
  targetIds: string[],
  bucketSeconds: number,
  offset: string,
): Promise<Map<string, SeriesPoint[]>> {
  const map = initMap(targetIds, () => [] as SeriesPoint[]);
  if (targetIds.length === 0) return map;
  const ph = placeholders(targetIds);
  const sql = `SELECT target_id, comment_count, updated_at FROM (
      SELECT target_id, comment_count, updated_at,
             ROW_NUMBER() OVER (PARTITION BY target_id, CAST(CAST(strftime('%s', updated_at) AS INTEGER) / ? AS INTEGER) ORDER BY updated_at DESC, id DESC) AS rn
      FROM snapshots WHERE account_id = ? AND status_code = 'ok' AND target_id IN (${ph}) AND updated_at >= datetime('now', ?)
    ) WHERE rn = 1 ORDER BY target_id ASC, updated_at ASC`;
  const { results } = await db
    .prepare(sql)
    .bind(bucketSeconds, accountId, ...targetIds, offset)
    .all<{ target_id: string } & SeriesPoint>();
  for (const row of results) {
    const { target_id, ...pt } = row as { target_id: string } & SeriesPoint;
    map.get(target_id)!.push(pt);
  }
  return map;
}

export async function fallbackLatestStats(
  db: D1Database,
  accountId: number,
): Promise<{ maxComment: number | null; maxRatio: number | null; latest: SnapshotRow | null }> {
  const distinct = await db
    .prepare(`SELECT target_id FROM snapshots WHERE account_id = ? AND status_code = 'ok' GROUP BY target_id`)
    .bind(accountId)
    .all<{ target_id: string }>();
  const targetIds = distinct.results.map((r) => r.target_id);
  if (targetIds.length === 0) return { maxComment: null, maxRatio: null, latest: null };
  const chunkSize = 5;
  const allRows: SnapshotRow[] = [];
  for (let i = 0; i < targetIds.length; i += chunkSize) {
    const chunk = targetIds.slice(i, i + chunkSize);
    const parts: string[] = [];
    const params: unknown[] = [];
    for (const tid of chunk) {
      parts.push(
        `SELECT * FROM (SELECT comment_count, like_count, share_count, ratio_c_l, updated_at FROM snapshots WHERE account_id = ? AND target_id = ? AND status_code = 'ok' ORDER BY updated_at DESC, id DESC LIMIT 1)`,
      );
      params.push(accountId, tid);
    }
    const sql = parts.join(' UNION ALL ');
    const { results } = await db.prepare(sql).bind(...params).all<SnapshotRow>();
    allRows.push(...results);
  }
  const results = allRows;
  if (results.length === 0) return { maxComment: null, maxRatio: null, latest: null };
  let maxComment: number | null = null;
  let maxRatio: number | null = null;
  let latest: SnapshotRow | null = null;
  for (const r of results) {
    if (maxComment === null || r.comment_count > maxComment) maxComment = r.comment_count;
    if (maxRatio === null || r.ratio_c_l > maxRatio) maxRatio = r.ratio_c_l;
    if (!latest || r.updated_at > latest.updated_at) latest = r;
    // tie-breaker for latest if same timestamp but higher comment
    if (latest && r.updated_at === latest.updated_at && r.comment_count > latest.comment_count) latest = r;
  }
  return { maxComment, maxRatio, latest };
}


