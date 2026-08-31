import { parseDbTime } from '@pace-radar/shared';

export { parseDbTime };

export function formatCount(n: number): string {
  if (n >= 1e4) return `${(n / 1e4).toFixed(2)}万`;
  return String(n);
}

export function formatCountComma(n: number): string {
  return n.toLocaleString('en-US');
}

export function formatClock(value: string): string {
  const d = parseDbTime(value);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}