import { parseDbTime } from '@pace-radar/shared';

export { parseDbTime };

export function formatCount(n: number): string {
  if (n >= 1e4) return `${(n / 1e4).toFixed(2)}万`;
  return String(n);
}

export function formatCountWan(n: number): string {
  const sign = n < 0 ? '-' : '';
  const [integer, fraction] = Math.abs(n).toString().split('.');
  const grouped = integer!.replace(/\B(?=(\d{4})+(?!\d))/g, ',');
  return `${sign}${grouped}${fraction ? `.${fraction}` : ''}`;
}

export function formatClock(value: string): string {
  const d = parseDbTime(value);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
