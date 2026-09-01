import { Hono, type Context } from 'hono';
import { BILI_API, BILI_UA, DEFAULT_CONFIG, type PaceConfig } from '@pace-radar/shared';
import { listAccounts, requestLogs } from './db';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const AVATAR_MAX_BYTES = 64 * 1024;
const LOG_LIMIT_MAX = 200;

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const da = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(a)));
  const db = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(b)));
  let diff = 0;
  for (let i = 0; i < da.length; i++) diff |= da[i]! ^ db[i]!;
  return diff === 0;
}

async function loadAdminToken(db: D1Database): Promise<string | null> {
  const row = await db.prepare("SELECT value FROM app_config WHERE key = 'admin_token'").first<{ value: string }>();
  return row?.value ?? null;
}

function unauthorized(c: Context, message: string) {
  return c.json({ error: { code: 'unauthorized', message } }, 401, { 'Cache-Control': 'no-store' });
}

function badRequest(c: Context, message: string) {
  return c.json({ error: { code: 'bad_request', message } }, 400);
}

function notFound(c: Context, message: string) {
  return c.json({ error: { code: 'not_found', message } }, 404);
}

async function loadConfig(db: D1Database): Promise<PaceConfig> {
  const { results } = await db.prepare('SELECT key, value FROM app_config').all<{ key: string; value: string }>();
  const config: PaceConfig = { ...DEFAULT_CONFIG };
  for (const { key, value } of results) {
    if (key === 'collect_interval_minutes') config.collectIntervalMinutes = Number(value);
    else if (key === 'active_interval_minutes') config.activeIntervalMinutes = Number(value);
    else if (key === 'bilibili_cookie') config.bilibiliCookie = value;
  }
  return config;
}

async function setConfigValue(db: D1Database, key: string, value: string): Promise<void> {
  await db.prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)').bind(key, value).run();
}

async function checkCookieValidity(cookie: string): Promise<boolean | null> {
  try {
    const res = await fetch(`${BILI_API}/x/web-interface/nav`, {
      headers: { 'User-Agent': BILI_UA, Cookie: cookie },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { code: number };
    return body.code === 0;
  } catch {
    return null;
  }
}

export const admin = new Hono<{ Bindings: { DB: D1Database } }>();

admin.use('*', async (c, next) => {
  const expected = await loadAdminToken(c.env.DB);
  const token = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!expected) return unauthorized(c, 'admin token not configured');
  if (!(await timingSafeEqual(token, expected))) return unauthorized(c, 'invalid token');
  await next();
  c.header('Cache-Control', 'no-store');
  c.header('CDN-Cache-Control', 'no-store');
});

admin.get('/accounts', async (c) => {
  const accounts = await listAccounts(c.env.DB);
  return c.json({
    data: accounts.map((a) => ({ id: a.id, mid: a.mid, name: a.name, threshold: a.threshold, enabled: a.enabled, hasAvatar: a.avatar !== null })),
  });
});

admin.post('/accounts', async (c) => {
  const body = await c.req.json<{ mid: number; name: string; threshold?: number; enabled?: boolean }>();
  if (!Number.isInteger(body.mid) || body.mid <= 0 || !body.name?.trim()) {
    return badRequest(c, 'mid and name are required');
  }
  try {
    const result = await c.env.DB.prepare(
      'INSERT INTO accounts (mid, name, threshold, enabled) VALUES (?, ?, ?, ?)',
    )
      .bind(body.mid, body.name.trim(), body.threshold ?? 0.5, body.enabled === false ? 0 : 1)
      .run();
    const id = Number(result.meta.last_row_id);
    return c.json({ data: { id } }, 201);
  } catch {
    return c.json({ error: { code: 'conflict', message: 'mid already exists' } }, 409);
  }
});

admin.put('/accounts/:mid', async (c) => {
  const mid = Number(c.req.param('mid'));
  const body = await c.req.json<{ name?: string; threshold?: number; enabled?: boolean }>();
  const sets: string[] = [];
  const values: (string | number)[] = [];
  if (body.name !== undefined) {
    if (!body.name.trim()) return badRequest(c, 'name cannot be empty');
    sets.push('name = ?');
    values.push(body.name.trim());
  }
  if (body.threshold !== undefined) {
    if (!Number.isFinite(body.threshold) || body.threshold <= 0) {
      return badRequest(c, 'threshold must be positive');
    }
    sets.push('threshold = ?');
    values.push(body.threshold);
  }
  if (body.enabled !== undefined) {
    sets.push('enabled = ?');
    values.push(body.enabled ? 1 : 0);
  }
  if (sets.length === 0) return badRequest(c, 'nothing to update');
  values.push(mid);
  const result = await c.env.DB.prepare(`UPDATE accounts SET ${sets.join(', ')} WHERE mid = ?`).bind(...values).run();
  if (result.meta.changes === 0) return notFound(c, 'account not found');
  return c.json({ data: { ok: true } });
});

admin.post('/accounts/:mid/avatar', async (c) => {
  const mid = Number(c.req.param('mid'));
  const body = await c.req.json<{ avatar: string | null }>();
  let avatar: string | null = null;
  if (body.avatar) {
    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(body.avatar), (ch) => ch.charCodeAt(0));
    } catch {
      return badRequest(c, 'invalid base64');
    }
    if (bytes.length > AVATAR_MAX_BYTES) return badRequest(c, 'avatar too large');
    if (bytes.length < PNG_SIGNATURE.length || !PNG_SIGNATURE.every((b, i) => bytes[i] === b)) {
      return badRequest(c, 'not a PNG image');
    }
    avatar = body.avatar;
  }
  const result = await c.env.DB.prepare('UPDATE accounts SET avatar = ? WHERE mid = ?').bind(avatar, mid).run();
  if (result.meta.changes === 0) return notFound(c, 'account not found');
  return c.json({ data: { ok: true } });
});

admin.get('/config', async (c) => {
  const config = await loadConfig(c.env.DB);
  return c.json({ data: { collectIntervalMinutes: config.collectIntervalMinutes, activeIntervalMinutes: config.activeIntervalMinutes } });
});

admin.put('/config', async (c) => {
  const body = await c.req.json<{ collectIntervalMinutes?: number; activeIntervalMinutes?: number }>();
  for (const [key, value] of [
    ['collect_interval_minutes', body.collectIntervalMinutes],
    ['active_interval_minutes', body.activeIntervalMinutes],
  ] as const) {
    if (value === undefined) continue;
    if (!Number.isInteger(value) || value < 1 || value > 1440) {
      return badRequest(c, `${key} must be an integer in 1-1440`);
    }
    await setConfigValue(c.env.DB, key, String(value));
  }
  return c.json({ data: { ok: true } });
});

admin.get('/cookie', async (c) => {
  const row = await c.env.DB.prepare("SELECT value, updated_at FROM app_config WHERE key = 'bilibili_cookie'").first<{
    value: string;
    updated_at: string;
  }>();
  const cookie = row?.value ?? '';
  return c.json({
    data: {
      length: cookie.length,
      masked: cookie ? `${cookie.slice(0, 40)}…` : '',
      updatedAt: row?.updated_at ?? null,
      valid: cookie ? await checkCookieValidity(cookie) : null,
    },
  });
});

admin.put('/cookie', async (c) => {
  const body = await c.req.json<{ value: string }>();
  if (!body.value?.trim() || body.value.length < 50) return badRequest(c, 'cookie looks too short');
  await setConfigValue(c.env.DB, 'bilibili_cookie', body.value.trim());
  return c.json({ data: { ok: true } });
});

admin.get('/logs', async (c) => {
  const limit = Math.min(Number(c.req.query('limit') ?? 50) || 50, LOG_LIMIT_MAX);
  const logs = await requestLogs(c.env.DB, limit);
  return c.json({
    data: logs.map((l) => ({
      id: l.id,
      accountId: l.account_id,
      accountName: l.account_name,
      targetType: l.target_type,
      targetId: l.target_id,
      commentCount: l.comment_count,
      likeCount: l.like_count,
      statusCode: l.status_code,
      endpoint: l.endpoint,
      updatedAt: l.updated_at,
    })),
  });
});
