import { ValoraeEngine } from '../lib/Valorae-engine.js';
import { sendJson } from '../lib/performance/http.js';

const ROUTES = {
  '/health': () => import('./health.js'),
  '/ready': () => import('./ready.js'),
  '/manifest': () => import('./manifest.js'),
  '/env': () => import('./env.js'),
  '/schema': () => import('./schema.js'),
  '/source/status': () => import('./source/status.js'),
  '/asset': () => import('./asset.js'),
  '/assets': () => import('./assets.js'),
  '/compare': () => import('./compare.js'),
  '/scrape': () => import('./scrape.js'),
  '/batch-scrape': () => import('./batch-scrape.js'),
  '/cache/stats': () => import('./cache/stats.js'),
  '/news': () => import('./news.js'),
  '/sync': () => import('./sync.js'),
  '/openapi': () => import('./openapi.js'),
  '/fields': () => import('./fields.js'),
  '/errors': () => import('./errors.js'),
  '/asset/history': () => import('./asset/history.js'),
  '/asset/dividends': () => import('./asset/dividends.js'),
  '/asset/next-dividend': () => import('./asset/next-dividend.js'),
  '/market/indices': () => import('./market/indices.js'),
  '/market/ipca': () => import('./market/ipca.js'),
  '/market/rankings': () => import('./market/rankings.js'),
  '/portfolio/analyze': () => import('./portfolio/analyze.js'),
  '/portfolio/allocation': () => import('./portfolio/allocation.js'),
  '/portfolio/dividends': () => import('./portfolio/dividends.js'),
  '/portfolio/events': () => import('./portfolio/events.js'),
  '/portfolio/history': () => import('./portfolio/history.js'),
  '/portfolio/income': () => import('./portfolio/income.js'),
  '/portfolio/next-dividends': () => import('./portfolio/next-dividends.js'),
  '/portfolio/rebalance': () => import('./portfolio/rebalance.js'),
  '/portfolio/risk': () => import('./portfolio/risk.js'),
  '/portfolio/summary': () => import('./portfolio/summary.js'),
  '/portfolio/transactions': () => import('./portfolio/transactions.js'),
  '/watchlist/analyze': () => import('./watchlist/analyze.js'),
  '/admin/status': () => import('./admin/status.js'),
  '/admin/cache': () => import('./admin/cache.js'),
  '/compat/scraper4': () => import('./compat/scraper4.js'),
};

const LEGACY_ALIASES = {
  '/cotacao': '/asset',
  '/ativo': '/asset',
  '/ativos': '/assets',
  '/ranking': '/market/rankings',
  '/rankings': '/market/rankings',
  '/carteira': '/portfolio/analyze',
  '/portfolio': '/portfolio/analyze',
  '/scraper4': '/compat/scraper4',
  '/scraper': '/compat/scraper4',
};

function parseUrl(req) {
  return new URL(req?.url || '/api', 'https://valorae.local');
}

function stripApiPrefix(pathname) {
  if (pathname === '/api') return '/';
  if (pathname.startsWith('/api/')) return pathname.slice('/api'.length) || '/';
  return pathname || '/';
}

function normalizePath(req) {
  const parsed = parseUrl(req);
  let path = stripApiPrefix(parsed.pathname);
  if (path === '/' || path === '') return { path: '/', apiVersion: 'v1', parsed };
  const m = path.match(/^\/(v[12])(?:\/(.*))?$/);
  let apiVersion = 'v1';
  if (m) {
    apiVersion = m[1];
    path = `/${m[2] || ''}`;
  }
  path = path.replace(/\/+$/, '') || '/';
  return { path: LEGACY_ALIASES[path] || path, apiVersion, parsed };
}

function queryFromSearchParams(params) {
  const out = {};
  for (const [key, value] of params.entries()) {
    if (out[key] === undefined) out[key] = value;
    else if (Array.isArray(out[key])) out[key].push(value);
    else out[key] = [out[key], value];
  }
  return out;
}

function mergeQuery(req, apiVersion, parsed) {
  const fromUrl = queryFromSearchParams((parsed || parseUrl(req)).searchParams);
  req.query = { ...fromUrl, ...(req.query || {}) };
  if (apiVersion === 'v2') {
    req.query.envelope = req.query.envelope ?? '1';
    req.query.apiVersion = 'v2';
  }
}

export async function dispatchRoute(req, res) {
  const { path, apiVersion, parsed } = normalizePath(req);
  if (path === '/') {
    const mod = await import('../api/index.js');
    return mod.default(req, res);
  }
  const load = ROUTES[path];
  if (!load) {
    return sendJson(req, res, {
      version: ValoraeEngine.version,
      status: 'NOT_FOUND',
      error: 'Rota não encontrada no router interno Valorae.',
      path,
      hint: 'Consulte /api/openapi, /api/fields e /api/errors.',
    }, { status: 404, engineVersion: ValoraeEngine.version, profile: 'router', cacheControl: 'private, max-age=30' });
  }
  mergeQuery(req, apiVersion, parsed);
  const mod = await load();
  return mod.default(req, res);
}

export function routeManifest() {
  return { routes: Object.keys(ROUTES).sort(), legacyAliases: LEGACY_ALIASES, physicalFunctions: ['api/index.js','api/[...path].js'] };
}

export const _test = { parseUrl, queryFromSearchParams, stripApiPrefix };
