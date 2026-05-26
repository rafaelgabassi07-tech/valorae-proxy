import { ValoraeEngine } from '../../lib/Valorae-engine.js';
import { fetchIndicesSnapshot } from '../../lib/market/indices.js';
import { sendJson } from '../../lib/performance/http.js';
import { beginRoute, sendRouteError } from '../../lib/http/route.js';

export default async function handler(req, res) {
  const route = beginRoute(req, res, { version: ValoraeEngine.version, methods: ['GET'], route: 'market-indices', rateMax: Number(process.env.VALORAE_RATE_LIMIT_MARKET_MAX || 90), profile: 'market' });
  if (route.done) return;
  try {
    const data = await fetchIndicesSnapshot();
    return sendJson(req, res, { version: ValoraeEngine.version, requestId: route.requestId, endpoint: 'market-indices', ...data }, { status: data.ok ? 200 : 502, engineVersion: ValoraeEngine.version, profile: 'market', cacheControl: data.ok ? 'private, max-age=30, stale-while-revalidate=300' : 'no-store' });
  } catch (err) {
    return sendRouteError(req, res, err, { version: ValoraeEngine.version, requestId: route.requestId, profile: 'market' });
  }
}
