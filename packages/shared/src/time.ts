/** 将 D1 的 UTC 时间字符串（'YYYY-MM-DD HH:MM:SS'）解析为 Date。 */
export function parseDbTime(value: string): Date {
  return new Date(`${value.replace(' ', 'T')}Z`);
}