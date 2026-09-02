import type {
  Account,
  NavResponse,
  PaceConfig,
  WbiKeys,
} from '@pace-radar/shared';

export interface ScheduleState {
  targetId: string | null;
  recentRatios: number[];
  lastCollectedAt: Date | null;
}

export interface SnapshotInsert {
  accountId: number;
  endpoint: string;
  statusCode: string;
  targetType: 'dynamic' | 'error';
  targetId: string;
  commentCount: number;
  likeCount: number;
  shareCount: number;
  summary?: string | null;
}

export interface CollectorHeartbeat {
  cookieMd5: string | null;
  cookieMid: number | null;
  cookieUname: string | null;
  isLogin: number | null;
  navCode: number | null;
  valid: number | null;
  error: string | null;
  egressIp: string | null;
  egressGeo: string | null;
  cookieCheckedAt: string | null;
  egressCheckedAt: string | null;
}

export interface CollectorStore {
  loadConfig(): Promise<PaceConfig>;
  saveWbiKeys(keys: WbiKeys): Promise<void>;
  listEnabledAccounts(): Promise<Account[]>;
  getScheduleState(accountId: number): Promise<ScheduleState>;
  getScheduleStates(accountId: number): Promise<Map<string, ScheduleState>>;
  insertSnapshot(snapshot: SnapshotInsert): Promise<void>;
  insertSnapshots(snapshots: SnapshotInsert[]): Promise<void>;
  archiveInactiveSnapshots(now?: Date): Promise<{ hourly: number; daily: number }>;
  acquireLease(holder: string, durationSeconds: number): Promise<boolean>;
  releaseLease(holder: string): Promise<void>;
  saveCollectorHeartbeat(heartbeat: CollectorHeartbeat): Promise<void>;
  loadCollectorHeartbeat(): Promise<CollectorHeartbeat | null>;
}

export interface BiliTransport {
  fetch(input: string, init?: RequestInit): Promise<Response>;
}

export interface BiliClient {
  nav(cookie: string): Promise<NavResponse>;
  collectAccount(account: Account, cookie: string, wbiKeys: WbiKeys): Promise<FreshStat[]>;
}

export interface FreshStat {
  endpoint: 'feed/space';
  targetType: 'dynamic';
  targetId: string;
  commentCount: number;
  likeCount: number;
  shareCount: number;
  summary: string | null;
}
