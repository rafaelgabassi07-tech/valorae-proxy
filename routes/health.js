import { ValoraeEngine, getValoraeRuntimeStats } from '../lib/Valorae-engine.js';
import { sendJson } from '../lib/performance/http.js';
import { securityRuntimeStats } from '../lib/security/guard.js';
import { beginRoute } from '../lib/http/route.js';

export default async function handler(req, res) {
  const route = beginRoute(req, res, { version: ValoraeEngine.version, methods: ['GET'], route: 'health', rateMax: Number(process.env.VALORAE_RATE_LIMIT_HEALTH_MAX || 180), profile: 'health', cacheControl: 'private, max-age=5' });
  if (route.done) return;
  return sendJson(req, res, {
    ok: true,
    name: 'Valorae Proxy',
    version: ValoraeEngine.version,
    runtime: 'vercel-node',
    compatibility: {
      github: true,
      vercel: true,
      serverless: true,
      persistentFilesystemRequired: false,
      externalDatabaseRequired: false,
    },
    time: new Date().toISOString(),
    runtimeStats: getValoraeRuntimeStats(),
    security: securityRuntimeStats(),
    capabilities: [
      'audit-hardening-v21.5.1','fields-catalog','errors-catalog','static-inspector','host-header-hardening','free-only-cache-enforcement','professional-refinement-v21.5','universal-financial-normalization','parser-resilience','schema-stability','payload-controls','compare-intelligence','advanced-portfolio-series','scraper-supremacy-audit','custom-selectors','market-cache-inflight','scraper4-get-post-compat','scraper-gap-boost','route-guard','consistent-json-errors','scrape-url-lockdown','security-headers','request-id','rate-limit','admin-status','admin-cache-control',
      'performance-profiles','etag-304','stale-if-error-cache','true-selector-only-fast-profile','adaptive-batch-concurrency',
      'schema-validation','quality-score','field-confidence','valorae-score','debug=1',
      'portfolio-stats','financial-summary','golden-tests','multi-source-fallback','circuit-breaker',
      'market-history','compact-standard-full-views','compare-api',
      'portfolio-analyze','portfolio-allocation','portfolio-income','portfolio-risk','portfolio-rebalance',
      'portfolio-events','portfolio-transactions','portfolio-history','portfolio-next-dividends','watchlist-analyze',
      'b3-calendar','range-aliases-1A-5A-Tudo','investidor10-live-rankings','scraper4-compat-mode'
    ],
    endpoints: [
      '/api/fields',
      '/api/errors',
      '/inspector.html',
      '/api/asset?ticker=PETR4&view=compact&profile=fast',
      '/api/asset?ticker=PETR4&mode=super&includeNews=1&debug=1',
      '/api/assets?tickers=PETR4,GARE11&view=compact',
      '/api/asset/history?ticker=PETR4&range=1Y',
      '/api/asset/history?ticker=PETR4&range=1A',
      '/api/compare?tickers=PETR4,VALE3,PRIO3',
      '/api/market/indices',
      '/api/market/ipca',
      '/api/market/rankings?type=FII',
      '/api/asset/dividends?ticker=PETR4',
      '/api/portfolio/dividends?tickers=PETR4,GARE11',
      '/api/portfolio/next-dividends?tickers=PETR4,GARE11',
      '/api/portfolio/history?tickers=PETR4,GARE11&quantities=100,200&avgPrices=32,8.5&range=1Y',
      '/api/portfolio/analyze',
      '/api/portfolio/summary',
      '/api/portfolio/allocation',
      '/api/portfolio/income',
      '/api/portfolio/risk',
      '/api/portfolio/rebalance',
      '/api/portfolio/events',
      '/api/portfolio/transactions',
      '/api/watchlist/analyze?tickers=PETR4,GARE11,VALE3',
      '/api/scrape?url=https://investidor10.com.br/acoes/petr4/&selectors={...}',
      '/api/news?ticker=PETR4',
      '/api/batch-scrape',
      '/api/compat/scraper4?mode=cotacao_historica&ticker=PETR4&range=1A'
    ],
  }, { status: 200, engineVersion: ValoraeEngine.version, profile: 'health', cachePolicy: 'etag', cacheControl: 'private, max-age=5' });
}
