import { ValoraeEngine } from '../lib/Valorae-engine.js';
import { sendJson } from '../lib/performance/http.js';
import { beginRoute } from '../lib/http/route.js';
import { ERROR_CATALOG, VALORAE_CATALOG_VERSION, TTL_MATRIX } from '../lib/catalogs/valorae-catalogs.js';

const ERROR_CATALOG_VERSION = VALORAE_CATALOG_VERSION;

const legacyErrors = [
  { code: 'REQUEST_ERROR', http: 400, retryable: false, description: 'Erro de entrada, query string ou corpo inválido.' },
  { code: 'INVALID_TICKER', http: 400, retryable: false, description: 'Ticker ausente, malformado ou não suportado pela validação.' },
  { code: 'PAYLOAD_TOO_LARGE', http: 413, retryable: false, description: 'Corpo acima do limite serverless configurado.' },
  { code: 'RATE_LIMITED', http: 429, retryable: true, description: 'Limite por rota/IP atingido. Respeite Retry-After.' },
  { code: 'INVALID_SCRAPE_URL', http: 400, retryable: false, description: 'URL de scrape inválida.' },
  { code: 'INVALID_SCRAPE_URL_PROTOCOL', http: 400, retryable: false, description: 'scrapeUrl precisa usar HTTPS, exceto localhost em desenvolvimento.' },
  { code: 'SCRAPE_URL_NOT_ALLOWED', http: 403, retryable: false, description: 'Host de scrape fora da allowlist do deploy.' },
  { code: 'INVALID_SCRAPE_URL_PATH', http: 400, retryable: false, description: 'scrapeUrl precisa apontar para /api/scrape.' },
  { code: 'INVALID_FIELDS', http: 400, retryable: false, description: 'Parâmetro fields/dataFields contém caminho inválido ou perigoso.' },
  { code: 'INVALID_VIEW', http: 400, retryable: false, description: 'View desconhecida. Use quote, card, wallet, detail, analysis, compact, standard ou full.' },
  { code: 'INVALID_PROFILE', http: 400, retryable: false, description: 'Profile desconhecido. Use quote, card, wallet, analysis, fast, standard, deep ou portfolio.' },
  { code: 'ROUTE_NOT_FOUND', http: 404, retryable: false, description: 'Rota não encontrada no router interno.' },
  { code: 'NOT_READY', http: 503, retryable: true, description: 'Readiness local falhou em alguma checagem de lançamento.' },
  { code: 'SCRAPE_SELECTOR_ERROR', http: 400, retryable: false, description: 'Seletor customizado inválido ou incompatível com CSS-lite.' },
  { code: 'SOURCE_UNAVAILABLE', http: 502, retryable: true, description: 'Fonte externa indisponível ou sem dados úteis.' },
  { code: 'SOURCE_DRIFT_DETECTED', http: 206, retryable: true, description: 'Fonte mudou estrutura/seletores e a resposta acionou fallback ou confiança reduzida.' },
  { code: 'SYNC_DISABLED_FREE_ONLY', http: 410, retryable: false, description: 'Endpoint legado sync desativado na build free-only, sem banco/storage externo.' },
  { code: 'ADMIN_TOKEN_NOT_CONFIGURED', http: 503, retryable: false, description: 'Endpoint admin protegido está desativado sem token.' },
  { code: 'ADMIN_UNAUTHORIZED', http: 401, retryable: false, description: 'Token administrativo ausente ou inválido.' },
  { code: 'SOURCE_BLOCKED', http: 502, retryable: true, description: 'Fonte externa bloqueou/limitou resposta; use cache, fallback ou tente depois.' },
  { code: 'SOURCE_TIMEOUT', http: 504, retryable: true, description: 'Fonte externa demorou além do timeout configurado.' },
  { code: 'INTERNAL_ERROR', http: 500, retryable: true, description: 'Erro interno sanitizado para não vazar detalhes.' }
];

export default async function handler(req, res) {
  const route = beginRoute(req, res, { version: ValoraeEngine.version, methods: ['GET'], route: 'errors', rateMax: Number(process.env.VALORAE_RATE_LIMIT_HEALTH_MAX || 180), profile: 'errors', cacheControl: TTL_MATRIX.staticCatalog.cacheControl });
  if (route.done) return;
  return sendJson(req, res, {
    version: ValoraeEngine.version,
    catalogVersion: ERROR_CATALOG_VERSION,
    requestId: route.requestId,
    endpoint: 'errors',
    errorShape: { version: 'string', status: 'ERROR|RATE_LIMITED', requestId: 'string', code: 'string', error: 'string' },
    errors: ERROR_CATALOG,
    headers: ['ETag','X-Request-Id','X-Valorae-Engine-Version','X-Valorae-Performance','X-RateLimit-Limit','X-RateLimit-Remaining','X-RateLimit-Reset','Retry-After']
  }, { status: 200, engineVersion: ValoraeEngine.version, profile: 'errors', cachePolicy: 'etag', cacheControl: TTL_MATRIX.staticCatalog.cacheControl });
}
