import { ValoraeEngine } from '../../lib/Valorae-engine.js';
import { fetchIpca } from '../../lib/market/bcb.js';
import { sendJson } from '../../lib/performance/http.js';
import { beginRoute, clampNumber, sendRouteError } from '../../lib/http/route.js';

export default async function handler(req, res) {
  const route = beginRoute(req, res, { version: ValoraeEngine.version, methods: ['GET'], route: 'market-ipca', rateMax: Number(process.env.VALORAE_RATE_LIMIT_MARKET_MAX || 90), profile: 'market' });
  if (route.done) return;
  try {
    const q = route.input;
    const data = await fetchIpca({ last: clampNumber(q.last, 24, 1, 120) });
    return sendJson(req, res, { version: ValoraeEngine.version, requestId: route.requestId, endpoint: 'market-ipca', ...data }, { status: data.ok ? 200 : 502, engineVersion: ValoraeEngine.version, profile: 'market', cacheControl: data.ok ? 'private, max-age=3600, stale-while-revalidate=86400' : 'no-store' });
  } catch (err) {
    return sendRouteError(req, res, err, { version: ValoraeEngine.version, requestId: route.requestId, profile: 'market' });
  }
}
