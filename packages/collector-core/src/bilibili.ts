import {
  BILI_API,
  BILI_HEADERS,
  ratioOf,
  signWbiQuery,
  type Account,
  type FeedSpaceResponse,
  type NavResponse,
  type WbiKeys,
} from '@pace-radar/shared';
import { RequestError } from './errors.js';
import type { BiliClient, BiliTransport, FreshStat } from './ports.js';

const FALLBACK_WBI_KEYS: WbiKeys = {
  imgKey: '7cd084941338484aae1ad9425b84077c',
  subKey: '4932caff0ff746eab6f01bf08b70ac45',
  fetchedAt: new Date(0).toISOString(),
};

function keysFromNav(nav: NavResponse): WbiKeys {
  const img = nav.data?.wbi_img;
  if (!img) throw new Error('nav response lacks wbi_img');
  const keyOf = (url: string) => url.split('/').at(-1)!.split('.')[0]!;
  return { imgKey: keyOf(img.img_url), subKey: keyOf(img.sub_url), fetchedAt: new Date().toISOString() };
}

function isBlocked(text: string): boolean {
  return text.includes('412') || text.includes('412.js') || text.includes('request was banned');
}

function createBiliFetch(transport: BiliTransport) {
  return async function biliFetch<T>(path: string, query: string, cookie: string): Promise<T> {
    let response: Response;
    try {
      response = await transport.fetch(`${BILI_API}${path}${query ? `?${query}` : ''}`, {
        headers: { ...BILI_HEADERS, Cookie: cookie },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new RequestError('network', path.slice(1) || 'unknown', `network error for ${path}`);
    }
    const text = await response.text();
    if (!response.ok) {
      if (isBlocked(text)) throw new RequestError('412', path.slice(1) || 'unknown', `412 for ${path}`);
      throw new RequestError(String(response.status), path.slice(1) || 'unknown', `HTTP ${response.status} for ${path}`);
    }
    try {
      const json = JSON.parse(text) as T & { code?: number };
      if (json.code === -412) throw new RequestError('412', path.slice(1) || 'unknown', `412 json for ${path}`);
      return json as T;
    } catch (error) {
      if (error instanceof RequestError) throw error;
      throw new RequestError('json', path.slice(1) || 'unknown', `invalid json for ${path}`);
    }
  };
}

export function createBiliClient(transport: BiliTransport): BiliClient {
  const biliFetch = createBiliFetch(transport);
  let preparedCookie: string | null = null;
  let preparedCookieSource = '';

  async function getPreparedCookie(cookie: string): Promise<string> {
    if (preparedCookie !== null && preparedCookieSource === cookie) return preparedCookie;
    preparedCookieSource = cookie;
    preparedCookie = cookie;
    try {
      const response = await transport.fetch(`${BILI_API}/x/frontend/finger/spi`, {
        headers: { ...BILI_HEADERS, Cookie: cookie },
        signal: AbortSignal.timeout(10_000),
      });
      if (response.ok) {
        const json = (await response.json()) as { code?: number; data?: { b_3?: string; b_4?: string } };
        if (json.code === 0 && json.data?.b_3 && !cookie.includes('buvid3=')) {
          preparedCookie = `${cookie}; buvid3=${json.data.b_3}; buvid4=${json.data.b_4 ?? ''}`;
        }
      }
    } catch {
      // The fingerprint endpoint is an optional enhancement.
    }
    return preparedCookie;
  }

  async function enrichCookie(cookie: string): Promise<string> {
    return getPreparedCookie(cookie);
  }

  return {
    async nav(cookie) {
      return biliFetch<NavResponse>('/x/web-interface/nav', '', await enrichCookie(cookie));
    },
    async collectAccount(account: Account, cookie: string, wbiKeys: WbiKeys): Promise<FreshStat> {
      const query = signWbiQuery(
        { host_mid: String(account.mid), timezone_offset: '-480', platform: 'web', web_location: '333.1387' },
        wbiKeys,
      );
      const feed = await biliFetch<FeedSpaceResponse>('/x/polymer/web-dynamic/v1/feed/space', query, await enrichCookie(cookie));
      if (feed.code !== 0) throw new RequestError(String(feed.code), 'feed/space', `feed/space code ${feed.code}`);
      const items = feed.data?.items ?? [];
      if (items.length === 0) throw new RequestError('no_dynamic', 'feed/space', 'no recent dynamic');

      let best = items[0]!;
      let bestRatio = ratioOf(best.modules.module_stat.comment.count, best.modules.module_stat.like.count);
      for (const item of items.slice(1)) {
        const stat = item.modules.module_stat;
        const ratio = ratioOf(stat.comment.count, stat.like.count);
        if (ratio > bestRatio) {
          best = item;
          bestRatio = ratio;
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
    },
  };
}

export { FALLBACK_WBI_KEYS, keysFromNav };
