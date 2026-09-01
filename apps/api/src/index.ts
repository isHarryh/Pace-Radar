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
  type SnapshotRow,
} from './db';
import { cachedJson, noStoreHeaders, PUBLIC_CACHE_TTL_S } from './cache';

export interface Env {
  DB: D1Database;
}

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors({ origin: '*' }));

// Ensure admin routes are never cached (no-store) and public routes can be cached.
// This middleware runs after admin route handling to set no-store headers.
app.use('/api/admin/*', async (c, next) => {
  await next();
  // Force no-store for all admin responses
  c.header('Cache-Control', 'no-store');
  c.header('CDN-Cache-Control', 'no-store');
});

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

async function buildAccountView(db: D1Database, account: { id: number; mid: number; name: string; threshold: number }): Promise<AccountView> {
  const targetId = await currentTargetId(db, account.id);
  const [ratios, rows] = await Promise.all([
    recentRatios(db, account.id, targetId),
    latestSnapshots(db, account.id, 2, targetId),
  ]);
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

app.get('/api/health', async (c) => {
  const cacheKey = `GET:${c.req.url}`;
  return cachedJson(c, cacheKey, async () => ({ ok: true }), PUBLIC_CACHE_TTL_S);
});

app.get('/api/accounts/:mid/avatar', async (c) => {
  const mid = Number(c.req.param('mid'));
  const row = await c.env.DB.prepare('SELECT avatar FROM accounts WHERE mid = ?').bind(mid).first<{ avatar: string | null }>();
  if (!row?.avatar) return c.json({ error: { code: 'not_found', message: 'no avatar' } }, 404, noStoreHeaders());
  const bytes = Uint8Array.from(atob(row.avatar), (ch) => ch.charCodeAt(0));
  return new Response(bytes, {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' },
  });
});

app.get('/api/accounts', async (c) => {
  const cacheKey = `GET:${c.req.url}`;
  return cachedJson(
    c,
    cacheKey,
    async () => {
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
        const view: AccountView = {
          id: account.id,
          mid: account.mid,
          name: account.name,
          threshold: account.threshold,
          status: deriveStatus(ratios, account.threshold),
          latest: toLatestView(rows),
          perMinute: toPerMinute(rows),
        };
        return { ...view, spark };
      });
    },
    PUBLIC_CACHE_TTL_S,
  );
});

app.get('/api/accounts/:mid', async (c) => {
  const mid = Number(c.req.param('mid'));
  if (!Number.isInteger(mid) || mid <= 0) {
    return c.json({ error: { code: 'bad_request', message: 'invalid mid' } }, 400, noStoreHeaders());
  }
  const cacheKey = `GET:${c.req.url}`;
  try {
    return await cachedJson(
      c,
      cacheKey,
      async () => {
        const account = await getAccountByMid(c.env.DB, mid);
        if (!account) {
          const e = new Error('not_found') as Error & { status?: number };
          e.status = 404;
          throw e;
        }
        // Public API only exposes enabled accounts.
        if (!account.enabled) {
          const e = new Error('not_found') as Error & { status?: number };
          e.status = 404;
          throw e;
        }
        return buildAccountView(c.env.DB, account);
      },
      PUBLIC_CACHE_TTL_S,
    );
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err?.status === 404) {
      return c.json({ error: { code: 'not_found', message: 'account not found' } }, 404, noStoreHeaders());
    }
    throw e;
  }
});

app.get('/api/accounts/:mid/latest', async (c) => {
  const mid = Number(c.req.param('mid'));
  if (!Number.isInteger(mid) || mid <= 0) {
    return c.json({ error: { code: 'bad_request', message: 'invalid mid' } }, 400, noStoreHeaders());
  }
  const cacheKey = `GET:${c.req.url}`;
  try {
    return await cachedJson(
      c,
      cacheKey,
      async () => {
        const account = await getAccountByMid(c.env.DB, mid);
        if (!account || !account.enabled) {
          const e = new Error('not_found') as Error & { status?: number };
          e.status = 404;
          throw e;
        }
        const rows = await latestSnapshots(c.env.DB, account.id, 1);
        const latest = rows.at(-1);
        if (!latest) {
          const e = new Error('no_snapshot') as Error & { status?: number; code?: string };
          e.status = 404;
          (e as unknown as { code: string }).code = 'no_snapshot';
          throw e;
        }
        return toLatestView(rows);
      },
      PUBLIC_CACHE_TTL_S,
    );
  } catch (e: unknown) {
    const err = e as { status?: number; code?: string };
    if (err?.status === 404) {
      if (err?.code === 'no_snapshot') {
        return c.json({ error: { code: 'not_found', message: 'no snapshots yet' } }, 404, noStoreHeaders());
      }
      return c.json({ error: { code: 'not_found', message: 'account not found' } }, 404, noStoreHeaders());
    }
    throw e;
  }
});

app.get('/api/accounts/:mid/series', async (c) => {
  const mid = Number(c.req.param('mid'));
  if (!Number.isInteger(mid) || mid <= 0) {
    return c.json({ error: { code: 'bad_request', message: 'invalid mid' } }, 400, noStoreHeaders());
  }
  const range = c.req.query('range') ?? '24h';
  const resolution = c.req.query('resolution') ?? '5m';
  const offset = RANGES[range];
  const bucket = RESOLUTIONS[resolution];
  if (!offset || !bucket) return c.json({ error: { code: 'bad_request', message: 'unsupported range or resolution' } }, 400, noStoreHeaders());

  const cacheKey = `GET:${c.req.url}`;
  try {
    return await cachedJson(
      c,
      cacheKey,
      async () => {
        const account = await getAccountByMid(c.env.DB, mid);
        if (!account || !account.enabled) {
          const e = new Error('not_found') as Error & { status?: number };
          e.status = 404;
          throw e;
        }
        const points = await series(c.env.DB, account.id, bucket, offset);
        const growthPoints = toGrowthPoints(points);
        return {
          range,
          resolution,
          points: points.map((p, i) => ({
            t: p.updated_at,
            commentCount: p.comment_count,
            ratio: p.ratio_c_l,
            growth: growthPoints[i]!.growth,
          })),
        };
      },
      PUBLIC_CACHE_TTL_S,
    );
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err?.status === 404) {
      return c.json({ error: { code: 'not_found', message: 'account not found' } }, 404, noStoreHeaders());
    }
    throw e;
  }
});

app.route('/api/admin', admin);

export default app;
