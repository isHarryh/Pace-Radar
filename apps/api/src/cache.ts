import type { Context } from 'hono';

export const PUBLIC_CACHE_TTL_S = 15;

interface CacheEntry {
  body: string;
  etag: string;
  headers: Record<string, string>;
  expires: number;
}

const memCache = new Map<string, CacheEntry>();
const pending = new Map<string, Promise<CacheEntry>>();

async function makeEtag(body: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
  return `"${hex}"`;
}

function notModifiedHeaders(etag: string, ttl: number): Record<string, string> {
  return { ETag: etag, 'Cache-Control': `public, max-age=${ttl}, s-maxage=${ttl}` };
}

export async function cachedJson(
  c: Context,
  cacheKey: string,
  producer: () => Promise<unknown>,
  ttl = PUBLIC_CACHE_TTL_S,
): Promise<Response> {
  const now = Date.now();
  const cached = memCache.get(cacheKey);
  const ifNoneMatch = c.req.header('If-None-Match');

  if (cached && cached.expires > now) {
    if (ifNoneMatch === cached.etag) return c.body(null, 304, notModifiedHeaders(cached.etag, ttl));
    return c.body(cached.body, 200, cached.headers);
  }

  let promise = pending.get(cacheKey);
  if (!promise) {
    promise = (async (): Promise<CacheEntry> => {
      const data = await producer();
      const body = JSON.stringify({ data });
      const etag = await makeEtag(body);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ETag: etag,
        'Cache-Control': `public, max-age=${ttl}, s-maxage=${ttl}, stale-while-revalidate=5`,
        'CDN-Cache-Control': `public, max-age=${ttl}`,
        Vary: 'Accept-Encoding',
      };
      const entry: CacheEntry = { body, etag, headers, expires: Date.now() + ttl * 1000 };
      memCache.set(cacheKey, entry);

      try {
        const cache = (caches as unknown as { default: Cache })?.default;
        if (cache) {
          const res = new Response(body, { status: 200, headers });
          const p = cache.put(new Request(c.req.url, { method: 'GET' }), res.clone());
          const ctx = (c as unknown as { executionCtx?: ExecutionContext }).executionCtx;
          if (ctx?.waitUntil) ctx.waitUntil(p);
          else await p;
        }
      } catch {
        // cache unavailable in local dev
      }

      return entry;
    })();
    pending.set(cacheKey, promise);
    promise.catch(() => {}).finally(() => pending.delete(cacheKey));
  }

  const entry = await promise;
  if (ifNoneMatch === entry.etag) return c.body(null, 304, notModifiedHeaders(entry.etag, ttl));
  return c.body(entry.body, 200, entry.headers);
}

export function noStoreHeaders(): Record<string, string> {
  return { 'Cache-Control': 'no-store', 'CDN-Cache-Control': 'no-store' };
}

export function clearCache(): void {
  memCache.clear();
  pending.clear();
}
