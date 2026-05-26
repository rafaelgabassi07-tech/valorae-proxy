import { deriveFiiPortfolioStats, deriveStockFinancialSummary, parsePercent } from '../normalizers/financial.js';

export const VALORAE_SCHEMA_VERSION = '2026-05-26-v20.2';

const REQUIRED_BY_TYPE = {
  FII: ['ticker', 'type', 'results', 'results.dividendYield', 'results.pvp', 'results.historicoDividendos|results.dividendos.historico|results.sections.dividendos.historico', 'results.historicoIndicadores|results.sections.historicoIndicadores', 'results.numeroCotistas|results.informacoesFundo.numeroCotistas|results.sections.informacoesFundo.numeroCotistas'],
  ACAO: ['ticker', 'type', 'results', 'results.precoAtual', 'results.pl', 'results.pvp', 'results.dividendYield', 'results.cnpj|results.dadosEmpresa.cnpj', 'results.historicoDividendos|results.dividendos.historico'],
  ETF: ['ticker', 'type', 'results'],
  BDR: ['ticker', 'type', 'results'],
  STOCK: ['ticker', 'type', 'results'],
};

function getPath(obj, path) {
  return String(path).split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function hasAnyPath(obj, spec) {
  return String(spec).split('|').some(path => {
    const value = getPath(obj, path.trim());
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === 'object') return Object.keys(value).length > 0;
    return value !== undefined && value !== null && value !== '';
  });
}

function sourceListFromMetrics(metrics = {}) {
  const raw = String(metrics.source || '');
  const out = [];
  for (const token of raw.split('+').map(x => x.trim()).filter(Boolean)) {
    if (!out.includes(token)) out.push(token);
  }
  const tried = Array.isArray(metrics.sourcesTried) ? metrics.sourcesTried : [];
  for (const s of tried) {
    const name = s?.name || s?.provider;
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

function suspectFiiFields(payload) {
  const r = payload.results || {};
  const suspects = [];
  const dy = r.dividendYield || r.dividendos?.dividendYield;
  const yield12m = r.yield12m || r.sections?.distribuicoes12m?.yield12m;
  if (dy && /^8(?:,00?)?%?$/.test(String(dy).trim()) && yield12m && String(yield12m) !== String(dy)) {
    suspects.push({ field: 'dividendYield', value: dy, reason: 'Parece critério de checklist; yield12m disponível é mais confiável.', suggestedValue: yield12m });
  }
  if (r.logoUrl && /assets\/front\/images\/logo\.webp/i.test(String(r.logoUrl))) {
    suspects.push({ field: 'logoUrl', value: r.logoUrl, reason: 'Logo genérico do Investidor10.' });
  }
  if (r.sobre && /Tudo sobre finanças, investimentos/i.test(String(r.sobre))) {
    suspects.push({ field: 'sobre', value: r.sobre.slice(0, 120), reason: 'Descrição genérica de site, não do ativo.' });
  }
  if (r.numeroCotistas !== undefined && Number(r.numeroCotistas) <= 1000) {
    suspects.push({ field: 'numeroCotistas', value: r.numeroCotistas, reason: 'Valor baixo demais; pode ser regra de checklist em vez do número real.' });
  }
  for (const k of ['taxaAdministracao','tipoFundo','segmentoFii','mandato','tipoGestao','prazoDuracao']) {
    const v = r[k] || r.informacoesFundo?.[k] || r.sections?.informacoesFundo?.[k];
    if (typeof v === 'string' && /\b(VACÂNCIA|VACANCIA|NUMERO DE COTISTAS|COTAS EMITIDAS|CNPJ)\b/i.test(v)) {
      suspects.push({ field: k, value: v.slice(0, 160), reason: 'Campo parece concatenado com rótulos seguintes.' });
    }
  }
  return suspects;
}

function suspectAcaoFields(payload) {
  const r = payload.results || {};
  const suspects = [];
  const sem = r.indicadoresFundamentalistas?.semComparativos || {};
  if (r.margemLiquida && sem.margemLiquida && String(r.margemLiquida) !== String(sem.margemLiquida)) {
    suspects.push({ field: 'margemLiquida', value: r.margemLiquida, reason: 'Diverge do bloco estruturado de indicadores.', suggestedValue: sem.margemLiquida });
  }
  for (const key of ['pCapGiro','pAtivoCircLiq']) {
    if (r[key] !== undefined && sem[key] !== undefined && Number(r[key]) !== Number(sem[key])) {
      suspects.push({ field: key, value: r[key], reason: 'Diverge do bloco estruturado de indicadores.', suggestedValue: sem[key] });
    }
  }
  if (r.precoAtual !== undefined && (Number(r.precoAtual) <= 0 || Number(r.precoAtual) > 100000)) {
    suspects.push({ field: 'precoAtual', value: r.precoAtual, reason: 'Cotação fora de faixa plausível.' });
  }
  return suspects;
}

export function enrichAssetResults(ticker, type, results = {}) {
  const out = { ...(results || {}) };
  const sections = { ...(out.sections || {}) };

  if (type === 'FII') {
    const portfolioStats = deriveFiiPortfolioStats(out);
    if (portfolioStats) {
      out.portfolioStats = portfolioStats;
      sections.portfolioStats = portfolioStats;
    }
    out.indicadores = {
      ...(out.indicadores || {}),
      pvp: out.pvp,
      dividendYield: out.dividendYield,
      dyMedio5a: out.dyMedio5a,
      yield1m: out.yield1m,
      yield3m: out.yield3m,
      yield6m: out.yield6m,
      yield12m: out.yield12m,
      ultimoRendimento: out.ultimoRendimento,
      valorPatrimonialCota: out.valorPatrimonial,
      vacanciaFisica: out.vacanciaFisica,
      liquidezDiaria: out.liquidezDiaria,
    };
    Object.keys(out.indicadores).forEach(k => out.indicadores[k] === undefined && delete out.indicadores[k]);
  } else {
    out.cotacao = {
      ...(out.cotacao || {}),
      precoAtual: out.precoAtual,
      variacaoDay: out.variacaoDay,
      variacao12m: out.variacao12m,
      fonte: out.cotacaoFonte || undefined,
    };
    Object.keys(out.cotacao).forEach(k => out.cotacao[k] === undefined && delete out.cotacao[k]);
    out.indicadores = {
      ...(out.indicadores || {}),
      pl: out.pl,
      pvp: out.pvp,
      psr: out.psr,
      pEbitda: out.pEbitda,
      pEbit: out.pEbit,
      pAtivo: out.pAtivo,
      pCapGiro: out.pCapGiro,
      pAtivoCircLiq: out.pAtivoCircLiq,
      evEbitda: out.evEbitda,
      evEbit: out.evEbit,
      lpa: out.lpa,
      vpa: out.vpa || out.valorPatrimonial,
      dividendYield: out.dividendYield,
      dyMedio5a: out.dyMedio5a,
      payout: out.payout,
      margemLiquida: out.margemLiquida,
      margemBruta: out.margemBruta,
      margemEbit: out.margemEbit,
      margemEbitda: out.margemEbitda,
      roe: out.roe,
      roic: out.roic,
      roa: out.roa,
      giroAtivos: out.giroAtivos,
      liquidezCorrente: out.liquidezCorrente,
      dividaLiquidaPatrimonio: out.dividaLiquidaPatrimonio,
      dividaLiquidaEbitda: out.dividaLiquidaEbitda,
      dividaLiquidaEbit: out.dividaLiquidaEbit,
      dividaBrutaPatrimonio: out.dividaBrutaPatrimonio,
      patrimonioAtivos: out.patrimonioAtivos,
      passivosAtivos: out.passivosAtivos,
      cagrReceitas5a: out.cagrReceitas5a,
      cagrLucros5a: out.cagrLucros5a,
    };
    Object.keys(out.indicadores).forEach(k => out.indicadores[k] === undefined && delete out.indicadores[k]);

    const financialSummary = deriveStockFinancialSummary(out);
    if (financialSummary) {
      out.financialSummary = financialSummary;
      sections.financialSummary = financialSummary;
    }
  }

  if (Object.keys(sections).length) out.sections = sections;
  return out;
}

export function buildSchemaValidation(payload = {}) {
  const type = String(payload.type || payload._meta?.tipo || '').toUpperCase() || 'ACAO';
  const required = REQUIRED_BY_TYPE[type] || REQUIRED_BY_TYPE.ACAO;
  const missing = required.filter(spec => !hasAnyPath(payload, spec));
  const suspicious = type === 'FII' ? suspectFiiFields(payload) : suspectAcaoFields(payload);
  const errors = [];
  if (!payload.ticker && !payload._meta?.ticker) errors.push({ code: 'MISSING_TICKER', message: 'Ticker ausente.' });
  if (!payload.results || typeof payload.results !== 'object') errors.push({ code: 'MISSING_RESULTS', message: 'Objeto results ausente.' });

  const fieldsChecked = required.length;
  const ok = errors.length === 0 && missing.length === 0 && suspicious.length === 0;
  return {
    schemaVersion: VALORAE_SCHEMA_VERSION,
    ok,
    type,
    fieldsChecked,
    required,
    missing,
    suspicious,
    errors,
  };
}

export function buildSourceReport(payload = {}) {
  const metrics = payload.metrics || {};
  const sourcesUsed = sourceListFromMetrics(metrics);
  const sourcesTried = Array.isArray(metrics.sourcesTried) ? metrics.sourcesTried.map(s => ({
    name: s.name,
    provider: s.provider,
    status: s.status,
    ok: !!s.ok,
    blocked: !!s.blocked,
    htmlLength: s.htmlLength,
    error: s.error,
  })) : [];
  return {
    sourcesUsed,
    sourcesTried,
    primarySource: sourcesUsed[0] || null,
    htmlParsed: metrics.scrapeStatus === 'HTML_PARSED',
    usedInternalApis: sourcesUsed.includes('Investidor10InternalAPIs'),
    usedYahoo: sourcesUsed.includes('YahooChart'),
    usedGoogleNews: !!payload.newsStatus?.source,
  };
}

export function augmentQualityReport(payload = {}) {
  const base = payload.quality || { score: 0, grade: 'D', checks: [], penalties: [] };
  const validation = payload.validation || buildSchemaValidation(payload);
  const sourceReport = payload.sourceReport || buildSourceReport(payload);
  const missing = validation.missing || [];
  const suspect = validation.suspicious || [];
  let score = Number(base.score || 0);
  score -= Math.min(12, missing.length * 3);
  score -= Math.min(12, suspect.length * 4);
  if (sourceReport.usedInternalApis) score += 3;
  if (sourceReport.usedYahoo) score += 1;
  if (sourceReport.sourcesUsed.length >= 3) score += 2;
  score = Math.max(0, Math.min(100, Math.round(score)));
  return {
    ...base,
    score,
    grade: score >= 92 ? 'A+' : score >= 85 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : 'D',
    schemaVersion: VALORAE_SCHEMA_VERSION,
    confidence: Number((score / 100).toFixed(2)),
    missing,
    suspect,
    sourcesUsed: sourceReport.sourcesUsed,
    summary: missing.length || suspect.length
      ? `Qualidade ${score}/100 com ${missing.length} campo(s) essencial(is) ausente(s) e ${suspect.length} suspeito(s).`
      : `Qualidade ${score}/100; schema essencial atendido.`,
  };
}

export function buildDebugInfo(payload = {}, context = {}) {
  return {
    schemaVersion: VALORAE_SCHEMA_VERSION,
    engineVersion: payload.version,
    ticker: payload.ticker,
    type: payload.type,
    mode: payload.mode,
    cacheStatus: payload.cacheStatus,
    coverage: payload.coverage,
    validation: payload.validation,
    quality: payload.quality,
    sourceReport: payload.sourceReport,
    timingMs: {
      total: payload.metrics?.totalTimeMs,
    },
    foundKeys: payload.metrics?.foundKeys || [],
    foundKeysCount: payload.metrics?.foundKeysCount || 0,
    sourcesTried: payload.metrics?.sourcesTried || [],
    warnings: payload.warnings || [],
    context,
  };
}
