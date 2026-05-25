
import { z } from 'zod';

// ════════════════════════════════════════════════════════════════════════════
// CONSTANTES E UTILITÁRIOS (SEU MOTOR)
// ════════════════════════════════════════════════════════════════════════════

const RE_MOEDA   = /[R$\s]/g;
const RE_MILHAR  = /\./g;
const RE_DECIMAL = /,/;
const RE_BDR     = /3[2-5]$/;

export const VALORES_INVALIDOS = new Set([
  '-', '—', '–', 'N/A', 'n/a', 'nd', '', 'null', 'undefined',
  '--', '---', '--%', '0%', '0,00', '0.00', 'n.d.', 'N.D.', 'NaN', 'Inf', '#', '?',
  'Indisponível', 'indisponível', 'Bloqueado', 'bloqueado', 'PRO', 'N.I.', '...',
  'Lock', 'lock', '--%',
]);

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
];

const TIPO_URL_MAP = {
  'FII':   'fiis',
  'ETF':   'etfs',
  'BDR':   'bdrs',
  'STOCK': 'stocks',
  'ACAO':  'acoes',
};

export function normalizeBRNumber(raw) {
  if (!raw) return null;
  let limpo = raw.replace(RE_MOEDA, '').toUpperCase().trim();
  if (limpo.includes('%')) return limpo;

  let mult = 1;
  const wordIdx = limpo.search(/BILH|TRILH|MILH(?!AR)|MIL\b/);
  if (wordIdx > 0) {
    const suffix = limpo.slice(wordIdx);
    if      (suffix.startsWith('BILH'))  mult = 1e9;
    else if (suffix.startsWith('TRILH')) mult = 1e12;
    else if (suffix.startsWith('MILH'))  mult = 1e6;
    else if (suffix.startsWith('MIL'))   mult = 1e3;
    limpo = limpo.slice(0, wordIdx).trim();
  }
  limpo = limpo.replace(RE_MILHAR, '').replace(RE_DECIMAL, '.');
  const num = parseFloat(limpo);
  return isNaN(num) ? raw.trim() : num * mult;
}

export function inferAssetType(ticker) {
  const t = ticker.trim().toUpperCase();
  if (t.endsWith('11')) {
      // Simplificação: se termina em 11 e não é ETF conhecido, assume FII
      return 'FII';
  }
  if (RE_BDR.test(t)) return 'BDR';
  return 'ACAO';
}

// ════════════════════════════════════════════════════════════════════════════
// MOTOR DE EXTRAÇÃO (LEXER)
// ════════════════════════════════════════════════════════════════════════════

export function universalLexer(html, template) {
  const results = {};
  const htmlLower = html.toLowerCase();

  for (const rule of template.rules) {
    for (const anchor of rule.anchors) {
      const anchorLower = anchor.toLowerCase();
      const idx = htmlLower.indexOf(anchorLower);
      if (idx === -1) continue;

      const chunkSize = rule.chunkSize ?? 800;
      const chunk = html.slice(idx, idx + chunkSize);
      const match = chunk.match(rule.extractRegex);
      
      if (match?.[1]) {
        const raw = match[1].trim();
        if (!VALORES_INVALIDOS.has(raw)) {
          results[rule.name] = rule.formatter ? rule.formatter(raw) : raw;
          break;
        }
      }
    }
  }
  return results;
}

// ════════════════════════════════════════════════════════════════════════════
// TEMPLATES (SEUS MODELOS DE DADOS)
// ════════════════════════════════════════════════════════════════════════════

const COMMON_FORMATTERS = {
  num: (r) => normalizeBRNumber(r),
  pct: (r) => r.trim().includes('%') ? r.trim() : r.trim() + '%',
};

export const acaoTemplate = {
  rules: [
    { name: 'price', anchors: ['Cotação', 'Valor atual'], extractRegex: />\s*R?\$?\s*([\d,.]+)\s*</, formatter: COMMON_FORMATTERS.num },
    { name: 'changePercent', anchors: ['Variação', 'Var%'], extractRegex: />\s*([+-]?[\d,.]+\s*%?)\s*</ },
    { name: 'dy', anchors: ['DY', 'DY (12M)'], extractRegex: />\s*([\d,.]+\s*%?)\s*</ },
    { name: 'pl', anchors: ['P/L', 'P/Lucro'], extractRegex: />\s*([+-]?[\d,.-]+)\s*</, formatter: COMMON_FORMATTERS.num },
    { name: 'pvp', anchors: ['P/VP'], extractRegex: />\s*([\d,.-]+)\s*</, formatter: COMMON_FORMATTERS.num },
  ],
};

export const fiiTemplate = {
  rules: [
    { name: 'precoAtual', anchors: ['Cotação', 'Valor atual'], extractRegex: />\s*R?\$?\s*([\d,.]+)\s*</, formatter: COMMON_FORMATTERS.num },
    { name: 'dy12m', anchors: ['DY', 'DY (12M)'], extractRegex: />\s*([\d,.]+\s*%?)\s*</, formatter: COMMON_FORMATTERS.pct },
    { name: 'pvp', anchors: ['P/VP'], extractRegex: />\s*([\d,.]+)\s*</, formatter: COMMON_FORMATTERS.num },
    { name: 'fiiVacancy', anchors: ['Vacância Física', 'Vacância'], extractRegex: />\s*([\d,.]+\s*%?)\s*</, formatter: COMMON_FORMATTERS.pct },
    { name: 'fiiSegment', anchors: ['Segmento'], extractRegex: />\s*([A-Za-zÀ-ÿ][^<]{1,40})\s*</ },
  ],
};

const TEMPLATE_MAP = { 'FII': fiiTemplate, 'ACAO': acaoTemplate };

// ════════════════════════════════════════════════════════════════════════════
// CLASSE PRINCIPAL (EXECUTADA NO SERVIDOR)
// ════════════════════════════════════════════════════════════════════════════

export class NexusEngineUltra {
  static async fetchAtivo(ticker) {
    const type = inferAssetType(ticker);
    const template = TEMPLATE_MAP[type] ?? acaoTemplate;
    const tipoUrl = TIPO_URL_MAP[type] ?? 'acoes';
    const url = `https://investidor10.com.br/${tipoUrl}/${ticker.toLowerCase()}/`;

    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENTS[0] }
    });

    if (!res.ok) throw new Error(`Investidor10 retornou erro ${res.status}`);

    const html = await res.text();
    const data = universalLexer(html, template);

    return {
      ticker: ticker.toUpperCase(),
      type,
      data,
      source: 'Nexus Smart Engine v1.0 (Server)'
    };
  }
}
