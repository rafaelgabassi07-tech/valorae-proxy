function clone(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
function pick(obj, keys) { const out = {}; for (const k of keys) if (obj?.[k] !== undefined) out[k] = obj[k]; return out; }

export const VALORAE_VIEW_ALIASES_VERSION = '21.5.13-mature-final-release-free';

export const VIEW_ALIASES = Object.freeze({
  instant: 'compact',
  ultra: 'compact',
  tiny: 'compact',
  quote: 'compact',
  card: 'compact',
  compact: 'compact',
  wallet: 'standard',
  portfolio: 'standard',
  standard: 'standard',
  detail: 'full',
  detailed: 'full',
  analysis: 'full',
  full: 'full',
});

export function resolvePayloadView(view = 'full') {
  const requested = String(view || 'full').toLowerCase().trim();
  const resolved = VIEW_ALIASES[requested] || 'full';
  return {
    requested,
    resolved,
    aliased: requested !== resolved,
    supported: Object.prototype.hasOwnProperty.call(VIEW_ALIASES, requested),
  };
}

export function applyPayloadView(payload = {}, view = 'full', options = {}) {
  const resolution = resolvePayloadView(view);
  const p = clone(payload);
  p.view = resolution.resolved;
  p.requestedView = resolution.requested;
  if (resolution.aliased) p.viewAlias = { requested: resolution.requested, resolved: resolution.resolved };
  if (p.view === 'full') return p;

  const r = p.results || {};
  const common = ['nome','sobre','cotacao','indicadores','precoAtual','variacaoDay','variacao12m','dividendYield','dyMedio5a','pvp','pl','valorPatrimonial','yield12m','ultimoRendimento'];
  if (p.type === 'FII') {
    p.results = {
      ...pick(r, common),
      informacoesFundo: p.view === 'compact' ? pick(r.informacoesFundo || {}, ['segmento','tipoFundo','mandato','tipoGestao','taxaAdministracao','numeroCotistas']) : r.informacoesFundo,
      valorPatrimonial: r.valorPatrimonial,
      rentabilidade: r.rentabilidade,
      portfolioStats: r.portfolioStats,
      dividendos: p.view === 'compact' ? pick(r.dividendos || {}, ['dividendYield','dyMedio5a','ultimoRendimento','yield12m']) : r.dividendos,
    };
  } else {
    p.results = {
      ...pick(r, common),
      dadosEmpresa: p.view === 'compact' ? pick(r.dadosEmpresa || {}, ['nome','setor','segmento','subsetor']) : r.dadosEmpresa,
      informacoesEmpresa: p.view === 'compact' ? pick(r.informacoesEmpresa || {}, ['valorDeMercado','valorDeFirma','patrimonioLiquido','setor','segmento','liquidezMediaDiaria']) : r.informacoesEmpresa,
      comparativoSetor: p.view === 'compact' ? undefined : r.comparativoSetor,
      financialSummary: r.financialSummary,
      rentabilidade: r.rentabilidade,
      dividendos: p.view === 'compact' ? pick(r.dividendos || {}, ['dividendYield','dyMedio5a','ultimoRendimento']) : r.dividendos,
    };
  }
  Object.keys(p.results).forEach(k => p.results[k] === undefined && delete p.results[k]);
  if (p.view === 'compact') {
    delete p.metrics;
    delete p.coverage;
    delete p.sourceReport?.sourcesTried;
    if (!options.includeQuality) { delete p.validation; delete p.quality; delete p.fieldConfidence; }
    delete p.debug;
    if (Array.isArray(p.news)) p.news = p.news.slice(0, 3);
  } else {
    delete p.debug;
  }
  return p;
}
