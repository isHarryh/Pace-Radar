import { BaseCollectorStore } from '@pace-radar/collector-core';

export class WorkerCollectorStore extends BaseCollectorStore {
  constructor(private readonly db: D1Database) {
    super();
  }

  override async queryAll<T>(sql: string, params: unknown[]): Promise<T[]> {
    const { results } = await this.db.prepare(sql).bind(...params).all<T>();
    return results;
  }

  override async queryFirst<T>(sql: string, params: unknown[]): Promise<T | null> {
    const row = await this.db.prepare(sql).bind(...params).first<T>();
    return row ?? null;
  }

  override async exec(sql: string, params: unknown[]): Promise<{ changes: number }> {
    const result = await this.db.prepare(sql).bind(...params).run();
    return { changes: result.meta.changes ?? 0 };
  }

  override async batchExec(statements: Array<{ sql: string; params: unknown[] }>): Promise<void> {
    if (statements.length === 0) return;
    const stmts = statements.map((s) => this.db.prepare(s.sql).bind(...s.params));
    await this.db.batch(stmts);
  }
}
