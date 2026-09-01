import { readFile } from 'node:fs/promises';
import { parseConfig, type CollectorStore, type ScheduleState, type SnapshotInsert } from '@pace-radar/collector-core';
import type { Account, PaceConfig, WbiKeys } from '@pace-radar/shared';

interface QueryResponse<T> {
  success: boolean;
  result?: Array<{ success: boolean; results?: T[]; errors?: unknown[] }>;
  errors?: unknown[];
}

export class D1HttpStore implements CollectorStore {
  private readonly endpoint: string;

  constructor(
    accountId: string,
    databaseId: string,
    private readonly apiToken: string,
    private readonly cookieFile?: string,
  ) {
    this.endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
  }

  private async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await response.json()) as QueryResponse<T>;
    const result = body.result?.[0];
    if (!response.ok || !body.success || !result?.success) {
      throw new Error(`D1 query failed (${response.status}): ${JSON.stringify(body.errors ?? result?.errors ?? [])}`);
    }
    return result.results ?? [];
  }

  async loadConfig(): Promise<PaceConfig> {
    const rows = await this.query<{ key: string; value: string }>('SELECT key, value FROM app_config');
    const config = parseConfig(rows);
    if (this.cookieFile) config.bilibiliCookie = (await readFile(this.cookieFile, 'utf8')).trim();
    return config;
  }

  async saveWbiKeys(keys: WbiKeys): Promise<void> {
    await this.query("INSERT OR REPLACE INTO app_config (key, value) VALUES ('wbi_keys', ?)", [JSON.stringify(keys)]);
  }

  async listEnabledAccounts(): Promise<Account[]> {
    return this.query<Account>('SELECT id, mid, name, threshold, enabled FROM accounts WHERE enabled = 1');
  }

  async getScheduleState(accountId: number): Promise<ScheduleState> {
    const rows = await this.query<{ target_id: string | null; ratios: string; last_collected_at: string | null }>(
      `WITH target AS (
         SELECT target_id FROM snapshots
         WHERE account_id = ? AND status_code = 'ok'
         ORDER BY updated_at DESC, id DESC LIMIT 1
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
      [accountId, accountId, accountId],
    );
    const row = rows[0];
    return {
      targetId: row?.target_id ?? null,
      recentRatios: row ? (JSON.parse(row.ratios) as number[]).reverse() : [],
      lastCollectedAt: row?.last_collected_at ? new Date(`${row.last_collected_at.replace(' ', 'T')}Z`) : null,
    };
  }

  async insertSnapshot(snapshot: SnapshotInsert): Promise<void> {
    await this.query(
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
  }

  async acquireLease(holder: string, durationSeconds: number): Promise<boolean> {
    const rows = await this.query<{ holder: string }>(
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
    return rows[0]?.holder === holder;
  }

  async releaseLease(holder: string): Promise<void> {
    await this.query("DELETE FROM collector_leases WHERE name = 'global' AND holder = ?", [holder]);
  }
}
