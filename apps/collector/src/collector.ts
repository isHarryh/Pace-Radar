import {
  BILI_API,
  BILI_HEADERS,
  DEFAULT_CONFIG,
  deriveStatus,
  intervalMinutesFor,
  parseDbTime,
  ratioOf,
  signWbiQuery,
  type Account,
  type FeedSpaceResponse,
  type NavResponse,
  type PaceConfig,
  type WbiKeys,
} from '@pace-radar/shared';

const WBI_REFRESH_MS = 12 * 60 * 60 * 1000;
const RATIO_WINDOW = 10;
const GLOBAL_ACCOUNT = 0;

class RequestError extends Error {
  constructor(
    public readonly statusCode: string,
    public readonly endpoint: string,
    message: string,
  ) {
    super(message);
  }
}

function keysFromNav(nav: NavResponse): WbiKeys {
  const img = nav.data?.wbi_img;
  if (!img) throw new Error('nav response lacks wbi_img');
  const keyOf = (url: string) => url.split('/').at(-1)!.split('.')[0]!;
  return { imgKey: keyOf(img.img_url), subKey: keyOf(img.sub_url), fetchedAt: new Date().toISOString() };
}

async function enrichCookie(cookie: string): Promise<string> {
  // 尝试通过 finger/spi 获取与当前出口 IP 绑定的 buvid3/4，失败则回退原 cookie（海外住宅 IP 场景下可降低 412 概率）
  // 在 Cloudflare Workers 数据中心 IP 下，spi 本身也会 412，此时直接回退
  try {
    const r = await fetch(`${BILI_API}/x/frontend/finger/spi`, {
      headers: { ...BILI_HEADERS, Cookie: cookie },
    });
    if (!r.ok) return cookie;
    const j = (await r.json()) as { code?: number; data?: { b_3?: string; b_4?: string } };
    if (j.code === 0 && j.data?.b_3) {
      const extra = `buvid3=${j.data.b_3}; buvid4=${j.data.b_4}`;
      // 避免重复追加
      if (cookie.includes('buvid3=')) return cookie;
      return `${cookie}; ${extra}`;
    }
  } catch {}
  return cookie;
}

async function biliFetch<T>(path: string, query: string, cookie: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BILI_API}${path}?${query}`, {
      headers: { ...BILI_HEADERS, Cookie: cookie },
    });
  } catch {
    throw new RequestError('network', 'unknown', `network error for ${path}`);
  }
  if (!res.ok) {
    const text = await res.text();
    if (text.includes('412') || text.includes('412.js') || text.includes('request was banned')) {
      throw new RequestError('412', path.slice(1) || 'unknown', `412 for ${path}`);
    }
    throw new RequestError(String(res.status), 'unknown', `HTTP ${res.status} for ${path}`);
  }
  const text = await res.text();
  try {
    const json = JSON.parse(text) as T & { code?: number };
    if ((json as { code?: number }).code === -412) {
      throw new RequestError('412', path.slice(1) || 'unknown', `412 json for ${path}`);
    }
    return json as T;
  } catch (e) {
    if (e instanceof RequestError) throw e;
    throw new RequestError('json', path.slice(1) || 'unknown', `invalid json for ${path}`);
  }
}

function fail(endpoint: string, err: unknown): RequestError {
  if (err instanceof RequestError) return new RequestError(err.statusCode, endpoint, err.message);
  return new RequestError('network', endpoint, String(err));
}

async function loadConfig(db: D1Database): Promise<PaceConfig> {
  const { results } = await db.prepare('SELECT key, value FROM app_config').all<{ key: string; value: string }>();
  const config: PaceConfig = { ...DEFAULT_CONFIG };
  for (const row of results) {
    switch (row.key) {
      case 'collect_interval_minutes':
        config.collectIntervalMinutes = Number(row.value);
        break;
      case 'active_interval_minutes':
        config.activeIntervalMinutes = Number(row.value);
        break;
      case 'bilibili_cookie':
        config.bilibiliCookie = row.value;
        break;
      case 'wbi_keys':
        config.wbiKeys = JSON.parse(row.value);
        break;
    }
  }
  return config;
}

async function saveWbiKeys(db: D1Database, keys: WbiKeys): Promise<void> {
  await db
    .prepare('INSERT OR REPLACE INTO app_config (key, value) VALUES (\'wbi_keys\', ?)')
    .bind(JSON.stringify(keys))
    .run();
}

async function listEnabledAccounts(db: D1Database): Promise<Account[]> {
  const { results } = await db
    .prepare('SELECT id, mid, name, threshold, enabled FROM accounts WHERE enabled = 1')
    .all<Account>();
  return results;
}

async function currentTargetId(db: D1Database, accountId: number): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT target_id AS t FROM snapshots WHERE account_id = ? AND status_code = 'ok' ORDER BY updated_at DESC, id DESC LIMIT 1`,
    )
    .bind(accountId)
    .first<{ t: string }>();
  return row?.t ?? null;
}

async function recentRatios(db: D1Database, accountId: number, targetId: string | null): Promise<number[]> {
  const where = targetId ? 'AND target_id = ?' : '';
  const params = targetId ? [accountId, targetId, RATIO_WINDOW] : [accountId, RATIO_WINDOW];
  const sql = `SELECT ratio_c_l FROM snapshots WHERE account_id = ? ${where} AND status_code = 'ok' ORDER BY updated_at DESC, id DESC LIMIT ?`;
  const { results } = await db.prepare(sql).bind(...params).all<{ ratio_c_l: number }>();
  return results.map((r) => r.ratio_c_l).reverse();
}

async function lastSnapshotAt(db: D1Database, accountId: number, targetId: string | null): Promise<Date | null> {
  const where = targetId ? 'AND target_id = ?' : '';
  const params = targetId ? [accountId, targetId] : [accountId];
  const sql = `SELECT MAX(updated_at) AS t FROM snapshots WHERE account_id = ? ${where} AND status_code = 'ok'`;
  const row = await db.prepare(sql).bind(...params).first<{ t: string | null }>();
  return row?.t ? parseDbTime(row.t) : null;
}

async function shouldCollectAccount(db: D1Database, account: Account, config: PaceConfig, now: Date): Promise<boolean> {
  const targetId = await currentTargetId(db, account.id);
  const ratios = await recentRatios(db, account.id, targetId);
  const status = deriveStatus(ratios, account.threshold);
  const intervalMs = intervalMinutesFor(status, config) * 60_000;
  const lastAt = await lastSnapshotAt(db, account.id, targetId);
  if (!lastAt) return true;
  return now.getTime() - lastAt.getTime() >= intervalMs;
}

interface FreshStat {
  endpoint: 'feed/space';
  targetType: 'dynamic';
  targetId: string;
  commentCount: number;
  likeCount: number;
  shareCount: number;
}

async function collectAccount(account: Account, cookie: string, wbiKeys: WbiKeys): Promise<FreshStat> {
  const query = signWbiQuery(
    { host_mid: String(account.mid), timezone_offset: '-480', platform: 'web', web_location: '333.1387' },
    wbiKeys,
  );
  let feed: FeedSpaceResponse;
  try {
    feed = await biliFetch<FeedSpaceResponse>('/x/polymer/web-dynamic/v1/feed/space', query, cookie);
  } catch (err) {
    throw fail('feed/space', err);
  }
  if (feed.code !== 0) throw new RequestError(String(feed.code), 'feed/space', `feed/space code ${feed.code}`);
  const items = feed.data?.items ?? [];
  if (items.length === 0) throw new RequestError('no_dynamic', 'feed/space', 'no recent dynamic');
  let best = items[0]!;
  let bestRatio = ratioOf(best.modules.module_stat.comment.count, best.modules.module_stat.like.count);
  for (const cur of items.slice(1)) {
    const s = cur.modules.module_stat;
    const r = ratioOf(s.comment.count, s.like.count);
    if (r > bestRatio) {
      best = cur;
      bestRatio = r;
    }
  }
  const stat = best.modules.module_stat;
  return {
    endpoint: 'feed/space',
    targetType: 'dynamic',
    targetId: best.id_str,
    commentCount: stat.comment.count,
    likeCount: stat.like.count,
    shareCount: stat.forward.count,
  };
}

async function insertSnapshot(
  db: D1Database,
  accountId: number,
  endpoint: string,
  statusCode: string,
  stat?: FreshStat,
): Promise<void> {
  const targetType = stat?.targetType ?? 'error';
  const targetId = stat?.targetId ?? '';
  const commentCount = stat?.commentCount ?? 0;
  const likeCount = stat?.likeCount ?? 0;
  const shareCount = stat?.shareCount ?? 0;
  const ratio = ratioOf(commentCount, likeCount);
  await db
    .prepare(
      `INSERT OR IGNORE INTO snapshots
        (account_id, target_type, target_id, comment_count, like_count, share_count, ratio_c_l, status_code, endpoint)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(accountId, targetType, targetId, commentCount, likeCount, shareCount, ratio, statusCode, endpoint)
    .run();
}

const FALLBACK_WBI_KEYS: WbiKeys = {
  imgKey: '7cd084941338484aae1ad9425b84077c',
  subKey: '4932caff0ff746eab6f01bf08b70ac45',
  fetchedAt: new Date(0).toISOString(),
};

export async function collect(db: D1Database): Promise<void> {
  const config = await loadConfig(db);
  const now = new Date();
  // 海外非数据中心场景下，spi 指纹可降低 412；在数据中心 412 时自动回退
  const enrichedCookie = await enrichCookie(config.bilibiliCookie);

  let nav: NavResponse | null = null;
  let navError: RequestError | null = null;
  try {
    nav = await biliFetch<NavResponse>('/x/web-interface/nav', '', enrichedCookie);
  } catch (err) {
    navError = fail('nav', err);
    await insertSnapshot(db, GLOBAL_ACCOUNT, navError.endpoint, navError.statusCode);
  }
  if (nav?.code === -101) {
    await insertSnapshot(db, GLOBAL_ACCOUNT, 'nav', '-101');
    console.log('[collector] cookie expired (nav -101), skip this round');
    return;
  }

  let wbiKeys = config.wbiKeys;
  const needsRefresh = !wbiKeys || Date.now() - Date.parse(wbiKeys.fetchedAt) > WBI_REFRESH_MS;
  if (needsRefresh) {
    if (nav?.data?.wbi_img) {
      wbiKeys = keysFromNav(nav);
      await saveWbiKeys(db, wbiKeys);
    } else if (wbiKeys) {
      // nav 412/network but have cached keys, continue with stale
      console.log(`[collector] nav unavailable (${navError?.statusCode ?? 'no wbi_img'}), reuse cached wbiKeys`);
    } else {
      wbiKeys = FALLBACK_WBI_KEYS;
      console.log('[collector] nav unavailable and no cached keys, use fallback wbiKeys');
    }
  }
  if (!wbiKeys) {
    console.log('[collector] no wbiKeys available, skip this round');
    return;
  }

  const accounts = await listEnabledAccounts(db);
  for (const account of accounts) {
    try {
      if (!(await shouldCollectAccount(db, account, config, now))) continue;
      const stat = await collectAccount(account, enrichedCookie, wbiKeys);
      await insertSnapshot(db, account.id, stat.endpoint, 'ok', stat);
    } catch (err) {
      const e = err instanceof RequestError ? err : fail('unknown', err);
      await insertSnapshot(db, account.id, e.endpoint, e.statusCode);
    }
  }
}