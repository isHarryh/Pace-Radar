import type { PaceStatus } from './types.js';

const STATUS_WINDOW = 5;
const PACING_OVER_COUNT = 1;

export function ratioOf(comment: number, like: number): number {
  return like > 0 ? comment / like : 0;
}

export function deriveStatus(ratios: number[], threshold: number): PaceStatus {
  const over = ratios.slice(-STATUS_WINDOW).filter((r) => r > threshold).length;
  return over >= PACING_OVER_COUNT ? 'pacing' : 'normal';
}
