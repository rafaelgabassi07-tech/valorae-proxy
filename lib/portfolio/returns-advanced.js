function parseLocaleNumber(value, fallback = 0) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (value === undefined || value === null || value === '') return fallback;
  const s = String(value).trim().replace(/R\$|US\$|BRL|USD/gi, '').replace(/%/g, '').replace(/\s+/g, '').replace(/\./g, '').replace(/,/g, '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

export const PORTFOLIO_RETURNS_ADVANCED_VERSION = '21.5.13-mature-final-release-free';

function round(n, d = 2) { const x = Number(n); if (!Number.isFinite(x)) return null; const f = 10 ** d; return Math.round(x * f) / f; }
function dateKey(x) { return String(x || '').slice(0, 10); }

export function buildPortfolioReturnSeries(input = {}) {
  const txs = Array.isArray(input.transactions) ? input.transactions : [];
  const byMonth = new Map();
  for (const t of txs) {
    const m = dateKey(t.date || t.data || new Date().toISOString()).slice(0, 7);
    const type = String(t.type || t.tipo || '').toUpperCase();
    const q = parseLocaleNumber(t.quantity ?? t.quantidade, 0);
    const p = parseLocaleNumber(t.price ?? t.preco, 0);
    const value = q * p;
    const row = byMonth.get(m) || { month: m, buys: 0, sells: 0, dividends: 0, contributions: 0, withdrawals: 0 };
    if (['BUY','COMPRA'].includes(type)) { row.buys += value; row.contributions += value; }
    else if (['SELL','VENDA'].includes(type)) { row.sells += value; row.withdrawals += value; }
    else if (/DIV|JCP|PROVENTO|REND/.test(type)) row.dividends += value || parseLocaleNumber(t.amount ?? t.valor, 0);
    byMonth.set(m, row);
  }
  const monthly = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)).map(r => ({
    ...r,
    buys: round(r.buys), sells: round(r.sells), dividends: round(r.dividends), contributions: round(r.contributions), withdrawals: round(r.withdrawals),
    netContribution: round(r.contributions - r.withdrawals),
    cashflow: round(-r.contributions + r.withdrawals + r.dividends),
  }));
  return {
    version: PORTFOLIO_RETURNS_ADVANCED_VERSION,
    monthly,
    totals: monthly.reduce((acc, r) => {
      acc.buys += r.buys || 0; acc.sells += r.sells || 0; acc.dividends += r.dividends || 0; acc.netContribution += r.netContribution || 0;
      return acc;
    }, { buys: 0, sells: 0, dividends: 0, netContribution: 0 }),
  };
}

export function buildContributionSimulation(analysis = {}, cashAvailable = 0) {
  const positions = Array.isArray(analysis.positions) ? analysis.positions : [];
  const cash = parseLocaleNumber(cashAvailable, 0);
  if (!positions.length || cash <= 0) return { version: PORTFOLIO_RETURNS_ADVANCED_VERSION, cashAvailable: cash, suggestions: [] };
  const ranked = positions
    .map(p => ({ ticker: p.ticker, currentPercent: p.percentOfPortfolio || p.currentPercent || 0, targetPercent: p.targetPercent ?? p.target ?? null, currentValue: p.currentValue || 0 }))
    .filter(p => p.targetPercent != null)
    .map(p => ({ ...p, gap: Number(p.targetPercent) - Number(p.currentPercent || 0) }))
    .filter(p => p.gap > 0)
    .sort((a, b) => b.gap - a.gap);
  const totalGap = ranked.reduce((s, p) => s + p.gap, 0) || 1;
  return {
    version: PORTFOLIO_RETURNS_ADVANCED_VERSION,
    cashAvailable: cash,
    suggestions: ranked.slice(0, 10).map(p => ({ ticker: p.ticker, suggestedAmount: round(cash * (p.gap / totalGap)), reason: `Abaixo da meta em ${round(p.gap)} p.p.` })),
  };
}
