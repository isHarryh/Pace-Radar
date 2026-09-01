import { readFile } from 'node:fs/promises';
import { BaseCollectorStore } from '@pace-radar/collector-core';

interface QueryResponse<T> {
  success: boolean;
  result?: Array<{ success: boolean; results?: T[]; errors?: unknown[] }>;
  errors?: unknown[];
}

export class D1HttpStore extends BaseCollectorStore {
  private readonly endpoint: string;

  constructor(
    accountId: string,
    databaseId: string,
    private readonly apiToken: string,
    private readonly cookieFile?: string,
  ) {
    super();
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

  override async queryAll<T>(sql: string, params: unknown[]): Promise<T[]> {
    return this.query<T>(sql, params);
  }

  override async queryFirst<T>(sql: string, params: unknown[]): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] ?? null;
  }

  override async exec(sql: string, params: unknown[]): Promise<{ changes: number }> {
    const rows = await this.query<Record<string, unknown>>(sql, params);
    return { changes: rows.length };
  }

  override async batchExec(statements: Array<{ sql: string; params: unknown[] }>): Promise<void> {
    for (const s of statements) await this.query(s.sql, s.params);
  }

  override async loadConfig() {
    const config = await super.loadConfig();
    if (this.cookieFile) config.bilibiliCookie = (await readFile(this.cookieFile, 'utf8')).trim();
    return config;
  }
}
