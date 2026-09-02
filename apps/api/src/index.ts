import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { deriveStatus, parseDbTime, type PaceStatus } from '@pace-radar/shared';
import { admin } from './admin';
import {
  fallbackLatestStats,
  getAccountByMid,
  getActiveTargetIds,
  getActiveTargetsBatch,
  getRecentRatiosByTargets,
  getSummaries,
  latestSnapshots,
  latestSnapshotsByTargets,
  listPublicAccounts,
  seriesByTargets,
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
  activeCount: number;
  maxComment: number | null;
  maxRatio: number | null;
  totalGrowth: { comments: number; windowMin: number } | null;
  latest: {
    commentCount: number;
    likeCount: number;
    shareCount: number;
    ratio: number;
    updatedAt: string;
  } | null;
  perMinute: { comments: number; windowMin: number } | null;
}

interface TargetView {
  targetId: string;
  url: string;
  summary: string | null;
  commentCount: number;
  likeCount: number;
  shareCount: number;
  ratio: number;
  updatedAt: string;
  perMinute: { comments: number; windowMin: number } | null;
  status: PaceStatus;
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

function targetUrl(targetId: string): string {
  return `https://t.bilibili.com/${targetId}`;
}

function toTargetView(
  targetId: string,
  ratios: number[],
  rows: SnapshotRow[],
  threshold: number,
  summary: string | null = null,
): TargetView {
  const latest = toLatestView(rows);
  return {
    targetId,
    url: targetUrl(targetId),
    summary,
    commentCount: latest?.commentCount ?? 0,
    likeCount: latest?.likeCount ?? 0,
    shareCount: latest?.shareCount ?? 0,
    ratio: latest?.ratio ?? 0,
    updatedAt: latest?.updatedAt ?? '',
    perMinute: toPerMinute(rows),
    status: deriveStatus(ratios, threshold),
  };
}

async function fetchActiveTargetViews(
  db: D1Database,
  account: PublicAccountRow,
  activeIds: string[],
): Promise<TargetView[]> {
  if (activeIds.length === 0) return [];
  const [snapshotsMap, ratiosMap, summaryMap] = await Promise.all([
    latestSnapshotsByTargets(db, account.id, activeIds, 2),
    getRecentRatiosByTargets(db, account.id, activeIds),
    getSummaries(db, account.id, activeIds),
  ]);
  return activeIds.map((tid) =>
    toTargetView(tid, ratiosMap.get(tid) ?? [], snapshotsMap.get(tid) ?? [], account.threshold, summaryMap.get(tid) ?? null),
  );
}

async function buildAggregatedAccountView(
  db: D1Database,
  account: PublicAccountRow,
  prefetchedActiveIds?: string[],
): Promise<AccountView> {
  const activeIds = prefetchedActiveIds ?? (await getActiveTargetIds(db, account.id, account.threshold));
  if (activeIds.length === 0) {
    const fallback = await fallbackLatestStats(db, account.id);
    const latestView = fallback.latest
      ? {
          commentCount: fallback.latest.comment_count,
          likeCount: fallback.latest.like_count,
          shareCount: fallback.latest.share_count,
          ratio: fallback.latest.ratio_c_l,
          updatedAt: fallback.latest.updated_at,
        }
      : null;
    return {
      id: account.id,
      mid: account.mid,
      name: account.name,
      threshold: account.threshold,
      status: 'normal',
      activeCount: 0,
      maxComment: fallback.maxComment,
      maxRatio: fallback.maxRatio,
      totalGrowth: null,
      latest: latestView,
      perMinute: null,
    };
  }
  const targetViews = await fetchActiveTargetViews(db, account, activeIds);
  // Aggregate
  let maxComment: number | null = null;
  let maxRatio: number | null = null;
  let totalGrowthValue = 0;
  let hasGrowth = false;
  let overallStatus: PaceStatus = 'normal';
  let latestForView: AccountView['latest'] = null;
  let maxCommentTarget: TargetView | null = null;
  for (const tv of targetViews) {
    if (maxComment === null || tv.commentCount > maxComment) {
      maxComment = tv.commentCount;
      maxCommentTarget = tv;
    }
    if (maxRatio === null || tv.ratio > maxRatio) maxRatio = tv.ratio;
    if (tv.perMinute) {
      totalGrowthValue += tv.perMinute.comments;
      hasGrowth = true;
    }
    if (tv.status === 'active') overallStatus = 'active';
    else if (tv.status === 'watching' && overallStatus !== 'active') overallStatus = 'watching';
  }
  if (maxCommentTarget) {
    latestForView = {
      commentCount: maxCommentTarget.commentCount,
      likeCount: maxCommentTarget.likeCount,
      shareCount: maxCommentTarget.shareCount,
      ratio: maxCommentTarget.ratio,
      updatedAt: maxCommentTarget.updatedAt,
    };
  }
  return {
    id: account.id,
    mid: account.mid,
    name: account.name,
    threshold: account.threshold,
    status: overallStatus,
    activeCount: activeIds.length,
    maxComment,
    maxRatio,
    totalGrowth: hasGrowth ? { comments: totalGrowthValue, windowMin: 1 } : null,
    latest: latestForView,
    perMinute: hasGrowth ? { comments: totalGrowthValue, windowMin: 1 } : null,
  };
}

async function buildOverviewSpark(db: D1Database, account: PublicAccountRow, activeIds: string[]): Promise<{ t: string; growth: number }[]> {
  if (activeIds.length === 0) return [];
  const seriesMap = await seriesByTargets(db, account.id, activeIds, SPARK_BUCKET_SECONDS, '-24 hours');
  // Aggregate hourly total growth: group by hour bucket string (YYYY-MM-DD HH)
  const bucketMap = new Map<string, { growthSum: number; t: string }>();
  for (const tid of activeIds) {
    const points = seriesMap.get(tid) ?? [];
    const growths = toGrowthPoints(points);
    for (let i = 1; i < growths.length; i++) {
      const g = growths[i]!;
      const hourKey = g.t.slice(0, 13); // YYYY-MM-DD HH
      const existing = bucketMap.get(hourKey);
      if (existing) {
        existing.growthSum += g.growth;
        // keep earliest t for that hour? use latest
        if (g.t > existing.t) existing.t = g.t;
      } else {
        bucketMap.set(hourKey, { growthSum: g.growth, t: g.t });
      }
    }
  }
  const sorted = Array.from(bucketMap.values()).sort((a, b) => a.t.localeCompare(b.t));
  return sorted.map((v) => ({ t: v.t, growth: v.growthSum }));
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

async function handleAccountRoute(
  c: Parameters<typeof cachedJson>[0],
  handler: (account: PublicAccountRow) => Promise<unknown>,
): Promise<Response> {
  const mid = parseMid(c as { req: { param: (n: string) => string } });
  if (mid === null) return badRequest(c as { json: (b: unknown, s: number, h?: Record<string, string>) => Response }, 'invalid mid');
  try {
    return await cachedJson(c, `GET:${(c as { req: { url: string } }).req.url}`, async () => {
      const account = await requirePublicAccount((c as { env: Env }).env.DB, mid);
      return handler(account);
    });
  } catch (e) {
    if (e instanceof NotFoundError) return notFound(c as { json: (b: unknown, s: number, h?: Record<string, string>) => Response }, 'account not found');
    throw e;
  }
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
    const activeMap = await getActiveTargetsBatch(c.env.DB, accounts);
    const views = await Promise.all(
      accounts.map(async (account) => {
        const activeIds = activeMap.get(account.id) ?? [];
        const view = await buildAggregatedAccountView(c.env.DB, account, activeIds);
        const spark = await buildOverviewSpark(c.env.DB, account, activeIds);
        return { ...view, spark };
      }),
    );
    return views;
  }),
);

async function getActiveTargetViews(db: D1Database, account: PublicAccountRow): Promise<TargetView[]> {
  const activeIds = await getActiveTargetIds(db, account.id, account.threshold);
  return fetchActiveTargetViews(db, account, activeIds);
}

app.get('/api/accounts/:mid', (c) => handleAccountRoute(c, (account) => buildAggregatedAccountView((c as unknown as { env: Env }).env.DB, account)));

app.get('/api/accounts/:mid/targets', (c) =>
  handleAccountRoute(c, (account) => getActiveTargetViews((c as unknown as { env: Env }).env.DB, account)),
);

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
  const params = resolveSeriesParams(c);
  if (!params) return badRequest(c, 'unsupported range or resolution');
  return handleAccountRoute(c, async (account) => {
    const activeIds = await getActiveTargetIds((c as unknown as { env: Env }).env.DB, account.id, account.threshold);
    if (activeIds.length === 0) {
      return {
        range: params.range,
        resolution: params.resolution,
        series: [] as { targetId: string; url: string; summary: string | null; points: { t: string; growth: number }[] }[],
      };
    }
    const db = (c as unknown as { env: Env }).env.DB;
    const [seriesMap, summaryMap] = await Promise.all([
      seriesByTargets(db, account.id, activeIds, params.bucket, params.offset),
      getSummaries(db, account.id, activeIds),
    ]);
    const series = activeIds.map((tid) => ({
      targetId: tid,
      url: targetUrl(tid),
      summary: summaryMap.get(tid) ?? null,
      points: toGrowthPoints(seriesMap.get(tid) ?? []),
    }));
    return { range: params.range, resolution: params.resolution, series };
  });
});

app.route('/api/admin', admin);

export default app;
