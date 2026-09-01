import { parseConfig, type CollectorStore, type ScheduleState, type SnapshotInsert } from '@pace-radar/collector-core';
import type { Account, WbiKeys } from '@pace-radar/shared';

export class WorkerCollectorStore implements CollectorStore {
  constructor(private readonly db: D1Database) {}

  async loadConfig() {
    const { results } = await this.db.prepare('SELECT key, value FROM app_config').all<{ key: string; value: string }>();
    return parseConfig(results);
  }

  async saveWbiKeys(keys: WbiKeys): Promise<void> {
    await this.db
      .prepare("INSERT OR REPLACE INTO app_config (key, value) VALUES ('wbi_keys', ?)")
      .bind(JSON.stringify(keys))
      .run();
  }

  async listEnabledAccounts(): Promise<Account[]> {
    const { results } = await this.db
      .prepare('SELECT id, mid, name, threshold, enabled FROM accounts WHERE enabled = 1')
      .all<Account>();
    return results;
  }

  async getScheduleState(accountId: number): Promise<ScheduleState> {
    const row = await this.db
      .prepare(
        `WITH target AS (
           SELECT target_id
           FROM snapshots
           WHERE account_id = ? AND status_code = 'ok'
           ORDER BY updated_at DESC, id DESC
           LIMIT 1
         )
         SELECT
           (SELECT target_id FROM target) AS target_id,
           COALESCE((SELECT json_group_array(ratio_c_l) FROM (
             SELECT ratio_c_l FROM snapshots
             WHERE account_id = ? AND status_code = 'ok'
               AND target_id = (SELECT target_id FROM target)
             ORDER BY updated_at DESC, id DESC LIMIT 10
           )), '[]') AS ratios,
           (SELECT MAX(updated_at) FROM snapshots
            WHERE account_id = ? AND status_code = 'ok'
              AND target_id = (SELECT target_id FROM target)) AS last_collected_at`,
      )
      .bind(accountId, accountId, accountId)
      .first<{ target_id: string | null; ratios: string; last_collected_at: string | null }>();
    return {
      targetId: row?.target_id ?? null,
      recentRatios: row ? (JSON.parse(row.ratios) as number[]).reverse() : [],
      lastCollectedAt: row?.last_collected_at ? new Date(`${row.last_collected_at.replace(' ', 'T')}Z`) : null,
    };
  }

  async insertSnapshot(snapshot: SnapshotInsert): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO snapshots
          (account_id, target_type, target_id, comment_count, like_count, share_count, ratio_c_l, status_code, endpoint)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(account_id, target_type, target_id, updated_at) DO NOTHING`,
      )
      .bind(
        snapshot.accountId,
        snapshot.targetType,
        snapshot.targetId,
        snapshot.commentCount,
        snapshot.likeCount,
        snapshot.shareCount,
        snapshot.likeCount === 0 ? 0 : snapshot.commentCount / snapshot.likeCount,
        snapshot.statusCode,
        snapshot.endpoint,
      )
      .run();
  }

  async acquireLease(holder: string, durationSeconds: number): Promise<boolean> {
    const row = await this.db
      .prepare(
        `INSERT INTO collector_leases (name, holder, expires_at)
         VALUES ('global', ?, datetime('now', '+' || ? || ' seconds'))
         ON CONFLICT(name) DO UPDATE SET
           holder = excluded.holder,
           expires_at = excluded.expires_at,
           updated_at = datetime('now')
         WHERE collector_leases.expires_at <= datetime('now') OR collector_leases.holder = excluded.holder
         RETURNING holder`,
      )
      .bind(holder, durationSeconds)
      .first<{ holder: string }>();
    return row?.holder === holder;
  }

  async releaseLease(holder: string): Promise<void> {
    await this.db.prepare("DELETE FROM collector_leases WHERE name = 'global' AND holder = ?").bind(holder).run();
  }
}
