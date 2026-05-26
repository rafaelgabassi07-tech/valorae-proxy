import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
const forbiddenDeps = [
  'redis', '@vercel/kv', '@upstash/redis', 'ioredis', 'ws', 'bullmq',
  '@supabase/supabase-js', 'firebase', 'mongodb', 'mongoose', 'pg', 'mysql2', 'prisma'
];
const badDeps = forbiddenDeps.filter(d => Object.prototype.hasOwnProperty.call(deps, d));
if (badDeps.length) {
  console.error('Dependências externas/pagas/complexas não permitidas:', badDeps.join(', '));
  process.exit(1);
}

const codeFiles = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory() && !['node_modules','.git'].includes(e.name)) walk(p);
    else if (/\.(js|ts|java)$/.test(p)) codeFiles.push(p);
  }
}
['api','routes','lib','public/sdk'].forEach(walk);

const forbiddenPatterns = [
  /from ['"]redis['"]/, /from ['"]@vercel\/kv['"]/, /from ['"]@upstash\/redis['"]/, /from ['"]ws['"]/, /require\(['"]redis['"]\)/,
  /from ['"]@supabase\/supabase-js['"]/, /SUPABASE_URL/, /SUPABASE_ANON_KEY/,
  /from ['"]firebase/, /from ['"]mongodb['"]/, /from ['"]mongoose['"]/, /from ['"]pg['"]/, /from ['"]mysql2['"]/, /from ['"]prisma/,
  /KV_REST_API_URL/, /REDIS_URL\s*&&\s*fetch/, /new\s+WebSocket\s*\(/,
  /\bFunction\s*\(/, /\beval\s*\(/, /child_process/,
];
const hits = [];
for (const f of codeFiles) {
  if (f === 'scripts/preflight-free-only.js') continue;
  const text = fs.readFileSync(f, 'utf8');
  for (const re of forbiddenPatterns) if (re.test(text)) hits.push(`${f}: ${re}`);
}
if (hits.length) {
  console.error('Uso de tecnologia externa/complexa detectado no runtime:');
  for (const hit of hits) console.error(`- ${hit}`);
  process.exit(1);
}
console.log('Free-only audit OK: sem dependência paga, banco/storage externo, Redis/KV, WebSocket ou import complexo detectado.');
