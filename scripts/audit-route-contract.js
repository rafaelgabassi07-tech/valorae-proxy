import fs from 'node:fs';
import path from 'node:path';
import { routeManifest } from '../routes/_router.js';

const root = process.cwd();
const failures = [];
const manifest = routeManifest();

for (const fn of manifest.physicalFunctions) {
  if (!fs.existsSync(path.join(root, fn))) failures.push(`Function física ausente: ${fn}`);
}

const routeFile = fs.readFileSync(path.join(root, 'routes/_router.js'), 'utf8');
for (const route of manifest.routes) {
  const importMatch = routeFile.match(new RegExp(`${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['\"]:\\s*\\(\\) => import\\('([^']+)'\\)`));
  if (!importMatch) continue;
  const rel = importMatch[1].replace(/^\.\//, 'routes/');
  const target = path.join(root, rel);
  if (!fs.existsSync(target)) failures.push(`Handler ausente para ${route}: ${rel}`);
}

for (const required of ['/health','/ready','/manifest','/env','/schema','/source/status','/asset','/assets','/compare','/scrape','/batch-scrape','/cache/stats','/fields','/errors','/openapi']) {
  if (!manifest.routes.includes(required)) failures.push(`Rota obrigatória fora do manifesto: ${required}`);
}


const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const apiCorsHeader = (vercel.headers || []).some(entry => String(entry.source || '').includes('/api') && (entry.headers || []).some(h => String(h.key || '').toLowerCase() === 'access-control-allow-origin'));
if (apiCorsHeader) failures.push('vercel.json não deve definir Access-Control-Allow-Origin para /api; CORS deve ficar no runtime para evitar conflito com allowlist.');

const openapi = fs.readFileSync(path.join(root, 'routes/openapi.js'), 'utf8');
for (const required of ['/api/v1/health','/api/v1/ready','/api/v1/manifest','/api/v1/env','/api/v1/schema','/api/v1/source/status','/api/v1/asset','/api/v2/asset','/api/v1/assets','/api/v1/compare','/api/v1/scrape','/api/v1/batch-scrape','/api/v1/cache/stats']) {
  if (!openapi.includes(required)) failures.push(`OpenAPI não referencia ${required}`);
}
for (const required of ['components:', 'schemas:', '#/components/schemas/Position', 'parameters', 'requestBody', 'operationId']) {
  if (!openapi.includes(required)) failures.push(`OpenAPI não contém estrutura validável esperada: ${required}`);
}
if (openapi.includes('#/schemas/')) failures.push('OpenAPI não deve usar referências legadas #/schemas/*; use #/components/schemas/*.');

if (failures.length) {
  console.error('Route contract audit failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`Route contract OK: ${manifest.routes.length} rotas internas, ${manifest.physicalFunctions.length} Functions físicas.`);
