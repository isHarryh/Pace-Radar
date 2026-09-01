#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const databaseId = process.env.DATABASE_ID;
if (!databaseId || !/^[0-9a-f-]{36}$/i.test(databaseId)) {
  console.error('[prepare-wrangler-config] DATABASE_ID must be a valid UUID');
  process.exit(1);
}

for (const app of ['apps/api', 'apps/collector']) {
  const source = path.join(root, app, 'wrangler.toml');
  const target = path.join(root, app, 'wrangler.generated.toml');
  const template = fs.readFileSync(source, 'utf8');
  const generated = template.replace(/\$\{DATABASE_ID[^}]*\}/g, databaseId);
  fs.writeFileSync(target, generated);
  console.log(`[prepare-wrangler-config] generated ${path.relative(root, target)}`);
}
