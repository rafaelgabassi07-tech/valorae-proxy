import { ValoraeEngine } from '../lib/Valorae-engine.js';
import { envCatalogSummary } from '../lib/catalogs/envs.js';
import { sendJson } from '../lib/performance/http.js';
import { beginRoute } from '../lib/http/route.js';
import { TTL_MATRIX } from '../lib/catalogs/valorae-catalogs.js';

export default async function handler(req, res) {
  const route = beginRoute(req, res, { version: ValoraeEngine.version, methods: ['GET'], route: 'env', rateMax: Number(process.env.VALORAE_RATE_LIMIT_HEALTH_MAX || 180), profile: 'env', cacheControl: TTL_MATRIX.staticCatalog.cacheControl });
  if (route.done) return;
  return sendJson(req, res, {
    version: ValoraeEngine.version,
    requestId: route.requestId,
    status: 'OK',
    freeOnly: true,
    ...envCatalogSummary(process.env),
    note: 'Catálogo público não expõe valores completos nem segredos; use .env.example para configuração local.'
  }, { status: 200, engineVersion: ValoraeEngine.version, profile: 'env', cachePolicy: 'etag', cacheControl: TTL_MATRIX.staticCatalog.cacheControl });
}
