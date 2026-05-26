import { ValoraeEngine } from '../lib/Valorae-engine.js';
import { sendJson } from '../lib/performance/http.js';
import { beginRoute } from '../lib/http/route.js';
import { routeManifest } from '../routes/_router.js';

export default async function handler(req, res) {
  const route = beginRoute(req, res, { version: ValoraeEngine.version, methods: ['GET'], route: 'index', rateMax: Number(process.env.VALORAE_RATE_LIMIT_HEALTH_MAX || 180), profile: 'index', cacheControl: 'private, max-age=30' });
  if (route.done) return;
  return sendJson(req, res, {
    name: 'Valorae Proxy API',
    version: ValoraeEngine.version,
    status: 'online',
    compatibility: 'GitHub/Vercel serverless proxy',
    router: { version: 'internal-v1-v2', ...routeManifest() },
    examples: {
      asset: '/api/asset?ticker=PETR4&mode=super&includeNews=1',
      assets: '/api/assets?tickers=PETR4,GARE11,VISC11&mode=super',
      scrape: '/api/scrape?url=https://investidor10.com.br/acoes/petr4/',
      news: '/api/news?ticker=PETR4',
      batchScrape: '/api/batch-scrape',
      health: '/api/health',
      fields: '/api/fields',
      errors: '/api/errors',
      openapi: '/api/openapi',
      inspector: '/inspector.html',
    },
  }, { status: 200, engineVersion: ValoraeEngine.version, profile: 'index', cacheControl: 'private, max-age=30' });
}
