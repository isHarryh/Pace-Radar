import {
  deriveStatus,
  intervalMinutesFor,
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
      const state = await store.getScheduleState(account.id);
      if (!shouldCollect(state, account.threshold, config, now)) continue;
      try {
        const stat = await bili.collectAccount(account, config.bilibiliCookie, wbiKeys);
        await store.insertSnapshot({
          accountId: account.id,
          endpoint: stat.endpoint,
          statusCode: 'ok',
          targetType: stat.targetType,
          targetId: stat.targetId,
          commentCount: stat.commentCount,
          likeCount: stat.likeCount,
          shareCount: stat.shareCount,
        });
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
    return true;
  } finally {
    await store.releaseLease(options.holder);
  }
}
