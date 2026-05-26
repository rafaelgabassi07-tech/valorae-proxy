import fs from 'node:fs';
import path from 'node:path';

const allowed = new Set(['api/index.js', 'api/[...path].js']);
const found = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (p.endsWith('.js')) found.push(p.replace(/\\/g, '/'));
  }
}
walk('api');
const extra = found.filter(f => !allowed.has(f));
if (extra.length) {
  console.error('Functions físicas extras detectadas:', extra.join(', '));
  process.exit(1);
}
console.log(`Guardrail OK: ${found.length} Functions físicas (${found.join(', ')}).`);
