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
  const data = new TextEncoder().encode(body);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
  return `"${hex}"`;
}

function publicHeaders(etag: string, ttl = PUBLIC_CACHE_TTL_S): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ETag: etag,
    'Cache-Control': `public, max-age=${ttl}, s-maxage=${ttl}, stale-while-revalidate=5`,
    'CDN-Cache-Control': `public, max-age=${ttl}`,
    Vary: 'Accept-Encoding',
  };
}

/**
 * Serves JSON with edge + worker memory cache and ETag / 304 support.
 *
 * - Uses in-worker memory deduplication (pending map) to avoid thundering herd.
 * - Sets Cache-Control for Cloudflare edge (s-maxage) and browser (max-age).
 * - Honors If-None-Match → 304.
 * - On cache MISS, calls `producer` exactly once per key per TTL window.
 */
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
    if (ifNoneMatch && ifNoneMatch === cached.etag) {
      return c.body(null, 304, {
        ETag: cached.etag,
        'Cache-Control': `public, max-age=${ttl}, s-maxage=${ttl}`,
      });
    }
    // Include CDN-Cache-Control on hit as well so edge keeps it cached.
    return c.body(cached.body, 200, cached.headers);
  }

  // Deduplicate concurrent producers for same key.
  let promise = pending.get(cacheKey);
  if (!promise) {
    promise = (async (): Promise<CacheEntry> => {
      const data = await producer();
      const body = JSON.stringify({ data });
      const etag = await makeEtag(body);
      const headers = publicHeaders(etag, ttl);
      const entry: CacheEntry = { body, etag, headers, expires: Date.now() + ttl * 1000 };
      memCache.set(cacheKey, entry);

      // Best-effort edge cache via caches.default (Cloudflare Workers).
      try {
        const cache = (caches as unknown as { default: Cache })?.default;
        if (cache) {
          const req = new Request(c.req.url, { method: 'GET' });
          const res = new Response(body, { status: 200, headers });
          // Use waitUntil if available to avoid blocking.
          const p = cache.put(req, res.clone());
          const ctx = (c as unknown as { executionCtx?: ExecutionContext }).executionCtx;
          if (ctx?.waitUntil) ctx.waitUntil(p);
          else await p;
        }
      } catch {
        // ignore cache API unavailability in local dev
      }

      return entry;
    })();
    pending.set(cacheKey, promise);
    promise.catch(() => {}).finally(() => pending.delete(cacheKey));
  }

  const entry = await promise;
  if (ifNoneMatch && ifNoneMatch === entry.etag) {
    return c.body(null, 304, {
      ETag: entry.etag,
      'Cache-Control': `public, max-age=${ttl}, s-maxage=${ttl}`,
    });
  }
  return c.body(entry.body, 200, entry.headers);
}

/** Checks If-None-Match against a just-produced entry and returns cached response if matched. */
export async function respondJsonWithEtag(
  c: Context,
  data: unknown,
  ttl = PUBLIC_CACHE_TTL_S,
): Promise<Response> {
  const body = JSON.stringify({ data });
  const etag = await makeEtag(body);
  const ifNoneMatch = c.req.header('If-None-Match');
  if (ifNoneMatch && ifNoneMatch === etag) {
    return c.body(null, 304, {
      ETag: etag,
      'Cache-Control': `public, max-age=${ttl}, s-maxage=${ttl}`,
    });
  }
  return c.body(body, 200, publicHeaders(etag, ttl));
}

export function noStoreHeaders(): Record<string, string> {
  return { 'Cache-Control': 'no-store', 'CDN-Cache-Control': 'no-store' };
}

/** For testing: clear in-memory cache. */
export function clearCache(): void {
  memCache.clear();
  pending.clear();
}
