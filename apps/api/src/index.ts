import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { deriveStatus, parseDbTime, type PaceStatus } from '@pace-radar/shared';
import { admin } from './admin';
import { currentTargetId, latestSnapshots, listAccounts, recentRatios, series, type SnapshotRow } from './db';

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

app.get('/api/health', (c) => c.json({ data: { ok: true } }));

app.get('/api/accounts/:mid/avatar', async (c) => {
  const mid = Number(c.req.param('mid'));
  const row = await c.env.DB.prepare('SELECT avatar FROM accounts WHERE mid = ?').bind(mid).first<{ avatar: string | null }>();
  if (!row?.avatar) return c.json({ error: { code: 'not_found', message: 'no avatar' } }, 404);
  const bytes = Uint8Array.from(atob(row.avatar), (ch) => ch.charCodeAt(0));
  return new Response(bytes, {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' },
  });
});

app.get('/api/accounts', async (c) => {
  const accounts = await listAccounts(c.env.DB);
  const spark = await Promise.all(
    accounts.map(async (account) => {
      const points = await series(c.env.DB, account.id, SPARK_BUCKET_SECONDS, '-24 hours');
      const growth = toGrowthPoints(points);
      // 去掉首点 0 值，避免 spark 被 0 拉平；若仅 1 点则返回空由前端显示“暂无数据”
      return growth.length > 1 ? growth.slice(1) : [];
    }),
  );
  const views = await Promise.all(accounts.map((account) => buildAccountView(c.env.DB, account)));
  return c.json({ data: views.map((view, i) => ({ ...view, spark: spark[i] })) });
});

app.get('/api/accounts/:mid', async (c) => {
  const mid = Number(c.req.param('mid'));
  const account = (await listAccounts(c.env.DB)).find((a) => a.mid === mid);
  if (!account) return c.json({ error: { code: 'not_found', message: 'account not found' } }, 404);
  return c.json({ data: await buildAccountView(c.env.DB, account) });
});

app.get('/api/accounts/:mid/latest', async (c) => {
  const mid = Number(c.req.param('mid'));
  const account = (await listAccounts(c.env.DB)).find((a) => a.mid === mid);
  if (!account) return c.json({ error: { code: 'not_found', message: 'account not found' } }, 404);
  const rows = await latestSnapshots(c.env.DB, account.id, 1);
  const latest = rows.at(-1);
  if (!latest) return c.json({ error: { code: 'not_found', message: 'no snapshots yet' } }, 404);
  return c.json({ data: toLatestView(rows) });
});

app.get('/api/accounts/:mid/series', async (c) => {
  const mid = Number(c.req.param('mid'));
  const account = (await listAccounts(c.env.DB)).find((a) => a.mid === mid);
  if (!account) return c.json({ error: { code: 'not_found', message: 'account not found' } }, 404);
  const range = c.req.query('range') ?? '24h';
  const resolution = c.req.query('resolution') ?? '5m';
  const offset = RANGES[range];
  const bucket = RESOLUTIONS[resolution];
  if (!offset || !bucket) return c.json({ error: { code: 'bad_request', message: 'unsupported range or resolution' } }, 400);
  const points = await series(c.env.DB, account.id, bucket, offset);
  const growthPoints = toGrowthPoints(points);
  return c.json({
    data: {
      range,
      resolution,
      points: points.map((p, i) => ({
        t: p.updated_at,
        commentCount: p.comment_count,
        ratio: p.ratio_c_l,
        growth: growthPoints[i]!.growth,
      })),
    },
  });
});

app.route('/api/admin', admin);

export default app;
