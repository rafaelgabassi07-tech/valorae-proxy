import { summarizeTransactions, PORTFOLIO_ENGINE_VERSION } from '../../lib/portfolio/analytics.js';
import { ValoraeEngine } from '../../lib/Valorae-engine.js';
import { sendJson } from '../../lib/performance/http.js';
import { beginRoute, sendRouteError } from '../../lib/http/route.js';

export default async function handler(req, res) {
  const route = beginRoute(req, res, { version: ValoraeEngine.version, methods: ['POST'], route: 'portfolio-transactions', rateMax: Number(process.env.VALORAE_RATE_LIMIT_PORTFOLIO_MAX || 60), profile: 'portfolio' });
  if (route.done) return;
  try {
    const data = summarizeTransactions(route.input || {});
    return sendJson(req, res, { requestId: route.requestId, ...data }, { status: 200, engineVersion: ValoraeEngine.version, profile: 'portfolio' });
  } catch (err) {
    return sendRouteError(req, res, err, { version: PORTFOLIO_ENGINE_VERSION, requestId: route.requestId, profile: 'portfolio' });
  }
}
