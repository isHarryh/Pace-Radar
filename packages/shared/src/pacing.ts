import type { PaceStatus } from './types';

const STATUS_WINDOW = 10;
const WATCHING_OVER_COUNT = 1;
const ACTIVE_OVER_COUNT = 5;

export function ratioOf(comment: number, like: number): number {
  return like > 0 ? comment / like : 0;
}

export function deriveStatus(ratios: number[], threshold: number): PaceStatus {
  const recent = ratios.slice(-STATUS_WINDOW);
  const over = recent.filter((r) => r > threshold).length;
  if (over >= ACTIVE_OVER_COUNT) return 'active';
  if (over >= WATCHING_OVER_COUNT) return 'watching';
  return 'normal';
}