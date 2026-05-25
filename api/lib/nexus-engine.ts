import { z } from 'zod';

// ════════════════════════════════════════════════════════════════════════════
// 1. TIPAGENS E CONTRATOS (SIMULADOS EM JS)
// ════════════════════════════════════════════════════════════════════════════

/** @typedef {'ACAO' | 'FII' | 'BDR' | 'ETF' | 'STOCK'} ExtendedAssetType */

// ════════════════════════════════════════════════════════════════════════════
// 2. CONSTANTES
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
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
];

const ETFS_CONHECIDOS = new Set([
  'BOVA11','IVVB11','SMAL11','DIVO11','FIND11','MATB11','GOVE11','XFIX11',
  'GOLD11','SPXI11','HASH11','BOVB11','BOVS11','BRAP11','BRRJ11','BRAX11',
  'XINA11','EURP11','FIXA11','TCHE11','ECOO11','ACWI11','NASD11',
]);

// FIX: mapa explícito de tipo → segmento de URL do Investidor10
// Antes: `type === 'FII' ? 'fiis' : 'acoes'` — ETFs iam para /acoes/ (404 / dados errados)
const TIPO_URL_MAP = {
  'FII':   'fiis',
  'ETF':   'etfs',
  'BDR':   'bdrs',
  'STOCK': 'stocks',
  'ACAO':  'acoes',
};

const NEXUS_PROXY_CACHE_VERSION = '2026-05-25-nexus-v16.1';

// ════════════════════════════════════════════════════════════════════════════
// 3. UTILITÁRIOS
// ════════════════════════════════════════════════════════════════════════════

const UNITS_CONHECIDAS = new Set([
  'TAEE11', 'SANB11', 'ALUP11', 'KLBN11', 'BPAC11', 'ENGI11', 'TIET11', 'SULA11', 'BIDI11', 'SAPR11'
]);

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
  } else {
    const ult = limpo[limpo.length - 1];
    if      (ult === 'K') { mult = 1_000;         limpo = limpo.slice(0, -1); }
    else if (ult === 'M') { mult = 1_000_000;     limpo = limpo.slice(0, -1); }
    else if (ult === 'B') { mult = 1_000_000_000; limpo = limpo.slice(0, -1); }
  }

  limpo = limpo.replace(RE_MILHAR, '').replace(RE_DECIMAL, '.');
  const num = parseFloat(limpo);
  return isNaN(num) ? raw.trim() : num * mult;
}

export function inferAssetType(ticker) {
  const t = ticker.trim().toUpperCase();
  if (ETFS_CONHECIDOS.has(t)) return 'ETF';
  if (UNITS_CONHECIDAS.has(t)) return 'ACAO';
  if (RE_BDR.test(t)) return 'BDR';
  if (t.endsWith('11')) return 'FII';
  if (/^[A-Z]{1,5}$/.test(t)) return 'STOCK';
  return 'ACAO';
}

// ════════════════════════════════════════════════════════════════════════════
// 4. MOTOR
// ════════════════════════════════════════════════════════════════════════════

const _regexCache = new Map();
const _anchorLowerCache = new Map();

function getGlobalRegex(source) {
  let r = _regexCache.get(source);
  if (!r) {
    r = new RegExp(source, 'g');
    _regexCache.set(source, r);
  }
  r.lastIndex = 0;
  return r;
}

export function universalLexer(html, template, existingResults = {}, precomputedHtmlLower) {
  const results = { ...existingResults };
  const htmlLower = precomputedHtmlLower || html.toLowerCase();
  const ANCHOR_STRATEGIES = [
    (h, a) => h.indexOf(`>${a}<`),
    (h, a) => h.indexOf(`"${a}"`),
    (h, a) => h.indexOf(`>${a} `),
    (h, a) => h.indexOf(`'${a}'`),
    (h, a) => h.indexOf(a),
  ];

  for (const rule of template.rules) {
    if (results[rule.name] !== undefined && !rule.multiple) continue;

    for (const anchor of rule.anchors) {
      let anchorLower = _anchorLowerCache.get(anchor);
      if (!anchorLower) {
        anchorLower = anchor.toLowerCase();
        _anchorLowerCache.set(anchor, anchorLower);
      }

      if (!htmlLower.includes(anchorLower)) continue;

      let idx = -1;
      for (const strategy of ANCHOR_STRATEGIES) {
        idx = strategy(htmlLower, anchorLower);
        if (idx !== -1) break;
      }
      if (idx === -1) continue;

      const chunkSize = rule.chunkSize ?? (rule.multiple ? 3000 : 400);
      const chunk = html.slice(idx, idx + chunkSize);

      if (rule.multiple) {
        const gRegex = getGlobalRegex(rule.extractRegex.source);
        const matches = [...chunk.matchAll(gRegex)];
        if (matches.length > 0) {
          const extracted = matches
            .map(m => {
              if (rule.extractGroups) {
                return rule.formatter ? rule.formatter(m) : Array.from(m).slice(1);
              }
              const val = m[1]?.trim();
              if (!val || VALORES_INVALIDOS.has(val)) return null;
              return rule.formatter ? rule.formatter(val) : val;
            })
            .filter(v => v !== null && v !== undefined);

          if (extracted.length > 0) {
            results[rule.name] = extracted;
            break;
          }
        }
      } else {
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
  }
  return results;
}

// ════════════════════════════════════════════════════════════════════════════
// 5. SCHEMAS E TEMPLATES (ACAO / FII / ETF / BDR)
// ════════════════════════════════════════════════════════════════════════════

const zNumStr = () => z.union([z.number(), z.string()]).optional();
const zStr    = () => z.string().optional();

export const B3Schema = z.object({
  precoAtual: zNumStr(),
  variacaoDay: zStr(),
  dy12m: zStr(),
  pl: zNumStr(),
  pvp: zNumStr(),
  roe: zStr(),
  dividaLiquidaEbitda: zNumStr(),
});

const COMMON_FORMATTERS = {
  num: (r) => normalizeBRNumber(r),
  pct: (r) => r.trim().includes('%') ? r.trim() : r.trim() + '%',
  str: (r) => r.trim(),
};

export const acaoTemplate = {
  name: 'B3_ACAO',
  schema: z.any(),
  rules: [
    { name: 'price',        anchors: ['Cotação', 'Valor atual'],                  extractRegex: />\s*R?\$?\s*([\d,.]+)\s*</,           formatter: COMMON_FORMATTERS.num },
    { name: 'changePercent',anchors: ['Variação', 'Var%'],                        extractRegex: />\s*([+-]?[\d,.]+\s*%?)\s*</                                         },
    { name: 'dy',           anchors: ['DY', 'DY (12M)'],                          extractRegex: />\s*([\d,.]+\s*%?)\s*</                                               },
    // FIX: chunkSize aumentado de 400 → 800 para alcançar o valor de P/L no HTML do Investidor10
    // Confirmado vazio no output.txt: "PL/DY/VAR/PVP/Cotacao ->  / 9,10% / 13,66%..."
    { name: 'pl',           anchors: ['P/L', 'P/Lucro'],                          extractRegex: />\s*([+-]?[\d,.-]+)\s*</,             formatter: COMMON_FORMATTERS.num, chunkSize: 800 },
    { name: 'pvp',          anchors: ['P/VP'],                                    extractRegex: />\s*([\d,.-]+)\s*</,                  formatter: COMMON_FORMATTERS.num },
    { name: 'roe',          anchors: ['ROE'],                                     extractRegex: />\s*([+-]?[\d,.]+\s*%?)\s*</                                          },
    { name: 'vpa',          anchors: ['VPA'],                                     extractRegex: />\s*([\d,.-]+)\s*</,                  formatter: COMMON_FORMATTERS.num },
    { name: 'lpa',          anchors: ['LPA'],                                     extractRegex: />\s*([+-]?[\d,.-]+)\s*</,             formatter: COMMON_FORMATTERS.num },
    { name: 'margins',      anchors: ['Margem Líquida'],                          extractRegex: />\s*([\d,.]+\s*%?)\s*</                                               },
    { name: 'grossMargin',  anchors: ['Margem Bruta'],                            extractRegex: />\s*([\d,.]+\s*%?)\s*</                                               },
    { name: 'ebitMargin',   anchors: ['Margem EBIT'],                             extractRegex: />\s*([\d,.]+\s*%?)\s*</                                               },
    { name: 'ebitdaMargin', anchors: ['Margem EBITDA'],                           extractRegex: />\s*([\d,.]+\s*%?)\s*</                                               },
    { name: 'payout',       anchors: ['Payout'],                                  extractRegex: />\s*([\d,.]+\s*%?)\s*</                                               },
    { name: 'debtEbitda',   anchors: ['Dívida Líquida/EBITDA', 'Dív. Líq./EBITDA'], extractRegex: />\s*([+-]?[\d,.-]+)\s*</,          formatter: COMMON_FORMATTERS.num },
    { name: 'roic',         anchors: ['ROIC'],                                    extractRegex: />\s*([\d,.]+\s*%?)\s*</                                               },
    { name: 'roa',          anchors: ['ROA'],                                     extractRegex: />\s*([\d,.]+\s*%?)\s*</                                               },
    { name: 'cnpj',         anchors: ['CNPJ'],                                    extractRegex: />\s*([\d]{2}\.[\d]{3}\.[\d]{3}\/[\d]{4}-[\d]{2}|[\d./-]{14,18})\s*</ },
    { name: 'marketCap',    anchors: ['Valor de mercado'],                        extractRegex: />\s*R?\$?\s*([\d,. \w]+)\s*</,        formatter: COMMON_FORMATTERS.num },
    { name: 'netWorth',     anchors: ['Patrimônio Líquido'],                      extractRegex: />\s*R?\$?\s*([\d,. \w]+)\s*</,        formatter: COMMON_FORMATTERS.num },
  ],
};

export const fiiTemplate = {
  name: 'B3_FII',
  schema: z.any(),
  rules: [
    { name: 'precoAtual',  anchors: ['Cotação', 'Valor atual'],       extractRegex: />\s*R?\$?\s*([\d,.]+)\s*</,            formatter: COMMON_FORMATTERS.num },
    { name: 'dy12m',       anchors: ['DY', 'DY (12M)'],               extractRegex: />\s*([\d,.]+\s*%?)\s*</,              formatter: COMMON_FORMATTERS.pct },
    { name: 'pvp',         anchors: ['P/VP'],                         extractRegex: />\s*([\d,.]+)\s*</,                   formatter: COMMON_FORMATTERS.num },
    { name: 'fiiVacancy',  anchors: ['Vacância Física', 'Vacância'],  extractRegex: />\s*([\d,.]+\s*%?)\s*</,              formatter: COMMON_FORMATTERS.pct },
    { name: 'fiiSegment',  anchors: ['Segmento'],                     extractRegex: />\s*([A-Za-zÀ-ÿ][^<]{1,40})\s*</,    formatter: COMMON_FORMATTERS.str },
    { name: 'magicNumber', anchors: ['Magic Number'],                 extractRegex: />\s*([\d,.]+)\s*</,                   formatter: COMMON_FORMATTERS.num },
    { name: 'cnpj',        anchors: ['CNPJ'],                         extractRegex: />\s*([\d]{2}\.[\d]{3}\.[\d]{3}\/[\d]{4}-[\d]{2})\s*</, formatter: COMMON_FORMATTERS.str },
  ],
};

// Template simplificado para ETFs — foca em cotação e DY
export const etfTemplate = {
  name: 'B3_ETF',
  schema: z.any(),
  rules: [
    { name: 'price',        anchors: ['Cotação', 'Valor atual'],  extractRegex: />\s*R?\$?\s*([\d,.]+)\s*</,  formatter: COMMON_FORMATTERS.num },
    { name: 'changePercent',anchors: ['Variação', 'Var%'],        extractRegex: />\s*([+-]?[\d,.]+\s*%?)\s*</                                  },
    { name: 'dy',           anchors: ['DY', 'DY (12M)'],         extractRegex: />\s*([\d,.]+\s*%?)\s*</                                        },
    { name: 'pvp',          anchors: ['P/VP'],                    extractRegex: />\s*([\d,.]+)\s*</,          formatter: COMMON_FORMATTERS.num },
    { name: 'cnpj',         anchors: ['CNPJ'],                    extractRegex: />\s*([\d]{2}\.[\d]{3}\.[\d]{3}\/[\d]{4}-[\d]{2})\s*</, formatter: COMMON_FORMATTERS.str },
  ],
};

// Template para BDRs — similar a ação mas sem campos BR-específicos
export const bdrTemplate = {
  name: 'B3_BDR',
  schema: z.any(),
  rules: [
    { name: 'price',        anchors: ['Cotação', 'Valor atual'],  extractRegex: />\s*R?\$?\s*([\d,.]+)\s*</,            formatter: COMMON_FORMATTERS.num },
    { name: 'changePercent',anchors: ['Variação', 'Var%'],        extractRegex: />\s*([+-]?[\d,.]+\s*%?)\s*</                                              },
    { name: 'dy',           anchors: ['DY', 'DY (12M)'],         extractRegex: />\s*([\d,.]+\s*%?)\s*</                                                    },
    { name: 'pl',           anchors: ['P/L', 'P/Lucro'],         extractRegex: />\s*([+-]?[\d,.-]+)\s*</,              formatter: COMMON_FORMATTERS.num, chunkSize: 800 },
    { name: 'pvp',          anchors: ['P/VP'],                    extractRegex: />\s*([\d,.-]+)\s*</,                   formatter: COMMON_FORMATTERS.num },
    { name: 'cnpj',         anchors: ['CNPJ'],                    extractRegex: />\s*([\d]{2}\.[\d]{3}\.[\d]{3}\/[\d]{4}-[\d]{2})\s*</, formatter: COMMON_FORMATTERS.str },
  ],
};

// Template para STOCKs internacionais
export const stockTemplate = {
  name: 'B3_STOCK',
  schema: z.any(),
  rules: [
    { name: 'price',        anchors: ['Cotação', 'Valor atual'],  extractRegex: />\s*R?\$?\s*([\d,.]+)\s*</,  formatter: COMMON_FORMATTERS.num },
    { name: 'changePercent',anchors: ['Variação', 'Var%'],        extractRegex: />\s*([+-]?[\d,.]+\s*%?)\s*</                                  },
    { name: 'dy',           anchors: ['DY', 'DY (12M)'],         extractRegex: />\s*([\d,.]+\s*%?)\s*</                                        },
    { name: 'pl',           anchors: ['P/L', 'P/Lucro'],         extractRegex: />\s*([+-]?[\d,.-]+)\s*</,    formatter: COMMON_FORMATTERS.num, chunkSize: 800 },
    { name: 'pvp',          anchors: ['P/VP'],                    extractRegex: />\s*([\d,.-]+)\s*</,         formatter: COMMON_FORMATTERS.num },
    { name: 'roe',          anchors: ['ROE'],                     extractRegex: />\s*([+-]?[\d,.]+\s*%?)\s*</                                  },
    { name: 'margins',      anchors: ['Margem Líquida'],          extractRegex: />\s*([\d,.]+\s*%?)\s*</                                        },
  ],
};

// FIX: mapa de tipo → template (antes só FII/ACAO eram cobertos)
const TEMPLATE_MAP = {
  'FII':   fiiTemplate,
  'ETF':   etfTemplate,
  'BDR':   bdrTemplate,
  'STOCK': stockTemplate,
  'ACAO':  acaoTemplate,
};

// ════════════════════════════════════════════════════════════════════════════
// 6. CLASSE PRINCIPAL
// ════════════════════════════════════════════════════════════════════════════

export class NexusEngineUltra {
  static _options = {
    cacheTtlMs: 24 * 60 * 60 * 1000,
    useNexusProxy: true,
    nexusProxyUrl: '',
    fetchDispatcher: undefined,
  };

  static configure(opts) {
    this._options = { ...this._options, ...opts };
  }

  static async fetchAtivo(ticker, type = 'ACAO') {
    // FIX: usa TEMPLATE_MAP em vez de ternário — cobre ETF, BDR, STOCK
    const template = TEMPLATE_MAP[type] ?? acaoTemplate;

    // FIX: usa TIPO_URL_MAP em vez de `type === 'FII' ? 'fiis' : 'acoes'`
    // Antes: ETF → /acoes/bova11/ (404), BDR → /acoes/amzo34/ (404)
    // Agora:  ETF → /etfs/bova11/, BDR → /bdrs/amzo34/
    const tipoUrl = TIPO_URL_MAP[type] ?? 'acoes';
    const url = `https://investidor10.com.br/${tipoUrl}/${ticker.toLowerCase()}/`;

    const start = Date.now();
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8',
        'Cache-Control': 'no-cache',
      },
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ao buscar ${url}`);
    }

    const html = await res.text();
    const data = universalLexer(html, template);
    const elapsedMs = Date.now() - start;

    const requestedFields = template.rules.map(r => r.name);
    const foundFields = Object.keys(data).filter(k => data[k] !== null && data[k] !== undefined && data[k] !== '');
    const missingFields = requestedFields.filter(f => !foundFields.includes(f));

    return {
      ticker: ticker.toUpperCase(),
      type,
      source: 'NexusEngine',
      data,
      quality: {
        missingFields,
        emptyFields: missingFields,
        foundFields,
        sourceUrl: url,
      },
      metrics: {
        elapsedMs,
        cacheStatus: 'MISS',
        cacheVersion: NEXUS_PROXY_CACHE_VERSION,
      },
    };
  }
    }
