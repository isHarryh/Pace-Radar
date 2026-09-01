import type { PaceConfig, PaceStatus } from './types.js';

export const DEFAULT_CONFIG: PaceConfig = {
  collectIntervalMinutes: 5,
  activeIntervalMinutes: 1,
  bilibiliCookie: '',
  wbiKeys: null,
};

/** 根据账号当前状态返回采集间隔（分钟）：正常 5 分钟，观察/节奏 1 分钟。 */
export function intervalMinutesFor(status: PaceStatus, config: PaceConfig): number {
  return status === 'normal' ? config.collectIntervalMinutes : config.activeIntervalMinutes;
}
