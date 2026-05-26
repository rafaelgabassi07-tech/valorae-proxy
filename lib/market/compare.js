import { ValoraeEngine, canonicalizeTicker } from '../Valorae-engine.js';
import { parsePtNumber, parsePercent } from '../normalizers/financial.js';

export const VALORAE_COMPARE_VERSION = '21.5.13-mature-final-release-free';

function n(raw, percent = false) { const v = percent ? parsePercent(raw) : parsePtNumber(raw); return v == null ? null : v; }
function normalizedValue(asset, key) {
  const field = asset?.normalized?.[key];
  const value = field && typeof field === 'object' ? field.value : undefined;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}
function firstNumber(asset, key, raw, percent = false) {
  const fromNormalized = normalizedValue(asset, key);
  return fromNormalized == null ? n(raw, percent) : fromNormalized;
}
function desc(rows, key) { return [...rows].filter(x => x[key] != null).sort((a,b)=>Number(b[key])-Number(a[key])); }
function asc(rows, key) { return [...rows].filter(x => x[key] != null).sort((a,b)=>Number(a[key])-Number(b[key])); }
function top(rows, key, dir='desc') { const arr = dir === 'asc' ? asc(rows,key) : desc(rows,key); return arr.slice(0, 5).map((x,i)=>({ rank:i+1, ticker:x.ticker, value:x[key], grade:x.grade })); }

function explainRow(row, allRows = []) {
  const strengths = [];
  const weaknesses = [];
  const avg = (key) => {
    const xs = allRows.map(r => Number(r[key])).filter(Number.isFinite);
    return xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : null;
  };
  if (row.dividendYield != null && row.dividendYield > (avg('dividendYield') ?? 0)) strengths.push('Dividend yield acima da média dos comparados');
  if (row.roe != null && row.roe > (avg('roe') ?? 0)) strengths.push('ROE acima da média');
  if (row.roic != null && row.roic > (avg('roic') ?? 0)) strengths.push('ROIC acima da média');
  if (row.pvp != null && row.pvp < (avg('pvp') ?? Infinity)) strengths.push('P/VP relativamente menor');
  if (row.pl != null && row.pl > 0 && row.pl < (avg('pl') ?? Infinity)) strengths.push('P/L relativamente menor');
  if (row.quality != null && row.quality >= 80) strengths.push('Boa qualidade de dados');
  if ((row.risks || []).length) weaknesses.push(`Possui ${row.risks.length} alerta(s)/risco(s)`);
  if (row.quality != null && row.quality < 70) weaknesses.push('Qualidade de dados abaixo do ideal');
  if (row.dividendYield === 0) weaknesses.push('Sem dividend yield relevante no recorte');
  return { ticker: row.ticker, strengths: strengths.slice(0, 5), weaknesses: weaknesses.slice(0, 5), decisiveFields: ['score','dividendYield','pvp','pl','roe','roic','quality'] };
}

function profileRank(rows, profile) {
  const formulas = {
    dividendos: x => (Number(x.dividendYield || 0) * 3.2) + Number(x.score || 0) / 5 + Number(x.quality || 0) / 10,
    conservador: x => Number(x.score || 0) + Number(x.quality || 0) - (x.risks?.length || 0) * 6 + Number(x.liquidity || 0) / 1e8,
    crescimento: x => Number(x.roe || 0) + Number(x.roic || 0) + Number(x.score || 0) / 4,
    valor: x => Number(x.score || 0) + (x.pl > 0 ? Math.max(0, 20 - x.pl) : 0) + (x.pvp ? Math.max(0, 2 - x.pvp) * 10 : 0),
    rendaFii: x => (x.type === 'FII' ? 20 : 0) + Number(x.dividendYield || 0) * 3 + Number(x.quality || 0) / 5,
  };
  const fn = formulas[profile] || formulas.conservador;
  return rows.map(x => ({ ...x, profileScore: fn(x) }))
    .sort((a,b)=>b.profileScore-a.profileScore)
    .slice(0, 10)
    .map((x,i)=>({rank:i+1,ticker:x.ticker,score:Math.round(x.profileScore), explanation: explainRow(x, rows)}));
}

export function compareAssets(assets = []) {
  const rows = assets.map(a => {
    const r = a.results || {};
    const indicators = r.indicadores || r.indicadoresFundamentalistas?.semComparativos || {};
    return {
      ticker: a.ticker,
      type: a.type,
      status: a.status,
      score: a.valoraeScore?.value ?? a.quality?.score ?? 0,
      grade: a.valoraeScore?.grade ?? a.quality?.grade,
      dividendYield: firstNumber(a, 'dividendYield', r.dividendYield ?? indicators.dividendYield ?? r.dividendos?.dividendYield, true),
      pvp: firstNumber(a, 'pvp', r.pvp ?? indicators.pvp),
      pl: firstNumber(a, 'pl', r.pl ?? indicators.pl),
      roe: firstNumber(a, 'roe', r.roe ?? indicators.roe, true),
      roic: firstNumber(a, 'roic', r.roic ?? indicators.roic, true),
      precoAtual: firstNumber(a, 'precoAtual', r.precoAtual ?? r.cotacao?.precoAtual),
      liquidity: firstNumber(a, 'liquidezMediaDiaria', r.informacoesEmpresa?.liquidezMediaDiaria ?? r.liquidezMediaDiaria),
      strengths: a.valoraeScore?.strengths || [],
      risks: a.valoraeScore?.risks || [],
      quality: a.quality?.score,
    };
  }).sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  const rankings = {
    score: top(rows, 'score'),
    dividendYield: top(rows, 'dividendYield'),
    pvp: top(rows, 'pvp', 'asc'),
    pl: top(rows, 'pl', 'asc'),
    roe: top(rows, 'roe'),
    roic: top(rows, 'roic'),
    quality: top(rows, 'quality'),
  };
  const winnerByCriterion = Object.fromEntries(Object.entries(rankings).map(([k,v]) => [k, v[0] || null]));
  const profiles = {
    dividendos: profileRank(rows, 'dividendos'),
    conservador: profileRank(rows, 'conservador'),
    crescimento: profileRank(rows, 'crescimento'),
    valor: profileRank(rows, 'valor'),
    rendaFii: profileRank(rows, 'rendaFii'),
  };
  const explanations = rows.map(row => explainRow(row, rows));
  return { version: VALORAE_COMPARE_VERSION, ranking: rows, rankings, winnerByCriterion, profiles, explanations, best: rows[0] || null, count: rows.length };
}

export async function fetchAndCompareTickers(tickers = [], options = {}) {
  const normalized = tickers.map(canonicalizeTicker).filter(Boolean);
  const batch = await ValoraeEngine.fetchAtivosBatch(normalized, { ...options, view: options.view || 'compact', includeNews: false, includeQuality: true });
  return { version: ValoraeEngine.version, requested: normalized, ...compareAssets(batch.assets), errors: batch.errors, stats: batch.stats };
}
