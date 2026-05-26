import { ValoraeEngine } from '../lib/Valorae-engine.js';
import { sendJson } from '../lib/performance/http.js';
import { beginRoute } from '../lib/http/route.js';

const version = ValoraeEngine.version;

function qp(name, schema = { type: 'string' }, description = '', required = false) {
  return { name, in: 'query', required, description, schema };
}

function slug(value = '') { return String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 64) || 'valorae_operation'; }

function op(summary, parameters = [], requestBody = undefined, tags = ['Valorae']) {
  const base = {
    tags,
    operationId: slug(`${tags[0] || 'Valorae'} ${summary}`),
    summary,
    parameters,
    responses: {
      200: { description: 'Resposta JSON Valorae', content: { 'application/json': { schema: { type: 'object' } } } },
      400: { description: 'Erro de entrada', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
      429: { description: 'Rate limit', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
      500: { description: 'Erro interno sanitizado', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
    },
  };
  if (requestBody) base.requestBody = requestBody;
  return base;
}

const assetParams = [
  qp('ticker', { type: 'string', example: 'PETR4' }, 'Ticker B3 sem .SA.', true),
  qp('mode', { type: 'string', example: 'super' }, 'Modo de coleta/compatibilidade.'),
  qp('view', { type: 'string', enum: ['instant','ultra','quote','card','wallet','detail','analysis','compact','standard','full'] }, 'Nível de payload; aliases são resolvidos internamente.'),
  qp('profile', { type: 'string', enum: ['instant','ultra','quote','card','wallet','analysis','fast','standard','deep','portfolio'] }, 'Perfil de performance; aliases são resolvidos internamente.'),
  qp('includeNews', { type: 'boolean' }, 'Inclui notícias via RSS quando disponível.'),
  qp('fields', { type: 'string', example: 'ticker,type,status,normalized,quality.score' }, 'Recorte do payload final.'),
  qp('dataFields', { type: 'string', example: 'ticker,normalized,parserResilience' }, 'Recorte do campo data no envelope v2.'),
  qp('lean', { type: 'boolean' }, 'Remove blocos pesados.'),
  qp('maxItems', { type: 'integer', minimum: 1, maximum: 500 }, 'Limita arrays recursivamente.'),
  qp('nocache', { type: 'boolean' }, 'Ignora cache em memória quando suportado.'),
];

const tickersParam = qp('tickers', { type: 'string', example: 'PETR4,VALE3,GARE11' }, 'Lista CSV de tickers.', true);
const postJsonBody = { required: false, content: { 'application/json': { schema: { type: 'object' } } } };

const paths = {
  '/api/v1/health': { get: op('Saúde, versão e capacidades via router v1', [], undefined, ['System']) },
  '/api/v1/ready': { get: op('Readiness de lançamento sem chamadas externas', [], undefined, ['System']) },
  '/api/v1/manifest': { get: op('Manifesto de capacidades, rotas, free-only e compatibilidade', [], undefined, ['System']) },
  '/api/v1/env': { get: op('Catálogo seguro de variáveis de ambiente e status de configuração', [], undefined, ['System']) },
  '/api/v1/schema': { get: op('Catálogo de schemas estáveis e versões de contrato', [], undefined, ['System']) },
  '/api/v1/source/status': { get: op('Status local de confiabilidade das fontes externas sem chamada de rede', [], undefined, ['System']) },
  '/api/v1/asset': { get: op('Dados de ativo sem envelope', assetParams, undefined, ['Assets']), post: op('Dados de ativo via JSON sem envelope', [], postJsonBody, ['Assets']) },
  '/api/v2/asset': { get: op('Dados de ativo com envelope v2', assetParams, undefined, ['Assets']), post: op('Dados de ativo via JSON com envelope v2', [], postJsonBody, ['Assets']) },
  '/api/v1/assets': { get: op('Batch de ativos via router v1', [tickersParam, ...assetParams.filter(p => p.name !== 'ticker')], undefined, ['Assets']), post: op('Batch de ativos via JSON no router v1', [], postJsonBody, ['Assets']) },
  '/api/v1/compare': { get: op('Compara tickers e ranqueia por score, valor, renda e qualidade', [tickersParam, qp('profile', { type: 'string', enum: ['dividendos','conservador','crescimento','valor','rendaFii'] })], undefined, ['Market']), post: op('Compara tickers via JSON', [], postJsonBody, ['Market']) },
  '/api/v1/market/rankings': { get: op('Rankings de ações/FIIs', [qp('type', { type: 'string', enum: ['ACAO','FII'], default: 'ACAO' }), qp('maxItems', { type: 'integer', default: 20 })], undefined, ['Market']) },
  '/api/v1/market/indices': { get: op('Índices de mercado', [], undefined, ['Market']) },
  '/api/v1/market/ipca': { get: op('IPCA/BCB', [], undefined, ['Market']) },
  '/api/v1/asset/history': { get: op('Cotação histórica via Yahoo Chart', [qp('ticker', { type: 'string' }, '', true), qp('range', { type: 'string', default: '1Y' })], undefined, ['Assets']) },
  '/api/v1/asset/dividends': { get: op('Dividendos por ativo', [qp('ticker', { type: 'string' }, '', true)], undefined, ['Assets']) },
  '/api/v1/asset/next-dividend': { get: op('Próximo dividendo/provento', [qp('ticker', { type: 'string' }, '', true)], undefined, ['Assets']) },
  '/api/v1/scrape': { get: op('Scrape seguro com seletores customizados simples', [qp('url', { type: 'string', format: 'uri' }), qp('selector', { type: 'string' })], undefined, ['Scrape']), post: op('Scrape seguro via JSON com selectors', [], postJsonBody, ['Scrape']) },
  '/api/v1/batch-scrape': { post: op('Batch scrape com deduplicação, fallback, selectors por job e sourceDrift', [], postJsonBody, ['Scrape']) },
  '/api/v1/cache/stats': { get: op('Métricas de cache em memória, hit/miss, in-flight e stores', [], undefined, ['System']) },
  '/api/v1/portfolio/analyze': { get: op('Análise de carteira por parâmetros simples', [], undefined, ['Portfolio']), post: op('Análise completa de carteira', [], { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PortfolioAnalyzeRequest' } } } }, ['Portfolio']) },
  '/api/v1/portfolio/allocation': { post: op('Alocação por ticker, classe, setor e conta', [], postJsonBody, ['Portfolio']) },
  '/api/v1/portfolio/income': { post: op('Renda passiva estimada, DY e calendário de proventos', [], postJsonBody, ['Portfolio']) },
  '/api/v1/portfolio/risk': { post: op('Concentração, diversificação e flags de risco', [], postJsonBody, ['Portfolio']) },
  '/api/v1/portfolio/rebalance': { post: op('Rebalanceamento por classe ou ticker', [], postJsonBody, ['Portfolio']) },
  '/api/v1/portfolio/history': { get: op('Histórico consolidado da carteira', [], undefined, ['Portfolio']), post: op('Histórico consolidado via JSON', [], postJsonBody, ['Portfolio']) },
  '/api/v1/watchlist/analyze': { get: op('Análise de watchlist', [tickersParam], undefined, ['Portfolio']), post: op('Análise de watchlist via JSON', [], postJsonBody, ['Portfolio']) },
  '/api/v1/fields': { get: op('Catálogo de campos estáveis e controles de payload', [], undefined, ['System']) },
  '/api/v1/errors': { get: op('Catálogo de erros', [], undefined, ['System']) },
  '/api/v1/openapi': { get: op('Especificação OpenAPI', [], undefined, ['System']) },
  '/api/compat/scraper4': { get: op('Compatibilidade com Scraper (4).js via query string', [], undefined, ['Compat']), post: op('Compatibilidade com Scraper (4).js via JSON', [], postJsonBody, ['Compat']) },
  '/api/sync': { get: op('Endpoint legado desativado na build free-only', [], undefined, ['Compat']), post: op('Endpoint legado desativado na build free-only', [], postJsonBody, ['Compat']) },
};

export default async function handler(req, res) {
  const route = beginRoute(req, res, { version, methods: ['GET'], route: 'openapi', rateMax: Number(process.env.VALORAE_RATE_LIMIT_HEALTH_MAX || 180), profile: 'openapi', cacheControl: 'private, max-age=60' });
  if (route.done) return;
  return sendJson(req, res, {
    openapi: '3.1.0',
    info: {
      title: 'Valorae Investment Data API',
      version,
      description: 'API HTTP/JSON para ativos, mercado, comparação, dividendos, watchlist e carteira. Compatível com GitHub/Vercel gratuito, router interno v1/v2 e apenas duas Functions físicas.'
    },
    servers: [{ url: process.env.VALORAE_PUBLIC_BASE_URL || 'https://valorae-proxy.vercel.app' }],
    paths,
    components: {
      schemas: {
        FinancialField: { type: 'object', properties: { display: { type: 'string' }, value: { type: ['number','null'] }, unit: { type: 'string' }, source: { type: 'string' }, confidence: { type: 'number', minimum: 0, maximum: 1 } } },
        AssetPayload: { type: 'object', properties: { version: { type: 'string' }, schemaVersion: { type: 'string' }, status: { type: 'string', enum: ['OK','PARTIAL','ERROR'] }, ticker: { type: 'string' }, type: { type: 'string' }, results: { type: 'object' }, normalized: { type: 'object', additionalProperties: { $ref: '#/components/schemas/FinancialField' } }, quality: { type: 'object' }, parserResilience: { type: 'object' } } },
        EnvelopeV2: { type: 'object', properties: { ok: { type: 'boolean' }, schemaVersion: { const: 'envelope-v2' }, version: { type: 'string' }, requestId: { type: 'string' }, data: { type: 'object' }, meta: { type: 'object' } } },
        Position: { type: 'object', properties: { ticker: { type: 'string' }, quantity: { type: 'number' }, averagePrice: { type: 'number' }, currentPrice: { type: 'number' }, currentValue: { type: 'number' }, investedValue: { type: 'number' }, targetPercent: { type: 'number' }, type: { type: 'string', examples: ['ACAO','FII','ETF','CASH','RENDA_FIXA'] }, annualRatePercent: { type: 'number', description: 'Taxa anual informada para renda fixa/caixa remunerado.' }, indexer: { type: 'string', examples: ['CDI','IPCA','PRE'] }, liquidityDays: { type: 'number' }, maturityDate: { type: 'string' }, issuer: { type: 'string' }, taxExempt: { type: 'boolean' }, objective: { type: 'string' }, account: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } } },
        PortfolioAnalyzeRequest: { type: 'object', properties: { positions: { type: 'array', items: { $ref: '#/components/schemas/Position' } }, targetsByType: { type: 'object' }, targetsByTicker: { type: 'object' }, cashAvailable: { type: 'number' }, monthlyContribution: { type: 'number' }, projectionYears: { type: 'number' }, expectedReturnAnnualPercent: { type: 'number' }, inflationAnnualPercent: { type: 'number' }, view: { enum: ['instant','ultra','quote','card','wallet','detail','analysis','compact','standard','full'] }, profile: { enum: ['instant','ultra','quote','card','wallet','analysis','fast','standard','deep','portfolio'] } } },
        PortfolioIntelligence: { type: 'object', properties: { incomeCalendar: { type: 'object' }, incomeCoverage: { type: 'object' }, liquidity: { type: 'array', items: { type: 'object' } }, goalProjection: { type: 'object' }, dataCompleteness: { type: 'object' }, taxPlanner: { type: 'object' }, technologyReadiness: { type: 'object' }, concentrationMap: { type: 'object' }, positionRanking: { type: 'object' }, passiveIncomeProjection: { type: 'object' }, rebalanceRoadmap: { type: 'object' }, objectiveProgress: { type: 'object' }, portfolioNarrative: { type: 'object' }, actionPlan: { type: 'array', items: { type: 'object' } } } },
        SourceDriftReport: { type: 'object', properties: { sourceDrift: { type: 'boolean' }, severity: { type: 'string' }, selectorCoverage: { type: 'number' }, changedSelectors: { type: 'array', items: { type: 'string' } }, recommendation: { type: 'string' } } },
        CacheStats: { type: 'object', properties: { driver: { type: 'object' }, caches: { type: 'object' }, providers: { type: 'object' }, freeOnly: { type: 'boolean' } } },
        Readiness: { type: 'object', properties: { status: { enum: ['READY','NOT_READY'] }, ready: { type: 'boolean' }, checks: { type: 'array', items: { type: 'object' } }, freeOnly: { type: 'boolean' } } },
        ValoraeManifest: { type: 'object', properties: { release: { type: 'string' }, freeOnly: { type: 'boolean' }, physicalFunctions: { type: 'array', items: { type: 'string' } }, routes: { type: 'array', items: { type: 'string' } }, capabilities: { type: 'object' } } },
        EnvCatalog: { type: 'object', properties: { total: { type: 'integer' }, configured: { type: 'integer' }, requiredMissing: { type: 'array', items: { type: 'string' } }, rows: { type: 'array', items: { type: 'object' } } } },
        SourceStatus: { type: 'object', properties: { status: { enum: ['OK','DEGRADED'] }, providers: { type: 'array', items: { type: 'object' } }, sourceReliability: { type: 'object' } } },
        PerformanceProfile: { enum: ['instant','ultra','quote','card','wallet','analysis','fast','standard','deep','portfolio'], description: 'Aliases públicos e perfis internos suportados.' },
        ErrorResponse: { type: 'object', properties: { version: { type: 'string' }, requestId: { type: 'string' }, status: { type: 'string' }, code: { type: 'string' }, error: { type: 'string' } } }
      }
    },
    xValorae: {
      version,
      audit: 'v21.5.13: launch readiness, ready/manifest endpoints, auditoria sem tsc externo, source reliability, cache metrics, carteira inteligente e OpenAPI ampliado, mantendo free-only.',
      vercelCompatible: true,
      freeOnly: true,
      physicalFunctions: ['api/index.js','api/[...path].js'],
      router: 'routes/_router.js',
      inspector: '/inspector.html',
    }
  }, { status: 200, engineVersion: version, profile: 'openapi', cachePolicy: 'etag', cacheControl: 'private, max-age=60' });
}
