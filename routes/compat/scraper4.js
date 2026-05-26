import { ValoraeEngine, canonicalizeTicker, inferAssetType, validarTicker } from '../../lib/Valorae-engine.js';
import { fetchYahooHistory } from '../../lib/market/yahoo.js';
import { fetchIndicesSnapshot } from '../../lib/market/indices.js';
import { fetchIpca } from '../../lib/market/bcb.js';
import { fetchInvestidor10Rankings } from '../../lib/market/rankings-i10.js';
import { buildPortfolioHistory, normalizePortfolioPositions } from '../../lib/portfolio/history.js';
import { sendJson } from '../../lib/performance/http.js';
import { beginRoute, boolParam, clampNumber, parseList, resolveSelfScrapeUrl, sendRouteError } from '../../lib/http/route.js';

const MODE_ALIASES = {
  ranking: 'rankings',
  rankings: 'rankings',
  indices: 'indices',
  índices: 'indices',
  ipca: 'ipca',
  fundamentos: 'fundamentos',
  asset: 'fundamentos',
  cotacao_historica: 'cotacao_historica',
  cotação_histórica: 'cotacao_historica',
  historico: 'cotacao_historica',
  histórico: 'cotacao_historica',
  historico_portfolio: 'historico_portfolio',
  historico_12m: 'historico_12m',
  proventos_carteira: 'proventos_carteira',
  proximo_provento: 'proximo_provento',
};
const ALLOWED_MODES = new Set(Object.values(MODE_ALIASES));

function parsePayload(input = {}) {
  if (input.payload && typeof input.payload === 'object') return input.payload;
  if (typeof input.payload === 'string') {
    try { return JSON.parse(input.payload); } catch {}
  }
  const { mode, payload, ...rest } = input;
  return rest;
}
function normalizeMode(raw = '') {
  const key = String(raw || '').trim().toLowerCase();
  return MODE_ALIASES[key] || key;
}

function parseBRDate(d) { const m = String(d || '').match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00Z`) : null; }
function nextDividendFromAsset(asset) {
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const historico = asset.results?.dividendos?.historico || asset.results?.historicoDividendos || [];
  const upcoming = historico.map(x => ({ ...x, _pag: parseBRDate(x.dataPagamento || x.paymentDate) })).filter(x => x._pag && x._pag >= today).sort((a, b) => a._pag - b._pag);
  const next = upcoming[0] || null;
  if (next) delete next._pag;
  return { ticker: asset.ticker, type: asset.type, nextDividend: next, lastDividend: historico[0] || null, dividendYield: asset.results?.dividendos?.dividendYield || asset.results?.dividendYield };
}

function tickerItemsFromPayload(payload = {}) {
  const raw = Array.isArray(payload.fiiList) ? payload.fiiList : parseList(payload.tickers || payload.ticker || payload.fiis || payload.assets);
  return raw.map((item) => {
    if (typeof item === 'string') return { ticker: canonicalizeTicker(item), limit: clampNumber(payload.limit, 12, 1, 120) };
    return { ticker: canonicalizeTicker(item?.ticker || item?.symbol || item?.ativo || ''), limit: clampNumber(item?.limit || payload.limit, 12, 1, 120) };
  }).filter(x => x.ticker);
}

function dividendHistoryFromAsset(asset, limit = 12) {
  const historico = asset?.results?.dividendos?.historico || asset?.results?.historicoDividendos || [];
  return historico.slice(0, Math.max(1, Math.min(Number(limit || 12), 120))).map(item => ({
    symbol: asset.ticker,
    ticker: asset.ticker,
    dataCom: item.dataCom || item.comDate || null,
    paymentDate: item.dataPagamento || item.paymentDate || null,
    value: Number(item.valor ?? item.value ?? 0) || 0,
    type: item.tipo || item.type || 'PROVENTO',
    rawType: item.rawType ?? item.tipo ?? item.type ?? null,
  }));
}

export default async function handler(req, res) {
  const route = beginRoute(req, res, { version: ValoraeEngine.version, methods: ['GET', 'POST'], route: 'compat-scraper4', rateMax: Number(process.env.VALORAE_RATE_LIMIT_COMPAT_MAX || 80), profile: 'compat' });
  if (route.done) return;
  try {
    const mode = normalizeMode(route.input.mode);
    const payload = parsePayload(route.input);
    if (!ALLOWED_MODES.has(mode)) return sendJson(req, res, { version: ValoraeEngine.version, requestId: route.requestId, error: 'Modo inválido.', allowedModes: Array.from(ALLOWED_MODES), aliases: Object.keys(MODE_ALIASES) }, { status: 400, engineVersion: ValoraeEngine.version, profile: 'compat' });

    if (mode === 'indices') return sendJson(req, res, { json: await fetchIndicesSnapshot(), _src: 'valorae-compat' }, { status: 200, engineVersion: ValoraeEngine.version, profile: 'compat', cacheControl: 'private, max-age=60, stale-while-revalidate=300' });
    if (mode === 'ipca') return sendJson(req, res, { json: await fetchIpca({ last: clampNumber(payload.last || payload.limit, 24, 1, 120) }), _src: 'valorae-compat' }, { status: 200, engineVersion: ValoraeEngine.version, profile: 'compat', cacheControl: 'private, max-age=3600, stale-while-revalidate=86400' });
    if (mode === 'rankings') return sendJson(req, res, { json: await fetchInvestidor10Rankings({ bypassCache: boolParam(payload.nocache || payload.refresh) }), _src: 'valorae-compat' }, { status: 200, engineVersion: ValoraeEngine.version, profile: 'compat', cacheControl: 'private, max-age=60, stale-while-revalidate=300' });

    if (mode === 'cotacao_historica') {
      const ticker = canonicalizeTicker(payload.ticker);
      const err = validarTicker(ticker);
      if (err) return sendJson(req, res, { error: err }, { status: 400, engineVersion: ValoraeEngine.version, profile: 'compat' });
      return sendJson(req, res, { json: await fetchYahooHistory(ticker, { range: payload.range || '1Y', interval: payload.interval, limit: payload.limit, timeoutMs: clampNumber(payload.timeoutMs, 9000, 1000, 20000) }), _src: 'valorae-compat' }, { status: 200, engineVersion: ValoraeEngine.version, profile: 'compat', cacheControl: 'private, max-age=60, stale-while-revalidate=300' });
    }

    if (mode === 'fundamentos') {
      const ticker = canonicalizeTicker(payload.ticker);
      const err = validarTicker(ticker);
      if (err) return sendJson(req, res, { error: err }, { status: 400, engineVersion: ValoraeEngine.version, profile: 'compat' });
      const data = await ValoraeEngine.fetchAtivo(ticker, inferAssetType(ticker), { mode: payload.valoraeMode || payload.mode || 'super', view: payload.view || 'full', includeNews: boolParam(payload.includeNews || payload.news), cache: !boolParam(payload.nocache || payload.refresh), valoraeScrapeUrl: resolveSelfScrapeUrl(req, payload), profile: payload.profile || 'standard' });
      return sendJson(req, res, { json: data, _src: 'valorae-compat' }, { status: 200, engineVersion: ValoraeEngine.version, profile: 'compat' });
    }

    if (mode === 'historico_portfolio') {
      const positions = normalizePortfolioPositions(payload);
      const data = await buildPortfolioHistory(positions, { range: payload.range || '1Y', interval: payload.interval, maxConcurrency: clampNumber(payload.maxConcurrency || payload.concurrency, 4, 1, 8), limit: payload.limit });
      return sendJson(req, res, { json: data, _src: 'valorae-compat' }, { status: data.ok ? 200 : 502, engineVersion: ValoraeEngine.version, profile: 'compat' });
    }

    if (mode === 'historico_12m') {
      const ticker = canonicalizeTicker(payload.ticker);
      const err = validarTicker(ticker);
      if (err) return sendJson(req, res, { error: err }, { status: 400, engineVersion: ValoraeEngine.version, profile: 'compat' });
      const asset = await ValoraeEngine.fetchAtivo(ticker, inferAssetType(ticker), { mode: 'super', view: 'full', includeNews: false, cache: !boolParam(payload.nocache || payload.refresh), valoraeScrapeUrl: resolveSelfScrapeUrl(req, payload), profile: 'portfolio' });
      return sendJson(req, res, { json: dividendHistoryFromAsset(asset, payload.limit || 120), _src: 'valorae-compat' }, { status: 200, engineVersion: ValoraeEngine.version, profile: 'compat', cacheControl: 'private, max-age=120, stale-while-revalidate=600' });
    }

    if (mode === 'proximo_provento' || mode === 'proventos_carteira') {
      const itemsInput = mode === 'proximo_provento' ? [{ ticker: payload.ticker, limit: 1 }] : tickerItemsFromPayload(payload);
      const clean = itemsInput.map(x => x.ticker).filter(Boolean);
      const batch = await ValoraeEngine.fetchAtivosBatch(clean, { mode: 'super', view: 'full', includeNews: false, maxConcurrency: clampNumber(payload.maxConcurrency || payload.concurrency, 4, 1, 6), cache: !boolParam(payload.nocache || payload.refresh), valoraeScrapeUrl: resolveSelfScrapeUrl(req, payload), profile: 'portfolio' });
      if (mode === 'proximo_provento') {
        const result = nextDividendFromAsset(batch.assets[0] || {});
        return sendJson(req, res, { json: result, _src: 'valorae-compat' }, { status: 200, engineVersion: ValoraeEngine.version, profile: 'compat' });
      }
      const limitByTicker = Object.fromEntries(itemsInput.map(x => [x.ticker, x.limit]));
      const flat = batch.assets.flatMap(asset => dividendHistoryFromAsset(asset, limitByTicker[asset.ticker] || payload.limit || 12));
      return sendJson(req, res, { json: flat, _src: 'valorae-compat', stats: batch.stats, errors: batch.errors }, { status: 200, engineVersion: ValoraeEngine.version, profile: 'compat', cacheControl: 'private, max-age=120, stale-while-revalidate=600' });
    }
  } catch (err) {
    return sendRouteError(req, res, err, { version: ValoraeEngine.version, requestId: route.requestId, profile: 'compat' });
  }
}
