import { parseConfig } from './config.js';
import type { CollectorStore, ScheduleState, SnapshotInsert } from './ports.js';
import type { Account, WbiKeys } from '@pace-radar/shared';
import { deriveStatus } from '@pace-radar/shared';

export abstract class BaseCollectorStore implements CollectorStore {
  abstract queryAll<T>(sql: string, params: unknown[]): Promise<T[]>;
  abstract queryFirst<T>(sql: string, params: unknown[]): Promise<T | null>;
  abstract exec(sql: string, params: unknown[]): Promise<{ changes: number }>;
  abstract batchExec(statements: Array<{ sql: string; params: unknown[] }>): Promise<void>;

  async loadConfig() {
    const rows = await this.queryAll<{ key: string; value: string }>('SELECT key, value FROM app_config', []);
    return parseConfig(rows);
  }

  async saveWbiKeys(keys: WbiKeys): Promise<void> {
    await this.exec("INSERT OR REPLACE INTO app_config (key, value) VALUES ('wbi_keys', ?)", [JSON.stringify(keys)]);
  }

  async listEnabledAccounts(): Promise<Account[]> {
    return this.queryAll<Account>('SELECT id, mid, name, threshold, enabled FROM accounts WHERE enabled = 1', []);
  }

  async getScheduleState(accountId: number): Promise<ScheduleState> {
    const row = await this.queryFirst<{ target_id: string | null; ratios: string; last_collected_at: string | null }>(
      `WITH target AS (
         SELECT target_id FROM snapshots WHERE account_id = ? AND status_code = 'ok'
         ORDER BY updated_at DESC, id DESC LIMIT 1
       )
       SELECT
         (SELECT target_id FROM target) AS target_id,
         COALESCE((SELECT json_group_array(ratio_c_l) FROM (
           SELECT ratio_c_l FROM snapshots WHERE account_id = ? AND status_code = 'ok'
             AND target_id = (SELECT target_id FROM target)
           ORDER BY updated_at DESC, id DESC LIMIT 5
         )), '[]') AS ratios,
         (SELECT MAX(updated_at) FROM snapshots WHERE account_id = ? AND status_code = 'ok'
           AND target_id = (SELECT target_id FROM target)) AS last_collected_at`,
      [accountId, accountId, accountId],
    );
    return {
      targetId: row?.target_id ?? null,
      recentRatios: row ? (JSON.parse(row.ratios) as number[]).reverse() : [],
      lastCollectedAt: row?.last_collected_at ? new Date(`${row.last_collected_at.replace(' ', 'T')}Z`) : null,
    };
  }

  async getScheduleStates(accountId: number): Promise<Map<string, ScheduleState>> {
    const targets = await this.queryAll<{ target_id: string }>(
      `SELECT target_id FROM account_targets WHERE account_id = ?`,
      [accountId],
    );
    if (targets.length === 0) return new Map();
    const chunkSize = 5;
    const rows: { target_id: string; ratio_c_l: number; updated_at: string }[] = [];
    for (let i = 0; i < targets.length; i += chunkSize) {
      const chunk = targets.slice(i, i + chunkSize);
      const unionParts: string[] = [];
      const unionParams: unknown[] = [];
      for (const { target_id } of chunk) {
        unionParts.push(
          `SELECT * FROM (SELECT target_id, ratio_c_l, updated_at FROM snapshots WHERE account_id = ? AND status_code = 'ok' AND target_id = ? ORDER BY updated_at DESC, id DESC LIMIT 5)`,
        );
        unionParams.push(accountId, target_id);
      }
      const chunkRows = await this.queryAll<{ target_id: string; ratio_c_l: number; updated_at: string }>(
        `${unionParts.join(' UNION ALL ')} ORDER BY target_id, updated_at DESC`,
        unionParams,
      );
      rows.push(...chunkRows);
    }
    const grouped = new Map<string, { ratios: number[]; last_at: string }>();
    for (const r of rows) {
      const g = grouped.get(r.target_id);
      if (g) g.ratios.push(r.ratio_c_l);
      else grouped.set(r.target_id, { ratios: [r.ratio_c_l], last_at: r.updated_at });
    }
    const map = new Map<string, ScheduleState>();
    for (const [targetId, { ratios, last_at }] of grouped) {
      map.set(targetId, {
        targetId,
        recentRatios: ratios.slice().reverse(),
        lastCollectedAt: last_at ? new Date(`${last_at.replace(' ', 'T')}Z`) : null,
      });
    }
    // Include targets with no recent ratios? Already covered by ranked, but if account has snapshots but all filtered?
    // Ensure empty map for accounts with no snapshots is correct.
    return map;
  }

  async insertSnapshot(snapshot: SnapshotInsert): Promise<void> {
    await this.exec(
      `INSERT INTO snapshots
        (account_id, target_type, target_id, comment_count, like_count, share_count, ratio_c_l, status_code, endpoint)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(account_id, target_type, target_id, updated_at) DO NOTHING`,
      [
        snapshot.accountId,
        snapshot.targetType,
        snapshot.targetId,
        snapshot.commentCount,
        snapshot.likeCount,
        snapshot.shareCount,
        snapshot.likeCount === 0 ? 0 : snapshot.commentCount / snapshot.likeCount,
        snapshot.statusCode,
        snapshot.endpoint,
      ],
    );
    if (snapshot.statusCode === 'ok' && snapshot.targetId) {
      await this.exec(
        `INSERT INTO account_targets (account_id, target_id, summary, first_seen_at, last_seen_at)
         VALUES (?, ?, ?, datetime('now'), datetime('now'))
         ON CONFLICT(account_id, target_id) DO UPDATE SET last_seen_at = excluded.last_seen_at, summary = COALESCE(excluded.summary, summary)`,
        [snapshot.accountId, snapshot.targetId, snapshot.summary ?? null],
      );
    }
  }

  async insertSnapshots(snapshots: SnapshotInsert[]): Promise<void> {
    if (snapshots.length === 0) return;
    await this.batchExec(
      snapshots.map((s) => ({
        sql: `INSERT INTO snapshots
          (account_id, target_type, target_id, comment_count, like_count, share_count, ratio_c_l, status_code, endpoint)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(account_id, target_type, target_id, updated_at) DO NOTHING`,
        params: [
          s.accountId,
          s.targetType,
          s.targetId,
          s.commentCount,
          s.likeCount,
          s.shareCount,
          s.likeCount === 0 ? 0 : s.commentCount / s.likeCount,
          s.statusCode,
          s.endpoint,
        ],
      })),
    );
    const okTargets = snapshots.filter((s) => s.statusCode === 'ok' && s.targetId);
    if (okTargets.length > 0) {
      const dedup = new Map<string, SnapshotInsert>();
      for (const s of okTargets) dedup.set(`${s.accountId}:${s.targetId}`, s);
      await this.batchExec(
        Array.from(dedup.values()).map((s) => ({
          sql: `INSERT INTO account_targets (account_id, target_id, summary, first_seen_at, last_seen_at)
                VALUES (?, ?, ?, datetime('now'), datetime('now'))
                ON CONFLICT(account_id, target_id) DO UPDATE SET last_seen_at = excluded.last_seen_at, summary = COALESCE(excluded.summary, summary)`,
          params: [s.accountId, s.targetId, s.summary ?? null],
        })),
      );
    }
  }

  private toDbTime(date: Date): string {
    return date.toISOString().slice(0, 19).replace('T', ' ');
  }

  private async deleteArchived(
    accountId: number,
    inactiveTargets: string[],
    partitionBy: string,
    timeFilter: string,
    timeParams: unknown[],
  ): Promise<number> {
    const ph = inactiveTargets.map(() => '?').join(',');
    const result = await this.exec(
      `DELETE FROM snapshots WHERE id IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (
            PARTITION BY ${partitionBy} ORDER BY updated_at DESC, id DESC
          ) AS rn
          FROM snapshots
          WHERE account_id = ? AND status_code = 'ok' AND target_id IN (${ph})
            AND ${timeFilter}
        ) WHERE rn > 1
      )`,
      [accountId, ...inactiveTargets, ...timeParams],
    );
    return result.changes;
  }

  async archiveInactiveSnapshots(now: Date = new Date()): Promise<{ hourly: number; daily: number }> {
    const accounts = await this.listEnabledAccounts();
    let hourly = 0;
    let daily = 0;
    const hourlyEnd = this.toDbTime(new Date(now.getTime() - 60 * 60 * 1000));
    const hourlyStart = this.toDbTime(new Date(now.getTime() - 24 * 60 * 60 * 1000));

    for (const account of accounts) {
      const states = await this.getScheduleStates(account.id);
      const inactiveTargets = Array.from(states.entries())
        .filter(([, state]) => deriveStatus(state.recentRatios, account.threshold) === 'normal')
        .map(([targetId]) => targetId);
      if (inactiveTargets.length === 0) continue;

      hourly += await this.deleteArchived(
        account.id,
        inactiveTargets,
        "target_id, strftime('%Y-%m-%d %H', updated_at)",
        'updated_at >= ? AND updated_at < ?',
        [hourlyStart, hourlyEnd],
      );
      daily += await this.deleteArchived(
        account.id,
        inactiveTargets,
        'target_id, date(updated_at)',
        'updated_at < ?',
        [hourlyStart],
      );
    }
    return { hourly, daily };
  }

  async acquireLease(holder: string, durationSeconds: number): Promise<boolean> {
    const row = await this.queryFirst<{ holder: string }>(
      `INSERT INTO collector_leases (name, holder, expires_at)
       VALUES ('global', ?, datetime('now', '+' || ? || ' seconds'))
       ON CONFLICT(name) DO UPDATE SET
         holder = excluded.holder,
         expires_at = excluded.expires_at,
         updated_at = datetime('now')
       WHERE collector_leases.expires_at <= datetime('now') OR collector_leases.holder = excluded.holder
       RETURNING holder`,
      [holder, durationSeconds],
    );
    return row?.holder === holder;
  }

  async releaseLease(holder: string): Promise<void> {
    await this.exec("DELETE FROM collector_leases WHERE name = 'global' AND holder = ?", [holder]);
  }

  async saveCollectorHeartbeat(hb: import('./ports.js').CollectorHeartbeat): Promise<void> {
    await this.exec(
      `INSERT INTO collector_leases
        (name, holder, expires_at, cookie_md5, cookie_mid, cookie_uname, is_login, nav_code, valid, error, egress_ip, egress_geo, cookie_checked_at, egress_checked_at, updated_at)
       VALUES ('heartbeat', 'heartbeat', datetime('now', '+1 year'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(name) DO UPDATE SET
         cookie_md5=excluded.cookie_md5,
         cookie_mid=excluded.cookie_mid,
         cookie_uname=excluded.cookie_uname,
         is_login=excluded.is_login,
         nav_code=excluded.nav_code,
         valid=excluded.valid,
         error=excluded.error,
         egress_ip=excluded.egress_ip,
         egress_geo=excluded.egress_geo,
         cookie_checked_at=excluded.cookie_checked_at,
         egress_checked_at=excluded.egress_checked_at,
         updated_at=datetime('now')`,
      [
        hb.cookieMd5,
        hb.cookieMid,
        hb.cookieUname,
        hb.isLogin,
        hb.navCode,
        hb.valid,
        hb.error,
        hb.egressIp,
        hb.egressGeo,
        hb.cookieCheckedAt,
        hb.egressCheckedAt,
      ],
    );
  }

  async loadCollectorHeartbeat(): Promise<import('./ports.js').CollectorHeartbeat | null> {
    const row = await this.queryFirst<{
      cookie_md5: string | null;
      cookie_mid: number | null;
      cookie_uname: string | null;
      is_login: number | null;
      nav_code: number | null;
      valid: number | null;
      error: string | null;
      egress_ip: string | null;
      egress_geo: string | null;
      cookie_checked_at: string | null;
      egress_checked_at: string | null;
    }>(
      `SELECT cookie_md5, cookie_mid, cookie_uname, is_login, nav_code, valid, error, egress_ip, egress_geo, cookie_checked_at, egress_checked_at
       FROM collector_leases WHERE name = 'heartbeat' LIMIT 1`,
      [],
    );
    if (!row) return null;
    return {
      cookieMd5: row.cookie_md5,
      cookieMid: row.cookie_mid,
      cookieUname: row.cookie_uname,
      isLogin: row.is_login,
      navCode: row.nav_code,
      valid: row.valid,
      error: row.error,
      egressIp: row.egress_ip,
      egressGeo: row.egress_geo,
      cookieCheckedAt: row.cookie_checked_at,
      egressCheckedAt: row.egress_checked_at,
    };
  }
}
