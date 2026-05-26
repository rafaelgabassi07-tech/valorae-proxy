import { parsePtNumber, parsePercent, round } from './financial.js';

export const UNIVERSAL_NORMALIZER_VERSION = '21.5.13-mature-final-release-free';

const MONEY_KEYS = new Set([
  'precoAtual','valorDeMercado','valorDeFirma','patrimonioLiquido','liquidezDiaria','liquidezMediaDiaria',
  'valorPatrimonial','valorPatrimonialCota','ultimoRendimento','faturamento12m','dividaBruta','dividaLiquida',
  'disponibilidade','ativos','ativoCirculante','totalInvested','currentValue','monthlyEstimate','annualIncomeEstimated',
  'realizedPnL','unrealizedPnL','totalPnL','averagePrice','currentPrice','investedValue','cashAvailable'
]);

const PERCENT_KEYS = new Set([
  'dividendYield','dy','dyMedio5a','yield1m','yield3m','yield6m','yield12m','variacaoDay','variacao12m',
  'roe','roic','roa','margemLiquida','margemBruta','margemEbit','margemEbitda','payout','cagrReceitas5a','cagrLucros5a',
  'vacanciaFisica','vacanciaFinanceira','freeFloat','tagAlong','percentOfPortfolio','targetPercent','gapPercent'
]);

const RATIO_KEYS = new Set([
  'pl','pvp','psr','pEbitda','pEbit','pAtivo','pCapGiro','pAtivoCircLiq','evEbitda','evEbit',
  'lpa','vpa','giroAtivos','liquidezCorrente','dividaLiquidaPatrimonio','dividaLiquidaEbitda',
  'dividaLiquidaEbit','dividaBrutaPatrimonio','patrimonioAtivos','passivosAtivos'
]);

function hasValue(value) {
  return value !== undefined && value !== null && value !== '' && !(typeof value === 'number' && !Number.isFinite(value));
}

function inferUnit(key, value) {
  const k = String(key || '');
  if (PERCENT_KEYS.has(k) || String(value || '').includes('%')) return '%';
  if (MONEY_KEYS.has(k) || /^\s*(R\$|BRL)/i.test(String(value || ''))) return 'BRL';
  if (/abl|area/i.test(k)) return 'm2';
  if (RATIO_KEYS.has(k)) return 'ratio';
  return 'number';
}

function inferNumber(key, value, unit) {
  if (!hasValue(value)) return undefined;
  if (unit === '%') return parsePercent(value);
  return parsePtNumber(value);
}

export function makeFinancialField(key, value, options = {}) {
  if (!hasValue(value)) return undefined;
  const unit = options.unit || inferUnit(key, value);
  const n = inferNumber(key, value, unit);
  return {
    display: String(value),
    value: n === undefined ? undefined : round(n, unit === 'BRL' ? 2 : 4),
    unit,
    source: options.source || 'valorae:derived',
    confidence: options.confidence ?? (n === undefined ? 0.55 : 0.9),
  };
}

function setIf(out, key, value, source, confidence = 0.9) {
  const f = makeFinancialField(key, value, { source, confidence });
  if (f) out[key] = f;
}

export function buildUniversalNormalized(payload = {}) {
  const out = { ...(payload.normalized || {}) };
  const r = payload.results || payload.data?.results || {};
  const candidates = [
    ['precoAtual', r.precoAtual ?? r.cotacao?.precoAtual ?? payload.cotacao?.precoAtual, 'cotacao'],
    ['variacaoDay', r.variacaoDay ?? r.cotacao?.variacaoDay ?? payload.cotacao?.variacaoDay, 'cotacao'],
    ['variacao12m', r.variacao12m ?? r.cotacao?.variacao12m ?? payload.cotacao?.variacao12m, 'cotacao'],
    ['dividendYield', r.dividendYield ?? r.indicadores?.dividendYield ?? r.dividendos?.dividendYield ?? r.indicadoresFundamentalistas?.semComparativos?.dividendYield, 'indicadores'],
    ['dyMedio5a', r.dyMedio5a ?? r.dividendos?.dyMedio5a, 'dividendos'],
    ['pvp', r.pvp ?? r.indicadores?.pvp ?? r.indicadoresFundamentalistas?.semComparativos?.pvp, 'indicadores'],
    ['pl', r.pl ?? r.indicadores?.pl ?? r.indicadoresFundamentalistas?.semComparativos?.pl, 'indicadores'],
    ['roe', r.roe ?? r.indicadores?.roe ?? r.indicadoresFundamentalistas?.semComparativos?.roe, 'indicadores'],
    ['roic', r.roic ?? r.indicadores?.roic ?? r.indicadoresFundamentalistas?.semComparativos?.roic, 'indicadores'],
    ['roa', r.roa ?? r.indicadores?.roa ?? r.indicadoresFundamentalistas?.semComparativos?.roa, 'indicadores'],
    ['margemLiquida', r.margemLiquida ?? r.indicadores?.margemLiquida, 'indicadores'],
    ['margemEbitda', r.margemEbitda ?? r.indicadores?.margemEbitda, 'indicadores'],
    ['payout', r.payout ?? r.indicadores?.payout, 'indicadores'],
    ['valorPatrimonialCota', r.valorPatrimonial?.valorPatrimonialCota ?? r.valorPatrimonial?.valorPatrimonial ?? r.valorPatrimonial, 'patrimonio'],
    ['patrimonioLiquido', r.valorPatrimonial?.patrimonioLiquido ?? r.informacoesEmpresa?.patrimonioLiquido ?? r.patrimonioLiquido, 'patrimonio'],
    ['valorDeMercado', r.informacoesEmpresa?.valorDeMercado ?? r.valorDeMercado, 'empresa'],
    ['liquidezMediaDiaria', r.informacoesEmpresa?.liquidezMediaDiaria ?? r.liquidezMediaDiaria ?? r.liquidezDiaria, 'liquidez'],
    ['vacanciaFisica', r.informacoesFundo?.vacanciaFisica ?? r.indicadores?.vacanciaFisica, 'fii'],
    ['yield1m', r.indicadores?.yield1m ?? r.distribuicoes12m?.yield1m, 'fii'],
    ['yield3m', r.indicadores?.yield3m ?? r.distribuicoes12m?.yield3m, 'fii'],
    ['yield6m', r.indicadores?.yield6m ?? r.distribuicoes12m?.yield6m, 'fii'],
    ['yield12m', r.indicadores?.yield12m ?? r.distribuicoes12m?.yield12m, 'fii'],
  ];
  for (const [key, value, source] of candidates) if (!out[key]) setIf(out, key, value, `valorae:${source}`, 0.92);
  out._meta = { version: UNIVERSAL_NORMALIZER_VERSION, count: Object.keys(out).filter(k => k !== '_meta').length, contract: 'display/value/unit/source/confidence' };
  return out;
}

export function normalizeDividendHistory(dividendos = {}) {
  const historico = Array.isArray(dividendos.historico) ? dividendos.historico : [];
  const valores = historico.map(d => Number(d.valor ?? parsePtNumber(d.valor))).filter(Number.isFinite);
  const soma = valores.reduce((s, v) => s + v, 0);
  return {
    version: UNIVERSAL_NORMALIZER_VERSION,
    count: historico.length,
    total: round(soma, 8),
    media: valores.length ? round(soma / valores.length, 8) : undefined,
    maior: valores.length ? Math.max(...valores) : undefined,
    menor: valores.length ? Math.min(...valores) : undefined,
    primeiro: historico.at(-1)?.dataCom || historico.at(-1)?.date,
    ultimo: historico[0]?.dataCom || historico[0]?.date,
  };
}
