export type PaceStatus = 'normal' | 'pacing';

export type TargetType = 'dynamic';

export interface Account {
  id: number;
  mid: number;
  name: string;
  threshold: number;
  enabled: boolean;
}

export interface Snapshot {
  id: number;
  accountId: number;
  targetType: TargetType;
  targetId: string;
  commentCount: number;
  likeCount: number;
  shareCount: number;
  ratioC_l: number;
  updatedAt: string;
}

export interface WbiKeys {
  imgKey: string;
  subKey: string;
  fetchedAt: string;
}

export interface PaceConfig {
  collectIntervalMinutes: number; // 正常状态采集间隔（分钟）
  activeIntervalMinutes: number; // 观察/节奏状态采集间隔（分钟）
  bilibiliCookie: string;
  wbiKeys: WbiKeys | null;
}