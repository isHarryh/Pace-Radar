import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { ProxyAgent } from 'undici';
import { collect } from '@pace-radar/collector-core';
import type { BiliTransport } from '@pace-radar/collector-core';
import { D1HttpStore } from './store.js';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const accountId = required('CLOUDFLARE_ACCOUNT_ID');
const databaseId = process.env.D1_DATABASE_ID ?? required('DATABASE_ID');
const apiToken = required('CLOUDFLARE_API_TOKEN');
const proxyUrl = process.env.BILI_PROXY_URL;
const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;
const holder = process.env.COLLECTOR_HOLDER ?? `node-${hostname()}-${process.pid}-${randomUUID()}`;

function createTransport(): BiliTransport {
  if (!dispatcher) return { fetch: (input, init) => globalThis.fetch(input, init) };
  return {
    fetch: (input, init) =>
      globalThis.fetch(input, { ...init, dispatcher } as RequestInit & { dispatcher: ProxyAgent }),
  };
}

try {
  const store = new D1HttpStore(accountId, databaseId, apiToken, process.env.BILIBILI_COOKIE_FILE);
  await collect(store, {
    holder,
    transport: createTransport(),
    log: (message) => console.log(new Date().toISOString(), message),
  });
} catch (error) {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : error);
  process.exitCode = 1;
} finally {
  await dispatcher?.close();
}
