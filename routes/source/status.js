import { ValoraeEngine, getValoraeRuntimeStats } from '../../lib/Valorae-engine.js';
import { sendJson } from '../../lib/performance/http.js';
import { beginRoute } from '../../lib/http/route.js';
import { buildSourceReliabilityMatrix } from '../../lib/quality/data-quality.js';

export default async function handler(req, res) {
  const route = beginRoute(req, res, { version: ValoraeEngine.version, methods: ['GET'], route: 'source-status', rateMax: Number(process.env.VALORAE_RATE_LIMIT_HEALTH_MAX || 180), profile: 'source-status', cacheControl: 'private, max-age=5' });
  if (route.done) return;
  const runtime = getValoraeRuntimeStats();
  const providers = buildSourceReliabilityMatrix(runtime);
  const degraded = providers.filter(p => ['cooldown','degraded'].includes(p.status));
  return sendJson(req, res, {
    version: ValoraeEngine.version,
    requestId: route.requestId,
    status: degraded.length ? 'DEGRADED' : 'OK',
    freeOnly: true,
    checkedAt: new Date().toISOString(),
    providers,
    sourceReliability: {
      okCount: providers.filter(p => !['cooldown','degraded'].includes(p.status)).length,
      degradedCount: degraded.length,
      note: 'Status é local da instância quente e não faz chamadas externas; pode resetar quando a Function esfriar.'
    }
  }, { status: 200, engineVersion: ValoraeEngine.version, profile: 'source-status', cacheControl: 'private, max-age=5', sourceStatus: degraded.length ? 'degraded' : 'ok' });
}
