import { ValoraeEngine, canonicalizeTicker, inferAssetType } from '../Valorae-engine.js';
import { buildPortfolioReturnSeries, buildContributionSimulation } from './returns-advanced.js';
import { buildPortfolioIntelligence } from './intelligence.js';

export const PORTFOLIO_ENGINE_VERSION = '21.5.13-mature-final-release-free';

const DEFAULT_MAX_POSITIONS = Number(process.env.VALORAE_PORTFOLIO_MAX_POSITIONS || 80);
const DEFAULT_MAX_CONCURRENCY = Number(process.env.VALORAE_PORTFOLIO_CONCURRENCY || 4);

export function parseBoolean(v, fallback = false) {
  if (v === undefined || v === null || v === '') return fallback;
  return ['1', 'true', 'yes', 'sim', 'on'].includes(String(v).toLowerCase());
}

export function parseLocaleNumber(value, fallback = 0) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (value === undefined || value === null || value === '') return fallback;
  const s = String(value)
    .trim()
    .replace(/R\$|US\$|BRL|USD/gi, '')
    .replace(/%/g, '')
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

export function parsePercent(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const n = parseLocaleNumber(value, NaN);
  return Number.isFinite(n) ? n : fallback;
}

export function money(value) {
  const n = Number(value || 0);
  return Math.round(n * 100) / 100;
}

function pct(value) {
  const n = Number(value || 0);
  return Math.round(n * 10000) / 100;
}

function safeArray(v) { return Array.isArray(v) ? v : []; }
function safeObject(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }

const CASH_TYPES = new Set(['CASH','CAIXA','DINHEIRO','RESERVA','RESERVA_EMERGENCIA']);
const FIXED_INCOME_TYPES = new Set(['RENDA_FIXA','FIXED_INCOME','CDB','LCI','LCA','CRI','CRA','DEBENTURE','TESOURO','TESOURO_SELIC','TESOURO_IPCA','TESOURO_PREFIXADO','RDB']);
function isCashLike(ticker = '', type = '') { return CASH_TYPES.has(String(ticker || '').toUpperCase()) || CASH_TYPES.has(String(type || '').toUpperCase()); }
function isFixedIncomeLike(ticker = '', type = '') { return FIXED_INCOME_TYPES.has(String(ticker || '').toUpperCase()) || FIXED_INCOME_TYPES.has(String(type || '').toUpperCase()); }

function compactKey(type = '') {
  const t = String(type || '').toUpperCase();
  if (t === 'ACAO' || t === 'STOCK') return 'ACOES';
  if (t === 'BDR') return 'BDR';
  if (t === 'FII') return 'FIIS';
  if (t === 'ETF') return 'ETFS';
  if (CASH_TYPES.has(t)) return 'CAIXA';
  if (FIXED_INCOME_TYPES.has(t)) return 'RENDA_FIXA';
  return t || 'OUTROS';
}

function extractPrice(asset = {}, position = {}) {
  const r = asset.results || asset || {};
  return Number(
    position.currentPrice ??
    position.precoAtual ??
    r.cotacao?.precoAtual ??
    asset.cotacao?.precoAtual ??
    r.precoAtual ??
    asset.precoAtual ??
    r.indicadores?.precoAtual ??
    0
  ) || 0;
}

function extractDividendYield(asset = {}) {
  const r = asset.results || asset || {};
  const raw =
    r.indicadores?.dividendYield ??
    r.dividendos?.dividendYield ??
    asset.dividendos?.dividendYield ??
    r.dividendYield ??
    asset.dividendYield ??
    r.yield12m ??
    r.indicadores?.yield12m;
  return parsePercent(raw, null);
}

function extractLastDividend(asset = {}) {
  const r = asset.results || asset || {};
  const hist = safeArray(r.dividendos?.historico || r.historicoDividendos || asset.dividendos?.historico);
  const first = hist[0];
  if (first?.valor !== undefined) return Number(first.valor) || 0;
  const ultimo = r.ultimoRendimento ?? r.indicadores?.ultimoRendimento;
  return Number(ultimo || 0) || 0;
}

function extractName(asset = {}, ticker = '') {
  const r = asset.results || asset || {};
  return r.nome || asset.nome || r.dadosEmpresa?.nomeCompleto || r.informacoesFundo?.nome || ticker;
}

function extractSector(asset = {}) {
  const r = asset.results || asset || {};
  return r.informacoesEmpresa?.setor || r.comparativoSetor?.setor || r.informacoesFundo?.segmentoFii || r.segmentoFii || asset.setor || null;
}

function extractSegment(asset = {}) {
  const r = asset.results || asset || {};
  return r.informacoesEmpresa?.segmento || r.comparativoSetor?.segmento || r.informacoesFundo?.tipoFundo || r.tipoFundo || null;
}

function extractQuality(asset = {}) {
  return Number(asset.quality?.score || asset.qualityScore || 0) || 0;
}

function normalizeTargetMap(rawTargets) {
  const targets = safeObject(rawTargets);
  const out = {};
  for (const [key, value] of Object.entries(targets)) {
    const k = String(key || '').trim().toUpperCase();
    const n = parseLocaleNumber(value, NaN);
    if (k && Number.isFinite(n)) out[k] = n;
  }
  return out;
}

export function parsePositionsFromRequest(input = {}) {
  let positions = [];
  if (Array.isArray(input.positions)) positions = input.positions;
  else if (typeof input.positions === 'string') {
    try { positions = JSON.parse(input.positions); } catch { positions = []; }
  }

  if (!positions.length) {
    const tickers = String(input.tickers || input.ticker || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const quantities = String(input.quantities || input.quantity || input.qtd || '')
      .split(',')
      .map(s => s.trim());
    const avgPrices = String(input.avgPrices || input.averagePrices || input.precoMedio || input.averagePrice || '')
      .split(',')
      .map(s => s.trim());
    const currentPrices = String(input.currentPrices || input.prices || input.precoAtual || '')
      .split(',')
      .map(s => s.trim());
    const targetPercents = String(input.targetPercents || input.targetsTicker || '')
      .split(',')
      .map(s => s.trim());
    positions = tickers.map((ticker, i) => ({
      ticker,
      quantity: quantities[i] ?? 1,
      averagePrice: avgPrices[i] ?? undefined,
      currentPrice: currentPrices[i] ?? undefined,
      targetPercent: targetPercents[i] ?? undefined,
    }));
  }

  const normalized = [];
  for (const p of positions) {
    const ticker = canonicalizeTicker(p?.ticker || p?.symbol || p?.codigo || p?.ativo || p?.name || '');
    const rawType = String(p?.type || p?.tipo || p?.assetClass || '').toUpperCase();
    const isCash = isCashLike(ticker, rawType);
    const isFixedIncome = isFixedIncomeLike(ticker, rawType);
    if (!ticker && !isCash && !isFixedIncome) continue;
    const quantity = parseLocaleNumber(p.quantity ?? p.quantidade ?? p.qtd ?? (isCash || isFixedIncome ? 1 : 0), 0);
    const averagePrice = parseLocaleNumber(p.averagePrice ?? p.precoMedio ?? p.avgPrice ?? p.pm ?? 0, 0);
    const currentPrice = parseLocaleNumber(p.currentPrice ?? p.precoAtual ?? p.price ?? 0, 0);
    const manualCurrentValue = parseLocaleNumber(p.currentValue ?? p.valorAtual ?? p.value ?? p.saldo ?? 0, 0);
    const manualInvestedValue = parseLocaleNumber(p.investedValue ?? p.valorInvestido ?? p.cost ?? p.principal ?? 0, 0);
    const type = isCash ? 'CASH' : (isFixedIncome ? 'RENDA_FIXA' : String(p.type || p.tipo || inferAssetType(ticker)).toUpperCase());
    const targetPercent = parsePercent(p.targetPercent ?? p.alvoPercentual ?? p.target ?? null, null);
    normalized.push({
      id: p.id || ticker || type,
      ticker: ticker || type,
      type,
      quantity,
      averagePrice,
      currentPrice,
      currentValue: manualCurrentValue,
      investedValue: manualInvestedValue,
      targetPercent,
      annualRatePercent: parsePercent(p.annualRatePercent ?? p.rateAnnualPercent ?? p.taxaAnual ?? p.rate ?? p.rentabilidadeAnual ?? null, null),
      indexer: p.indexer || p.indexador || p.benchmark || null,
      liquidityDays: parseLocaleNumber(p.liquidityDays ?? p.liquidezDias ?? p.resgateDias ?? p.diasResgate ?? null, NaN),
      maturityDate: p.maturityDate || p.vencimento || null,
      issuer: p.issuer || p.emissor || null,
      currency: p.currency || p.moeda || 'BRL',
      riskLevel: p.riskLevel || p.risco || null,
      taxExempt: parseBoolean(p.taxExempt ?? p.isentoIR ?? p.isento, false),
      objective: p.objective || p.objetivo || null,
      account: p.account || p.corretora || p.broker || null,
      note: p.note || p.observacao || null,
      tags: Array.isArray(p.tags) ? p.tags : [],
      raw: p,
    });
  }
  return normalized.slice(0, DEFAULT_MAX_POSITIONS);
}

async function fetchAssetsForPositions(positions, options = {}) {
  const tickers = [...new Set(positions
    .filter(p => p.ticker && !isCashLike(p.ticker, p.type) && !isFixedIncomeLike(p.ticker, p.type))
    .map(p => p.ticker))];
  if (!tickers.length || options.enrich === false) return { assetsByTicker: {}, batchStats: null, errors: [] };
  const batch = await ValoraeEngine.fetchAtivosBatch(tickers, {
    mode: options.mode || 'super',
    includeNews: false,
    view: options.assetView || 'compact',
    profile: options.profile || options.performance || 'portfolio',
    includeQuality: true,
    maxConcurrency: Number(options.maxConcurrency || DEFAULT_MAX_CONCURRENCY),
    cache: options.cache !== false,
    bypassCache: options.bypassCache === true,
    valoraeScrapeUrl: options.valoraeScrapeUrl,
    timeoutMs: options.timeoutMs,
    maxHtmlChars: options.maxHtmlChars,
  });
  const assetsByTicker = {};
  for (const asset of safeArray(batch.assets)) assetsByTicker[asset.ticker] = asset;
  return { assetsByTicker, batchStats: batch.stats, errors: batch.errors || [] };
}

function pushAgg(map, key, value, extra = {}) {
  const k = key || 'Não classificado';
  if (!map[k]) map[k] = { key: k, value: 0, count: 0, ...extra };
  map[k].value += Number(value || 0);
  map[k].count += 1;
  return map[k];
}

function mapToAllocation(map, total) {
  return Object.values(map)
    .map(item => ({ ...item, value: money(item.value), percent: total > 0 ? pct(item.value / total) : 0 }))
    .sort((a, b) => b.value - a.value);
}

function makeInsights(enriched, summary, allocation, risk, income, intelligence = {}) {
  const insights = [];
  if (summary.totalCurrentValue <= 0) insights.push({ level: 'warning', code: 'EMPTY_PORTFOLIO', message: 'Carteira sem valor atual calculável.' });
  if (risk.concentration.top1Percent > 40) insights.push({ level: 'warning', code: 'HIGH_SINGLE_ASSET_CONCENTRATION', message: `Maior ativo representa ${risk.concentration.top1Percent}% da carteira.` });
  if (risk.concentration.top3Percent > 70) insights.push({ level: 'warning', code: 'HIGH_TOP3_CONCENTRATION', message: `Top 3 ativos representam ${risk.concentration.top3Percent}% da carteira.` });
  if ((allocation.byType || []).length < 2 && summary.positionsCount > 1) insights.push({ level: 'info', code: 'LOW_ASSET_CLASS_DIVERSIFICATION', message: 'Carteira concentrada em uma única classe de ativo.' });
  if (income.annualYieldOnCurrentValue > 8) insights.push({ level: 'positive', code: 'HIGH_INCOME_YIELD', message: `Renda anual estimada de ${income.annualYieldOnCurrentValue}% sobre o valor atual.` });
  const missingPrice = enriched.filter(p => p.flags.includes('MISSING_CURRENT_PRICE')).length;
  if (missingPrice) insights.push({ level: 'warning', code: 'MISSING_PRICES', message: `${missingPrice} posição(ões) sem preço atual confiável.` });
  const missingCost = enriched.filter(p => p.flags.includes('MISSING_AVERAGE_PRICE')).length;
  if (missingCost) insights.push({ level: 'info', code: 'MISSING_COST_BASIS', message: `${missingCost} posição(ões) sem preço médio; rentabilidade/yield on cost ficam parciais.` });
  if (intelligence?.incomeCoverage?.concentrationWarning) insights.push({ level: 'warning', code: 'HIGH_INCOME_CONCENTRATION', message: `Top 3 pagadores representam ${intelligence.incomeCoverage.top3IncomePercent}% da renda anual estimada.` });
  if (intelligence?.dataCompleteness?.score < 85) insights.push({ level: 'info', code: 'DATA_COMPLETENESS_CAN_IMPROVE', message: `Completude de dados da carteira em ${intelligence.dataCompleteness.score}%; informe liquidez, vencimento, preço médio e metas para projeções melhores.` });
  if (intelligence?.technologyReadiness?.score >= 85) insights.push({ level: 'positive', code: 'PORTFOLIO_TECH_READY', message: `Carteira pronta para dashboards rápidos: score tecnológico ${intelligence.technologyReadiness.score}.` });
  return insights;
}

function buildRisk(enriched, totalCurrentValue, allocation, averageQualityScore) {
  const sorted = [...enriched].sort((a, b) => b.currentValue - a.currentValue);
  const weights = sorted.map(p => totalCurrentValue > 0 ? p.currentValue / totalCurrentValue : 0);
  const hhi = weights.reduce((sum, w) => sum + w * w, 0);
  const top1Percent = weights[0] ? pct(weights[0]) : 0;
  const top3Percent = pct(weights.slice(0, 3).reduce((s, w) => s + w, 0));
  const classCount = allocation.byType.length;
  const sectorCount = allocation.bySector.filter(x => x.key !== 'Não classificado').length;
  const flags = [];
  if (top1Percent > 40) flags.push('HIGH_SINGLE_ASSET_CONCENTRATION');
  if (top3Percent > 70) flags.push('HIGH_TOP3_CONCENTRATION');
  if (classCount < 2 && enriched.length > 1) flags.push('LOW_CLASS_DIVERSIFICATION');
  if (sectorCount < 3 && enriched.length > 4) flags.push('LOW_SECTOR_DIVERSIFICATION');
  if (averageQualityScore && averageQualityScore < 70) flags.push('LOW_DATA_QUALITY');
  const issuerTop = safeArray(allocation.byIssuer)[0]?.percent || 0;
  const illiquidPercent = enriched.filter(p => Number(p.liquidityDays || 0) > 180).reduce((sum, p) => sum + Number(p.weightPercent || 0), 0);
  if (issuerTop > 35) flags.push('HIGH_ISSUER_OR_ACCOUNT_CONCENTRATION');
  if (illiquidPercent > 30) flags.push('HIGH_ILLIQUID_EXPOSURE');
  let score = 100;
  score -= Math.max(0, top1Percent - 25) * 0.9;
  score -= Math.max(0, top3Percent - 55) * 0.5;
  score -= Math.max(0, 3 - classCount) * 8;
  score -= Math.max(0, 5 - sectorCount) * 3;
  score -= Math.max(0, issuerTop - 35) * 0.35;
  score -= Math.max(0, illiquidPercent - 25) * 0.35;
  if (averageQualityScore) score -= Math.max(0, 80 - averageQualityScore) * 0.3;
  score = Math.max(0, Math.min(100, Math.round(score)));
  const grade = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : score >= 40 ? 'D' : 'E';
  return {
    score,
    grade,
    concentration: { hhi: Math.round(hhi * 10000) / 10000, top1Percent, top3Percent, topAssets: sorted.slice(0, 5).map(p => ({ ticker: p.ticker, value: money(p.currentValue), percent: p.weightPercent })) },
    diversification: { positions: enriched.length, assetClasses: classCount, sectors: sectorCount, issuerTopPercent: issuerTop, illiquidPercent: money(illiquidPercent) },
    flags,
  };
}

function buildPortfolioScore(summary, risk, income, averageQualityScore) {
  const diversification = risk.score;
  const incomeScore = Math.max(0, Math.min(100, Math.round((income.annualYieldOnCurrentValue || 0) * 7)));
  const performanceScore = summary.unrealizedPnLPercent == null ? 60 : Math.max(0, Math.min(100, Math.round(50 + summary.unrealizedPnLPercent * 1.5)));
  const dataQuality = averageQualityScore || 60;
  const value = Math.round(diversification * 0.32 + incomeScore * 0.18 + performanceScore * 0.22 + dataQuality * 0.28);
  const grade = value >= 90 ? 'A+' : value >= 82 ? 'A' : value >= 74 ? 'B+' : value >= 66 ? 'B' : value >= 55 ? 'C' : value >= 40 ? 'D' : 'E';
  return { value, grade, factors: { diversificacao: diversification, renda: incomeScore, desempenho: performanceScore, qualidadeDados: dataQuality } };
}

function buildIncome(enriched, totalCurrentValue, totalInvestedValue) {
  const byTicker = enriched.map(p => ({
    ticker: p.ticker,
    type: p.type,
    dividendYield: p.dividendYield,
    lastDividend: p.lastDividend,
    monthlyIncomeEstimated: money(p.monthlyIncomeEstimated),
    annualIncomeEstimated: money(p.annualIncomeEstimated),
    percentOfIncome: 0,
  })).filter(p => p.annualIncomeEstimated > 0);
  const annualIncomeEstimated = money(byTicker.reduce((sum, p) => sum + p.annualIncomeEstimated, 0));
  for (const item of byTicker) item.percentOfIncome = annualIncomeEstimated > 0 ? pct(item.annualIncomeEstimated / annualIncomeEstimated) : 0;
  byTicker.sort((a, b) => b.annualIncomeEstimated - a.annualIncomeEstimated);
  return {
    annualIncomeEstimated,
    monthlyIncomeEstimated: money(annualIncomeEstimated / 12),
    annualYieldOnCurrentValue: totalCurrentValue > 0 ? pct(annualIncomeEstimated / totalCurrentValue) : 0,
    yieldOnCost: totalInvestedValue > 0 ? pct(annualIncomeEstimated / totalInvestedValue) : 0,
    byTicker,
  };
}

function buildRebalance(enriched, totalCurrentValue, input = {}) {
  const targetsByTicker = normalizeTargetMap(input.targetsByTicker || input.tickerTargets);
  const targetsByType = normalizeTargetMap(input.targetsByType || input.classTargets || input.targets);
  const cashAvailable = parseLocaleNumber(input.cashAvailable || input.aporte || input.contribuicao || 0, 0);
  const mode = input.rebalanceMode || input.modeRebalance || 'fullPortfolio';
  const actions = [];
  const typeTotals = {};
  for (const p of enriched) pushAgg(typeTotals, compactKey(p.type), p.currentValue);

  if (Object.keys(targetsByTicker).length) {
    const base = mode === 'contributionOnly' ? cashAvailable : totalCurrentValue + cashAvailable;
    for (const p of enriched) {
      const target = targetsByTicker[p.ticker];
      if (target === undefined) continue;
      const targetValue = base * target / 100;
      const delta = targetValue - p.currentValue;
      actions.push({ scope: 'ticker', ticker: p.ticker, targetPercent: target, currentPercent: p.weightPercent, currentValue: money(p.currentValue), targetValue: money(targetValue), deltaValue: money(delta), action: delta > 5 ? 'BUY' : delta < -5 ? 'REDUCE' : 'HOLD', estimatedQuantity: p.currentPrice > 0 ? Math.floor(Math.abs(delta) / p.currentPrice) : null });
    }
  }

  if (Object.keys(targetsByType).length) {
    const base = mode === 'contributionOnly' ? cashAvailable : totalCurrentValue + cashAvailable;
    for (const [type, target] of Object.entries(targetsByType)) {
      const current = typeTotals[type]?.value || 0;
      const targetValue = base * target / 100;
      const delta = targetValue - current;
      actions.push({ scope: 'type', type, targetPercent: target, currentValue: money(current), currentPercent: totalCurrentValue > 0 ? pct(current / totalCurrentValue) : 0, targetValue: money(targetValue), deltaValue: money(delta), action: delta > 5 ? 'BUY' : delta < -5 ? 'REDUCE' : 'HOLD' });
    }
  }

  return {
    mode,
    cashAvailable: money(cashAvailable),
    hasTargets: actions.length > 0,
    actions: actions.sort((a, b) => Math.abs(b.deltaValue) - Math.abs(a.deltaValue)),
    note: actions.length ? 'Rebalanceamento estimado, sem considerar custos, impostos, liquidez, lote mínimo ou suitability.' : 'Envie targetsByType ou targetsByTicker para obter recomendações de rebalanceamento.',
  };
}

function buildEvents(enriched) {
  const events = [];
  for (const p of enriched) {
    const hist = safeArray(p.asset?.results?.dividendos?.historico || p.asset?.results?.historicoDividendos || p.asset?.dividendos?.historico).slice(0, 36);
    for (const h of hist) {
      const valorPorCota = Number(h.valor ?? h.value ?? h.valorPorCota ?? 0) || 0;
      const dataPagamento = h.dataPagamento || h.paymentDate || h.dataPagamentoPrevista || null;
      events.push({
        ticker: p.ticker,
        type: h.tipo || h.type || 'Provento',
        dataCom: h.dataCom || h.comDate || null,
        dataPagamento,
        paymentDate: dataPagamento,
        valorPorCota,
        quantidade: p.quantity,
        valorEstimado: money(valorPorCota * p.quantity),
      });
    }
  }
  events.sort((a, b) => String(b.dataPagamento || '').localeCompare(String(a.dataPagamento || '')));
  const byMonth = {};
  for (const ev of events) {
    const key = String(ev.dataPagamento || ev.dataCom || '').slice(0, 7) || 'sem-data';
    if (!byMonth[key]) byMonth[key] = { month: key, count: 0, estimatedValue: 0, tickers: new Set() };
    byMonth[key].count += 1;
    byMonth[key].estimatedValue += Number(ev.valorEstimado || 0);
    if (ev.ticker) byMonth[key].tickers.add(ev.ticker);
  }
  return {
    count: events.length,
    items: events.slice(0, 160),
    byMonth: Object.values(byMonth).map(x => ({ month: x.month, count: x.count, estimatedValue: money(x.estimatedValue), tickers: [...x.tickers].slice(0, 10) })).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 24),
  };
}

export async function analyzePortfolio(input = {}, options = {}) {
  const started = performance.now();
  const positions = parsePositionsFromRequest(input);
  if (!positions.length) {
    return {
      version: PORTFOLIO_ENGINE_VERSION,
      status: 'EMPTY',
      error: 'Envie posições da carteira. Use POST { positions: [{ ticker, quantity, averagePrice }] } ou GET tickers=PETR4,GARE11&quantities=10,100&avgPrices=30,8.',
    };
  }

  const { assetsByTicker, batchStats, errors } = await fetchAssetsForPositions(positions, options);
  const enriched = positions.map(p => {
    const asset = assetsByTicker[p.ticker] || null;
    const inferredType = p.type || asset?.type || inferAssetType(p.ticker);
    const type = compactKey(inferredType);
    const currentPrice = p.currentPrice || extractPrice(asset || {}, p) || ((type === 'CAIXA' || type === 'RENDA_FIXA') ? 1 : 0);
    const averagePrice = p.averagePrice || ((type === 'CAIXA' || type === 'RENDA_FIXA') ? currentPrice : 0);
    const currentValue = p.currentValue || (p.quantity && currentPrice ? p.quantity * currentPrice : ((type === 'CAIXA' || type === 'RENDA_FIXA') ? (p.investedValue || p.quantity || 0) : 0));
    const investedValue = p.investedValue || (p.quantity && averagePrice ? p.quantity * averagePrice : ((type === 'CAIXA' || type === 'RENDA_FIXA') ? currentValue : 0));
    const unrealizedPnL = currentValue - investedValue;
    const unrealizedPnLPercent = investedValue > 0 ? pct(unrealizedPnL / investedValue) : null;
    const dividendYield = extractDividendYield(asset || {});
    const lastDividend = extractLastDividend(asset || {});
    const fixedIncomeAnnualIncome = p.annualRatePercent != null ? currentValue * Number(p.annualRatePercent) / 100 : 0;
    const annualIncomeEstimated = dividendYield != null ? currentValue * dividendYield / 100 : (fixedIncomeAnnualIncome || (lastDividend ? lastDividend * p.quantity * 12 : 0));
    const flags = [];
    if (!currentPrice && type !== 'CAIXA' && type !== 'RENDA_FIXA') flags.push('MISSING_CURRENT_PRICE');
    if (!averagePrice && type !== 'CAIXA' && type !== 'RENDA_FIXA') flags.push('MISSING_AVERAGE_PRICE');
    if (!asset && type !== 'CAIXA' && type !== 'RENDA_FIXA') flags.push('ASSET_NOT_ENRICHED');
    if (type === 'RENDA_FIXA' && p.annualRatePercent == null) flags.push('MISSING_FIXED_INCOME_RATE');
    const qualityScore = extractQuality(asset || {});
    if (qualityScore && qualityScore < 70) flags.push('LOW_DATA_QUALITY');
    return {
      ticker: p.ticker,
      name: extractName(asset || {}, p.ticker),
      type,
      rawType: inferredType,
      quantity: p.quantity,
      averagePrice: money(averagePrice),
      currentPrice: money(currentPrice),
      investedValue: money(investedValue),
      currentValue: money(currentValue),
      unrealizedPnL: money(unrealizedPnL),
      unrealizedPnLPercent,
      dividendYield,
      lastDividend,
      annualIncomeEstimated: money(annualIncomeEstimated),
      monthlyIncomeEstimated: money(annualIncomeEstimated / 12),
      sector: extractSector(asset || {}) || (type === 'RENDA_FIXA' ? 'Renda fixa' : null),
      segment: extractSegment(asset || {}) || p.indexer || null,
      annualRatePercent: p.annualRatePercent,
      indexer: p.indexer,
      liquidityDays: Number.isFinite(p.liquidityDays) ? p.liquidityDays : undefined,
      maturityDate: p.maturityDate,
      issuer: p.issuer,
      currency: p.currency,
      riskLevel: p.riskLevel,
      taxExempt: p.taxExempt,
      objective: p.objective,
      targetPercent: p.targetPercent,
      qualityScore,
      account: p.account,
      tags: p.tags,
      flags,
      asset,
    };
  });

  const totalInvestedValue = money(enriched.reduce((sum, p) => sum + p.investedValue, 0));
  const totalCurrentValue = money(enriched.reduce((sum, p) => sum + p.currentValue, 0));
  for (const p of enriched) p.weightPercent = totalCurrentValue > 0 ? pct(p.currentValue / totalCurrentValue) : 0;
  const unrealizedPnL = money(totalCurrentValue - totalInvestedValue);
  const unrealizedPnLPercent = totalInvestedValue > 0 ? pct(unrealizedPnL / totalInvestedValue) : null;
  const validQuality = enriched.map(p => p.qualityScore).filter(Boolean);
  const averageQualityScore = validQuality.length ? Math.round(validQuality.reduce((s, n) => s + n, 0) / validQuality.length) : 0;

  const byTicker = {};
  const byType = {};
  const bySector = {};
  const byAccount = {};
  const byIssuer = {};
  const byIndexer = {};
  const byObjective = {};
  for (const p of enriched) {
    pushAgg(byTicker, p.ticker, p.currentValue, { ticker: p.ticker, type: p.type });
    pushAgg(byType, p.type, p.currentValue);
    pushAgg(bySector, p.sector || 'Não classificado', p.currentValue);
    if (p.account) pushAgg(byAccount, p.account, p.currentValue);
    if (p.issuer) pushAgg(byIssuer, p.issuer, p.currentValue);
    if (p.indexer) pushAgg(byIndexer, p.indexer, p.currentValue);
    if (p.objective) pushAgg(byObjective, p.objective, p.currentValue);
  }
  const allocation = {
    byTicker: mapToAllocation(byTicker, totalCurrentValue),
    byType: mapToAllocation(byType, totalCurrentValue),
    bySector: mapToAllocation(bySector, totalCurrentValue),
    byAccount: mapToAllocation(byAccount, totalCurrentValue),
    byIssuer: mapToAllocation(byIssuer, totalCurrentValue),
    byIndexer: mapToAllocation(byIndexer, totalCurrentValue),
    byObjective: mapToAllocation(byObjective, totalCurrentValue),
  };
  const income = buildIncome(enriched, totalCurrentValue, totalInvestedValue);
  const risk = buildRisk(enriched, totalCurrentValue, allocation, averageQualityScore);
  const summary = {
    positionsCount: enriched.length,
    tickersCount: new Set(enriched.map(p => p.ticker)).size,
    totalInvestedValue,
    totalCurrentValue,
    unrealizedPnL,
    unrealizedPnLPercent,
    averageQualityScore,
  };
  const portfolioScore = buildPortfolioScore(summary, risk, income, averageQualityScore);
  const rebalance = buildRebalance(enriched, totalCurrentValue, input);
  const events = buildEvents(enriched);
  const cleanedPositions = enriched.map(({ asset, ...p }) => p);
  const diagnosticsBase = { batchStats, errors };
  const intelligence = buildPortfolioIntelligence({ positions: cleanedPositions, summary, allocation, income, risk, rebalance, events, input, diagnostics: diagnosticsBase });
  const insights = makeInsights(enriched, summary, allocation, risk, income, intelligence);

  const includeAssets = parseBoolean(input.includeAssets ?? options.includeAssets, false);
  const payload = {
    version: PORTFOLIO_ENGINE_VERSION,
    engineVersion: ValoraeEngine.version,
    schemaVersion: 'portfolio-2026-05-26-v21.5.13-quality-matrix',
    status: 'OK',
    generatedAt: new Date().toISOString(),
    summary,
    portfolioScore,
    positions: cleanedPositions,
    allocation,
    income,
    risk,
    rebalance,
    events,
    insights,
    returnSeries: buildPortfolioReturnSeries(input),
    contributionSimulation: buildContributionSimulation({ positions: enriched }, input.cashAvailable ?? input.aporte ?? input.contributionAmount ?? 0),
    intelligence,
    diagnostics: {
      durationMs: Math.round(performance.now() - started),
      batchStats,
      errors,
      warnings: insights.filter(i => i.level === 'warning').map(i => i.message),
    },
  };
  if (includeAssets) payload.assets = assetsByTicker;
  return applyPortfolioView(payload, input.view || options.view || 'full');
}

export function applyPortfolioView(payload, view = 'full') {
  const v = String(view || 'full').toLowerCase();
  if (v === 'compact') {
    return {
      version: payload.version,
      engineVersion: payload.engineVersion,
      schemaVersion: payload.schemaVersion,
      status: payload.status,
      generatedAt: payload.generatedAt,
      view: 'compact',
      summary: payload.summary,
      portfolioScore: payload.portfolioScore,
      allocation: { byTicker: payload.allocation.byTicker, byType: payload.allocation.byType, byIssuer: payload.allocation.byIssuer, byObjective: payload.allocation.byObjective },
      income: {
        annualIncomeEstimated: payload.income.annualIncomeEstimated,
        monthlyIncomeEstimated: payload.income.monthlyIncomeEstimated,
        annualYieldOnCurrentValue: payload.income.annualYieldOnCurrentValue,
        yieldOnCost: payload.income.yieldOnCost,
      },
      risk: { score: payload.risk.score, grade: payload.risk.grade, concentration: payload.risk.concentration, flags: payload.risk.flags },
      intelligence: payload.intelligence ? { technologyReadiness: payload.intelligence.technologyReadiness, incomeCoverage: payload.intelligence.incomeCoverage, dataCompleteness: payload.intelligence.dataCompleteness, actionPlan: payload.intelligence.actionPlan?.slice(0, 3) } : undefined,
      insights: payload.insights.slice(0, 6),
    };
  }
  if (v === 'standard') {
    const p = { ...payload, view: 'standard' };
    p.positions = safeArray(p.positions).map(pos => ({ ...pos, flags: pos.flags?.slice(0, 4) || [] }));
    p.events = { count: p.events.count, items: p.events.items.slice(0, 24) };
    if (p.intelligence?.incomeCalendar?.rows) p.intelligence.incomeCalendar.rows = p.intelligence.incomeCalendar.rows.slice(0, 12);
    delete p.assets;
    return p;
  }
  return { ...payload, view: 'full' };
}

export function parseTransactions(input = {}) {
  let transactions = Array.isArray(input.transactions) ? input.transactions : [];
  if (!transactions.length && typeof input.transactions === 'string') {
    try { transactions = JSON.parse(input.transactions); } catch { transactions = []; }
  }
  return transactions.map(t => ({
    ticker: canonicalizeTicker(t.ticker || t.ativo || ''),
    type: String(t.type || t.tipo || t.side || '').toUpperCase(),
    date: t.date || t.data || null,
    quantity: parseLocaleNumber(t.quantity ?? t.quantidade ?? 0, 0),
    price: parseLocaleNumber(t.price ?? t.preco ?? 0, 0),
    fees: parseLocaleNumber(t.fees ?? t.taxas ?? t.custos ?? 0, 0),
  })).filter(t => t.ticker && t.quantity > 0);
}

export function summarizeTransactions(input = {}) {
  const transactions = parseTransactions(input);
  const byTicker = {};
  for (const t of transactions) {
    if (!byTicker[t.ticker]) byTicker[t.ticker] = { ticker: t.ticker, buys: 0, sells: 0, buyValue: 0, sellValue: 0, fees: 0, quantityNet: 0 };
    const item = byTicker[t.ticker];
    const gross = t.quantity * t.price;
    item.fees += t.fees;
    if (['SELL','VENDA','VENDER'].includes(t.type)) { item.sells += t.quantity; item.sellValue += gross; item.quantityNet -= t.quantity; }
    else { item.buys += t.quantity; item.buyValue += gross; item.quantityNet += t.quantity; }
  }
  for (const item of Object.values(byTicker)) {
    item.averageBuyPrice = item.buys > 0 ? money((item.buyValue + item.fees) / item.buys) : 0;
    item.realizedGross = money(item.sellValue - (item.sells * item.averageBuyPrice));
    item.buyValue = money(item.buyValue); item.sellValue = money(item.sellValue); item.fees = money(item.fees);
  }
  return {
    version: PORTFOLIO_ENGINE_VERSION,
    status: 'OK',
    transactionsCount: transactions.length,
    byTicker: Object.values(byTicker),
    note: 'Resumo operacional bruto. Não calcula imposto devido nem substitui controle fiscal oficial.',
  };
}
