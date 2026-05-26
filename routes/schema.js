import { ValoraeEngine } from '../lib/Valorae-engine.js';
import { sendJson } from '../lib/performance/http.js';
import { beginRoute } from '../lib/http/route.js';
import { schemaCatalog } from '../lib/quality/data-quality.js';
import { TTL_MATRIX } from '../lib/catalogs/valorae-catalogs.js';

export default async function handler(req, res) {
  const route = beginRoute(req, res, { version: ValoraeEngine.version, methods: ['GET'], route: 'schema', rateMax: Number(process.env.VALORAE_RATE_LIMIT_HEALTH_MAX || 180), profile: 'schema', cacheControl: TTL_MATRIX.staticCatalog.cacheControl });
  if (route.done) return;
  return sendJson(req, res, { version: ValoraeEngine.version, requestId: route.requestId, status: 'OK', ...schemaCatalog() }, { status: 200, engineVersion: ValoraeEngine.version, profile: 'schema', schemaVersion: 'schema-catalog-v21.5.13', cachePolicy: 'etag', cacheControl: TTL_MATRIX.staticCatalog.cacheControl });
}
