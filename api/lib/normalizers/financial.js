// Normalizadores e estatísticas derivadas do Valorae.
// Módulo puro: não faz fetch e pode ser usado em testes/golden files.

export function parsePtNumber(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  let s = String(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/R\$|US\$/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s || /^[-—–]+$/.test(s)) return undefined;

  const lower = s.toLowerCase();
  let mult = 1;
  if (/tri(?:lh(?:ã|a)o|lh(?:õ|o)es)?|(?:^|\s)T(?:\s|$)/i.test(s)) mult = 1e12;
  else if (/bi(?:lh(?:ã|a)o|lh(?:õ|o)es)?|bilh(?:ã|a)o|bilh(?:õ|o)es|(?:^|\s)B(?:\s|$)/i.test(s)) mult = 1e9;
  else if (/mi(?:lh(?:ã|a)o|lh(?:õ|o)es)?|milh(?:ã|a)o|milh(?:õ|o)es|(?:^|\s)M(?:\s|$)/i.test(s)) mult = 1e6;
  else if (/(?:^|\s)K(?:\s|$)/.test(s)) mult = 1e3;

  s = s
    .replace(/m²|m2/gi, '')
    .replace(/tri(?:lh(?:ã|a)o|lh(?:õ|o)es)?|bi(?:lh(?:ã|a)o|lh(?:õ|o)es)?|milh(?:ã|a)o|milh(?:õ|o)es|mil(?:h(?:a|õ)es)?|(?:^|\s)[TBMK](?:\s|$)/gi, ' ')
    .replace(/%/g, '')
    .trim();

  const negative = /^-/.test(s);
  s = s.replace(/^[+-]/, '');
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = Number(s.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n)) return undefined;
  return (negative ? -n : n) * mult;
}

export function parsePercent(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  return parsePtNumber(String(value).replace('%', ''));
}

export function round(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function compactString(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function extractAblM2(raw) {
  const n = parsePtNumber(raw);
  return n === undefined ? undefined : n;
}

export function deriveFiiPortfolioStats(results = {}) {
  const sections = results.sections || {};
  const items = Array.isArray(results.portafolioImoveis) ? results.portafolioImoveis
    : Array.isArray(results.portfolioImoveis) ? results.portfolioImoveis
    : Array.isArray(sections.listaImoveis) ? sections.listaImoveis
    : [];

  if (!items.length) return undefined;

  const byState = {};
  let ablTotalM2 = 0;
  let ablCount = 0;
  const normalizedItems = items.map((item) => {
    const nome = compactString(item?.nome || item?.name || '');
    const estado = compactString(item?.estado || item?.uf || item?.state || 'Não informado');
    const ablM2 = extractAblM2(item?.abl || item?.area || item?.areaBrutaLocavel);
    byState[estado] = byState[estado] || { estado, quantidade: 0, ablM2: 0 };
    byState[estado].quantidade += 1;
    if (ablM2 !== undefined) {
      byState[estado].ablM2 += ablM2;
      ablTotalM2 += ablM2;
      ablCount += 1;
    }
    return { nome, estado, abl: item?.abl, ablM2 };
  });

  const estados = Object.values(byState)
    .map(x => ({ ...x, ablM2: round(x.ablM2, 2), percentualAbl: ablTotalM2 ? round((x.ablM2 / ablTotalM2) * 100, 2) : undefined }))
    .sort((a, b) => (b.ablM2 || 0) - (a.ablM2 || 0) || b.quantidade - a.quantidade);
  const topEstado = estados[0] || null;
  const maioresImoveis = normalizedItems
    .filter(x => x.ablM2 !== undefined)
    .sort((a, b) => b.ablM2 - a.ablM2)
    .slice(0, 8);

  return {
    quantidadeImoveis: items.length,
    quantidadeEstados: estados.length,
    ablTotalM2: ablCount ? round(ablTotalM2, 2) : undefined,
    ablMediaM2: ablCount ? round(ablTotalM2 / ablCount, 2) : undefined,
    estados,
    topEstado,
    maioresImoveis,
    concentracaoMaiorEstadoPct: topEstado?.percentualAbl,
  };
}

export function deriveStockFinancialSummary(results = {}) {
  const info = results.informacoesEmpresa || {};
  const indicadores = results.indicadoresFundamentalistas?.semComparativos || results.indicadores || {};
  const summary = {};

  const valorMercado = info.valorDeMercado ?? results.valorDeMercado;
  const valorFirma = info.valorDeFirma ?? results.valorDeFirma;
  const dividaBruta = info.dividaBruta ?? results.dividaBruta;
  const dividaLiquida = info.dividaLiquida ?? results.dividaLiquida;
  const disponibilidade = info.disponibilidade ?? results.disponibilidade;
  const patrimonioLiquido = info.patrimonioLiquido ?? results.patrimonioLiquido;
  const totalPapeis = info.totalPapeis ?? results.totalPapeis;
  const precoAtual = results.precoAtual ?? results.cotacao?.precoAtual;

  if (valorMercado !== undefined) summary.valorDeMercado = valorMercado;
  if (valorFirma !== undefined) summary.valorDeFirma = valorFirma;
  if (dividaLiquida !== undefined) summary.dividaLiquida = dividaLiquida;
  if (dividaBruta !== undefined) summary.dividaBruta = dividaBruta;
  if (disponibilidade !== undefined) summary.caixaDisponibilidades = disponibilidade;
  if (patrimonioLiquido !== undefined) summary.patrimonioLiquido = patrimonioLiquido;
  if (totalPapeis !== undefined) summary.totalPapeis = totalPapeis;
  if (precoAtual !== undefined) summary.precoAtual = precoAtual;

  if (valorMercado && patrimonioLiquido) summary.marketToBookCalculado = round(valorMercado / patrimonioLiquido, 2);
  if (dividaLiquida !== undefined && patrimonioLiquido) summary.dividaLiquidaPatrimonioCalculada = round(dividaLiquida / patrimonioLiquido, 2);
  if (valorFirma && valorMercado) summary.evSobreMarketCap = round(valorFirma / valorMercado, 2);
  if (totalPapeis && precoAtual) summary.marketCapEstimadoPorPreco = round(totalPapeis * precoAtual, 0);

  const ratios = {};
  for (const key of ['pl','pvp','psr','pEbitda','pEbit','evEbitda','evEbit','roe','roic','roa','margemLiquida','margemEbitda','dividendYield','payout']) {
    if (results[key] !== undefined) ratios[key] = results[key];
    else if (indicadores[key] !== undefined) ratios[key] = indicadores[key];
    else if (key === 'dividendYield' && indicadores.dy !== undefined) ratios[key] = indicadores.dy;
  }
  if (Object.keys(ratios).length) summary.ratiosChave = ratios;
  return Object.keys(summary).length ? summary : undefined;
}
