import { DEFAULT_CONFIG, type PaceConfig, type WbiKeys } from '@pace-radar/shared';

export interface ConfigRow {
  key: string;
  value: string;
}

export function parseConfig(rows: ConfigRow[]): PaceConfig {
  const config: PaceConfig = { ...DEFAULT_CONFIG };
  for (const row of rows) {
    switch (row.key) {
      case 'collect_interval_minutes':
        if (Number.isInteger(Number(row.value)) && Number(row.value) >= 1) config.collectIntervalMinutes = Number(row.value);
        break;
      case 'active_interval_minutes':
        if (Number.isInteger(Number(row.value)) && Number(row.value) >= 1) config.activeIntervalMinutes = Number(row.value);
        break;
      case 'bilibili_cookie':
        config.bilibiliCookie = row.value;
        break;
      case 'wbi_keys':
        try {
          const keys = JSON.parse(row.value) as WbiKeys;
          if (keys && typeof keys.imgKey === 'string' && typeof keys.subKey === 'string' && typeof keys.fetchedAt === 'string') {
            config.wbiKeys = keys;
          }
        } catch {
          // A bad cache should not prevent a fresh nav request.
        }
        break;
    }
  }
  return config;
}
