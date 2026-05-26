function pct(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  const m = String(v ?? '').replace('%','').replace(/\./g,'').replace(',','.').match(/[+-]?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : undefined;
}
function num(v) { const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/\./g,'').replace(',','.')); return Number.isFinite(n) ? n : undefined; }
function clamp(n, lo=0, hi=100) { return Math.max(lo, Math.min(hi, Math.round(n))); }
function grade(score) { return score >= 92 ? 'A+' : score >= 85 ? 'A' : score >= 78 ? 'A-' : score >= 70 ? 'B' : score >= 60 ? 'C' : 'D'; }

export function buildValoraeScore(payload = {}) {
  const r = payload.results || {};
  const type = String(payload.type || '').toUpperCase();
  const q = Number(payload.quality?.score || 0);
  const factors = { qualidadeDados: q };

  if (type === 'FII') {
    const dy = pct(r.dividendYield || r.yield12m || r.indicadores?.dividendYield);
    const pvp = num(r.pvp || r.indicadores?.pvp);
    const vac = pct(r.vacanciaFisica || r.informacoesFundo?.vacanciaFisica);
    const liq = num(r.liquidezDiaria || r.indicadores?.liquidezDiaria);
    const cotistas = num(r.numeroCotistas || r.informacoesFundo?.numeroCotistas);
    const imoveis = num(r.portfolioStats?.quantidadeImoveis);
    factors.dividendos = clamp((dy ?? 0) * 7 + (pct(r.dyMedio5a) ?? 0) * 2.2, 0, 100);
    factors.valuation = pvp ? clamp(100 - Math.abs(pvp - 0.9) * 55, 0, 100) : 50;
    factors.liquidez = clamp((liq ? Math.log10(Math.max(liq, 1)) * 15 : 40) + (cotistas ? Math.log10(Math.max(cotistas, 1)) * 6 : 0), 0, 100);
    factors.risco = clamp(100 - Math.max(0, vac ?? 5) * 4 + Math.min(15, (imoveis || 0) / 2), 0, 100);
    factors.rentabilidade = clamp((pct(r.rentabilidade?.um_ano || r.variacao12m) ?? 0) + 55, 0, 100);
  } else {
    const roe = pct(r.roe || r.indicadores?.roe);
    const roic = pct(r.roic || r.indicadores?.roic);
    const dy = pct(r.dividendYield || r.indicadores?.dividendYield);
    const pl = num(r.pl || r.indicadores?.pl);
    const pvp = num(r.pvp || r.indicadores?.pvp);
    const dlpl = num(r.dividaLiquidaPatrimonio || r.indicadores?.dividaLiquidaPatrimonio);
    factors.eficiencia = clamp((roe ?? 0) * 1.9 + (roic ?? 0) * 1.4, 0, 100);
    factors.dividendos = clamp((dy ?? 0) * 9 + (pct(r.payout || r.indicadores?.payout) ?? 0) * 0.25, 0, 100);
    factors.valuation = clamp(100 - Math.max(0, (pl ?? 12) - 6) * 4 - Math.max(0, (pvp ?? 1.5) - 1) * 15, 0, 100);
    factors.risco = clamp(90 - Math.max(0, (dlpl ?? 0.6) - 0.5) * 35 + (r.informacoesEmpresa?.freeFloat ? 4 : 0), 0, 100);
    factors.rentabilidade = clamp((pct(r.rentabilidade?.um_ano || r.variacao12m) ?? 0) + 45, 0, 100);
  }

  const weights = type === 'FII'
    ? { qualidadeDados: 0.22, dividendos: 0.22, valuation: 0.18, liquidez: 0.16, risco: 0.14, rentabilidade: 0.08 }
    : { qualidadeDados: 0.20, eficiencia: 0.20, dividendos: 0.18, valuation: 0.18, risco: 0.14, rentabilidade: 0.10 };
  let value = 0, total = 0;
  for (const [k, w] of Object.entries(weights)) { if (Number.isFinite(factors[k])) { value += factors[k] * w; total += w; } }
  const score = clamp(total ? value / total : q, 0, 100);
  const strengths = Object.entries(factors).filter(([,v]) => v >= 82).map(([k]) => k).slice(0, 4);
  const risks = Object.entries(factors).filter(([,v]) => v < 60).map(([k]) => k).slice(0, 4);
  return { value: score, grade: grade(score), factors, strengths, risks, methodology: 'Valorae Score v1: qualidade dos dados + dividendos/rentabilidade/valuation/liquidez/risco/eficiência. Não é recomendação de investimento.' };
}
