function get(obj, path) { return String(path).split('.').reduce((a, k) => a == null ? undefined : a[k], obj); }
function has(obj, path) { const v = get(obj, path); return Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && v !== ''; }

const FIELDS = {
  FII: {
    dividendYield: ['results.dividendYield','results.dividendos.dividendYield','results.historicoIndicadores'],
    pvp: ['results.pvp','results.indicadores.pvp','results.historicoIndicadores'],
    numeroCotistas: ['results.numeroCotistas','results.informacoesFundo.numeroCotistas','results.historicoIndicadores'],
    patrimonioLiquido: ['results.patrimonioLiquido','results.valorPatrimonial.patrimonioLiquido','results.historicoIndicadores'],
    portafolioImoveis: ['results.portafolioImoveis','results.portfolioStats'],
    dividendos: ['results.dividendos.historico','results.historicoDividendos'],
    sobre: ['results.sobre']
  },
  ACAO: {
    precoAtual: ['results.precoAtual','results.cotacao.precoAtual'],
    dividendYield: ['results.dividendYield','results.indicadores.dividendYield','results.dividendos.dividendYield'],
    margemLiquida: ['results.margemLiquida','results.indicadores.margemLiquida','results.indicadoresFundamentalistas.semComparativos.margemLiquida'],
    pCapGiro: ['results.pCapGiro','results.indicadores.pCapGiro','results.indicadoresFundamentalistas.semComparativos.pCapGiro'],
    dividendos: ['results.dividendos.historico','results.historicoDividendos'],
    dadosEmpresa: ['results.dadosEmpresa','results.informacoesEmpresa'],
    comparativoSetor: ['results.comparativoSetor','results.indicadoresFundamentalistas.comparativoSetor']
  }
};

function sourceFor(payload, paths) {
  if (paths.some(p => p.includes('historicoIndicadores') && has(payload, p))) return 'historicoIndicadores';
  if (paths.some(p => p.includes('indicadoresFundamentalistas') && has(payload, p))) return 'indicadoresFundamentalistas';
  if (paths.some(p => p.includes('dividendos') && has(payload, p))) return 'dividendos';
  if (paths.some(p => p.includes('informacoesFundo') && has(payload, p))) return 'informacoesFundo';
  if (payload.sourceReport?.primarySource) return payload.sourceReport.primarySource;
  return 'results';
}

export function buildFieldConfidence(payload = {}) {
  const type = String(payload.type || payload._meta?.tipo || 'ACAO').toUpperCase();
  const spec = FIELDS[type] || FIELDS.ACAO;
  const suspectFields = new Set((payload.validation?.suspicious || []).map(x => x.field));
  const out = {};
  for (const [field, paths] of Object.entries(spec)) {
    const presentPaths = paths.filter(p => has(payload, p));
    let confidence = presentPaths.length ? 0.72 : 0.15;
    if (presentPaths.length >= 2) confidence += 0.12;
    if (presentPaths.some(p => /historicoIndicadores|indicadoresFundamentalistas|informacoesFundo|dadosEmpresa/.test(p))) confidence += 0.1;
    if (payload.sourceReport?.usedInternalApis) confidence += 0.03;
    if (payload.sourceReport?.usedYahoo && /precoAtual/.test(field)) confidence += 0.06;
    if (suspectFields.has(field)) confidence -= 0.35;
    confidence = Math.max(0, Math.min(0.99, Number(confidence.toFixed(2))));
    out[field] = { confidence, present: presentPaths.length > 0, source: sourceFor(payload, presentPaths), paths: presentPaths, validated: confidence >= 0.75 && !suspectFields.has(field) };
  }
  return out;
}
