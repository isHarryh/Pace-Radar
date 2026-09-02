import { describe, expect, it } from 'vitest';
import type { Account, PaceConfig, WbiKeys } from '@pace-radar/shared';
import { collect } from './collect.js';
import type { CollectorStore, ScheduleState, SnapshotInsert } from './ports.js';

const account: Account = { id: 1, mid: 123, name: 'test', threshold: 0.5, enabled: true };
const keys: WbiKeys = { imgKey: 'a'.repeat(32), subKey: 'b'.repeat(32), fetchedAt: new Date().toISOString() };
const config: PaceConfig = { collectIntervalMinutes: 5, activeIntervalMinutes: 1, bilibiliCookie: 'cookie', wbiKeys: keys };

class FakeStore implements CollectorStore {
  snapshots: SnapshotInsert[] = [];
  lease = false;
  heartbeat: import('./ports.js').CollectorHeartbeat | null = null;

  async loadConfig() { return config; }
  async saveWbiKeys() {}
  async listEnabledAccounts() { return [account]; }
  async getScheduleState(): Promise<ScheduleState> {
    return { targetId: null, recentRatios: [], lastCollectedAt: null };
  }
  async getScheduleStates(): Promise<Map<string, ScheduleState>> {
    return new Map();
  }
  async insertSnapshot(snapshot: SnapshotInsert) { this.snapshots.push(snapshot); }
  async insertSnapshots(snapshots: SnapshotInsert[]) { this.snapshots.push(...snapshots); }
  async archiveInactiveSnapshots() { return { hourly: 0, daily: 0 }; }
  async acquireLease() {
    if (this.lease) return false;
    this.lease = true;
    return true;
  }
  async releaseLease() { this.lease = false; }
  async saveCollectorHeartbeat(hb: import('./ports.js').CollectorHeartbeat) { this.heartbeat = hb; }
  async loadCollectorHeartbeat() { return this.heartbeat; }
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function traceResponse(): Response {
  return new Response('ip=1.1.1.1\ncolo=SIN\nloc=SG\n', { status: 200, headers: { 'Content-Type': 'text/plain' } });
}

function isEgress(input: string): boolean {
  return input.includes('1.1.1.1/cdn-cgi/trace') || input.includes('ip-api.com') || input.includes('api.ipify.org');
}

describe('collect', () => {
  it('collects all dynamics on the first page and writes snapshots per target', async () => {
    const store = new FakeStore();
    const calls: string[] = [];
    const result = await collect(store, {
      holder: 'test',
      transport: {
        fetch: async (input) => {
          calls.push(input);
          if (isEgress(input)) {
            if (input.includes('1.1.1.1/cdn-cgi/trace')) return traceResponse();
            if (input.includes('ip-api.com')) return response({ status: 'success', query: '1.1.1.1', country: 'SG', regionName: 'SG', city: 'SG' });
            return response({ ip: '1.1.1.1' });
          }
          if (input.includes('/finger/spi')) return response({ code: -1 });
          if (input.includes('/x/web-interface/nav')) {
            return response({ code: 0, data: { wbi_img: { img_url: 'https://i/a.png', sub_url: 'https://i/b.png' } } });
          }
          return response({
            code: 0,
            data: {
              items: [
                { id_str: 'low', modules: { module_stat: { comment: { count: 1 }, like: { count: 10 }, forward: { count: 0 } } } },
                { id_str: 'high', modules: { module_stat: { comment: { count: 8 }, like: { count: 4 }, forward: { count: 2 } } } },
              ],
            },
          });
        },
      },
    });

    expect(result).toBe(true);
    expect(calls.filter((u) => !isEgress(u))).toHaveLength(3);
    expect(calls.some((u) => isEgress(u))).toBe(true);
    expect(store.snapshots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountId: 1, statusCode: 'ok', targetId: 'low', commentCount: 1, likeCount: 10 }),
        expect.objectContaining({ accountId: 1, statusCode: 'ok', targetId: 'high', commentCount: 8, likeCount: 4 }),
      ]),
    );
    expect(store.snapshots).toHaveLength(2);
  });

  it('reuses cached keys after a nav 412 and records failures without retrying', async () => {
    const store = new FakeStore();
    const calls: string[] = [];
    await collect(store, {
      holder: 'test',
      transport: {
        fetch: async (input) => {
          calls.push(input);
          if (isEgress(input)) {
            if (input.includes('1.1.1.1/cdn-cgi/trace')) return traceResponse();
            if (input.includes('ip-api.com')) return response({ status: 'fail', message: 'fail' });
            return response({ ip: '1.1.1.1' });
          }
          if (input.includes('/finger/spi')) return response('<html>412</html>', 412);
          return response('<html>412</html>', 412);
        },
      },
    });

    expect(calls.filter((u) => !isEgress(u))).toHaveLength(3);
    expect(store.snapshots).toEqual([
      expect.objectContaining({ accountId: 0, statusCode: '412', endpoint: 'nav', targetId: '' }),
      expect.objectContaining({ accountId: 1, statusCode: '412', endpoint: 'feed/space', targetId: '' }),
    ]);
  });
});
