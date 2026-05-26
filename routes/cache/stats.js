import { ValoraeEngine, getValoraeRuntimeStats } from '../../lib/Valorae-engine.js';
import { cacheDriverInfo } from '../../lib/cache/memory.js';
import { sendJson } from '../../lib/performance/http.js';
import { beginRoute } from '../../lib/http/route.js';

export default async function handler(req, res) {
  const route = beginRoute(req, res, { version: ValoraeEngine.version, methods: ['GET'], route: 'cache-stats', rateMax: Number(process.env.VALORAE_RATE_LIMIT_HEALTH_MAX || 180), profile: 'cache-stats', cacheControl: 'private, max-age=5' });
  if (route.done) return;
  const runtime = getValoraeRuntimeStats();
  return sendJson(req, res, {
    version: ValoraeEngine.version,
    requestId: route.requestId,
    status: 'OK',
    freeOnly: true,
    driver: cacheDriverInfo(),
    caches: runtime.caches,
    providers: runtime.providers,
    note: 'Métricas em memória da instância serverless quente; podem zerar quando a função esfriar ou escalar.',
  }, { status: 200, engineVersion: ValoraeEngine.version, profile: 'cache-stats', cachePolicy: 'etag', cacheControl: 'private, max-age=5' });
}
