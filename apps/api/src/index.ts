import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { deriveStatus, parseDbTime, type PaceStatus } from '@pace-radar/shared';
import { admin } from './admin';
import {
  currentTargetId,
  getAccountByMid,
  latestSnapshots,
  latestSnapshotsBatch,
  listPublicAccounts,
  recentRatios,
  recentRatiosBatch,
  series,
  seriesBatch,
  type PublicAccountRow,
  type SnapshotRow,
} from './db';
import { cachedJson, noStoreHeaders } from './cache';

export interface Env {
  DB: D1Database;
}

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors({ origin: '*' }));

const RANGES: Record<string, string> = { '1h': '-1 hours', '24h': '-24 hours', '7d': '-7 days' };
const RESOLUTIONS: Record<string, number> = { '1m': 60, '5m': 300, '1h': 3600 };
const SPARK_BUCKET_SECONDS = 3600;

interface AccountView {
  id: number;
  mid: number;
  name: string;
  threshold: number;
  status: PaceStatus;
  latest: {
    commentCount: number;
    likeCount: number;
    shareCount: number;
    ratio: number;
    updatedAt: string;
  } | null;
  perMinute: { comments: number; windowMin: number } | null;
}

class NotFoundError extends Error {
  constructor(message = 'not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

class NoSnapshotError extends Error {
  constructor() {
    super('no snapshots yet');
    this.name = 'NoSnapshotError';
  }
}

function badRequest(c: { json: (b: unknown, s: number, h?: Record<string, string>) => Response }, message: string) {
  return c.json({ error: { code: 'bad_request', message } }, 400, noStoreHeaders());
}

function notFound(c: { json: (b: unknown, s: number, h?: Record<string, string>) => Response }, message: string) {
  return c.json({ error: { code: 'not_found', message } }, 404, noStoreHeaders());
}

function toLatestView(rows: SnapshotRow[]): AccountView['latest'] {
  const latest = rows.at(-1);
  if (!latest) return null;
  return {
    commentCount: latest.comment_count,
    likeCount: latest.like_count,
    shareCount: latest.share_count,
    ratio: latest.ratio_c_l,
    updatedAt: latest.updated_at,
  };
}

function toPerMinute(rows: SnapshotRow[]): AccountView['perMinute'] {
  if (rows.length < 2) return null;
  const latest = rows.at(-1)!;
  const prev = rows.at(-2)!;
  const minutes = (parseDbTime(latest.updated_at).getTime() - parseDbTime(prev.updated_at).getTime()) / 60_000;
  if (minutes <= 0) return null;
  return { comments: (latest.comment_count - prev.comment_count) / minutes, windowMin: minutes };
}

function toGrowthPoints(points: { updated_at: string; comment_count: number }[]): { t: string; growth: number }[] {
  return points.map((p, i) => {
    if (i === 0) return { t: p.updated_at, growth: 0 };
    const prev = points[i - 1]!;
    const minutes = (parseDbTime(p.updated_at).getTime() - parseDbTime(prev.updated_at).getTime()) / 60_000;
    const growth = minutes > 0 ? (p.comment_count - prev.comment_count) / minutes : 0;
    return { t: p.updated_at, growth };
  });
}

function toAccountView(account: PublicAccountRow, ratios: number[], rows: SnapshotRow[]): AccountView {
  return {
    id: account.id,
    mid: account.mid,
    name: account.name,
    threshold: account.threshold,
    status: deriveStatus(ratios, account.threshold),
    latest: toLatestView(rows),
    perMinute: toPerMinute(rows),
  };
}

async function buildAccountView(db: D1Database, account: PublicAccountRow): Promise<AccountView> {
  const targetId = await currentTargetId(db, account.id);
  const [ratios, rows] = await Promise.all([
    recentRatios(db, account.id, targetId),
    latestSnapshots(db, account.id, 2, targetId),
  ]);
  return toAccountView(account, ratios, rows);
}

async function requirePublicAccount(db: D1Database, mid: number): Promise<PublicAccountRow> {
  const account = await getAccountByMid(db, mid);
  if (!account || !account.enabled) throw new NotFoundError('account not found');
  return account;
}

function parseMid(c: { req: { param: (n: string) => string } }): number | null {
  const mid = Number(c.req.param('mid'));
  if (!Number.isInteger(mid) || mid <= 0) return null;
  return mid;
}

function resolveSeriesParams(c: { req: { query: (n: string) => string | undefined } }) {
  const range = c.req.query('range') ?? '24h';
  const resolution = c.req.query('resolution') ?? '5m';
  const offset = RANGES[range];
  const bucket = RESOLUTIONS[resolution];
  if (!offset || !bucket) return null;
  return { range, resolution, offset, bucket };
}

app.get('/api/health', (c) => cachedJson(c, `GET:${c.req.url}`, async () => ({ ok: true })));

app.get('/api/accounts/:mid/avatar', async (c) => {
  const mid = parseMid(c);
  if (mid === null) return badRequest(c, 'invalid mid');
  const row = await c.env.DB.prepare('SELECT avatar FROM accounts WHERE mid = ?').bind(mid).first<{ avatar: string | null }>();
  if (!row?.avatar) return notFound(c, 'no avatar');
  const bytes = Uint8Array.from(atob(row.avatar), (ch) => ch.charCodeAt(0));
  return new Response(bytes, {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' },
  });
});

app.get('/api/accounts', (c) =>
  cachedJson(c, `GET:${c.req.url}`, async () => {
    const accounts = await listPublicAccounts(c.env.DB);
    if (accounts.length === 0) return [];
    const ids = accounts.map((a) => a.id);
    const [ratiosMap, snapshotsMap, sparkMap] = await Promise.all([
      recentRatiosBatch(c.env.DB, ids),
      latestSnapshotsBatch(c.env.DB, ids, 2),
      seriesBatch(c.env.DB, ids, SPARK_BUCKET_SECONDS, '-24 hours'),
    ]);
    return accounts.map((account) => {
      const ratios = ratiosMap.get(account.id) ?? [];
      const rows = snapshotsMap.get(account.id) ?? [];
      const points = sparkMap.get(account.id) ?? [];
      const growth = toGrowthPoints(points);
      const spark = growth.length > 1 ? growth.slice(1) : [];
      return { ...toAccountView(account, ratios, rows), spark };
    });
  }),
);

app.get('/api/accounts/:mid', async (c) => {
  const mid = parseMid(c);
  if (mid === null) return badRequest(c, 'invalid mid');
  try {
    return await cachedJson(c, `GET:${c.req.url}`, async () => {
      const account = await requirePublicAccount(c.env.DB, mid);
      return buildAccountView(c.env.DB, account);
    });
  } catch (e) {
    if (e instanceof NotFoundError) return notFound(c, 'account not found');
    throw e;
  }
});

app.get('/api/accounts/:mid/latest', async (c) => {
  const mid = parseMid(c);
  if (mid === null) return badRequest(c, 'invalid mid');
  try {
    return await cachedJson(c, `GET:${c.req.url}`, async () => {
      const account = await requirePublicAccount(c.env.DB, mid);
      const rows = await latestSnapshots(c.env.DB, account.id, 1);
      if (rows.length === 0) throw new NoSnapshotError();
      return toLatestView(rows);
    });
  } catch (e) {
    if (e instanceof NotFoundError) return notFound(c, 'account not found');
    if (e instanceof NoSnapshotError) return notFound(c, 'no snapshots yet');
    throw e;
  }
});

app.get('/api/accounts/:mid/series', async (c) => {
  const mid = parseMid(c);
  if (mid === null) return badRequest(c, 'invalid mid');
  const params = resolveSeriesParams(c);
  if (!params) return badRequest(c, 'unsupported range or resolution');
  try {
    return await cachedJson(c, `GET:${c.req.url}`, async () => {
      const account = await requirePublicAccount(c.env.DB, mid);
      const points = await series(c.env.DB, account.id, params.bucket, params.offset);
      const growthPoints = toGrowthPoints(points);
      return {
        range: params.range,
        resolution: params.resolution,
        points: points.map((p, i) => ({
          t: p.updated_at,
          commentCount: p.comment_count,
          ratio: p.ratio_c_l,
          growth: growthPoints[i]!.growth,
        })),
      };
    });
  } catch (e) {
    if (e instanceof NotFoundError) return notFound(c, 'account not found');
    throw e;
  }
});

app.route('/api/admin', admin);

export default app;
