#!/usr/bin/env node
// 构建时将 wrangler.toml 占位 ${DATABASE_ID-...} 替换为环境变量 DATABASE_ID，避免入库硬编码
import fs from 'node:fs';
const id = process.env.DATABASE_ID;
if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
  console.error('[inject-db-id] DATABASE_ID 未设置或非合法 uuid，跳过替换');
  process.exit(0);
}
for (const p of ['apps/api/wrangler.toml', 'apps/collector/wrangler.toml']) {
  try {
    let s = fs.readFileSync(p, 'utf8');
    const before = s;
    s = s.replace(/\$\{DATABASE_ID[^}]*\}/g, id);
    if (s !== before) {
      fs.writeFileSync(p, s);
      console.log(`[inject-db-id] ${p} 已注入 ${id}`);
    }
  } catch (e) {
    console.warn(`[inject-db-id] ${p} 处理失败:`, e.message);
  }
}
