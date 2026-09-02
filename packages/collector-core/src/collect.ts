import {
  deriveStatus,
  intervalMinutesFor,
  md5Hex,
  type PaceConfig,
  type NavResponse,
  type WbiKeys,
} from '@pace-radar/shared';
import { createBiliClient, FALLBACK_WBI_KEYS, keysFromNav } from './bilibili.js';
import { RequestError } from './errors.js';
import type { BiliTransport, CollectorStore, ScheduleState } from './ports.js';

const WBI_REFRESH_MS = 12 * 60 * 60 * 1000;
const GLOBAL_ACCOUNT = 0;

export interface CollectOptions {
  holder: string;
  now?: Date;
  leaseSeconds?: number;
  transport: BiliTransport;
  log?: (message: string) => void;
}

function fail(endpoint: string, error: unknown): RequestError {
  if (error instanceof RequestError) return new RequestError(error.statusCode, endpoint, error.message);
  return new RequestError('network', endpoint, String(error));
}

function shouldCollect(state: ScheduleState, threshold: number, config: PaceConfig, now: Date): boolean {
  const status = deriveStatus(state.recentRatios, threshold);
  const intervalMs = intervalMinutesFor(status, config) * 60_000;
  return !state.lastCollectedAt || now.getTime() - state.lastCollectedAt.getTime() >= intervalMs;
}

function shouldArchive(now: Date): boolean {
  return now.getMinutes() === 0;
}

async function fetchEgressGeo(transport: BiliTransport): Promise<{ ip: string | null; geo: string | null }> {
  // Primary: Cloudflare trace is most reliable inside Workers and reflects egress colo
  try {
    const res = await transport.fetch('https://1.1.1.1/cdn-cgi/trace', { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const text = await res.text();
      const m: Record<string, string> = {};
      for (const line of text.trim().split('\n')) {
        const idx = line.indexOf('=');
        if (idx > 0) m[line.slice(0, idx)] = line.slice(idx + 1);
      }
      if (m.ip) {
        const geo = JSON.stringify({ colo: m.colo ?? null, loc: m.loc ?? null, country: m.loc ?? null });
        return { ip: m.ip, geo };
      }
    }
  } catch {}
  // Fallback: public geo IP
  try {
    const res = await transport.fetch('https://ip-api.com/json/?fields=status,message,country,regionName,city,query', {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        status?: string;
        country?: string;
        regionName?: string;
        city?: string;
        query?: string;
      };
      if (data.status === 'success' && data.query) {
        const geo = JSON.stringify({ country: data.country ?? null, regionName: data.regionName ?? null, city: data.city ?? null });
        return { ip: data.query, geo };
      }
    }
  } catch {}
  try {
    const res = await transport.fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = (await res.json()) as { ip?: string };
      if (data.ip) return { ip: data.ip, geo: null };
    }
  } catch {}
  return { ip: null, geo: null };
}

export async function collect(store: CollectorStore, options: CollectOptions): Promise<boolean> {
  const log = options.log ?? console.log;
  const acquired = await store.acquireLease(options.holder, options.leaseSeconds ?? 120);
  if (!acquired) {
    log('[collector] another instance is already running');
    return false;
  }

  try {
    const config = await store.loadConfig();
    const now = options.now ?? new Date();
    const bili = createBiliClient(options.transport);
    let nav: NavResponse | null = null;
    let navError: RequestError | null = null;

    try {
      nav = await bili.nav(config.bilibiliCookie);
    } catch (error) {
      navError = fail('nav', error);
      await store.insertSnapshot({
        accountId: GLOBAL_ACCOUNT,
        endpoint: navError.endpoint,
        statusCode: navError.statusCode,
        targetType: 'error',
        targetId: '',
        commentCount: 0,
        likeCount: 0,
        shareCount: 0,
      });
    }

    // Async heartbeat: egress IP geo via public service (through same transport/proxy) + cookie state
    let egress: { ip: string | null; geo: string | null } = { ip: null, geo: null };
    try {
      egress = await fetchEgressGeo(options.transport);
    } catch {
      // ignore egress fetch failure
    }
    try {
      const cookie = config.bilibiliCookie ?? '';
      const cookieMd5 = cookie ? md5Hex(cookie) : null;
      const checkedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
      let isLogin: number | null = null;
      let cookieMid: number | null = null;
      let cookieUname: string | null = null;
      let navCode: number | null = nav?.code ?? null;
      let valid: number | null = null;
      let error: string | null = null;
      if (!cookie) {
        valid = null;
        error = null;
      } else if (navError) {
        const status = navError.statusCode;
        if (status === '412') {
          valid = null;
          error = '风控拦截 412';
        } else {
          valid = null;
          error = navError.message.slice(0, 200);
        }
        // try to parse numeric code for nav_code
        const n = Number(status);
        if (!Number.isNaN(n)) navCode = n;
      } else if (nav) {
        navCode = nav.code;
        if (nav.code === 0) {
          valid = 1;
          isLogin = nav.data?.isLogin ? 1 : 0;
          cookieMid = nav.data?.mid ?? null;
          cookieUname = (nav.data?.uname ?? (nav.data as { name?: string })?.name) ?? null;
          error = null;
        } else if (nav.code === -101) {
          valid = 0;
          isLogin = 0;
          error = '未登录 (-101)';
        } else {
          valid = 0;
          isLogin = 0;
          error = `B站返回 ${nav.code}: ${nav.message ?? '未知错误'}`.slice(0, 200);
        }
      }
      await store.saveCollectorHeartbeat({
        cookieMd5,
        cookieMid,
        cookieUname,
        isLogin,
        navCode,
        valid,
        error,
        egressIp: egress.ip,
        egressGeo: egress.geo,
        cookieCheckedAt: checkedAt,
        egressCheckedAt: checkedAt,
      });
    } catch (e) {
      log(`[collector] save heartbeat failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (nav?.code === -101) {
      await store.insertSnapshot({
        accountId: GLOBAL_ACCOUNT,
        endpoint: 'nav',
        statusCode: '-101',
        targetType: 'error',
        targetId: '',
        commentCount: 0,
        likeCount: 0,
        shareCount: 0,
      });
      log('[collector] cookie expired (nav -101), skip this round');
      return true;
    }

    let wbiKeys: WbiKeys | null = config.wbiKeys;
    const needsRefresh = !wbiKeys || Date.now() - Date.parse(wbiKeys.fetchedAt) > WBI_REFRESH_MS;
    if (needsRefresh) {
      if (nav?.data?.wbi_img) {
        wbiKeys = keysFromNav(nav);
        await store.saveWbiKeys(wbiKeys);
      } else if (wbiKeys) {
        log(`[collector] nav unavailable (${navError?.statusCode ?? 'no wbi_img'}), reuse cached wbiKeys`);
      } else {
        wbiKeys = FALLBACK_WBI_KEYS;
        log('[collector] nav unavailable and no cached keys, use fallback wbiKeys');
      }
    }
    if (!wbiKeys) {
      log('[collector] no wbiKeys available, skip this round');
      return true;
    }

    const accounts = await store.listEnabledAccounts();
    for (const account of accounts) {
      const states = await store.getScheduleStates(account.id);
      // 若该账号下没有任何已知的 target，则所有新动态均需采集；否则按 target 粒度判定是否需要拉取
      let needCollect = states.size === 0;
      if (!needCollect) {
        for (const state of states.values()) {
          if (shouldCollect(state, account.threshold, config, now)) {
            needCollect = true;
            break;
          }
        }
        // 若没有任何 target 满足时间间隔，但存在全新 target（未在 states 中），仍需采集
        // 通过直接拉取全页来发现新 target，下面会在 stats 中体现
        if (!needCollect) {
          // 仍尝试拉取以发现新动态：若距上次任意 target 的采集已超过正常间隔则拉取
          // 简化：若所有已知 target 都处于冷却中则跳过本账号
          continue;
        }
      }
      try {
        const stats = await bili.collectAccount(account, config.bilibiliCookie, wbiKeys);
        const inserts = stats
          .filter((s) => {
            const st = states.get(s.targetId);
            if (!st) return true;
            return shouldCollect(st, account.threshold, config, now);
          })
          .map((s) => ({
            accountId: account.id,
            endpoint: s.endpoint,
            statusCode: 'ok' as const,
            targetType: s.targetType,
            targetId: s.targetId,
            commentCount: s.commentCount,
            likeCount: s.likeCount,
            shareCount: s.shareCount,
            summary: s.summary,
          }));
        if (inserts.length > 0) await store.insertSnapshots(inserts);
      } catch (error) {
        const requestError = fail('feed/space', error);
        await store.insertSnapshot({
          accountId: account.id,
          endpoint: requestError.endpoint,
          statusCode: requestError.statusCode,
          targetType: 'error',
          targetId: '',
          commentCount: 0,
          likeCount: 0,
          shareCount: 0,
        });
      }
    }

    if (shouldArchive(now)) {
      try {
        const result = await store.archiveInactiveSnapshots(now);
        log(`[collector] archive hourly=${result.hourly} daily=${result.daily}`);
      } catch (e) {
        log(`[collector] archive failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return true;
  } finally {
    await store.releaseLease(options.holder);
  }
}
