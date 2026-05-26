
function parseLocaleNumber(value, fallback = 0) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (value === undefined || value === null || value === '') return fallback;
  const s = String(value).trim().replace(/R\$|US\$|BRL|USD/gi, '').replace(/%/g, '').replace(/\s+/g, '').replace(/\./g, '').replace(/,/g, '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

function parsePercent(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const n = parseLocaleNumber(value, NaN);
  return Number.isFinite(n) ? n : fallback;
}

function money(value) {
  const n = Number(value || 0);
  return Math.round(n * 100) / 100;
}

export const PORTFOLIO_INTELLIGENCE_VERSION = '21.5.13-mature-final-release-free';

function pct(value) {
  const n = Number(value || 0);
  return Math.round(n * 10000) / 100;
}

function round(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function safeArray(value) { return Array.isArray(value) ? value : []; }
function ym(dateLike) { return String(dateLike || '').slice(0, 7); }

function addMonthKey(date = new Date(), offset = 0) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function inferTaxHint(position) {
  const type = String(position.type || '').toUpperCase();
  if (type === 'FIIS') return 'Proventos de FIIs podem ter tratamento diferente de ganho de capital; controle preço médio e vendas mensais.';
  if (type === 'ACOES') return 'Ações exigem controle de preço médio, dividendos/JCP e apuração de vendas; JCP pode ter retenção na fonte.';
  if (type === 'ETFS' || type === 'BDR') return 'ETFs/BDRs podem ter regras fiscais específicas; mantenha registros por ticker e corretora.';
  if (type === 'RENDA_FIXA') return position.taxExempt ? 'Renda fixa marcada como isenta pelo usuário; confira elegibilidade e vencimento.' : 'Renda fixa pode ter IOF/IR regressivo conforme prazo e produto.';
  if (type === 'CAIXA') return 'Caixa/reserva não gera imposto de renda por si só, mas rendimentos vinculados devem ser controlados.';
  return 'Mantenha controle fiscal por ativo, conta, data, custo, taxas e proventos.';
}

function buildIncomeCalendar(events = {}, income = {}, input = {}) {
  const months = Number(input.calendarMonths || input.incomeMonths || 12);
  const start = new Date();
  const keys = Array.from({ length: Math.max(1, Math.min(months, 36)) }, (_, i) => addMonthKey(start, i));
  const byMonth = new Map(keys.map(month => [month, { month, estimatedIncome: 0, events: 0, tickers: new Set(), source: 'forward-estimate' }]));

  for (const ev of safeArray(events.items)) {
    const m = ym(ev.dataPagamento || ev.paymentDate || ev.date || ev.dataCom);
    if (!m) continue;
    if (!byMonth.has(m)) byMonth.set(m, { month: m, estimatedIncome: 0, events: 0, tickers: new Set(), source: 'events' });
    const row = byMonth.get(m);
    row.estimatedIncome += Number(ev.valorEstimado || ev.estimatedValue || 0) || 0;
    row.events += 1;
    if (ev.ticker) row.tickers.add(ev.ticker);
    row.source = row.source === 'forward-estimate' ? 'events' : row.source;
  }

  const monthlyFallback = Number(income.monthlyIncomeEstimated || 0);
  const rows = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(0, Math.max(1, Math.min(months, 36))).map(row => ({
    month: row.month,
    estimatedIncome: money(row.estimatedIncome > 0 ? row.estimatedIncome : monthlyFallback),
    events: row.events,
    tickers: [...row.tickers].slice(0, 12),
    source: row.estimatedIncome > 0 ? row.source : 'portfolio-yield-estimate',
  }));

  return {
    months: rows.length,
    monthlyAverage: rows.length ? money(rows.reduce((s, r) => s + r.estimatedIncome, 0) / rows.length) : 0,
    totalEstimated: money(rows.reduce((s, r) => s + r.estimatedIncome, 0)),
    rows,
  };
}

function buildIncomeCoverage(positions = [], income = {}) {
  const byTicker = safeArray(income.byTicker);
  const total = Number(income.annualIncomeEstimated || 0);
  const top1 = byTicker[0]?.annualIncomeEstimated || 0;
  const top3 = byTicker.slice(0, 3).reduce((s, p) => s + Number(p.annualIncomeEstimated || 0), 0);
  const payers = byTicker.length;
  const positionsCount = positions.length || 1;
  let grade = 'C';
  if (payers >= Math.min(8, positionsCount) && pct(top3 / (total || 1)) < 55) grade = 'A';
  else if (payers >= Math.min(5, positionsCount) && pct(top3 / (total || 1)) < 70) grade = 'B';
  else if (!payers) grade = 'D';
  return {
    incomePayers: payers,
    incomePayerPercent: pct(payers / positionsCount),
    top1IncomePercent: total > 0 ? pct(top1 / total) : 0,
    top3IncomePercent: total > 0 ? pct(top3 / total) : 0,
    grade,
    concentrationWarning: total > 0 && top3 / total > 0.7,
  };
}

function buildLiquidityMap(positions = [], summary = {}) {
  const buckets = {
    immediate: { key: 'D+0/D+1', value: 0, count: 0 },
    short: { key: 'D+2 até D+30', value: 0, count: 0 },
    medium: { key: 'D+31 até D+180', value: 0, count: 0 },
    long: { key: 'D+181+', value: 0, count: 0 },
    unknown: { key: 'Não informado', value: 0, count: 0 },
  };
  for (const p of positions) {
    const v = Number(p.currentValue || 0);
    const d = Number(p.liquidityDays ?? p.liquidezDias ?? NaN);
    let bucket = 'unknown';
    if (Number.isFinite(d)) {
      if (d <= 1) bucket = 'immediate';
      else if (d <= 30) bucket = 'short';
      else if (d <= 180) bucket = 'medium';
      else bucket = 'long';
    } else if (['CAIXA','ACOES','FIIS','ETFS','BDR'].includes(String(p.type || '').toUpperCase())) bucket = 'immediate';
    buckets[bucket].value += v;
    buckets[bucket].count += 1;
  }
  const total = Number(summary.totalCurrentValue || 0);
  return Object.values(buckets).map(b => ({ ...b, value: money(b.value), percent: total > 0 ? pct(b.value / total) : 0 })).filter(b => b.count > 0 || b.value > 0);
}

function futureValue({ presentValue = 0, monthlyContribution = 0, annualReturnPercent = 0, years = 10 }) {
  const months = Math.max(1, Math.min(Number(years || 10) * 12, 50 * 12));
  const monthlyRate = Math.pow(1 + Number(annualReturnPercent || 0) / 100, 1 / 12) - 1;
  let value = Number(presentValue || 0);
  for (let i = 0; i < months; i++) value = value * (1 + monthlyRate) + Number(monthlyContribution || 0);
  return money(value);
}

function buildGoalProjection(summary = {}, income = {}, input = {}) {
  const monthlyContribution = parseLocaleNumber(input.monthlyContribution ?? input.aporteMensal ?? input.contributionMonthly, 0);
  const years = Math.max(1, Math.min(parseLocaleNumber(input.projectionYears ?? input.years ?? 10, 10), 50));
  const expectedReturnAnnualPercent = parsePercent(input.expectedReturnAnnualPercent ?? input.expectedReturn ?? null, null) ?? Math.max(3, Math.min(14, Number(income.annualYieldOnCurrentValue || 0) + 4));
  const inflationAnnualPercent = parsePercent(input.inflationAnnualPercent ?? input.inflation ?? null, null) ?? 4;
  const nominalFinalValue = futureValue({ presentValue: summary.totalCurrentValue, monthlyContribution, annualReturnPercent: expectedReturnAnnualPercent, years });
  const realFinalValue = money(nominalFinalValue / Math.pow(1 + inflationAnnualPercent / 100, years));
  return {
    years,
    monthlyContribution: money(monthlyContribution),
    expectedReturnAnnualPercent: round(expectedReturnAnnualPercent, 2),
    inflationAnnualPercent: round(inflationAnnualPercent, 2),
    nominalFinalValue,
    inflationAdjustedFinalValue: realFinalValue,
    assumptions: 'Projeção educativa por juros compostos; não considera impostos, taxas, slippage, mudanças de provento, risco ou suitability.',
  };
}

function buildDataCompleteness(positions = [], diagnostics = {}) {
  const total = positions.length || 1;
  const missingPrice = positions.filter(p => safeArray(p.flags).includes('MISSING_CURRENT_PRICE')).length;
  const missingCost = positions.filter(p => safeArray(p.flags).includes('MISSING_AVERAGE_PRICE')).length;
  const notEnriched = positions.filter(p => safeArray(p.flags).includes('ASSET_NOT_ENRICHED')).length;
  const enrichedPercent = pct((total - notEnriched) / total);
  const priceCoverage = pct((total - missingPrice) / total);
  const costCoverage = pct((total - missingCost) / total);
  const score = Math.round((enrichedPercent * 0.4) + (priceCoverage * 0.35) + (costCoverage * 0.25));
  return { score, enrichedPercent, priceCoverage, costCoverage, missingPrice, missingCost, notEnriched, sourceErrors: safeArray(diagnostics.errors).length };
}

function buildTaxPlanner(positions = [], input = {}) {
  const uniqueHints = [];
  const seen = new Set();
  for (const p of positions) {
    const hint = inferTaxHint(p);
    if (!seen.has(hint)) { seen.add(hint); uniqueHints.push(hint); }
  }
  return {
    educationalOnly: true,
    taxYear: input.taxYear || new Date().getUTCFullYear(),
    hints: uniqueHints.slice(0, 8),
    requiredControls: ['preço médio', 'quantidade', 'data de compra/venda', 'taxas', 'proventos', 'corretora/conta', 'classe do ativo'],
    note: 'Não calcula imposto devido e não substitui contador/consultor fiscal.',
  };
}

function buildTechnologyReadiness(dataCompleteness = {}, risk = {}, incomeCoverage = {}) {
  let score = 100;
  score -= Math.max(0, 85 - Number(dataCompleteness.score || 0)) * 0.35;
  score -= safeArray(risk.flags).length * 5;
  if (incomeCoverage.concentrationWarning) score -= 8;
  score = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score,
    grade: score >= 90 ? 'A+' : score >= 82 ? 'A' : score >= 72 ? 'B' : score >= 60 ? 'C' : 'D',
    capabilities: ['serverless-free', 'memory-cache', 'batch-dedup', 'normalized-fields', 'portfolio-intelligence', 'scraper4-compat'],
    recommendedNextInputs: ['targetPercent por posição', 'cashAvailable', 'monthlyContribution', 'liquidityDays para renda fixa', 'maturityDate para títulos', 'transactions para histórico/fiscal'],
  };
}


function gradeFromScore(score) {
  const n = Number(score || 0);
  return n >= 90 ? 'A+' : n >= 82 ? 'A' : n >= 74 ? 'B+' : n >= 66 ? 'B' : n >= 55 ? 'C' : n >= 40 ? 'D' : 'E';
}

function buildConcentrationMap(positions = [], allocation = {}) {
  const total = positions.reduce((sum, p) => sum + Number(p.currentValue || 0), 0) || 0;
  const issuer = new Map();
  const indexer = new Map();
  const objective = new Map();
  const tags = new Map();
  for (const p of positions) {
    const value = Number(p.currentValue || 0);
    const push = (map, key) => {
      const k = key || 'Não informado';
      const row = map.get(k) || { key: k, value: 0, count: 0 };
      row.value += value; row.count += 1; map.set(k, row);
    };
    push(issuer, p.issuer || p.account || null);
    push(indexer, p.indexer || null);
    push(objective, p.objective || null);
    for (const tag of safeArray(p.tags)) push(tags, tag);
  }
  const rows = (map) => [...map.values()].map(r => ({ ...r, value: money(r.value), percent: total > 0 ? pct(r.value / total) : 0 })).sort((a,b)=>b.value-a.value).slice(0, 15);
  return {
    byTicker: safeArray(allocation.byTicker).slice(0, 15),
    byType: safeArray(allocation.byType),
    bySector: safeArray(allocation.bySector).slice(0, 15),
    byIssuer: rows(issuer),
    byIndexer: rows(indexer),
    byObjective: rows(objective),
    byTag: rows(tags),
    warnings: [
      ...(rows(issuer)[0]?.percent > 35 ? [`Emissor/conta mais concentrado em ${rows(issuer)[0].percent}%`] : []),
      ...(rows(objective).filter(x => x.key !== 'Não informado').length === 0 ? ['Nenhum objetivo informado por posição.'] : []),
    ],
  };
}

function scorePosition(position = {}, context = {}) {
  const weight = Number(position.weightPercent || 0);
  const incomeYield = Number(position.dividendYield || 0);
  const quality = Number(position.qualityScore || 0) || (safeArray(position.flags).includes('ASSET_NOT_ENRICHED') ? 45 : 70);
  const target = position.targetPercent == null ? null : Number(position.targetPercent);
  const targetGap = target == null ? 0 : Math.abs(target - weight);
  const liquidityDays = Number(position.liquidityDays ?? (['ACOES','FIIS','ETFS','BDR','CAIXA'].includes(String(position.type).toUpperCase()) ? 1 : 999));
  let riskScore = 100;
  riskScore -= Math.max(0, weight - 20) * 2;
  riskScore -= safeArray(position.flags).length * 8;
  riskScore -= liquidityDays > 180 ? 15 : liquidityDays > 30 ? 8 : 0;
  const incomeScore = Math.max(0, Math.min(100, Math.round(incomeYield * 8 + Number(position.monthlyIncomeEstimated || 0) / Math.max(1, Number(context.monthlyIncomeEstimated || 1)) * 15)));
  const targetScore = target == null ? 72 : Math.max(0, Math.min(100, Math.round(100 - targetGap * 4)));
  const diversificationScore = Math.max(0, Math.min(100, Math.round(100 - Math.max(0, weight - 10) * 3)));
  const liquidityScore = liquidityDays <= 1 ? 95 : liquidityDays <= 30 ? 82 : liquidityDays <= 180 ? 65 : 45;
  const score = Math.round(quality * 0.28 + incomeScore * 0.18 + riskScore * 0.22 + liquidityScore * 0.16 + targetScore * 0.10 + diversificationScore * 0.06);
  const reasons = [];
  if (weight > 25) reasons.push('peso elevado na carteira');
  if (incomeYield > 8) reasons.push('renda estimada relevante');
  if (quality >= 80) reasons.push('boa qualidade de dados');
  if (target != null && targetGap > 3) reasons.push('fora da meta declarada');
  if (safeArray(position.flags).length) reasons.push(`${safeArray(position.flags).length} alerta(s) de dados/risco`);
  return {
    ticker: position.ticker,
    type: position.type,
    score: Math.max(0, Math.min(100, score)),
    grade: gradeFromScore(score),
    factors: { quality, income: incomeScore, risk: Math.max(0, Math.round(riskScore)), liquidity: liquidityScore, targetAlignment: targetScore, diversification: diversificationScore },
    weightPercent: weight,
    targetPercent: target,
    actionHint: target != null && target - weight > 2 ? 'priorizar aporte' : target != null && weight - target > 2 ? 'evitar novos aportes/reduzir gradualmente' : weight > 25 ? 'monitorar concentração' : 'manter monitoramento',
    reasons: reasons.slice(0, 5),
  };
}

function buildPositionRanking(positions = [], income = {}) {
  const ranked = safeArray(positions).map(p => scorePosition(p, income)).sort((a,b)=>b.score-a.score);
  return {
    version: PORTFOLIO_INTELLIGENCE_VERSION,
    best: ranked.slice(0, 8),
    attention: [...ranked].sort((a,b)=>a.score-b.score).slice(0, 8),
    byScore: ranked,
    methodology: ['qualidade', 'renda', 'risco/concentração', 'liquidez', 'aderência à meta', 'diversificação'],
  };
}

function buildPassiveIncomeProjection(income = {}, input = {}) {
  const monthlyBase = Number(income.monthlyIncomeEstimated || 0);
  const monthlyContribution = parseLocaleNumber(input.monthlyContribution ?? input.aporteMensal ?? input.contributionMonthly, 0);
  const expectedYield = Math.max(0, Math.min(parsePercent(input.expectedIncomeYieldPercent ?? input.expectedYield ?? income.annualYieldOnCurrentValue ?? 0, 0) || 0, 30));
  const months = Math.max(1, Math.min(Number(input.incomeProjectionMonths || 24), 120));
  const rows = [];
  let investedByContribution = 0;
  for (let i = 1; i <= months; i++) {
    investedByContribution += monthlyContribution;
    const addedMonthlyIncome = investedByContribution * expectedYield / 100 / 12;
    rows.push({ monthOffset: i, projectedMonthlyIncome: money(monthlyBase + addedMonthlyIncome), contributionAccumulated: money(investedByContribution) });
  }
  return {
    months,
    baseMonthlyIncome: money(monthlyBase),
    monthlyContribution: money(monthlyContribution),
    assumedAnnualIncomeYieldPercent: round(expectedYield, 2),
    finalProjectedMonthlyIncome: rows.length ? rows.at(-1).projectedMonthlyIncome : money(monthlyBase),
    rows: rows.filter((_, i) => i < 12 || (i + 1) % 12 === 0),
    note: 'Projeção educativa de renda passiva; não garante proventos futuros e não considera impostos, taxas ou mudanças de distribuição.',
  };
}

function buildRebalanceRoadmap(rebalance = {}, input = {}) {
  const monthlyContribution = parseLocaleNumber(input.monthlyContribution ?? input.aporteMensal ?? input.contributionMonthly ?? rebalance.cashAvailable, 0);
  const buys = safeArray(rebalance.actions).filter(a => a.action === 'BUY' && Number(a.deltaValue || 0) > 0).slice(0, 12);
  const totalGap = buys.reduce((s,a)=>s+Number(a.deltaValue||0),0) || 0;
  return {
    contributionOnly: true,
    monthlyContribution: money(monthlyContribution),
    monthsToCloseEstimated: monthlyContribution > 0 && totalGap > 0 ? Math.ceil(totalGap / monthlyContribution) : null,
    suggestedOrder: buys.map((a, i) => ({ rank: i + 1, scope: a.scope, ticker: a.ticker, type: a.type, targetPercent: a.targetPercent, currentPercent: a.currentPercent, gapValue: money(a.deltaValue), suggestedFirstContribution: totalGap > 0 ? money(monthlyContribution * (Number(a.deltaValue || 0) / totalGap)) : 0 })),
    note: buys.length ? 'Roteiro usa novos aportes para reduzir desvios, evitando vendas quando possível.' : 'Sem gaps de compra detectados; informe metas para gerar roteiro.',
  };
}

function buildObjectiveProgress(positions = [], input = {}) {
  const targetIncome = parseLocaleNumber(input.targetMonthlyIncome ?? input.metaRendaMensal ?? 0, 0);
  const targetValue = parseLocaleNumber(input.targetPortfolioValue ?? input.metaPatrimonio ?? 0, 0);
  const currentValue = positions.reduce((s,p)=>s+Number(p.currentValue||0),0);
  const currentMonthlyIncome = positions.reduce((s,p)=>s+Number(p.monthlyIncomeEstimated||0),0);
  return {
    targetMonthlyIncome: money(targetIncome),
    currentMonthlyIncome: money(currentMonthlyIncome),
    monthlyIncomeProgressPercent: targetIncome > 0 ? pct(currentMonthlyIncome / targetIncome) : null,
    targetPortfolioValue: money(targetValue),
    currentPortfolioValue: money(currentValue),
    portfolioValueProgressPercent: targetValue > 0 ? pct(currentValue / targetValue) : null,
  };
}

function buildPortfolioHealthScore({ summary = {}, risk = {}, income = {}, dataCompleteness = {}, incomeCoverage = {}, technologyReadiness = {} } = {}) {
  let score = 100;
  score -= Math.max(0, 85 - Number(dataCompleteness.score || 0)) * 0.25;
  score -= Math.max(0, Number(risk.concentration?.top1Percent || 0) - 25) * 0.5;
  score -= Math.max(0, Number(risk.concentration?.top3Percent || 0) - 60) * 0.35;
  if (incomeCoverage.concentrationWarning) score -= 8;
  if (Number(income.monthlyIncomeEstimated || 0) <= 0 && Number(summary.positionsCount || 0) > 0) score -= 6;
  score = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score,
    grade: score >= 90 ? 'A+' : score >= 82 ? 'A' : score >= 72 ? 'B' : score >= 60 ? 'C' : 'D',
    components: {
      dataCompleteness: dataCompleteness.score || 0,
      risk: risk.score || 0,
      incomeCoverage: incomeCoverage.grade || 'NA',
      technologyReadiness: technologyReadiness.score || 0,
    },
    note: 'Score educativo de saúde da carteira; não é recomendação individual de investimento.'
  };
}

function buildIncomeStabilityScore(positions = [], incomeCoverage = {}) {
  const payers = Number(incomeCoverage.incomePayers || 0);
  const top3 = Number(incomeCoverage.top3IncomePercent || 0);
  const monthlyKnown = safeArray(positions).filter(p => Number(p.monthlyIncomeEstimated || 0) > 0).length;
  let score = Math.min(100, payers * 10 + monthlyKnown * 3);
  score -= Math.max(0, top3 - 55) * 0.5;
  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, grade: score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : 'D', payers, top3IncomePercent: top3, note: 'Mede diversificação e previsibilidade aproximada da renda estimada.' };
}

function buildPortfolioNarrative({ summary = {}, risk = {}, income = {}, allocation = {}, intelligence = {} } = {}) {
  const positives = [];
  const attention = [];
  const nextActions = [];
  if (Number(summary.totalCurrentValue || 0) > 0) positives.push(`Carteira com valor atual estimado de R$ ${money(summary.totalCurrentValue).toLocaleString('pt-BR')}.`);
  if (Number(income.monthlyIncomeEstimated || 0) > 0) positives.push(`Renda mensal estimada em R$ ${money(income.monthlyIncomeEstimated).toLocaleString('pt-BR')}.`);
  if (risk.grade && ['A','B'].includes(String(risk.grade)[0])) positives.push(`Risco agregado em nível ${risk.grade}.`);
  if (risk.concentration?.top1Percent > 35) attention.push(`Maior posição representa ${risk.concentration.top1Percent}% da carteira.`);
  if (risk.concentration?.top3Percent > 65) attention.push(`Top 3 posições representam ${risk.concentration.top3Percent}% da carteira.`);
  if (intelligence.dataCompleteness?.score < 85) attention.push(`Completude de dados em ${intelligence.dataCompleteness.score}%; alguns cálculos podem estar parciais.`);
  if (safeArray(allocation.byType).length < 2 && Number(summary.positionsCount || 0) > 1) attention.push('Pouca diversificação por classe de ativo.');
  nextActions.push(...safeArray(intelligence.actionPlan).map(a => a.message).slice(0, 3));
  if (!nextActions.length) nextActions.push('Manter monitoramento de concentração, renda e metas após novos aportes.');
  return {
    summary: positives[0] || 'Carteira recebida e analisada com dados disponíveis.',
    strengths: positives.slice(0, 4),
    attentionPoints: attention.slice(0, 5),
    suggestedNextActions: nextActions,
    disclosure: 'Narrativa educativa e operacional; não é recomendação individual de investimento.',
  };
}

export function buildPortfolioIntelligence({ positions = [], summary = {}, allocation = {}, income = {}, risk = {}, rebalance = {}, events = {}, input = {}, diagnostics = {} } = {}) {
  const incomeCalendar = buildIncomeCalendar(events, income, input);
  const incomeCoverage = buildIncomeCoverage(positions, income);
  const liquidity = buildLiquidityMap(positions, summary);
  const goalProjection = buildGoalProjection(summary, income, input);
  const dataCompleteness = buildDataCompleteness(positions, diagnostics);
  const taxPlanner = buildTaxPlanner(positions, input);
  const technologyReadiness = buildTechnologyReadiness(dataCompleteness, risk, incomeCoverage);
  const concentrationMap = buildConcentrationMap(positions, allocation);
  const positionRanking = buildPositionRanking(positions, income);
  const passiveIncomeProjection = buildPassiveIncomeProjection(income, input);
  const rebalanceRoadmap = buildRebalanceRoadmap(rebalance, input);
  const objectiveProgress = buildObjectiveProgress(positions, input);
  const portfolioHealthScore = buildPortfolioHealthScore({ summary, risk, income, dataCompleteness, incomeCoverage, technologyReadiness });
  const incomeStabilityScore = buildIncomeStabilityScore(positions, incomeCoverage);
  const dividendCoverage = { incomePayerPercent: incomeCoverage.incomePayerPercent, incomePayers: incomeCoverage.incomePayers, top3IncomePercent: incomeCoverage.top3IncomePercent, grade: incomeCoverage.grade };
  const actionPlan = [];
  if (safeArray(rebalance.actions).some(a => a.action === 'BUY')) actionPlan.push({ priority: 'high', code: 'USE_CONTRIBUTION_REBALANCE', message: 'Use o plano de rebalanceamento para direcionar novos aportes aos maiores gaps.' });
  if (incomeCoverage.concentrationWarning) actionPlan.push({ priority: 'medium', code: 'REDUCE_INCOME_CONCENTRATION', message: 'Renda anual estimada concentrada em poucos ativos; avalie diversificação de pagadores.' });
  if (dataCompleteness.score < 85) actionPlan.push({ priority: 'medium', code: 'IMPROVE_DATA_COMPLETENESS', message: 'Informe preço médio, valor atual e liquidez para melhorar score e projeções.' });
  if (!actionPlan.length) actionPlan.push({ priority: 'info', code: 'KEEP_MONITORING', message: 'Carteira com boa estrutura de dados; monitore concentração, renda e metas periodicamente.' });

  return {
    version: PORTFOLIO_INTELLIGENCE_VERSION,
    healthScore: portfolioHealthScore,
    incomeCalendar,
    incomeCoverage,
    incomeStabilityScore,
    dividendCoverage,
    liquidity,
    goalProjection,
    dataCompleteness,
    taxPlanner,
    technologyReadiness,
    concentrationMap,
    positionRanking,
    passiveIncomeProjection,
    rebalanceRoadmap,
    objectiveProgress,
    actionPlan,
    portfolioNarrative: buildPortfolioNarrative({ summary, risk, income, allocation, intelligence: { dataCompleteness, actionPlan } }),
  };
}
