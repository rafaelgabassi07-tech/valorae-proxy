export const VALORAE_CATALOG_VERSION = '21.5.13-mature-final-release-free';

export const VIEW_ALIASES = Object.freeze({
  instant: 'compact',
  ultra: 'compact',
  tiny: 'compact',
  quote: 'compact',
  card: 'compact',
  wallet: 'standard',
  detail: 'full',
  analysis: 'full',
  compact: 'compact',
  standard: 'standard',
  full: 'full',
});

export const PROFILE_ALIASES = Object.freeze({
  instant: 'instant',
  ultra: 'instant',
  tiny: 'instant',
  quote: 'fast',
  card: 'fast',
  wallet: 'portfolio',
  analysis: 'deep',
  balanced: 'standard',
  complete: 'deep',
  fast: 'fast',
  standard: 'standard',
  deep: 'deep',
  portfolio: 'portfolio',
});

export const TTL_MATRIX = Object.freeze({
  assetQuote: { ttlMs: 15_000, staleMs: 60_000, cacheControl: 'private, max-age=15, stale-while-revalidate=60' },
  assetFull: { ttlMs: 300_000, staleMs: 900_000, cacheControl: 'private, max-age=30, stale-while-revalidate=300' },
  html: { ttlMs: 14_400_000, staleMs: 3_600_000, cacheControl: 'private, max-age=60, stale-while-revalidate=600' },
  rankings: { ttlMs: 900_000, staleMs: 300_000, cacheControl: 'private, max-age=60, stale-while-revalidate=300' },
  market: { ttlMs: 60_000, staleMs: 120_000, cacheControl: 'private, max-age=30, stale-while-revalidate=120' },
  news: { ttlMs: 900_000, staleMs: 3_600_000, cacheControl: 'private, max-age=120, stale-while-revalidate=600' },
  portfolio: { ttlMs: 10_000, staleMs: 60_000, cacheControl: 'private, max-age=10, stale-while-revalidate=60' },
  staticCatalog: { ttlMs: 300_000, staleMs: 3600_000, cacheControl: 'public, max-age=300, stale-while-revalidate=3600' },
});

export const ERROR_CATALOG = Object.freeze([
  { code: 'REQUEST_ERROR', http: 400, retryable: false, description: 'Erro de entrada, query string ou corpo inválido.' },
  { code: 'INVALID_TICKER', http: 400, retryable: false, description: 'Ticker ausente, malformado ou não suportado.' },
  { code: 'PAYLOAD_TOO_LARGE', http: 413, retryable: false, description: 'Corpo acima do limite serverless configurado.' },
  { code: 'URL_TOO_LONG', http: 414, retryable: false, description: 'URL/query string acima do limite seguro.' },
  { code: 'TOO_MANY_QUERY_PARAMS', http: 400, retryable: false, description: 'Número de parâmetros de query acima do limite seguro.' },
  { code: 'RATE_LIMITED', http: 429, retryable: true, description: 'Limite por rota/IP atingido. Respeite Retry-After.' },
  { code: 'INVALID_SCRAPE_URL', http: 400, retryable: false, description: 'URL de scrape inválida.' },
  { code: 'INVALID_SCRAPE_URL_PROTOCOL', http: 400, retryable: false, description: 'scrapeUrl precisa usar HTTPS, exceto localhost em desenvolvimento.' },
  { code: 'SCRAPE_URL_NOT_ALLOWED', http: 403, retryable: false, description: 'Host de scrape fora da allowlist do deploy.' },
  { code: 'INVALID_SCRAPE_URL_PATH', http: 400, retryable: false, description: 'scrapeUrl precisa apontar para /api/scrape.' },
  { code: 'INVALID_FIELDS', http: 400, retryable: false, description: 'Parâmetro fields/dataFields contém caminho inválido ou perigoso.' },
  { code: 'INVALID_VIEW', http: 400, retryable: false, description: 'View desconhecida.' },
  { code: 'INVALID_PROFILE', http: 400, retryable: false, description: 'Profile desconhecido.' },
  { code: 'ROUTE_NOT_FOUND', http: 404, retryable: false, description: 'Rota não encontrada no router interno.' },
  { code: 'NOT_READY', http: 503, retryable: true, description: 'Readiness local falhou.' },
  { code: 'SCRAPE_SELECTOR_ERROR', http: 400, retryable: false, description: 'Seletor customizado inválido/incompatível.' },
  { code: 'SOURCE_UNAVAILABLE', http: 502, retryable: true, description: 'Fonte externa indisponível ou sem dados úteis.' },
  { code: 'SOURCE_BLOCKED', http: 502, retryable: true, description: 'Fonte externa bloqueou/limitou resposta.' },
  { code: 'SOURCE_TIMEOUT', http: 504, retryable: true, description: 'Fonte externa demorou além do timeout.' },
  { code: 'SOURCE_DRIFT_DETECTED', http: 206, retryable: true, description: 'Fonte mudou estrutura/seletores e acionou fallback/confiança reduzida.' },
  { code: 'SYNC_DISABLED_FREE_ONLY', http: 410, retryable: false, description: 'Endpoint legado sync desativado na build free-only.' },
  { code: 'ADMIN_TOKEN_NOT_CONFIGURED', http: 503, retryable: false, description: 'Endpoint admin protegido desativado sem token.' },
  { code: 'ADMIN_UNAUTHORIZED', http: 401, retryable: false, description: 'Token administrativo ausente ou inválido.' },
  { code: 'INTERNAL_ERROR', http: 500, retryable: true, description: 'Erro interno sanitizado.' },
]);

export const ENV_CATALOG = Object.freeze([
  { name: 'VALORAE_PUBLIC_BASE_URL', required: false, category: 'deploy', example: 'https://seu-proxy.vercel.app', description: 'Base pública usada em URLs internas e CORS strict.' },
  { name: 'PUBLIC_BASE_URL', required: false, category: 'deploy', description: 'Alias legado para base pública.' },
  { name: 'VALORAE_CORS_ALLOW_ORIGINS', required: false, category: 'security', example: 'https://app.exemplo.com,https://admin.exemplo.com', description: 'Allowlist CORS separada por vírgula.' },
  { name: 'VALORAE_CORS_STRICT', required: false, category: 'security', example: '1', description: 'Quando ativo, usa allowlist/base pública em vez de wildcard.' },
  { name: 'VALORAE_RATE_LIMIT_MAX', required: false, category: 'security', defaultValue: '90', description: 'Limite global por rota/IP por janela.' },
  { name: 'VALORAE_RATE_LIMIT_WINDOW_MS', required: false, category: 'security', defaultValue: '60000', description: 'Janela do rate limit.' },
  { name: 'VALORAE_RATE_LIMIT_DISABLED', required: false, category: 'security', description: 'Só deve ser usado em dev; produção exige VALORAE_RATE_LIMIT_FORCE_DISABLE=1.' },
  { name: 'VALORAE_RATE_LIMIT_FORCE_DISABLE', required: false, category: 'security', description: 'Override explícito para desligar rate limit em produção; não recomendado.' },
  { name: 'VALORAE_MAX_BODY_BYTES', required: false, category: 'security', defaultValue: '524288', description: 'Limite de corpo para POST.' },
  { name: 'VALORAE_MAX_URL_LENGTH', required: false, category: 'security', defaultValue: '4096', description: 'Limite de URL/query string.' },
  { name: 'VALORAE_MAX_QUERY_PARAMS', required: false, category: 'security', defaultValue: '80', description: 'Limite de parâmetros de query.' },
  { name: 'VALORAE_ALLOWED_SCRAPE_HOSTS', required: false, category: 'scrape', description: 'Hosts extras permitidos para scrape próprio, se habilitado.' },
  { name: 'VALORAE_ALLOW_CLIENT_SCRAPE_URL', required: false, category: 'scrape', defaultValue: '0', description: 'Permite cliente definir scrapeUrl; manter desligado em produção.' },
  { name: 'VALORAE_FETCH_TIMEOUT_MS', required: false, category: 'performance', defaultValue: '12000', description: 'Timeout de fetch externo.' },
  { name: 'VALORAE_MAX_HTML_CHARS', required: false, category: 'performance', defaultValue: '3200000', description: 'Máximo de HTML processado por resposta.' },
  { name: 'VALORAE_ADMIN_TOKEN', required: false, category: 'admin', description: 'Ativa rotas admin protegidas.' },
  { name: 'ADMIN_TOKEN', required: false, category: 'admin', description: 'Alias legado de token admin.' },
  { name: 'VALORAE_ADMIN_ALLOW_QUERY_TOKEN', required: false, category: 'admin', defaultValue: '0', description: 'Permite token admin via query apenas fora de produção; prefira Authorization Bearer ou X-Valorae-Admin-Token.' },
  { name: 'VALORAE_ADMIN_ALLOW_QUERY_TOKEN_IN_PRODUCTION', required: false, category: 'admin', defaultValue: '0', description: 'Override explícito e não recomendado para aceitar token admin via query em produção.' },
  { name: 'VALORAE_VERBOSE_ERRORS', required: false, category: 'debug', description: 'Exibe detalhes de erro; usar apenas em dev.' },
]);

export const SOURCE_PROVIDERS = Object.freeze([
  { name: 'Investidor10', kind: 'html/api', criticalFields: ['dividendYield','pvp','pl','roe','vacanciaFisica','ultimoRendimento'], driftSensitive: true },
  { name: 'StatusInvest', kind: 'html-fallback', criticalFields: ['precoAtual','dividendYield','pvp','pl'], driftSensitive: true },
  { name: 'YahooChart', kind: 'json', criticalFields: ['precoAtual','historico','variacaoDay'], driftSensitive: false },
  { name: 'GoogleNews', kind: 'rss', criticalFields: ['items'], driftSensitive: false },
  { name: 'BCB', kind: 'json', criticalFields: ['ipca'], driftSensitive: false },
]);

export const SCHEMA_CATALOG = Object.freeze({
  asset: { version: 'asset-v21.5.13', required: ['version','ticker','type','status','results','normalized','quality','sourceReport'], volatile: ['requestId','generatedAt','checkedAt'], description: 'Contrato de ativo com dados brutos, normalizados, qualidade e fontes.' },
  portfolio: { version: 'portfolio-v21.5.13', required: ['summary','positions','allocation','income','risk','intelligence'], volatile: ['requestId','generatedAt'], description: 'Contrato de carteira com inteligência, concentração, renda, risco e planos.' },
  envelope: { version: 'envelope-v2.1', required: ['version','status','data'], volatile: ['requestId','generatedAt'], description: 'Envelope v2 para respostas padronizadas.' },
  error: { version: 'error-v1.2', required: ['version','status','code','error'], volatile: ['requestId'], description: 'Contrato de erro sanitizado.' },
});

export const RECOMMENDED_IMPROVEMENTS_STATUS = Object.freeze({
  implementedIn: '21.5.13',
  scope: 'Somente melhorias recomendadas e viáveis; itens não recomendados/condicionais ficaram fora do runtime.',
  categories: ['release-maturity','source-reliability','cache-performance','portfolio-intelligence','parser-compat','api-contract','security','tests-audits','sdks','observability','data-quality','inspector','maintenance'],
});
