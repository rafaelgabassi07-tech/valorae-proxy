import { ValoraeEngine, getValoraeRuntimeStats } from '../lib/Valorae-engine.js';
import { cacheDriverInfo } from '../lib/cache/memory.js';
import { sendJson } from '../lib/performance/http.js';
import { beginRoute } from '../lib/http/route.js';
import { routeManifest } from './_router.js';

const version = '21.5.13';

function buildReadiness() {
  const manifest = routeManifest();
  const runtime = getValoraeRuntimeStats();
  const checks = [
    { name: 'freeOnly', ok: true, detail: 'Sem Redis/KV/banco/storage externo obrigatório.' },
    { name: 'physicalFunctions', ok: manifest.physicalFunctions.length === 2, detail: manifest.physicalFunctions.join(', ') },
    { name: 'router', ok: manifest.routes.includes('/asset') && manifest.routes.includes('/ready'), detail: `${manifest.routes.length} rotas internas` },
    { name: 'cacheDriver', ok: cacheDriverInfo().driver === 'memory', detail: 'memory' },
    { name: 'engineVersion', ok: ValoraeEngine.version.includes(version), detail: ValoraeEngine.version },
    { name: 'requiredCatalogs', ok: ['/fields','/errors','/openapi','/manifest','/env','/schema','/source/status'].every(r => manifest.routes.includes(r)), detail: 'fields/errors/openapi/manifest/env/schema/source-status' },
  ];
  return { checks, ready: checks.every(c => c.ok), runtime };
}

export default async function handler(req, res) {
  const route = beginRoute(req, res, { version: ValoraeEngine.version, methods: ['GET'], route: 'ready', rateMax: Number(process.env.VALORAE_RATE_LIMIT_HEALTH_MAX || 180), profile: 'ready', cacheControl: 'private, max-age=10' });
  if (route.done) return;
  const readiness = buildReadiness();
  return sendJson(req, res, {
    version: ValoraeEngine.version,
    release: version,
    requestId: route.requestId,
    status: readiness.ready ? 'READY' : 'NOT_READY',
    ready: readiness.ready,
    checks: readiness.checks,
    freeOnly: true,
    githubVercelReady: readiness.ready,
    note: 'Readiness local não chama fontes externas; valida contrato, roteamento, cache e política free-only.',
  }, { status: readiness.ready ? 200 : 503, engineVersion: ValoraeEngine.version, profile: 'ready', cachePolicy: 'etag', cacheControl: 'private, max-age=10' });
}
