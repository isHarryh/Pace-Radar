import type { PaceStatus } from '@pace-radar/shared';

const BASE = import.meta.env.VITE_API_BASE ?? '/api';
const ADMIN_TOKEN_KEY = 'pace_admin_token';

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body: { data?: T; error?: { message: string } } = await res.json();
  if (body.error) throw new Error(body.error.message);
  return body.data as T;
}

export interface LatestView {
  commentCount: number;
  likeCount: number;
  shareCount: number;
  ratio: number;
  updatedAt: string;
}

export interface AccountView {
  id: number;
  mid: number;
  name: string;
  threshold: number;
  status: PaceStatus;
  latest: LatestView | null;
  perMinute: { comments: number; windowMin: number } | null;
  spark?: { t: string; growth: number }[];
}

export interface SeriesPoint {
  t: string;
  commentCount: number;
  ratio: number;
  growth: number;
}

export interface SeriesData {
  range: string;
  resolution: string;
  points: SeriesPoint[];
}

export const fetchAccounts = () => getJson<AccountView[]>('/accounts');
export const fetchAccount = (mid: number) => getJson<AccountView>(`/accounts/${mid}`);
export const fetchSeries = (mid: number, range: string, resolution: string) =>
  getJson<SeriesData>(`/accounts/${mid}/series?range=${range}&resolution=${resolution}`);

export const avatarUrl = (mid: number) => `${BASE}/accounts/${mid}/avatar`;

export class AdminUnauthorized extends Error {
  constructor() {
    super('unauthorized');
  }
}

let adminToken = localStorage.getItem(ADMIN_TOKEN_KEY) ?? '';

export function setAdminToken(token: string): void {
  adminToken = token;
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearAdminToken(): void {
  adminToken = '';
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}`, ...init?.headers },
  });
  if (res.status === 401) {
    clearAdminToken();
    window.location.hash = '#/admin/login';
    throw new AdminUnauthorized();
  }
  const body: { data?: T; error?: { message: string } } = await res.json().catch(() => ({}));
  if (!res.ok || body.error) throw new Error(body.error?.message ?? `HTTP ${res.status}`);
  return body.data as T;
}

export interface AdminAccount {
  id: number;
  mid: number;
  name: string;
  threshold: number;
  enabled: boolean;
  hasAvatar: boolean;
}

export interface AdminConfig {
  collectIntervalMinutes: number;
  activeIntervalMinutes: number;
}

export interface AdminCookieInfo {
  length: number;
  masked: string;
  updatedAt: string | null;
  valid: boolean | null;
}

export interface RequestLog {
  id: number;
  accountId: number;
  accountName: string | null;
  targetType: string;
  targetId: string | null;
  commentCount: number;
  likeCount: number;
  statusCode: string;
  endpoint: string;
  updatedAt: string;
}

export const fetchAdminAccounts = () => adminFetch<AdminAccount[]>('/admin/accounts');
export const createAdminAccount = (input: { mid: number; name: string; threshold?: number; enabled?: boolean }) =>
  adminFetch<{ id: number }>('/admin/accounts', { method: 'POST', body: JSON.stringify(input) });
export const updateAdminAccount = (mid: number, input: { name?: string; threshold?: number; enabled?: boolean }) =>
  adminFetch<{ ok: boolean }>(`/admin/accounts/${mid}`, { method: 'PUT', body: JSON.stringify(input) });
export const updateAdminAvatar = (mid: number, avatar: string | null) =>
  adminFetch<{ ok: boolean }>(`/admin/accounts/${mid}/avatar`, { method: 'POST', body: JSON.stringify({ avatar }) });
export const fetchAdminConfig = () => adminFetch<AdminConfig>('/admin/config');
export const updateAdminConfig = (input: Partial<AdminConfig>) =>
  adminFetch<{ ok: boolean }>('/admin/config', { method: 'PUT', body: JSON.stringify(input) });
export const fetchAdminCookie = () => adminFetch<AdminCookieInfo>('/admin/cookie');
export const updateAdminCookie = (value: string) =>
  adminFetch<{ ok: boolean }>('/admin/cookie', { method: 'PUT', body: JSON.stringify({ value }) });
export const fetchAdminLogs = (limit = 50) => adminFetch<RequestLog[]>(`/admin/logs?limit=${limit}`);