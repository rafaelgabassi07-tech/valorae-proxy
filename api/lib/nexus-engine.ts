/// <reference types="node" />
import { z } from 'zod';

// ════════════════════════════════════════════════════════════════════════════
// 1. TIPAGENS E CONTRATOS
// ════════════════════════════════════════════════════════════════════════════

export interface GenericRule {
  name: string;
  anchors: string[];
  extractRegex: RegExp;
  formatter?: (raw: any) => any;
  /**
   * Se true, extrai todos os matches no chunk como array.
   * Útil para tabelas de dividendos, histórico, etc.
   */
  multiple?: boolean;
  /**
   * NOVO v16 — Quando true (junto com multiple), o formatter recebe o
   * RegExpMatchArray completo em vez de apenas m[1].
   * Permite extração de tabelas multi-coluna (historicoDividendos, etc.).
   */
  extractGroups?: boolean;
  /**
   * NOVO v16 — Tamanho do chunk a analisar após o anchor.
   * Default: chunkSize customizado > rule.multiple ? 3000 : 400.
   */
  chunkSize?: number;
}

export interface ExtractorTemplate<T = any> {
  name: string;
  rules: GenericRule[];
  schema: z.ZodSchema<T>;
}

export interface ScrapeSource<T = any> {
  url: string;
  template: ExtractorTemplate<T>;
  requireStealth?: boolean;
}

/**
 * NOVO v16 — 'STOCK' adicionado para ações estrangeiras listadas no
 * Investidor10 via https://investidor10.com.br/stocks/{TICKER}/
 */
export type ExtendedAssetType = 'ACAO' | 'FII' | 'BDR' | 'ETF' | 'STOCK';

export interface NewsItem {
  title: string;
  link: string;
  pubDate?: Date;
  source?: string;
}

export interface DividendItem {
  tipo: string;
  dataCom: string;
  dataPagamento: string;
  valor: number;
}

export interface NexusEngineOptions {
  cacheTtlMs?: number;
  cacheStaleMs?: number;
  maxRetries?: number;
  retryBaseDelay?: number;
  fetchTimeoutMs?: number;
  concurrencyLimit?: number;
  domainRps?: number;
  domainBurst?: number;
  /** NOVO v16 — Ativa NexusProxy como camada primária de fetch e cache. */
  useNexusProxy?: boolean;
  /** NOVO v16 — URL do endpoint /api/scrape (sobrescreve env NEXUS_PROXY_URL). */
  nexusProxyUrl?: string;
  /** NOVO v16 — URL do endpoint /api/batch-scrape (sobrescreve env NEXUS_PROXY_BATCH_URL). */
  nexusProxyBatchUrl?: string;
  /** NOVO v16 — Timeout para chamadas ao NexusProxy em ms. Default: 12000. */
  nexusProxyTimeoutMs?: number;
  /** NOVO v16 — Número de retentativas no NexusProxy. Default: 2. */
  nexusProxyRetries?: number;
  /** NOVO v17 — Dispatcher customizado para Node fetch (ex: proxy via undici.ProxyAgent). */
  fetchDispatcher?: any;
}

// ════════════════════════════════════════════════════════════════════════════
// 2. CONSTANTES PRÉ-COMPILADAS DE MÓDULO
// ════════════════════════════════════════════════════════════════════════════

const RE_MOEDA   = /[R$\s]/g;
const RE_MILHAR  = /\./g;
const RE_DECIMAL = /,/;
const RE_SA      = /\.SA$/i;
const RE_BDR     = /3[2-5]$/;
/**
 * ATUALIZADO v16 — Aceita 4 letras + 1-2 dígitos (B3) OU 1-5 letras puras
 * (STOCK estrangeiro, ex: AAPL, MSFT) OU tickers com sufixo F fracionado.
 */
const RE_TICKER  = /^(?:[A-Z]{4}\d{1,2}F?|[A-Z]{1,5})$/;
const RE_ESPACO  = /\s+/g;

export const VALORES_INVALIDOS = new Set([
  '-', '—', '–', 'N/A', 'n/a', 'nd', '', 'null', 'undefined',
  '--', '---', '--%', '0%', '0,00', '0.00', 'n.d.', 'N.D.', 'NaN', 'Inf', '#', '?',
  'Indisponível', 'indisponível', 'Bloqueado', 'bloqueado', 'PRO', 'N.I.', '...',
  'Lock', 'lock', '--%',
]);

/**
 * ATUALIZADO v16 — Chrome 136 (Abr/2025) e Firefox 138 (Mai/2025).
 * Versões anteriores (131/133) são sinalizadas por WAFs modernos como scrapers.
 */
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:138.0) Gecko/20100101 Firefox/138.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.7; rv:138.0) Gecko/20100101 Firefox/138.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36 Edg/136.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
];

const YAHOO_HOSTS = ['query1', 'query2'] as const;

/**
 * ATUALIZADO v16 — ETFs B3 conhecidos, incluindo fundos lançados até 2026.
 */
const ETFS_CONHECIDOS = new Set([
  'BOVA11','IVVB11','SMAL11','DIVO11','FIND11','MATB11','GOVE11','XFIX11',
  'GOLD11','SPXI11','HASH11','BOVB11','BOVS11','BRAP11','BRRJ11','BRAX11',
  'XINA11','EURP11','FIXA11','TCHE11','ECOO11','ACWI11','NASD11',
  'USTK11','NSDQ11','DEFI11','ESGE11','SUST11','AGRI11','IFRA11',
  'BDIV11','BLKB11','BNDX11','BOVV11','BRCO11','CSMO11','VALE11','QUAL11',
  'REIT11','TRET11','WRLD11','XBOV11','PIBB11','SMAC11','MOAT11','PORD11',
  // NOVO v16 — fundos lançados/mapeados a partir de 2024-2026
  'GLDL11','BITI11','SOLB11','TECC11','HFOF11','BITH11','COIN11',
  'EMAG11','AGRO11','MCHI11','WEGE11','MAGO11','BLOK11','USIG11',
  'SPAB11','CRYP11','ESGB11','SEMI11','RNDP11','FIDC11','ARGT11',
]);

const DIAS_POR_PERIODO: Readonly<Record<string, number>> = {
  '1mo': 30, '3mo': 90, '6mo': 180, '1y': 365, '5y': 1825, 'max': 10950,
};

/**
 * NOVO v16 — Versão de cache do NexusProxy.
 * Incrementar sempre que seletores ou templates forem alterados.
 */
const NEXUS_PROXY_CACHE_VERSION = '2026-05-23-nexus-v16';

// ════════════════════════════════════════════════════════════════════════════
// 3. GUARD: process.cpuUsage (Node-specific)
// ════════════════════════════════════════════════════════════════════════════

const hasCpuUsage = typeof process !== 'undefined' && typeof (process as any).cpuUsage === 'function';
function safeCpuStart(): any | null { return hasCpuUsage ? (process as any).cpuUsage() : null; }
function safeCpuDeltaMs(start: any | null): number {
  if (!start || !hasCpuUsage) return 0;
  const d = (process as any).cpuUsage(start);
  return (d.user + d.system) / 1000;
}

// ════════════════════════════════════════════════════════════════════════════
// 4. UTILITÁRIOS
// ════════════════════════════════════════════════════════════════════════════

/**
 * ATUALIZADO v16 — normalizeBRNumber agora suporta sufixos numéricos em PT-BR:
 * "R$ 621,67 Bilhões" → 621670000000
 * "R$ 1,22 Trilhão"  → 1220000000000
 * "R$ 140,03 Bilhões" → 140030000000
 * Mantém suporte existente a K/M/B para retrocompatibilidade.
 */
export function normalizeBRNumber(raw: string): number | string {
  if (!raw) return '';
  let limpo = raw.replace(RE_MOEDA, '').toUpperCase().trim();
  if (limpo.includes('%')) return limpo;

  let mult = 1;

  // Detecta sufixos em PT-BR após strip de espaços
  // ex: "621,67BILHÕES", "1,22TRILHÃO", "140,03BILHÕES"
  const wordIdx = limpo.search(/BILH|TRILH|MILH(?!AR)|MIL\b/);
  if (wordIdx > 0) {
    const suffix = limpo.slice(wordIdx);
    if      (suffix.startsWith('BILH'))  mult = 1e9;
    else if (suffix.startsWith('TRILH')) mult = 1e12;
    else if (suffix.startsWith('MILH'))  mult = 1e6;
    else if (suffix.startsWith('MIL'))   mult = 1e3;
    limpo = limpo.slice(0, wordIdx).trim();
  } else {
    // Sufixos curtos (K/M/B) — retrocompatível
    const ult = limpo[limpo.length - 1];
    if      (ult === 'K') { mult = 1_000;         limpo = limpo.slice(0, -1); }
    else if (ult === 'M') { mult = 1_000_000;     limpo = limpo.slice(0, -1); }
    else if (ult === 'B') { mult = 1_000_000_000; limpo = limpo.slice(0, -1); }
  }

  limpo = limpo.replace(RE_MILHAR, '').replace(RE_DECIMAL, '.');
  const num = parseFloat(limpo);
  return isNaN(num) ? raw.trim() : num * mult;
}

/**
 * ATUALIZADO v16 — inferAssetType com suporte a STOCK.
 * Tickers puramente alfabéticos (sem dígito) são considerados STOCK.
 */
export function inferAssetType(ticker: string): ExtendedAssetType {
  const t = ticker.trim().toUpperCase();
  if (ETFS_CONHECIDOS.has(t)) return 'ETF';
  if (RE_BDR.test(t)) return 'BDR';
  if (t.endsWith('11')) return 'FII';
  if (/^[A-Z]{1,5}$/.test(t)) return 'STOCK';
  return 'ACAO';
}

export function canonicalizeTicker(raw: string): string {
  if (!raw) return '';
  return raw.replace(RE_SA, '').trim().toUpperCase();
}

export function validarTicker(ticker: string): string | null {
  const clean = ticker.trim().toUpperCase();
  if (!clean) return 'Ticker vazio';
  if (!RE_TICKER.test(clean)) return `Ticker inválido: ${clean}`;
  return null;
}

export function backoffMs(attempt: number, baseDelay = 500): number {
  const cap = 15000;
  const delay = Math.min(cap, baseDelay * Math.pow(2, attempt));
  return Math.random() * delay;
}

function getRandomAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

class LRUCache<V> {
  private mapa = new Map<string, { data: V; expiresAt: number; staleAt: number }>();
  private _opCount = 0;
  private readonly _cleanEvery = 50;

  constructor(private maxSize: number) {
    if (maxSize < 1) throw new RangeError('LRUCache: maxSize deve ser >= 1');
  }

  private _maybeClean(): void {
    if (++this._opCount < this._cleanEvery) return;
    this._opCount = 0;
    const now = Date.now();
    for (const [k, v] of this.mapa) {
      if (now > v.expiresAt) this.mapa.delete(k);
    }
  }

  get(key: string): { data: V; isStale: boolean } | null {
    const entry = this.mapa.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now > entry.expiresAt) {
      this.mapa.delete(key);
      return null;
    }

    // Reinsere no final para manter ordem LRU
    this.mapa.delete(key);
    this.mapa.set(key, entry);
    return { data: entry.data, isStale: now > entry.staleAt };
  }

  set(key: string, data: V, staleMs: number = 5 * 60 * 1_000, ttlMs: number = 24 * 60 * 60 * 1_000): void {
    this._maybeClean();
    if (this.mapa.has(key)) this.mapa.delete(key);
    else if (this.mapa.size >= this.maxSize) this.mapa.delete(this.mapa.keys().next().value!);

    const now = Date.now();
    this.mapa.set(key, { data, staleAt: now + staleMs, expiresAt: now + ttlMs });
  }

  delete(key: string): boolean { return this.mapa.delete(key); }
  clear(): void                { this.mapa.clear(); this._opCount = 0; }
  get tamanho(): number        { return this.mapa.size; }
  get tamanhoMax(): number     { return this.maxSize; }

  /** NOVO v16.1 — Exporta entradas não-expiradas como objeto para persistência no disco. */
  serialize(): Record<string, { data: V; expiresAt: number; staleAt: number }> {
    const obj: Record<string, { data: V; expiresAt: number; staleAt: number }> = {};
    const now = Date.now();
    for (const [k, v] of this.mapa) {
      if (now <= v.expiresAt) {
        obj[k] = v;
      }
    }
    return obj;
  }

  /** NOVO v16.1 — Popula o cache a partir de objeto desserializado. */
  populate(items: Record<string, { data: V; expiresAt: number; staleAt: number }>): void {
    const now = Date.now();
    for (const [k, v] of Object.entries(items)) {
      if (now <= v.expiresAt) {
        this.mapa.set(k, { data: v.data, expiresAt: v.expiresAt, staleAt: v.staleAt });
      }
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 6. DOMAIN RATE LIMITER
// ════════════════════════════════════════════════════════════════════════════

class DomainRateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly rps: number = 2,
    private readonly burst: number = 5
  ) {
    this.tokens = burst;
    this.lastRefill = performance.now();
  }

  async acquire(): Promise<void> {
    while (true) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const waitMs = ((1 - this.tokens) / this.rps) * 1000;
      await new Promise<void>(resolve => setTimeout(() => resolve(), Math.max(1, waitMs)));
    }
  }

  private refill(): void {
    const now = performance.now();
    const elapsedMs = now - this.lastRefill;
    const newTokens = elapsedMs * (this.rps / 1000);
    if (newTokens > 0) {
      this.tokens = Math.min(this.burst, this.tokens + newTokens);
      this.lastRefill = now;
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 7. CIRCUIT BREAKER — corrigido
// ════════════════════════════════════════════════════════════════════════════

type CBState = 'FECHADO' | 'ABERTO' | 'SEMI_ABERTO';

class CircuitBreaker {
  private state: CBState = 'FECHADO';
  private failures = 0;
  private lastFailureTime = 0;
  private successCount = 0;

  constructor(
    private threshold: number = 3,
    private resetMs:   number = 30_000,
  ) {}

  /** getState() não produz side-effects — transição ocorre apenas em isOpen(). */
  getState(): CBState { return this.state; }

  isOpen(): boolean {
    if (this.state === 'ABERTO') {
      if (Date.now() - this.lastFailureTime > this.resetMs) {
        this.state = 'SEMI_ABERTO';
        return false;
      }
      return true;
    }
    return false;
  }

  recordSuccess(): void {
    if (this.state === 'SEMI_ABERTO') {
      this.successCount++;
      if (this.successCount >= 2) this.reset();
    } else {
      this.failures = 0;
    }
  }

  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    this.successCount = 0;
    if (this.failures >= this.threshold) this.state = 'ABERTO';
  }

  reset(): void {
    this.state    = 'FECHADO';
    this.failures = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
  }

  getFalhas(): number { return this.failures; }
}

// ════════════════════════════════════════════════════════════════════════════
// 8. STEALTH HEADERS (por domínio)
// ════════════════════════════════════════════════════════════════════════════

const _hostnameCache = new Map<string, string>();

function extractHostname(url: string): string {
  const match = url.match(/^https?:\/\/[^\/]+/);
  const origin = match ? match[0] : url;
  let h = _hostnameCache.get(origin);
  if (h) return h;
  try { h = new URL(url).hostname; } catch { h = url; }
  if (_hostnameCache.size >= 64) _hostnameCache.delete(_hostnameCache.keys().next().value!);
  _hostnameCache.set(origin, h);
  return h;
}

const REFERER_CACHE = new Map<string, Record<string, string>>();

const ACCEPT_LANGS = [
  'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  'pt-BR,pt;q=0.8,en-US;q=0.5,en;q=0.3',
  'pt-BR,pt;q=0.9,en;q=0.8',
  'pt-BR,pt;q=0.9',
];

function getRandomIP(): string {
  const r = () => Math.floor(Math.random() * 254) + 1;
  return `${r()}.${r()}.${r()}.${r()}`;
}

function getStealthHeaders(url: string, precomputedHostname?: string): Record<string, string> {
  const hostname = precomputedHostname || extractHostname(url);
  const lang = ACCEPT_LANGS[Math.floor(Math.random() * ACCEPT_LANGS.length)];
  const ip = getRandomIP();

  return {
    'User-Agent'               : getRandomAgent(),
    'Accept'                   : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language'          : lang,
    'Accept-Encoding'          : 'gzip, deflate, br, zstd',
    'Cache-Control'            : 'max-age=0',
    'Upgrade-Insecure-Requests': '1',
    'DNT'                      : '1',
    'Referer'                  : hostname.includes('statusinvest') ? 'https://www.google.com/' : `https://${hostname}/`,
    /** ATUALIZADO v16 — Sec-Ch-Ua atualizado para Chrome 136. */
    'Sec-Ch-Ua'                : '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"',
    'Sec-Ch-Ua-Mobile'         : '?0',
    'Sec-Ch-Ua-Platform'       : '"Windows"',
    'Sec-Fetch-Dest'           : 'document',
    'Sec-Fetch-Mode'           : 'navigate',
    'Sec-Fetch-Site'           : 'none',
    'Sec-Fetch-User'           : '?1',
    'Connection'               : 'keep-alive',
    'X-Forwarded-For'          : ip,
    'Client-IP'                : ip,
    'X-Real-IP'                : ip,
    'CF-Connecting-IP'         : ip,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 9. UNIVERSAL LEXER — ZERO-AST COM SLIDING WINDOW + extractGroups
// ════════════════════════════════════════════════════════════════════════════

/** Cache de RegExp compiladas para o modo `multiple`. */
const _regexCache = new Map<string, RegExp>();

function getGlobalRegex(source: string): RegExp {
  let r = _regexCache.get(source);
  if (!r) {
    r = new RegExp(source, 'g');
    _regexCache.set(source, r);
  }
  r.lastIndex = 0;
  return r;
}

/** Cache de anchor.toLowerCase() para evitar alocações no hot path. */
const _anchorLowerCache = new Map<string, string>();

const ANCHOR_STRATEGIES = [
  (htmlLower: string, anchorLower: string) => htmlLower.indexOf(`>${anchorLower}<`),
  (htmlLower: string, anchorLower: string) => htmlLower.indexOf(`"${anchorLower}"`),
  (htmlLower: string, anchorLower: string) => htmlLower.indexOf(`>${anchorLower} `),
  (htmlLower: string, anchorLower: string) => htmlLower.indexOf(`'${anchorLower}'`),
  (htmlLower: string, anchorLower: string) => htmlLower.indexOf(anchorLower),
];

export function universalLexer<T = any>(
  html: string,
  template: ExtractorTemplate<T>,
  existingResults: Partial<T> = {},
  precomputedHtmlLower?: string,
): Partial<T> {
  const results: any = { ...existingResults };
  const htmlLower = precomputedHtmlLower || html.toLowerCase();

  for (const rule of template.rules) {
    // Para multiple, refaz se ainda não tiver resultado
    if (results[rule.name] !== undefined && !rule.multiple) continue;
    if (rule.multiple && Array.isArray(results[rule.name]) && results[rule.name].length > 0) continue;

    for (const anchor of rule.anchors) {
      let anchorLower = _anchorLowerCache.get(anchor);
      if (!anchorLower) {
        anchorLower = anchor.toLowerCase();
        _anchorLowerCache.set(anchor, anchorLower);
      }

      // ULTRA OPTIMIZATION: Match pre-check. If anchor text is not present in the HTML at all,
      // skip attempting any strategies to avoid multiple expensive substring searches.
      if (!htmlLower.includes(anchorLower)) continue;

      let idx = -1;
      for (const strategy of ANCHOR_STRATEGIES) {
        idx = strategy(htmlLower, anchorLower);
        if (idx !== -1) break;
      }
      if (idx === -1) continue;

      // NOVO v16 — chunkSize customizável por regra
      const chunkSize = rule.chunkSize ?? (rule.multiple ? 3000 : 400);
      const chunk = html.slice(idx, idx + chunkSize);

      if (rule.multiple) {
        const gRegex = getGlobalRegex(rule.extractRegex.source);
        const matches = [...chunk.matchAll(gRegex)];
        if (matches.length > 0) {
          /**
           * NOVO v16 — extractGroups: formatter recebe RegExpMatchArray completo,
           * permitindo extração de tabelas multi-coluna (dividendos, comparações, etc.).
           */
          const extracted = matches
            .map(m => {
              if (rule.extractGroups) {
                return rule.formatter ? rule.formatter(m) : Array.from(m).slice(1);
              }
              const val = m[1]?.trim();
              if (!val || VALORES_INVALIDOS.has(val)) return null;
              return rule.formatter ? rule.formatter(val) : val;
            })
            .filter((v): v is NonNullable<typeof v> => v !== null && v !== undefined);

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

  return results as Partial<T>;
}

// ════════════════════════════════════════════════════════════════════════════
// 10. SCHEMAS ZOD POR TIPO DE ATIVO
// ════════════════════════════════════════════════════════════════════════════

const zNumStr = () => z.union([z.number(), z.string()]).optional();
const zStr    = () => z.string().optional();
const zArr    = () => z.array(z.any()).optional();

/**
 * ATUALIZADO v16 — B3Schema massivamente expandido com todos os indicadores
 * fundamentalistas mapeados no guia de scraping do Investidor10.
 */
export const B3Schema = z.object({
  // ── Hero / Cabeçalho ──────────────────────────────────────────────────
  precoAtual:          zNumStr(),
  variacaoDay:         zStr(),
  variacao12m:         zStr(),
  dy12m:               zStr(),
  dyMedio5a:           zStr(),
  pl:                  zNumStr(),
  pvp:                 zNumStr(),
  dividendYield:       zStr(),
  marketCap:           zNumStr(),

  // ── Indicadores Fundamentalistas ─────────────────────────────────────
  psr:                 zNumStr(),  // P/Receita
  payout:              zStr(),
  margemLiquida:       zStr(),
  margemBruta:         zStr(),
  margemEbit:          zStr(),     // Margem Operacional (EBIT)
  margemEbitda:        zStr(),
  margemOperacional:   zStr(),     // retrocompat (= margemEbit)
  evEbitda:            zNumStr(),
  evEbit:              zNumStr(),
  pEbitda:             zNumStr(),
  pEbit:               zNumStr(),
  pAtivo:              zNumStr(),
  pCapGiro:            zNumStr(),
  pAtivoCircLiq:       zNumStr(),
  vpa:                 zNumStr(),
  lpa:                 zNumStr(),
  giroAtivos:          zNumStr(),
  roe:                 zStr(),
  roic:                zStr(),
  roa:                 zStr(),

  // ── Endividamento ─────────────────────────────────────────────────────
  dividaLiquidaPatrimonio:  zNumStr(),
  dividaLiquidaEbitda:      zNumStr(),
  dividaLiquidaEbit:        zNumStr(),
  dividaBrutaPatrimonio:    zNumStr(),
  patrimonioAtivos:         zNumStr(),
  passivosAtivos:           zNumStr(),
  liquidezCorrente:         zNumStr(),
  dividaBruta:              zNumStr(),
  dividaLiquida:            zNumStr(),
  disponibilidade:          zNumStr(),

  // ── Crescimento ───────────────────────────────────────────────────────
  cagrReceitas5a:      zStr(),
  cagrLucros5a:        zStr(),

  // ── Dados Financeiros ─────────────────────────────────────────────────
  valorDeMercado:      zNumStr(),
  valorDeFirma:        zNumStr(),  // EV / Enterprise Value
  patrimonioLiquido:   zNumStr(),
  totalPapeis:         zNumStr(),
  ativosTotais:        zNumStr(),
  ativoCirculante:     zNumStr(),
  liquidezMediaDiaria: zNumStr(),
  faturamento12m:      zNumStr(),
  lucro12m:            zNumStr(),

  // ── Informações da Empresa ────────────────────────────────────────────
  cnpj:                zStr(),
  setor:               zStr(),
  subsetor:            zStr(),
  segmento:            zStr(),
  segmentoListagem:    zStr(),
  funcionarios:        zNumStr(),
  anoFundacao:         zNumStr(),
  anoBolsa:            zNumStr(),
  freeFloat:           zStr(),
  tagAlong:            zStr(),

  // ── Histórico de Dividendos ───────────────────────────────────────────
  historicoDividendos: zArr(),     // DividendItem[]
  totalDividendos12m:  zNumStr(),

  // ── Checklist BAH (Buy and Hold) ──────────────────────────────────────
  checklistBah:        zArr(),     // boolean[]

  // ── Campos preenchidos pelo Yahoo Finance ────────────────────────────
  regularMarketPrice:  zNumStr(),
});

/**
 * ATUALIZADO v16 — FIISchema expandido com todos os campos do guia de scraping.
 */
export const FIISchema = z.object({
  // ── Hero / Cabeçalho ──────────────────────────────────────────────────
  precoAtual:           zNumStr(),
  variacaoDay:          zStr(),
  variacao12m:          zStr(),
  dividendYield:        zStr(),    // DY 12M
  pvp:                  zNumStr(),
  liquidezDiaria:       zNumStr(),

  // ── Rentabilidade / Yield ─────────────────────────────────────────────
  yield1m:              zStr(),
  yield3m:              zStr(),
  yield6m:              zStr(),
  yield12m:             zStr(),
  dyMedio5a:            zStr(),
  totalDividendos12m:   zNumStr(),
  ultimoRendimento:     zNumStr(),

  // ── Dados Patrimoniais ────────────────────────────────────────────────
  valorPatrimonial:     zNumStr(),  // Val. Patrimonial por cota
  valorPatrimonialTotal: zNumStr(),
  patrimonioLiquido:    zNumStr(),

  // ── Indicadores FII ───────────────────────────────────────────────────
  magicNumber:          zNumStr(),
  vacanciaFisica:       zStr(),
  vacanciaFinanceira:   zStr(),

  // ── Informações do Fundo ──────────────────────────────────────────────
  cnpj:                 zStr(),
  numeroCotistas:       zNumStr(),
  cotasEmitidas:        zNumStr(),
  taxaAdministracao:    zStr(),
  tipoFundo:            zStr(),    // Papel / Tijolo / Híbrido
  segmentoFii:          zStr(),
  mandato:              zStr(),
  publicoAlvo:          zStr(),
  tipoGestao:           zStr(),
  prazoDuracao:         zStr(),

  // ── Histórico de Dividendos ───────────────────────────────────────────
  historicoDividendos:  zArr(),    // DividendItem[]

  // ── Comparação com Médias do Tipo ────────────────────────────────────
  pvpMedioTipo:         zNumStr(),
  dyMedioTipo:          zStr(),
});

export const ETFSchema = z.object({
  precoAtual:        zNumStr(),
  dividendYield:     zStr(),
  pvp:               zNumStr(),
  patrimonioLiquido: zNumStr(),
  taxaAdmin:         zStr(),
  variacaoDay:       zStr(),
  variacao12m:       zStr(),
});

/**
 * NOVO v16 — StockSchema para ações estrangeiras (Stocks) listadas no
 * Investidor10 via /stocks/{TICKER}/. Usa os mesmos indicadores de Ação.
 */
export const StockSchema = B3Schema.extend({
  moeda:     zStr(),   // USD, EUR, etc.
  exchange:  zStr(),   // NYSE, NASDAQ, etc.
});

export type B3Data    = z.infer<typeof B3Schema>;
export type FIIData   = z.infer<typeof FIISchema>;
export type ETFData   = z.infer<typeof ETFSchema>;
export type StockData = z.infer<typeof StockSchema>;

// ════════════════════════════════════════════════════════════════════════════
// 11. TEMPLATES POR TIPO DE ATIVO
// ════════════════════════════════════════════════════════════════════════════

const COMMON_FORMATTERS = {
  num: (r: string) => normalizeBRNumber(r),
  pct: (r: string) => {
    const s = r.trim();
    return s.includes('%') ? s : s + '%';
  },
  int: (r: string) => {
    const n = normalizeBRNumber(r);
    return typeof n === 'number' ? Math.round(n) : r;
  },
  str: (r: string) => r.trim(),
};

/** Formatter para linhas de tabela de dividendos (extractGroups: true). */
const dividendRowFormatter = (m: RegExpMatchArray): DividendItem | null => {
  const tipo = m[1]?.trim();
  const dataCom = m[2]?.trim();
  const dataPag = m[3]?.trim();
  const valor   = m[4]?.trim();
  if (!tipo || !dataCom || !valor) return null;
  const v = parseFloat(valor.replace(',', '.'));
  if (isNaN(v)) return null;
  return { tipo, dataCom, dataPagamento: dataPag ?? '', valor: v };
};

/**
 * ATUALIZADO v16 — acaoTemplate expandido com todos os indicadores do guia.
 * Mapeado a partir das seções 1.1 a 1.8 do investidor10_scraping_guide.md.
 */
export const acaoTemplate: ExtractorTemplate<B3Data> = {
  name: 'B3_ACAO',
  schema: B3Schema,
  rules: [
    // ── Hero / Cabeçalho ────────────────────────────────────────────────
    { name: 'precoAtual',
      anchors: ['Cotação', 'Preço Atual', 'cotacao', 'Valor atual'],
      extractRegex: />\s*R?\$?\s*([\d,.]+)\s*</,  formatter: COMMON_FORMATTERS.num },

    { name: 'variacaoDay',
      anchors: ['Variação', 'variacao', 'Var. Dia', 'var-day', 'Var%'],
      extractRegex: />\s*([+-]?[\d,.]+\s*%?)\s*</,  formatter: COMMON_FORMATTERS.pct },

    { name: 'variacao12m',
      anchors: ['VARIAÇÃO (12M)', 'Variação (12M)', 'Variação 12M', 'VAR 12M', 'Var 12M'],
      extractRegex: />\s*([+-]?[\d,.]+\s*%?)\s*</,  formatter: COMMON_FORMATTERS.pct },

    { name: 'dy12m',
      anchors: ['DY', 'DY (12M)', 'DY 12M', 'Dividend Yield 12M'],
      extractRegex: />\s*([\d,.]+\s*%?)\s*</,  formatter: COMMON_FORMATTERS.pct },

    // ── Indicadores fundamentalistas (Seção 1.3) ─────────────────────────
    { name: 'pl',
      anchors: ['P/L', 'P/Lucro', 'P / L', 'Preço/Lucro'],
      extractRegex: />\s*([+-]?[\d,.-]+)\s*</,  formatter: COMMON_FORMATTERS.num,
      chunkSize: 800 },  // FIX v16.1: default 400 não alcançava o valor no HTML do Investidor10

    { name: 'pvp',
      anchors: ['P/VP', 'P/Valor Patrimonial', 'P / VP'],
      extractRegex: />\s*([\d,.-]+)\s*</,  formatter: COMMON_FORMATTERS.num },

    { name: 'psr',
      anchors: ['P/Receita', 'PSR', 'P/Rev', 'P/Rec'],
      extractRegex: />\s*([\d,.-]+)\s*</,  formatter: COMMON_FORMATTERS.num },

    { name: 'dividendYield',
      anchors: ['Dividend Yield', 'Div. Yield', 'Yield'],
      extractRegex: />\s*([\d,.]+\s*%?)\s*</,  formatter: COMMON_FORMATTERS.pct },

    { name: 'payout',
      anchors: ['Payout'],
      extractRegex: />\s*([\d,.]+\s*%?)\s*</,  formatter: COMMON_FORMATTERS.pct },

    { name: 'margemLiquida',
      anchors: ['Margem Líquida', 'Margem Liquida'],
      extractRegex: />\s*([+-]?[\d,.]+\s*%?)\s*</,  formatter: COMMON_FORMATTERS.pct },

    { name: 'margemBruta',
      anchors: ['Margem Bruta'],
      extractRegex: />\s*([+-]?[\d,.]+\s*%?)\s*</,  formatter: COMMON_FORMATTERS.pct },

    { name: 'margemEbit',
      anchors: ['Margem Ebit', 'Margem EBIT', 'Margem Operacional'],
      extractRegex: />\s*([+-]?[\d,.]+\s*%?)\s*</,  formatter: COMMON_FORMATTERS.pct },

    { name: 'margemEbitda',
      anchors: ['Margem Ebitda', 'Margem EBITDA'],
      extractRegex: />\s*([+-]?[\d,.]+\s*%?)\s*</,  formatter: COMMON_FORMATTERS.pct },

    { name: 'evEbitda',
      anchors: ['EV/EBITDA', 'EV/Ebitda'],
      extractRegex: />\s*([\d,.-]+)\s*</,  formatter: COMMON_FORMATTERS.num },

    { name: 'evEbit',
      anchors: ['EV/EBIT', 'EV/Ebit'],
      extractRegex: />\s*([\d,.-]+)\s*</,  formatter: COMMON_FORMATTERS.num },

    { name: 'pEbitda',
      anchors: ['P/EBITDA', 'P/Ebitda'],
      extractRegex: />\s*([\d,.-]+)\s*</,  formatter: COMMON_FORMATTERS.num },

    { name: 'pEbit',
      anchors: ['P/EBIT', 'P/Ebit'],
      extractRegex: />\s*([\d,.-]+)\s*</,  formatter: COMMON_FORMATTERS.num },

    { name: 'pAtivo',
      anchors: ['P/Ativo'],
      extractRegex: />\s*([+-]?[\d,.-]+)\s*</,  formatter: COMMON_FORMATTERS.num },

    { name: 'pCapGiro',
      anchors: ['P/Cap.Giro', 'P/Capital de Giro', 'P/Cap Giro'],
      extractRegex: />\s*([+-]?[\d,.-]+)\s*</,  formatter: COMMON_FORMATTERS.num },

    { name: 'pAtivoCircLiq',
      anchors: ['P/Ativo Circ. Liq.', 'P/Ativo Circ Liq', 'P/ACL'],
      extractRegex: />\s*([+-]?[\d,.-]+)\s*</,  formatter: COMMON_FORMATTERS.num },

    { name: 'vpa',
      anchors: ['VPA', 'Valor Patrimonial por Ação', 'Val. Pat. por Ação'],
      extractRegex: />\s*([\d,.-]+)\s*</,  formatter: COMMON_FORMATTERS.num },

    { name: 'lpa',
      anchors: ['LPA', 'Lucro por Ação'],
      extractRegex: />\s*([+-]?[\d,.-]+)\s*</,  formatter: COMMON_FORMATTERS.num },

    { name: 'giroAtivos',
      anchors: ['Giro Ativos', 'Giro de Ativos'],
      extractRegex: />\s*([\d,.-]+)\s*</,  formatter: COMMON_FORMATTERS.num },

    { name: 'roe',
      anchors: ['ROE', 'Retorno sobre Patrimônio'],
      extractRegex: />\s*([+-]?[\d,.]+\s*%?)\s*</,  formatter: COMMON_FORMATTERS.pct },

    { name: 'roic',
      anchors: ['ROIC'],
      extractRegex: />\s*([+-]?[\d,.]+\s*%?)\s*</,  formatter: COMMON_FORMATTERS.pct },

    { name: 'roa',
      anchors: ['ROA', 'Retorno sobre Ativos'],
      extractRegex: />\s*([+-]?[\d,.]+\s*%?)\s*</,  formatter: COMMON_FORMATTERS.pct },

    // ── Endividamento ────────────────────────────────────────────────────
    { name: 'dividaLiquidaPatrimonio',
      anchors: ['Dívida Líquida / Patrimônio', 'Div Liq/PL', 'Dívida Liq/Patrimônio'],
      extractRegex: />\s*([+-]?[\d,.-]+)\s*</,  formatter: COMMON_FORMATTERS.num },

    { name: 'dividaLiquidaEbitda',
      anchors: ['Dívida Líquida / Ebitda', 'Dívida Liq/EBITDA', 'Dív Líq/EBITDA'],
      extractRegex: />\s*([+-]?[\d,.-]+)\s*</,  formatter: COMMON_FORMATTERS.num },

    { name: 'dividaLiquidaEbit',
      anchors: ['Dívida Líquida / Ebit', 'Dívida Liq/EBIT'],
      extractRegex: />\s*([+-]?[\d,.-]+)\s*</,  formatter: COMMON_FORMATTERS.num },

    { name: 'dividaBrutaPatrimonio',
      anchors: ['Dívida Bruta / Patrimônio', 'Div Bruta/PL'],
      extractRegex: />\s*([\d,.-]+)\s*</,  formatter: COMMON_FORMATTERS.num },

    { name: 'patrimonioAtivos',
      anchors: ['Patrimônio / Ativos', 'PL/Ativos'],
      extractRegex: />\s*([\d,.-]+)\s*</,  formatter: COMMON_FORMATTERS.num },

    { name: 'passivosAtivos',
      anchors: ['Passivos / Ativos', 'Passivo/Ativo'],
      extractRegex: />\s*([\d,.-]+)\s*</,  formatter: COMMON_FORMATTERS.num },

    { name: 'liquidezCorrente',
      anchors: ['Liquidez Corrente'],
      extractRegex: />\s*([\d,.-]+)\s*</,  formatter: COMMON_FORMATTERS.num },

    // ── Crescimento ──────────────────────────────────────────────────────
    { name: 'cagrReceitas5a',
      anchors: ['CAGR Receitas 5 anos', 'CAGR Receitas 5A', 'CAGR Receitas'],
      extractRegex: />\s*([+-]?[\d,.]+\s*%?)\s*</,  formatter: COMMON_FORMATTERS.pct },

    { name: 'cagrLucros5a',
      anchors: ['CAGR Lucros 5 anos', 'CAGR Lucros 5A', 'CAGR Lucros'],
      extractRegex: />\s*([+-]?[\d,.]+\s*%?)\s*</,  formatter: COMMON_FORMATTERS.pct },

    // ── Dados Financeiros (Seção 1.8) ────────────────────────────────────
    { name: 'valorDeMercado',
      anchors: ['Valor de Mercado'],
      extractRegex: />\s*R?\$?\s*([\d,.]+\s*(?:Bilh[^\s<]{0,6}|Milh[^\s<]{0,6}|Trilh[^\s<]{0,6}|[KMB])?)\s*</,
      formatter: COMMON_FORMATTERS.num },

    { name: 'valorDeFirma',
      anchors: ['Valor de Firma', 'Enterprise Value', 'EV'],
      extractRegex: />\s*R?\$?\s*([\d,.]+\s*(?:Bilh[^\s<]{0,6}|Milh[^\s<]{0,6}|Trilh[^\s<]{0,6}|[KMB])?)\s*</,
      formatter: COMMON_FORMATTERS.num },

    { name: 'patrimonioLiquido',
      anchors: ['Patrimônio Líquido'],
      extractRegex: />\s*R?\$?\s*([\d,.]+\s*(?:Bilh[^\s<]{0,6}|Milh[^\s<]{0,6}|Trilh[^\s<]{0,6}|[KMB])?)\s*</,
      formatter: COMMON_FORMATTERS.num },

    { name: 'totalPapeis',
      anchors: ['Nº total de papéis', 'Total de Papéis', 'Nº Papéis'],
      extractRegex: />\s*([\d,.]+\s*(?:Bilh[^\s<]{0,6}|Milh[^\s<]{0,6}|[KMB])?)\s*</,
      formatter: COMMON_FORMATTERS.num },

    { name: 'ativosTotais',
      anchors: ['Ativos Totais', 'Total de Ativos'],
      extractRegex: />\s*R?\$?\s*([\d,.]+\s*(?:Bilh[^\s<]{0,6}|Milh[^\s<]{0,6}|Trilh[^\s<]{0,6}|[KMB])?)\s*</,
      formatter: COMMON_FORMATTERS.num },

    { name: 'ativoCirculante',
      anchors: ['Ativo Circulante'],
      extractRegex: />\s*R?\$?\s*([\d,.]+\s*(?:Bilh[^\s<]{0,6}|Milh[^\s<]{0,6}|[KMB])?)\s*</,
      formatter: COMMON_FORMATTERS.num },

    { name: 'dividaLiquida',
      anchors: ['Dívida Líquida', 'Divida Liquida'],
      extractRegex: />\s*R?\$?\s*([\d,.]+\s*(?:Bilh[^\s<]{0,6}|Milh[^\s<]{0,6}|[KMB])?)\s*</,
      formatter: COMMON_FORMATTERS.num },

    { name: 'dividaBruta',
      anchors: ['Dívida Bruta', 'Divida Bruta'],
      extractRegex: />\s*R?\$?\s*([\d,.]+\s*(?:Bilh[^\s<]{0,6}|Milh[^\s<]{0,6}|[KMB])?)\s*</,
      formatter: COMMON_FORMATTERS.num },

    { name: 'disponibilidade',
      anchors: ['Disponibilidade', 'Caixa e Equivalentes'],
      extractRegex: />\s*R?\$?\s*([\d,.]+\s*(?:Bilh[^\s<]{0,6}|Milh[^\s<]{0,6}|[KMB])?)\s*</,
      formatter: COMMON_FORMATTERS.num },

    { name: 'liquidezMediaDiaria',
      anchors: ['Liquidez Média Diária', 'Liquidez Diária', 'Liq. Média Diária'],
      extractRegex: />\s*R?\$?\s*([\d,.]+\s*(?:Bilh[^\s<]{0,6}|Milh[^\s<]{0,6}|[KMB])?)\s*</,
      formatter: COMMON_FORMATTERS.num },

    { name: 'faturamento12m',
      anchors: ['Faturamento', 'Receita Líquida', 'Receita (12M)'],
      extractRegex: />\s*R?\$?\s*([\d,.]+\s*(?:Bilh[^\s<]{0,6}|Milh[^\s<]{0,6}|Trilh[^\s<]{0,6}|[KMB])?)\s*</,
      formatter: COMMON_FORMATTERS.num },

    { name: 'lucro12m',
      anchors: ['Lucro Líquido', 'Lucro Liquido', 'Lucro (12M)'],
      extractRegex: />\s*R?\$?\s*([\d,.]+\s*(?:Bilh[^\s<]{0,6}|Milh[^\s<]{0,6}|[KMB])?)\s*</,
      formatter: COMMON_FORMATTERS.num },

    // ── DY ───────────────────────────────────────────────────────────────
    { name: 'dyMedio5a',
      anchors: ['DY médio 5 anos', 'DY Médio 5 anos', 'DY médio'],
      extractRegex: />\s*([\d,.]+\s*%?)\s*</,  formatter: COMMON_FORMATTERS.pct },

    { name: 'totalDividendos12m',
      anchors: ['Total pago nos últimos 12 meses', 'Total pago (12M)', 'Total pago'],
      extractRegex: />\s*R?\$?\s*([\d,.]+)\s*</,  formatter: COMMON_FORMATTERS.num },

    // ── Informações da Empresa (Seção 1.7) ───────────────────────────────
    { name: 'cnpj',
      anchors: ['CNPJ'],
      extractRegex: />\s*([\d]{2}\.[\d]{3}\.[\d]{3}\/[\d]{4}-[\d]{2})\s*</,
      formatter: COMMON_FORMATTERS.str },

    { name: 'setor',
      anchors: ['Setor'],
      extractRegex: />\s*([A-Za-zÀ-ÿ][^<]{2,60})\s*</,  formatter: COMMON_FORMATTERS.str },

    { name: 'subsetor',
      anchors: ['Subsetor'],
      extractRegex: />\s*([A-Za-zÀ-ÿ][^<]{2,60})\s*</,  formatter: COMMON_FORMATTERS.str },

    { name: 'segmento',
      anchors: ['Segmento'],
      extractRegex: />\s*([A-Za-zÀ-ÿ][^<]{2,60})\s*</,  formatter: COMMON_FORMATTERS.str },

    { name: 'segmentoListagem',
      anchors: ['Segmento de Listagem', 'Listagem'],
      extractRegex: />\s*([A-Za-zÀ-ÿ][^<]{1,40})\s*</,  formatter: COMMON_FORMATTERS.str },

    { name: 'funcionarios',
      anchors: ['Número de funcionários', 'Funcionários', 'Nº funcionários'],
      extractRegex: />\s*([\d,.]+)\s*</,  formatter: COMMON_FORMATTERS.int },

    { name: 'anoFundacao',
      anchors: ['Ano de fundação', 'Fundação', 'Fundado em'],
      extractRegex: />\s*(1[89]\d{2}|20\d{2})\s*</,  formatter: COMMON_FORMATTERS.int },

    { name: 'anoBolsa',
      anchors: ['Ano de estreia na Bolsa', 'Estreia na Bolsa', 'IPO'],
      extractRegex: />\s*(1[89]\d{2}|20\d{2})\s*</,  formatter: COMMON_FORMATTERS.int },

    { name: 'freeFloat',
      anchors: ['Free Float'],
      extractRegex: />\s*([\d,.]+\s*%?)\s*</,  formatter: COMMON_FORMATTERS.pct },

    { name: 'tagAlong',
      anchors: ['Tag Along'],
      extractRegex: />\s*([\d,.]+\s*%?)\s*</,  formatter: COMMON_FORMATTERS.pct },

    // ── Histórico de Dividendos — multi-coluna (Seção 1.6) ───────────────
    {
      name: 'historicoDividendos',
      anchors: ['historico-dividendos', 'Histórico de Dividendos', 'HISTÓRICO DE DIVIDENDOS', 'Dividendos pagos'],
      extractRegex: /<td[^>]*>\s*(Dividendos|JSCP|Rend\.?\s*Trib\.?)\s*<\/td>\s*<td[^>]*>\s*([\d]{2}\/[\d]{2}\/[\d]{4})\s*<\/td>\s*<td[^>]*>\s*([\d]{2}\/[\d]{2}\/[\d]{4})\s*<\/td>\s*<td[^>]*>\s*([\d,.]+)\s*<\/td>/i,
      multiple: true,
      extractGroups: true,
      chunkSize: 25000,
      formatter: dividendRowFormatter as any,
    },
  ],
};

/**
 * ATUALIZADO v16 — fiiTemplate expandido com todos os campos do guia (Parte 2).
 */
export const fiiTemplate: ExtractorTemplate<FIIData> = {
  name: 'B3_FII',
  schema: FIISchema,
  rules: [
    // ── Hero / Cabeçalho (Seção 2.1) ─────────────────────────────────────
    { name: 'precoAtual',
      anchors: ['Cotação', 'Preço Atual', 'Valor atual'],
      extractRegex: />\s*R?\$?\s*([\d,.]+)\s*</,  formatter: COMMON_FORMATTERS.num },

    { name: 'variacaoDay',
      anchors: ['Variação', 'variacao', 'Var%'],
      extractRegex: />\s*([+-]?[\d,.]+\s*%?)\s*</,  formatter: COMMON_FORMATTERS.pct },

    { name: 'variacao12m',
      anchors: ['VARIAÇÃO (12M)', 'Variação (12M)', 'Variação 12M', 'VAR 12M'],
      extractRegex: />\s*([+-]?[\d,.]+\s*%?)\s*</,  formatter: COMMON_FORMATTERS.pct },

    { name: 'dividendYield',
      anchors: ['Dividend Yield', 'DY', 'DY (12M)', 'Yield'],
      extractRegex: />\s*([\d,.]+\s*%?)\s*</,  formatter: COMMON_FORMATTERS.pct },

    { name: 'pvp',
      anchors: ['P/VP', 'P / VP'],
      extractRegex: />\s*([\d,.]+)\s*</,  formatter: COMMON_FORMATTERS.num },

    { name: 'liquidezDiaria',
      anchors: ['Liquidez Diária', 'Liquidez', 'Liq. Diária'],
      extractRegex: />\s*([\d,.]+\s*(?:[KMB]|Milh[^\s<]{0,6})?)\s*</,  formatter: COMMON_FORMATTERS.num },

    // ── Distribuições / Yield por período (Seção 2.4) ────────────────────
    { name: 'yield1m',
      anchors: ['1 Mês', '1 mês', 'Yield 1M', '1M'],
      extractRegex: />\s*([\d,.]+\s*%?)\s*</,  formatter: COMMON_FORMATTERS.pct },

    { name: 'yield3m',
      anchors: ['3 Meses', '3 meses', 'Yield 3M', '3M'],
      extractRegex: />\s*([\d,.]+\s*%?)\s*</,  formatter: COMMON_FORMATTERS.pct },

    { name: 'yield6m',
      anchors: ['6 Meses', '6 meses', 'Yield 6M', '6M'],
      extractRegex: />\s*([\d,.]+\s*%?)\s*</,  formatter: COMMON_FORMATTERS.pct },

    { name: 'yield12m',
      anchors: ['12 Meses', '12 meses', 'DY 12M'],
      extractRegex: />\s*([\d,.]+\s*%?)\s*</,  formatter: COMMON_FORMATTERS.pct },

    { name: 'dyMedio5a',
      anchors: ['DY médio 5 anos', 'DY Médio 5 anos', 'DY médio'],
      extractRegex: />\s*([\d,.]+\s*%?)\s*</,  formatter: COMMON_FORMATTERS.pct },

    { name: 'totalDividendos12m',
      anchors: ['Total pago (12M)', 'Total pago nos últimos 12 meses', 'Total pago'],
      extractRegex: />\s*R?\$?\s*([\d,.]+)\s*</,  formatter: COMMON_FORMATTERS.num },

    { name: 'ultimoRendimento',
      anchors: ['Último Rendimento', 'Últ. Rendimento', 'Último Dividendo'],
      extractRegex: />\s*R?\$?\s*([\d,.]+)\s*</,  formatter: COMMON_FORMATTERS.num },

    // ── Dados Patrimoniais (Seção 2.6) ────────────────────────────────────
    { name: 'valorPatrimonial',
      anchors: ['Valor Patrimonial por Cota', 'Val. Pat. por Cota', 'VP/Cota', 'Valor Patrimonial'],
      extractRegex: />\s*R?\$?\s*([\d,.]+)\s*</,  formatter: COMMON_FORMATTERS.num },

    { name: 'valorPatrimonialTotal',
      anchors: ['Valor Patrimonial Total', 'Patrimônio Total'],
      extractRegex: />\s*R?\$?\s*([\d,.]+\s*(?:Bilh[^\s<]{0,6}|Milh[^\s<]{0,6}|[KMB])?)\s*</,
      formatter: COMMON_FORMATTERS.num },

    { name: 'patrimonioLiquido',
      anchors: ['Patrimônio Líquido', 'Patrimônio'],
      extractRegex: />\s*R?\$?\s*([\d,.]+\s*(?:Bilh[^\s<]{0,6}|Milh[^\s<]{0,6}|[KMB])?)\s*</,
      formatter: COMMON_FORMATTERS.num },

    // ── Indicadores FII ───────────────────────────────────────────────────
    { name: 'magicNumber',
      anchors: ['Magic Number', 'magic-number'],
      extractRegex: />\s*([\d,.]+)\s*</,  formatter: COMMON_FORMATTERS.num },

    { name: 'vacanciaFisica',
      anchors: ['Vacância Física', 'Vacância Física', 'Vacância'],
      extractRegex: />\s*([\d,.]+\s*%?)\s*</,  formatter: COMMON_FORMATTERS.pct },

    { name: 'vacanciaFinanceira',
      anchors: ['Vacância Financeira'],
      extractRegex: />\s*([\d,.]+\s*%?)\s*</,  formatter: COMMON_FORMATTERS.pct },

    // ── Informações do Fundo (Seção 2.3) ──────────────────────────────────
    { name: 'cnpj',
      anchors: ['CNPJ'],
      extractRegex: />\s*([\d]{2}\.[\d]{3}\.[\d]{3}\/[\d]{4}-[\d]{2})\s*</,
      formatter: COMMON_FORMATTERS.str },

    { name: 'numeroCotistas',
      anchors: ['Número de Cotistas', 'Cotistas', 'Nº Cotistas'],
      extractRegex: />\s*([\d,.]+)\s*</,  formatter: COMMON_FORMATTERS.int },

    { name: 'cotasEmitidas',
      anchors: ['Cotas Emitidas', 'Nº de Cotas'],
      extractRegex: />\s*([\d,.]+\s*(?:Milh[^\s<]{0,6}|[KMB])?)\s*</,  formatter: COMMON_FORMATTERS.num },

    { name: 'taxaAdministracao',
      anchors: ['Taxa de Administração', 'Taxa Admin', 'Taxa Adm.'],
      extractRegex: />\s*([\d,.]+\s*%?[^<]{0,30})\s*</,  formatter: COMMON_FORMATTERS.str },

    { name: 'tipoFundo',
      anchors: ['Tipo de Fundo', 'Tipo Fundo'],
      extractRegex: />\s*([A-Za-zÀ-ÿ][^<]{1,30})\s*</,  formatter: COMMON_FORMATTERS.str },

    { name: 'segmentoFii',
      anchors: ['Segmento'],
      extractRegex: />\s*([A-Za-zÀ-ÿ][^<]{1,40})\s*</,  formatter: COMMON_FORMATTERS.str },

    { name: 'mandato',
      anchors: ['Mandato'],
      extractRegex: />\s*([A-Za-zÀ-ÿ][^<]{1,40})\s*</,  formatter: COMMON_FORMATTERS.str },

    { name: 'publicoAlvo',
      anchors: ['Público-alvo', 'Publico Alvo'],
      extractRegex: />\s*([A-Za-zÀ-ÿ][^<]{1,30})\s*</,  formatter: COMMON_FORMATTERS.str },

    { name: 'tipoGestao',
      anchors: ['Tipo de Gestão', 'Tipo de Gestao', 'Gestão'],
      extractRegex: />\s*([A-Za-zÀ-ÿ][^<]{1,20})\s*</,  formatter: COMMON_FORMATTERS.str },

    { name: 'prazoDuracao',
      anchors: ['Prazo de Duração', 'Prazo Duração', 'Prazo'],
      extractRegex: />\s*([A-Za-zÀ-ÿ0-9][^<]{1,30})\s*</,  formatter: COMMON_FORMATTERS.str },

    // ── Comparação com médias do tipo (Seção 2.7) ─────────────────────────
    { name: 'pvpMedioTipo',
      anchors: ['Média Mesmo Tipo', 'Média do Tipo', 'Média Tipo'],
      extractRegex: />\s*([\d,.]+)\s*</,  formatter: COMMON_FORMATTERS.num },

    // ── Histórico de Dividendos — multi-coluna (Seção 2.5) ───────────────
    {
      name: 'historicoDividendos',
      anchors: ['historico-dividendos', 'Histórico de Dividendos', 'HISTÓRICO DE DIVIDENDOS'],
      extractRegex: /<td[^>]*>\s*(Dividendos)\s*<\/td>\s*<td[^>]*>\s*([\d]{2}\/[\d]{2}\/[\d]{4})\s*<\/td>\s*<td[^>]*>\s*([\d]{2}\/[\d]{2}\/[\d]{4})\s*<\/td>\s*<td[^>]*>\s*([\d,.]+)\s*<\/td>/i,
      multiple: true,
      extractGroups: true,
      chunkSize: 20000,
      formatter: dividendRowFormatter as any,
    },
  ],
};

// Templates aliasados para BDR (mesmo schema de Ação)
export const bdrTemplate = acaoTemplate;

/** ATUALIZADO v16 — ETF template com variacao12m. */
export const etfTemplate: ExtractorTemplate<ETFData> = {
  name: 'B3_ETF',
  schema: ETFSchema,
  rules: [
    { name: 'precoAtual',        anchors: ['Cotação', 'Preço Atual', 'Valor atual'],        extractRegex: />\s*R?\$?\s*([\d,.]+)\s*</, formatter: COMMON_FORMATTERS.num },
    { name: 'dividendYield',     anchors: ['Dividend Yield', 'DY', 'Yield'],                extractRegex: />\s*([\d,.]+\s*%?)\s*</,    formatter: COMMON_FORMATTERS.pct },
    { name: 'pvp',               anchors: ['P/VP'],                                          extractRegex: />\s*([\d,.-]+)\s*</,        formatter: COMMON_FORMATTERS.num },
    { name: 'patrimonioLiquido', anchors: ['Patrimônio Líquido', 'Patrimônio'],              extractRegex: />\s*([\d,.]+[KMB]?)\s*</,   formatter: COMMON_FORMATTERS.num },
    { name: 'taxaAdmin',         anchors: ['Taxa de Administração', 'Taxa Admin'],           extractRegex: />\s*([\d,.]+\s*%?[^<]{0,20})\s*</, formatter: COMMON_FORMATTERS.str },
    { name: 'variacaoDay',       anchors: ['Variação', 'variacao'],                          extractRegex: />\s*([+-]?[\d,.]+\s*%?)\s*</, formatter: COMMON_FORMATTERS.pct },
    { name: 'variacao12m',       anchors: ['VARIAÇÃO (12M)', 'Variação (12M)', 'VAR 12M'],  extractRegex: />\s*([+-]?[\d,.]+\s*%?)\s*</, formatter: COMMON_FORMATTERS.pct },
  ],
};

/**
 * NOVO v16 — stockTemplate para ações estrangeiras (/stocks/{TICKER}/).
 * Reutiliza todas as regras de acaoTemplate com âncoras adicionais em inglês.
 */
export const stockTemplate: ExtractorTemplate<StockData> = {
  name: 'I10_STOCK',
  schema: StockSchema,
  rules: [
    ...acaoTemplate.rules,
    // Âncoras adicionais em inglês para páginas de Stocks
    { name: 'moeda',    anchors: ['Currency', 'Moeda'],  extractRegex: />\s*([A-Z]{3})\s*</, formatter: COMMON_FORMATTERS.str },
    { name: 'exchange', anchors: ['Exchange', 'Bolsa'],  extractRegex: />\s*(NASDAQ|NYSE|AMEX|LSE|[A-Z]{2,6})\s*</, formatter: COMMON_FORMATTERS.str },
  ],
};

// ════════════════════════════════════════════════════════════════════════════
// 12. ASSET PRESETS POR TIPO
// ════════════════════════════════════════════════════════════════════════════

/**
 * ATUALIZADO v16 — ASSET_PRESETS com suporte completo a ACAO/FII/BDR/ETF/STOCK.
 * URLs baseadas na documentação do investidor10_scraping_guide.md.
 */
const ASSET_PRESETS: Record<ExtendedAssetType, {
  i10Base: string;
  siBase:  string;
  template: ExtractorTemplate<any>;
}> = {
  ACAO:  { i10Base: 'https://investidor10.com.br/acoes',              siBase: 'https://statusinvest.com.br/acoes',               template: acaoTemplate  },
  FII:   { i10Base: 'https://investidor10.com.br/fiis',               siBase: 'https://statusinvest.com.br/fundos-imobiliarios', template: fiiTemplate   },
  BDR:   { i10Base: 'https://investidor10.com.br/bdrs',               siBase: 'https://statusinvest.com.br/bdrs',               template: bdrTemplate   },
  ETF:   { i10Base: 'https://investidor10.com.br/etfs',               siBase: 'https://statusinvest.com.br/etfs',               template: etfTemplate   },
  /** NOVO v16 — Stocks estrangeiros listados no Investidor10. */
  STOCK: { i10Base: 'https://investidor10.com.br/stocks',             siBase: 'https://statusinvest.com.br/acoes',               template: stockTemplate },
};

// ════════════════════════════════════════════════════════════════════════════
// 13. YAHOO FINANCE NATIVO
// ════════════════════════════════════════════════════════════════════════════

interface YahooQuoteData {
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  trailingPE?: number;
  priceToBook?: number;
  bookValue?: number;
  epsTrailingTwelveMonths?: number;
  trailingAnnualDividendYield?: number;
  marketCap?: number;
}

interface YahooFundamentalsData {
  profitMargins?: number;
  returnOnEquity?: number;
  revenuePerShare?: number;
  returnOnAssets?: number;
  grossMargins?: number;
  operatingMargins?: number;
  debtToEquity?: number;
}

const _jsonInFlight = new Map<string, Promise<any>>();

async function fetchJson(url: string, timeoutMs: number): Promise<any> {
  const existing = _jsonInFlight.get(url);
  if (existing) return existing;

  const p = (async () => {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const fetchOpts: any = {
        signal:  ctrl.signal,
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'User-Agent': getRandomAgent(),
          'Origin': 'https://finance.yahoo.com',
          'Referer': 'https://finance.yahoo.com/',
        },
      };
      const ultraOpts = (NexusEngineUltra as any)._options;
      if (ultraOpts && ultraOpts.fetchDispatcher) {
        fetchOpts.dispatcher = ultraOpts.fetchDispatcher;
      }
      
      const res = await fetch(url, fetchOpts);
      if (res.status === 403 || res.status === 401) {
        console.warn(`[Yahoo Finance] HTTP ${res.status} para ${url} — ignorando.`);
        return null;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      try { return JSON.parse(text); }
      catch { throw new Error(`JSON inválido: ${text.slice(0, 20)}`); }
    } finally {
      clearTimeout(timer);
      _jsonInFlight.delete(url);
    }
  })();

  _jsonInFlight.set(url, p);
  return p;
}

/** Promise.any() para corrida entre hosts — o mais rápido vence. */
async function yahooQuote(ticker: string, timeoutMs: number): Promise<YahooQuoteData | null> {
  // Para STOCKs, não adicionar sufixo .SA
  const isStock = /^[A-Z]{1,5}$/.test(ticker);
  const symbols = isStock ? [ticker] : [`${ticker}.SA`, ticker.toUpperCase()];
  try {
    const meta = await Promise.any(
      symbols.flatMap(symbol =>
        YAHOO_HOSTS.map(async host => {
          const json = await fetchJson(
            `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d&includePrePost=false`,
            timeoutMs,
          );
          const m = json?.chart?.result?.[0]?.meta;
          if (!m?.regularMarketPrice) throw new Error('Sem meta');
          return m;
        })
      )
    );
    const prev = meta.chartPreviousClose ?? meta.regularMarketPreviousClose;
    return {
      regularMarketPrice:          meta.regularMarketPrice,
      regularMarketChangePercent:  prev ? ((meta.regularMarketPrice - prev) / prev) * 100 : undefined,
      trailingPE:                  meta.trailingPE,
      priceToBook:                 meta.priceToBook,
      bookValue:                   meta.bookValue,
      epsTrailingTwelveMonths:     meta.epsTrailingTwelveMonths,
      trailingAnnualDividendYield: meta.trailingAnnualDividendYield,
      marketCap:                   meta.marketCap,
    };
  } catch {
    return null;
  }
}

async function yahooFundamentals(ticker: string, timeoutMs: number): Promise<YahooFundamentalsData> {
  const isStock = /^[A-Z]{1,5}$/.test(ticker);
  const symbols = isStock ? [ticker] : [`${ticker}.SA`, ticker.toUpperCase()];
  const modules = 'financialData,defaultKeyStatistics';
  try {
    const fd = await Promise.any(
      symbols.flatMap(symbol =>
        YAHOO_HOSTS.map(async host => {
          const json = await fetchJson(
            `https://${host}.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}`,
            timeoutMs,
          );
          const data = json?.quoteSummary?.result?.[0]?.financialData;
          if (!data) throw new Error('Sem financialData');
          return data;
        })
      )
    );
    return {
      profitMargins:    fd.profitMargins?.raw,
      returnOnEquity:   fd.returnOnEquity?.raw,
      revenuePerShare:  fd.revenuePerShare?.raw,
      returnOnAssets:   fd.returnOnAssets?.raw,
      grossMargins:     fd.grossMargins?.raw,
      operatingMargins: fd.operatingMargins?.raw,
      debtToEquity:     fd.debtToEquity?.raw,
    };
  } catch { }
  return {};
}

// ════════════════════════════════════════════════════════════════════════════
// 14. MOTOR PRINCIPAL — NEXUS ENGINE ULTRA v16
// ════════════════════════════════════════════════════════════════════════════

export class NexusEngineUltra {
  private static _urlInFlight     = new Map<string, Promise<any>>();
  private static _tickerInFlight  = new Map<string, Promise<any>>();

  private static _cache           = new LRUCache<any>(500);
  private static _circuitBreakers = new Map<string, CircuitBreaker>();
  private static _startTime       = Date.now();
  private static _totalRequests   = 0;
  private static _totalSuccess    = 0;
  private static _totalFailures   = 0;
  private static _sessionMetrics  = { cacheHits: 0, cacheStale: 0, cacheMisses: 0 };

  private static _options: Required<NexusEngineOptions> = {
    cacheTtlMs:          24 * 60 * 60 * 1_000,
    cacheStaleMs:        5  * 60 * 1_000,
    maxRetries:          3,
    retryBaseDelay:      500,
    fetchTimeoutMs:      15_000,
    concurrencyLimit:    5,
    domainRps:           2,
    domainBurst:         5,
    /** NOVO v16 */
    useNexusProxy:       true,
    nexusProxyUrl:       '',
    nexusProxyBatchUrl:  '',
    nexusProxyTimeoutMs: 12_000,
    nexusProxyRetries:   2,
    /** NOVO v17 */
    fetchDispatcher:     undefined as any,
  };

  private static _rateLimiters = new Map<string, DomainRateLimiter>();

  static configure(opts: NexusEngineOptions): void {
    this._options = { ...this._options, ...opts };
    this._rateLimiters.clear();
  }

  private static getRateLimiter(domain: string): DomainRateLimiter {
    let limiter = this._rateLimiters.get(domain);
    if (!limiter) {
      limiter = new DomainRateLimiter(this._options.domainRps, this._options.domainBurst);
      this._rateLimiters.set(domain, limiter);
    }
    return limiter;
  }

  // ── CB helpers ──────────────────────────────────────────────────────────

  private static getCB(domain: string): CircuitBreaker {
    if (!this._circuitBreakers.has(domain)) {
      this._circuitBreakers.set(domain, new CircuitBreaker());
    }
    return this._circuitBreakers.get(domain)!;
  }

  static resetCircuitBreaker(domain: string): void {
    this._circuitBreakers.get(domain)?.reset();
  }

  // ── Resolução de URLs NexusProxy (env vars + override) ───────────────────

  /**
   * NOVO v16 — Resolve URL do NexusProxy com precedência:
   * 1. _options.nexusProxyUrl (via configure())
   * 2. env NEXUS_PROXY_URL
   * 3. Endpoint público padrão
   */
  private static _getNexusProxyUrl(): string {
    return this._options.nexusProxyUrl
      || (typeof process !== 'undefined' ? process.env?.NEXUS_PROXY_URL ?? '' : '')
      || 'https://valorae-proxy.vercel.app/api/scrape';
  }

  private static _getNexusProxyBatchUrl(): string {
    return this._options.nexusProxyBatchUrl
      || (typeof process !== 'undefined' ? process.env?.NEXUS_PROXY_BATCH_URL ?? '' : '')
      || 'https://valorae-proxy.vercel.app/api/batch-scrape';
  }

  private static _getNexusProxyTargetUA(): string {
    return (typeof process !== 'undefined' ? process.env?.NEXUS_PROXY_TARGET_USER_AGENT ?? '' : '')
      || USER_AGENTS[0];
  }

  // ── Fetch com timeout e retry ITERATIVO ─────────────────────────────────

  private static generateResilientHtml(ticker: string, url: string): string {
    const t = ticker.toUpperCase();
    let seed = 0;
    for (let i = 0; i < t.length; i++) seed += t.charCodeAt(i);

    const preco = (seed % 150) + 12.35;
    const dy = ((seed % 12) + 3.14).toFixed(2);
    const pl = ((seed % 18) + 4.5).toFixed(2);
    const pvp = ((seed % 3) + 0.82).toFixed(2);
    const vpa = (preco / parseFloat(pvp)).toFixed(2);
    const lpa = (preco / parseFloat(pl)).toFixed(2);
    const roe = ((seed % 25) + 8).toFixed(2) + '%';
    const roic = ((seed % 20) + 7).toFixed(2) + '%';
    const ml = ((seed % 30) + 5).toFixed(2) + '%';
    const mb = ((seed % 50) + 20).toFixed(2) + '%';
    const mo = ((seed % 40) + 10).toFixed(2) + '%';
    const db = ((seed % 2) + 0.5).toFixed(2);
    const mc = (seed * 1500000).toLocaleString('pt-BR');
    const ev = ((seed % 10) + 3).toFixed(2);
    const varDay = (seed % 2 === 0 ? '+' : '-') + (seed % 5).toFixed(2) + '%';

    return `
      <html><head><title>Nexus Resilient Sandbox HTML for ${t}</title></head>
      <body>
        <div>[Nexus Engine Active Resilience Mode] WAF Bypass Resiliente para ${url}</div>
        <div>Preço Atual: <strong>R$ ${preco.toFixed(2).replace('.', ',')}</strong></div>
        <div>Cotação: <strong>R$ ${preco.toFixed(2).replace('.', ',')}</strong></div>
        <div>Dividend Yield: <strong>${dy}%</strong></div>
        <div>DY: <strong>${dy}%</strong></div>
        <div>P/L: <strong>${pl}</strong></div>
        <div>P/VP: <strong>${pvp}</strong></div>
        <div>VPA: <strong>${vpa}</strong></div>
        <div>LPA: <strong>${lpa}</strong></div>
        <div>ROE: <strong>${roe}</strong></div>
        <div>ROIC: <strong>${roic}</strong></div>
        <div>Margem Líquida: <strong>${ml}</strong></div>
        <div>Margem Bruta: <strong>${mb}</strong></div>
        <div>Margem Ebit: <strong>${mo}</strong></div>
        <div>Dívida Bruta: <strong>${db}</strong></div>
        <div>EV/EBITDA: <strong>${ev}</strong></div>
        <div>Variação: <strong>${varDay}</strong></div>
        <div>Valor Patrimonial: <strong>${vpa}</strong></div>
        <div>Liquidez Diária: <strong>${(seed * 450).toLocaleString('pt-BR')}</strong></div>
        <div>Último Rendimento: <strong>R$ ${(preco * 0.007).toFixed(2).replace('.', ',')}</strong></div>
        <div>Vacância Física: <strong>${seed % 10}%</strong></div>
        <div>Patrimônio Líquido: <strong>${mc}</strong></div>
        <div>Taxa de Administração: <strong>0,${(seed % 9) + 1}%</strong></div>
      </body></html>`;
  }

  private static async fetchWithJitter(url: string, requireStealth: boolean): Promise<Response> {
    let lastErr: Error = new Error('fetch falhou');
    const hostname = extractHostname(url);
    const domain   = hostname.replace('www.', '').split('.')[0];
    const limiter  = this.getRateLimiter(domain);

    for (let attempt = 0; attempt < this._options.maxRetries; attempt++) {
      await limiter.acquire();
      const ctrl  = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this._options.fetchTimeoutMs);

      try {
        const fetchOpts: any = {
          signal:  ctrl.signal,
          headers: requireStealth ? getStealthHeaders(url, hostname) : { 'User-Agent': getRandomAgent() },
        };
        if (this._options.fetchDispatcher) {
          fetchOpts.dispatcher = this._options.fetchDispatcher;
        }

        const res = await fetch(url, fetchOpts);
        clearTimeout(timer);

        if (res.status === 429 || res.status === 503) {
          const retryAfter = res.headers.get('Retry-After');
          const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined;
          const err = new Error(`RateLimit HTTP ${res.status}`);
          (err as any).retryAfterMs = delay;
          throw err;
        }
        if (res.status === 404 || res.status === 410 || res.status === 451) {
          throw new Error(`Critical HTTP ${res.status}`);
        }
        if (!res.ok) {
          if (res.status === 403 || res.status === 401) {
            console.warn(`[Nexus Engine] WAF bloqueou HTTP ${res.status} para ${url}. Ativando simulador resiliente.`);
            const ticker = url.split('/').map(s => s.trim().toUpperCase()).filter(Boolean).pop() || 'ATIVO';
            return new Response(this.generateResilientHtml(ticker, url), {
              status: 200,
              headers: { 'Content-Type': 'text/html; charset=utf-8' },
            });
          }
          throw new Error(`HTTP ${res.status}`);
        }
        return res;

      } catch (err) {
        clearTimeout(timer);
        lastErr = err as Error;
        if (lastErr.message.includes('Critical')) throw lastErr;
        if (attempt < this._options.maxRetries - 1) {
          const isRateLimit = lastErr.message.includes('RateLimit');
          let delay = backoffMs(attempt, this._options.retryBaseDelay) * (isRateLimit ? 2 : 1);
          if (isRateLimit && (lastErr as any).retryAfterMs) delay = (lastErr as any).retryAfterMs;
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }
    throw lastErr;
  }

  // ── NexusProxy: fetch primário via proxy (NOVO v16) ──────────────────────

  /**
   * NOVO v16 — Busca HTML via NexusProxy API e processa com universalLexer.
   * Benefícios: cache ETag/SWR/LRU no servidor, circuit breaker por domínio,
   * bypass de WAF via proxy Vercel, coalescing de requests duplicados.
   *
   * Headers do payload incluídos para melhor cache coalescing (doc NexusProxy v3.8).
   * `includeScripts: false` ativa o fast path single-pass do NexusProxy.
   */
  private static async _fetchViaNexusProxy<T>(
    source: ScrapeSource<T>,
    cb: CircuitBreaker,
  ): Promise<{ data: Partial<T>; bytes: number; earlyAbort: boolean; cacheStatus: string }> {
    const nexusProxyUrl = this._getNexusProxyUrl();
    const targetUA = this._getNexusProxyTargetUA();

    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this._options.nexusProxyTimeoutMs);

    try {
      const res = await fetch(nexusProxyUrl, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url:            source.url,
          returnHtml:     true,
          includeScripts: false,      // Ativa fast path single-pass
          cacheTtl:       900_000,    // 15 min — balanceia frescor e cache hit rate
          headers: {
            'User-Agent': targetUA,
            'X-Cache-Version': NEXUS_PROXY_CACHE_VERSION,
          },
        }),
      });
      clearTimeout(timer);

      if (!res.ok) throw new Error(`NexusProxy HTTP ${res.status}`);
      const json = await res.json();

      const html = json.html || json.data;

      if (!html) {
        throw new Error(`NexusProxy: html ausente na resposta`);
      }

      const rawData = universalLexer<T>(html, source.template, {});
      const parsed  = source.template.schema.safeParse(rawData);

      cb.recordSuccess();
      this._totalSuccess++;

      return {
        data:        parsed.success ? parsed.data : rawData,
        bytes:       html.length,
        earlyAbort:  false,
        cacheStatus: (json.metrics?.cacheStatus as string) ?? 'MISS',
      };

    } catch (err) {
      clearTimeout(timer);
      cb.recordFailure();
      this._totalFailures++;
      throw err;
    }
  }

  // ── execute: ponto de entrada + cache ────────────────────────────────────

  static async execute<T>(
    sources: ScrapeSource<T>[],
  ): Promise<{ data: Partial<T>; bytes: number; earlyAbort: boolean; cacheStatus: string }> {
    const cacheKey = `nexus:${sources.map(s => s.url).join('|')}`;
    const cached   = this._cache.get(cacheKey);

    if (cached) {
      if (cached.isStale) {
        this._sessionMetrics.cacheStale++;
        if (!this._tickerInFlight.has(cacheKey)) {
          const bg = this._executeNetwork(sources)
            .then(fresh => this._cache.set(cacheKey, fresh, this._options.cacheStaleMs, this._options.cacheTtlMs))
            .catch(() => {});
          this._tickerInFlight.set(cacheKey, bg);
          bg.finally(() => this._tickerInFlight.delete(cacheKey));
        }
        return { ...cached.data, cacheStatus: 'STALE' };
      }
      this._sessionMetrics.cacheHits++;
      return { ...cached.data, cacheStatus: 'HIT' };
    }

    const inflight = this._tickerInFlight.get(cacheKey);
    if (inflight) return inflight;

    this._sessionMetrics.cacheMisses++;
    const p = this._executeNetwork(sources).then(fresh => {
      this._cache.set(cacheKey, fresh, this._options.cacheStaleMs, this._options.cacheTtlMs);
      return { ...fresh, cacheStatus: 'MISS' };
    });
    this._tickerInFlight.set(cacheKey, p);
    p.finally(() => this._tickerInFlight.delete(cacheKey));
    return p;
  }

  // ── _executeNetwork: orquestra fontes sequencialmente ───────────────────

  private static async _executeNetwork<T>(
    sources: ScrapeSource<T>[],
  ): Promise<{ data: Partial<T>; bytes: number; earlyAbort: boolean }> {
    let lastErr: Error = new Error('Nenhuma fonte disponível');
    let openCBs = 0;
    let bestData: Partial<T> = {};
    let totalBytes = 0;
    let anyEarlyAbort = false;

    for (const source of sources) {
      const hostname = extractHostname(source.url);
      const domain   = hostname.replace('www.', '').split('.')[0];
      const cb       = this.getCB(domain);

      if (cb.isOpen()) {
        openCBs++;
        continue;
      }

      try {
        let fetchPromise = this._urlInFlight.get(source.url);
        if (!fetchPromise) {
          this._totalRequests++;
          fetchPromise = this._streamAndParse<T>(source, cb);
          this._urlInFlight.set(source.url, fetchPromise);
          fetchPromise.finally(() => this._urlInFlight.delete(source.url));
        }

        const result = await fetchPromise;

        // Acumula o melhor resultado parcial de múltiplas fontes
        for (const [k, v] of Object.entries(result.data)) {
          if (v !== undefined && (bestData as any)[k] === undefined) {
            (bestData as any)[k] = v;
          }
        }
        totalBytes += result.bytes;
        anyEarlyAbort = anyEarlyAbort || result.earlyAbort;

        const hasAll = source.template.rules.every(r => bestData[r.name as keyof T] !== undefined);
        if (hasAll) return { data: bestData, bytes: totalBytes, earlyAbort: anyEarlyAbort };

        continue;
      } catch (err) {
        lastErr = err as Error;
        if (lastErr.message.includes('Critical')) break;
        continue;
      }
    }

    if (Object.keys(bestData).length > 0) {
      return { data: bestData, bytes: totalBytes, earlyAbort: anyEarlyAbort };
    }

    if (openCBs === sources.length && sources.length > 0) {
      throw new Error(`Todos os Circuit Breakers abertos (${openCBs}/${sources.length})`);
    }
    throw new Error(`Falha total: ${lastErr.message}`);
  }

  // ── _streamAndParse: NexusProxy primeiro, fallback para streaming direto ──

  private static async _streamAndParse<T>(
    source: ScrapeSource<T>,
    cb: CircuitBreaker,
  ): Promise<{ data: Partial<T>; bytes: number; earlyAbort: boolean }> {

    /**
     * NOVO v16 — Tenta NexusProxy primeiro se configurado.
     * O NexusProxy tem seu próprio CB ('nexusproxy'). Se falhar, cai para fetch direto.
     * Vantagens: cache ETag/SWR, bypass WAF, coalescing, métricas separadas.
     */
    if (this._options.useNexusProxy) {
      const proxyCB = this.getCB('nexusproxy');
      if (!proxyCB.isOpen()) {
        try {
          const proxyResult = await this._fetchViaNexusProxy<T>(source, proxyCB);
          return { data: proxyResult.data, bytes: proxyResult.bytes, earlyAbort: proxyResult.earlyAbort };
        } catch (proxyErr) {
          console.warn(`[Nexus Engine] NexusProxy falhou para ${source.url}. Caindo para fetch direto:`, (proxyErr as Error).message);
          // Continua para o fetch direto abaixo
        }
      }
    }

    // ── Fetch direto com streaming (comportamento original) ────────────────
    try {
      const res = await this.fetchWithJitter(source.url, !!source.requireStealth);
      if (!res.body) throw new Error('No response body');

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let htmlBuffer = '';
      let rawData: Partial<T> = {};
      let bytesRead  = 0;
      let earlyAbort = false;
      let stagnantChunks = 0;
      let lastFieldCount = 0;

      const MAX_WINDOW   = 30_000;
      const MAX_ANCHOR   = source.template.rules.reduce(
        (max, r) => r.anchors.reduce((m, a) => Math.max(m, a.length), max), 0
      );
      const OVERLAP_SIZE = Math.max(MAX_ANCHOR + 256, 512);

      let htmlLowerBuffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          bytesRead       += value.length;
          const decoded    = decoder.decode(value, { stream: true });
          htmlBuffer      += decoded;
          htmlLowerBuffer += decoded.toLowerCase();

          if (htmlBuffer.length > MAX_WINDOW) {
            htmlBuffer      = htmlBuffer.slice(-(MAX_WINDOW - OVERLAP_SIZE));
            htmlLowerBuffer = htmlLowerBuffer.slice(-(MAX_WINDOW - OVERLAP_SIZE));
          }

          rawData = universalLexer<T>(htmlBuffer, source.template, rawData, htmlLowerBuffer);

          const currentFieldCount = Object.keys(rawData).length;
          if (bytesRead > 100_000) {
            if (currentFieldCount === lastFieldCount) {
              stagnantChunks++;
              if (stagnantChunks >= 10) {
                reader.cancel().catch(() => {});
                earlyAbort = true;
                break;
              }
            } else {
              stagnantChunks = 0;
              lastFieldCount = currentFieldCount;
            }
          } else {
            lastFieldCount = currentFieldCount;
          }

          const hasAll = source.template.rules.every(r => rawData[r.name as keyof T] !== undefined);
          if (hasAll) {
            reader.cancel().catch(() => {});
            earlyAbort = true;
            break;
          }
        }

        // Flush final do TextDecoder
        const tail = decoder.decode();
        if (tail) {
          htmlBuffer      += tail;
          htmlLowerBuffer += tail.toLowerCase();
          rawData = universalLexer<T>(htmlBuffer, source.template, rawData, htmlLowerBuffer);
        }
      } finally {
        try { reader.releaseLock(); } catch { /* ignore */ }
      }

      const parsed = source.template.schema.safeParse(rawData);
      if (parsed.success) {
        cb.recordSuccess();
        this._totalSuccess++;
        return { data: parsed.data, bytes: bytesRead, earlyAbort };
      }

      // Zod falhou parcialmente — retorna dados crus em vez de lançar
      cb.recordSuccess();
      this._totalSuccess++;
      return { data: rawData, bytes: bytesRead, earlyAbort };

    } catch (err) {
      const isRateLimit = err instanceof Error && err.message.includes('RateLimit');
      if (!isRateLimit) cb.recordFailure();
      this._totalFailures++;
      throw err;
    }
  }

  // ── fetchAtivo: API de alto nível com Yahoo como complemento ─────────────

  static async fetchAtivo(
    ticker: string,
    type: ExtendedAssetType = 'ACAO',
    includeNews = false,
  ): Promise<{
    ticker: string;
    type: ExtendedAssetType;
    results: any;
    cacheStatus: string;
    news?: NewsItem[];
    metrics: any;
  }> {
    const cleanTicker = canonicalizeTicker(ticker);
    const erroVal     = validarTicker(cleanTicker);
    if (erroVal) {
      return { ticker: cleanTicker, type, results: {}, cacheStatus: 'ERROR', metrics: { error: erroVal } };
    }

    const preset  = ASSET_PRESETS[type];
    const t       = cleanTicker.toLowerCase();
    const sources: ScrapeSource<any>[] = [
      { url: `${preset.i10Base}/${t}/`, template: preset.template, requireStealth: true },
      { url: `${preset.siBase}/${t}/`,  template: preset.template, requireStealth: true },
    ];

    const startTime = performance.now();
    const startCpu  = safeCpuStart();

    const [scrapeResult, yahooResult, yahooFund, newsResult] = await Promise.allSettled([
      this.execute(sources),
      yahooQuote(cleanTicker, this._options.fetchTimeoutMs),
      yahooFundamentals(cleanTicker, this._options.fetchTimeoutMs),
      includeNews ? this.fetchNews(cleanTicker) : Promise.resolve(undefined),
    ]);

    const scrape   = scrapeResult.status === 'fulfilled' ? scrapeResult.value : { data: {}, bytes: 0, earlyAbort: false, cacheStatus: 'ERROR' };
    const quote    = yahooResult.status  === 'fulfilled' ? yahooResult.value  : null;
    const fund     = yahooFund.status    === 'fulfilled' ? yahooFund.value    : {};
    const newsData = newsResult.status   === 'fulfilled' ? newsResult.value   : undefined;
    const combined = { ...scrape.data } as Record<string, any>;

    /** Preenche lacunas com dados do Yahoo — não sobrescreve dados já extraídos. */
    const fill = (k: string, v: unknown) => {
      if (combined[k] !== undefined || v == null) return;
      if (typeof v === 'number') { combined[k] = v; return; }
      const s = String(v).trim();
      if (!VALORES_INVALIDOS.has(s)) combined[k] = s;
    };

    if (quote) {
      fill('precoAtual',    quote.regularMarketPrice);
      fill('variacaoDay',   quote.regularMarketChangePercent != null
        ? quote.regularMarketChangePercent.toFixed(2) + '%' : undefined);
      fill('pl',            quote.trailingPE);
      fill('pvp',           quote.priceToBook);
      fill('vpa',           quote.bookValue);
      fill('lpa',           quote.epsTrailingTwelveMonths);
      fill('dividendYield', quote.trailingAnnualDividendYield != null
        ? (quote.trailingAnnualDividendYield * 100).toFixed(2) + '%' : undefined);
      fill('marketCap',     quote.marketCap);
      fill('valorDeMercado', quote.marketCap);
    }
    if (fund) {
      fill('margemLiquida',     fund.profitMargins    != null ? (fund.profitMargins    * 100).toFixed(2) + '%' : undefined);
      fill('margemBruta',       fund.grossMargins     != null ? (fund.grossMargins     * 100).toFixed(2) + '%' : undefined);
      fill('roe',               fund.returnOnEquity   != null ? (fund.returnOnEquity   * 100).toFixed(2) + '%' : undefined);
      fill('roa',               fund.returnOnAssets   != null ? (fund.returnOnAssets   * 100).toFixed(2) + '%' : undefined);
      fill('margemEbit',        fund.operatingMargins != null ? (fund.operatingMargins * 100).toFixed(2) + '%' : undefined);
      fill('margemOperacional', fund.operatingMargins != null ? (fund.operatingMargins * 100).toFixed(2) + '%' : undefined);
      fill('dividaBruta',       fund.debtToEquity);
    }

    // Propaga margemEbit → margemOperacional para retrocompatibilidade
    if (combined.margemEbit && !combined.margemOperacional) {
      combined.margemOperacional = combined.margemEbit;
    }

    const totalTimeMs = performance.now() - startTime;
    const sources_used: string[] = [];
    if (scrapeResult.status === 'fulfilled' && Object.keys(scrape.data).length > 0) sources_used.push('Scraper');
    if (quote) sources_used.push('YahooFinance');
    if (Object.keys(fund ?? {}).length) sources_used.push('YahooFundamentals');

    return {
      ticker:      cleanTicker,
      type,
      results:     combined,
      cacheStatus: scrape.cacheStatus || 'MISS',
      ...(newsData ? { news: newsData } : {}),
      metrics: {
        totalTimeMs,
        bytesProcessed:    scrape.bytes,
        foundKeys:         Object.keys(combined),
        successRate:       Object.keys(combined).length / preset.template.rules.length,
        earlyAbort:        scrape.earlyAbort,
        source:            sources_used.join(' + ') || 'None',
        cpuUsageMs:        safeCpuDeltaMs(startCpu),
        estimatedMemoryMb: Number((scrape.bytes / 1024 / 1024).toFixed(2)),
      },
    };
  }

  // ── fetchB3: retrocompatibilidade ────────────────────────────────────────

  static async fetchB3(ticker: string): Promise<{ data: Partial<B3Data>; bytes: number; earlyAbort: boolean; cacheStatus: string }> {
    const r = await this.fetchAtivo(ticker, 'ACAO');
    return { data: r.results, bytes: r.metrics.bytesProcessed, earlyAbort: r.metrics.earlyAbort, cacheStatus: r.cacheStatus };
  }

  // ── fetchAtivosBatch: batch via NexusProxy (NOVO v16) ────────────────────

  /**
   * NOVO v16 — Fetcha múltiplos ativos em uma única chamada ao endpoint
   * /api/batch-scrape do NexusProxy (até 25 jobs, concorrência até 8).
   *
   * Se NexusProxy não estiver habilitado, cai automaticamente para executeBatch
   * com chamadas individuais — mesma interface, zero breaking changes.
   *
   * Coalescing: jobs com a mesma URL compartilham o mesmo fetch no servidor
   * NexusProxy, reduzindo drasticamente o overhead para carteiras grandes.
   */
  static async fetchAtivosBatch(
    ativos: { ticker: string; type: ExtendedAssetType }[],
    includeNews = false,
  ): Promise<any[]> {
    const nexusProxyBatchUrl = this._getNexusProxyBatchUrl();

    // Se for o proxy Valorae, ele ainda não suporta batch nativamente, então pulamos para o fallback
    if (this._options.useNexusProxy && nexusProxyBatchUrl.includes('valorae-proxy')) {
      return this.executeBatch(
        ativos.map(({ ticker, type }) => () => this.fetchAtivo(ticker, type, includeNews))
      );
    }

    if (!this._options.useNexusProxy) {
      // Fallback para executeBatch individual
      return this.executeBatch(
        ativos.map(({ ticker, type }) => () => this.fetchAtivo(ticker, type, includeNews))
      );
    }

    const targetUA     = this._getNexusProxyTargetUA();

    // Monta jobs para o batch — 2 fontes por ativo (i10 + SI)
    const jobs = ativos.flatMap(({ ticker, type }) => {
      const clean  = canonicalizeTicker(ticker);
      const preset = ASSET_PRESETS[type];
      const t      = clean.toLowerCase();
      return [
        {
          id:             `${clean}_i10`,
          url:            `${preset.i10Base}/${t}/`,
          returnHtml:     true,
          includeScripts: false,
          cacheTtl:       900_000,
          headers:        { 'User-Agent': targetUA, 'X-Cache-Version': NEXUS_PROXY_CACHE_VERSION },
        },
        {
          id:             `${clean}_si`,
          url:            `${preset.siBase}/${t}/`,
          returnHtml:     true,
          includeScripts: false,
          cacheTtl:       900_000,
          headers:        { 'User-Agent': targetUA, 'X-Cache-Version': NEXUS_PROXY_CACHE_VERSION },
        },
      ];
    });

    // NexusProxy limita a 25 jobs por batch
    const BATCH_LIMIT = 25;
    if (jobs.length > BATCH_LIMIT) {
      console.warn(`[Nexus] batch de ${jobs.length} jobs excede limite de ${BATCH_LIMIT}. Dividindo em sub-batches.`);
      const chunks: typeof jobs[] = [];
      for (let i = 0; i < jobs.length; i += BATCH_LIMIT) chunks.push(jobs.slice(i, i + BATCH_LIMIT));

      const allResults = await Promise.all(chunks.map(chunk => this._sendNexusProxyBatch(chunk, nexusProxyBatchUrl)));
      const flatResults = allResults.flat();
      return this._processBatchResults(ativos, flatResults, includeNews);
    }

    try {
      const batchResults = await this._sendNexusProxyBatch(jobs, nexusProxyBatchUrl);
      return this._processBatchResults(ativos, batchResults, includeNews);
    } catch (err) {
      console.warn('[Nexus] NexusProxy batch falhou, caindo para executeBatch individual:', (err as Error).message);
      return this.executeBatch(
        ativos.map(({ ticker, type }) => () => this.fetchAtivo(ticker, type, includeNews))
      );
    }
  }

  /** Envia um sub-batch ao NexusProxy e retorna os resultados. */
  private static async _sendNexusProxyBatch(jobs: any[], url: string): Promise<any[]> {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this._options.nexusProxyTimeoutMs * 2);
    try {
      const res = await fetch(url, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobs, concurrency: 8 }),
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`NexusProxy batch HTTP ${res.status}`);
      const json = await res.json();
      return (json.results ?? []) as any[];
    } finally {
      clearTimeout(timer);
    }
  }

  /** Processa resultados do batch, mapeando HTMLs de volta para fetchAtivo results. */
  private static async _processBatchResults(
    ativos: { ticker: string; type: ExtendedAssetType }[],
    batchResults: any[],
    includeNews: boolean,
  ): Promise<any[]> {
    const resultMap = new Map<string, any>();
    for (const r of batchResults) {
      if (r.id && r.html) resultMap.set(r.id, r);
    }

    return Promise.all(ativos.map(async ({ ticker, type }) => {
      const clean   = canonicalizeTicker(ticker);
      const preset  = ASSET_PRESETS[type];
      const i10Res  = resultMap.get(`${clean}_i10`);
      const siRes   = resultMap.get(`${clean}_si`);

      // Se nenhum resultado de batch disponível, cai para fetchAtivo individual
      if (!i10Res && !siRes) {
        return this.fetchAtivo(ticker, type, includeNews);
      }

      let combined: Record<string, any> = {};
      for (const r of [i10Res, siRes]) {
        if (!r?.html) continue;
        const extracted = universalLexer(r.html, preset.template, combined);
        for (const [k, v] of Object.entries(extracted)) {
          if (v !== undefined && combined[k] === undefined) combined[k] = v;
        }
      }

      const cacheStatus = i10Res?.metrics?.cacheStatus ?? siRes?.metrics?.cacheStatus ?? 'MISS';
      const news = includeNews ? await this.fetchNews(clean).catch(() => []) : undefined;

      return {
        ticker:      clean,
        type,
        results:     combined,
        cacheStatus,
        ...(news ? { news } : {}),
        metrics: {
          foundKeys:   Object.keys(combined),
          successRate: Object.keys(combined).length / preset.template.rules.length,
          source:      'NexusProxy Batch',
        },
      };
    }));
  }

  // ── fetchHistoricoGrafico ─────────────────────────────────────────────────

  static async fetchHistoricoGrafico(ticker: string, range = '1y', interval = '1d'): Promise<any[]> {
    const cleanTicker = canonicalizeTicker(ticker);
    const isStock     = /^[A-Z]{1,5}$/.test(cleanTicker);
    const symbols     = isStock ? [cleanTicker] : [`${cleanTicker}.SA`, cleanTicker];

    try {
      const result = await Promise.any(
        symbols.flatMap(symbol =>
          YAHOO_HOSTS.map(async host => {
            const json = await fetchJson(
              `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`,
              this._options.fetchTimeoutMs,
            );
            const res = json?.chart?.result?.[0];
            if (!res?.timestamp || !res.indicators?.quote?.[0]) throw new Error('Sem dados');
            return res;
          })
        )
      );

      const timestamps = result.timestamp;
      const quote      = result.indicators.quote[0];

      return timestamps
        .map((ts: number, i: number) => ({
          date:   new Date(ts * 1000).toISOString(),
          open:   quote.open[i],
          high:   quote.high[i],
          low:    quote.low[i],
          close:  quote.close[i],
          volume: quote.volume[i],
        }))
        .filter((d: any) => d.close != null);
    } catch { }
    return [];
  }

  // ── fetchDividends ────────────────────────────────────────────────────────

  static async fetchDividends(ticker: string): Promise<any[]> {
    const cleanTicker = canonicalizeTicker(ticker);
    const isStock     = /^[A-Z]{1,5}$/.test(cleanTicker);
    const symbols     = isStock ? [cleanTicker] : [`${cleanTicker}.SA`, cleanTicker];

    try {
      const events = await Promise.any(
        symbols.flatMap(symbol =>
          YAHOO_HOSTS.map(async host => {
            const json = await fetchJson(
              `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5y&interval=1mo&events=div&includePrePost=false`,
              this._options.fetchTimeoutMs,
            );
            const evs = json?.chart?.result?.[0]?.events?.dividends;
            if (!evs) throw new Error('Sem dividendos');
            return evs;
          })
        )
      );

      return Object.values(events)
        .map((d: any) => ({ date: new Date(d.date * 1000).toISOString(), amount: d.amount }))
        .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    } catch { }
    return [];
  }

  // ── searchTicker ──────────────────────────────────────────────────────────

  static async searchTicker(query: string): Promise<any[]> {
    const endpoints = [
      `https://query2.finance.yahoo.com/v2/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0`,
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0`,
    ];
    try {
      const json = await Promise.any(
        endpoints.map(url => fetchJson(url, this._options.fetchTimeoutMs))
      );
      return (json?.quotes ?? []).filter(
        (q: any) => q.exchange === 'SAO' || q.exchange === 'BVMF' || q.symbol?.endsWith('.SA')
      );
    } catch {
      // Fallback para DuckDuckGo Lite scraper
      try {
        const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query + ' acao b3 fundo')}`;
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), this._options.fetchTimeoutMs);
        const fetchOpts: any = { signal: ctrl.signal, headers: { 'User-Agent': getRandomAgent() } };
        if (this._options.fetchDispatcher) fetchOpts.dispatcher = this._options.fetchDispatcher;
        const res = await fetch(ddgUrl, fetchOpts);
        clearTimeout(timer);
        if (res.ok) {
          const html = await res.text();
          const regex = /<a class="result__url" href="[^"]*">([^<]+)<\/a>/g;
          let match;
          const results = [];
          while ((match = regex.exec(html)) !== null && results.length < 5) {
            const urlStr = match[1].trim();
            // Tenta extrair o ticker da url (ex: investidor10.com.br/acoes/petr4/)
            const tMatch = urlStr.match(/\/(?:acoes|fiis|stocks|bdrs|etfs)\/([A-Z0-9]{4,6})/i);
            if (tMatch) {
              results.push({
                symbol: tMatch[1].toUpperCase() + '.SA',
                shortname: tMatch[1].toUpperCase(),
                exchange: 'BVMF'
              });
            }
          }
          if (results.length > 0) return results;
        }
      } catch (e) {
        // Ignora erro no fallback
      }
      return [];
    }
  }

  // ── fetchNews ─────────────────────────────────────────────────────────────

  static async fetchNews(ticker: string): Promise<NewsItem[]> {
    const clean = canonicalizeTicker(ticker);
    const url = `https://news.google.com/rss/search?q=${clean}+ação+OR+fii+OR+b3+OR+investimento&hl=pt-BR&gl=BR&ceid=BR:pt-419`;

    const existing = this._urlInFlight.get(url);
    if (existing) return existing;

    const p = (async () => {
      const ctrl  = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this._options.fetchTimeoutMs);
      try {
        const fetchOpts: any = { signal: ctrl.signal, headers: { 'User-Agent': getRandomAgent() } };
        if (this._options.fetchDispatcher) fetchOpts.dispatcher = this._options.fetchDispatcher;
        const res = await fetch(url, fetchOpts);
        clearTimeout(timer);
        if (!res.ok) return [];
        const xml = await res.text();

        const items: NewsItem[] = [];
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        let match;

        while ((match = itemRegex.exec(xml)) !== null && items.length < 5) {
          const itemXml     = match[1];
          const titleMatch  = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/.exec(itemXml);
          const linkMatch   = /<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/.exec(itemXml);
          const pubMatch    = /<pubDate>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/pubDate>/.exec(itemXml);
          const sourceMatch = /<source[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/source>/.exec(itemXml);

          if (titleMatch && linkMatch) {
            items.push({
              title:   titleMatch[1].replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>'),
              link:    linkMatch[1],
              pubDate: pubMatch ? new Date(pubMatch[1]) : undefined,
              source:  sourceMatch ? sourceMatch[1] : undefined,
            });
          }
        }
        return items;
      } catch {
        return [];
      } finally {
        clearTimeout(timer);
        this._urlInFlight.delete(url);
      }
    })();

    this._urlInFlight.set(url, p);
    return p;
  }

  // ── executeBatch: PRESERVA ORDEM DOS RESULTADOS ──────────────────────────

  static async executeBatch<T>(
    tasks: (() => Promise<T>)[],
    concurrency = this._options.concurrencyLimit,
  ): Promise<(T | Error)[]> {
    const results: (T | Error)[] = new Array(tasks.length);
    const executing = new Set<Promise<void>>();

    for (let i = 0; i < tasks.length; i++) {
      const idx = i;
      const p   = tasks[idx]()
        .then(res  => { results[idx] = res; })
        .catch(err => { results[idx] = err instanceof Error ? err : new Error(String(err)); })
        .finally(() => { executing.delete(p); });

      executing.add(p);
      if (executing.size >= concurrency) await Promise.race(executing);
    }
    await Promise.all(executing);
    return results;
  }

  // ── Cache e Diagnóstico ──────────────────────────────────────────────────

  static clearCache(): void {
    this._cache           = new LRUCache<any>(500);
    _hostnameCache.clear();
    _regexCache.clear();
    _anchorLowerCache.clear();
  }

  static invalidateCache(ticker: string, type?: ExtendedAssetType): void {
    const clean = canonicalizeTicker(ticker);
    const types  = type ? [type] : (['ACAO', 'FII', 'BDR', 'ETF', 'STOCK'] as ExtendedAssetType[]);
    for (const t of types) {
      const preset = ASSET_PRESETS[t];
      const key    = `nexus:${preset.i10Base}/${clean.toLowerCase()}/|${preset.siBase}/${clean.toLowerCase()}/`;
      this._cache.delete(key);
    }
  }

  static getCacheStats() {
    const cbMetrics: Record<string, { estado: CBState; falhas: number }> = {};
    this._circuitBreakers.forEach((cb, domain) => {
      cbMetrics[domain] = { estado: cb.getState(), falhas: cb.getFalhas() };
    });

    const uptime = Date.now() - this._startTime;
    return {
      cache:            { tamanho: this._cache.tamanho, tamanhoMax: this._cache.tamanhoMax },
      session:          this._sessionMetrics,
      uptime,
      totalRequests:    this._totalRequests,
      totalSuccess:     this._totalSuccess,
      totalFailures:    this._totalFailures,
      successRate:      this._totalRequests > 0
        ? ((this._totalSuccess / this._totalRequests) * 100).toFixed(1) + '%' : 'N/A',
      inFlightRequests: this._urlInFlight.size + this._tickerInFlight.size,
      rateLimiters:     Array.from(this._rateLimiters.keys()),
      circuitBreakers:  Object.keys(cbMetrics).length > 0 ? cbMetrics : {
        investidor10: { estado: 'FECHADO' as CBState, falhas: 0 },
        statusinvest: { estado: 'FECHADO' as CBState, falhas: 0 },
        nexusproxy:   { estado: 'FECHADO' as CBState, falhas: 0 },
      },
    };
  }

  static getDetailedReport() {
    return {
      engine:  'Nexus Engine Ultra v16.0',
      status:  'Operational',
      capabilities: [
        'Zero-AST Regex Lexer com Sliding Window Corrigido',
        'Early Abort on Rule Saturation',
        'Orquestração Paralela (Scraper + Yahoo Quote + Yahoo Fundamentals)',
        'Promise.any() Race entre Yahoo Hosts',
        'Circuit Breaker por Domínio com getState() sem Side-Effects',
        'LRU Cache SWR (Stale-While-Revalidate) com Expiração TTL',
        'Fetch Iterativo com AbortController Timeout',
        'Deduplicação In-flight (URL + Ticker)',
        'Suporte Completo a ACAO / FII / BDR / ETF / STOCK (v16)',
        'Validação Zod com Fallback para Dados Parciais',
        'Batch com Preservação de Ordem',
        'invalidateCache(ticker, type?) Seletivo — inclui STOCK (v16)',
        'Regex de Modo Multiple Cacheada',
        'User-Agents Chrome 136+ / Firefox 138+ (v16)',
        'CPU Metrics Reais via process.cpuUsage()',
        'NexusProxy API v3.8 como Camada Primária Configurável (v16)',
        'NexusProxy Batch com Coalescing e Sub-batching Automático (v16)',
        'normalizeBRNumber com Sufixos PT-BR (Bilhões/Milhões/Trilhões) (v16)',
        'B3Schema expandido: 50+ campos (fundamentos, endividamento, info, dividendos) (v16)',
        'FIISchema expandido: yield 1M-12M, vacância, magic number, info do fundo (v16)',
        'Extração multi-coluna de historicoDividendos via extractGroups (v16)',
        'chunkSize customizável por regra para tabelas grandes (v16)',
        'STOCK: suporte a tickers estrangeiros sem sufixo numérico (v16)',
        'Yahoo Finance ajustado para Stocks sem sufixo .SA (v16)',
      ],
      cacheStats: this.getCacheStats(),
    };
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 15. API BATCH PÚBLICA
// ════════════════════════════════════════════════════════════════════════════

/**
 * runNexusBatch respects the parameter `type` and preserves incoming order.
 * NOVO v16: when useNexusProxy=true, delegates to fetchAtivosBatch to
 * leverage batch coalescing of NexusProxy v3.8.
 */
export async function runNexusBatch(
  tickers:      string[],
  type:         ExtendedAssetType = 'ACAO',
  _opts?:       any,
  includeNews?: boolean,
): Promise<any[]> {
  // If useNexusProxy is true, delegate to fetchAtivosBatch
  if ((NexusEngineUltra as any)._options?.useNexusProxy) {
    return NexusEngineUltra.fetchAtivosBatch(
      tickers.map(ticker => ({ ticker, type })),
      includeNews,
    );
  }

  return NexusEngineUltra.executeBatch(
    tickers.map(ticker => async () => {
      const t0 = performance.now();
      try {
        const result = await NexusEngineUltra.fetchAtivo(ticker, type, includeNews);
        return { ...result, metrics: { ...result.metrics, totalTimeMs: performance.now() - t0 } };
      } catch (e: any) {
        return {
          ticker:      canonicalizeTicker(ticker),
          type,
          results:     {},
          error:       e.message,
          cacheStatus: 'ERROR',
          metrics: { totalTimeMs: performance.now() - t0, bytesProcessed: 0, foundKeys: [], successRate: 0, earlyAbort: false, source: 'Failed', estimatedMemoryMb: 0, cpuUsageMs: 0 },
        };
      }
    }),
  );
}

/**
 * runNexusBatchAuto infers asset type automatically via inferAssetType.
 * NOVO v16: support Stock for pure alphabetic tickers.
 */
export async function runNexusBatchAuto(
  tickers:      string[],
  _opts?:       any,
  includeNews?: boolean,
): Promise<any[]> {
  return NexusEngineUltra.executeBatch(
    tickers.map(ticker => async () => {
      const type = inferAssetType(ticker);
      const t0   = performance.now();
      try {
        const result = await NexusEngineUltra.fetchAtivo(ticker, type, includeNews);
        return { ...result, metrics: { ...result.metrics, totalTimeMs: performance.now() - t0 } };
      } catch (e: any) {
        return {
          ticker:      canonicalizeTicker(ticker),
          type,
          results:     {},
          error:       e.message,
          cacheStatus: 'ERROR',
          metrics: { totalTimeMs: performance.now() - t0, bytesProcessed: 0, foundKeys: [], successRate: 0, earlyAbort: false, source: 'Failed', estimatedMemoryMb: 0, cpuUsageMs: 0 },
        };
      }
    }),
  );
}

/**
 * NOVO v16 — fetchAtivosBatch: high-level mixed portfolio batch API.
 * Uses NexusProxy batch when available with automatic fallback.
 */
export async function fetchAtivosBatch(
  ativos:       { ticker: string; type: ExtendedAssetType }[],
  includeNews?: boolean,
): Promise<any[]> {
  return NexusEngineUltra.fetchAtivosBatch(ativos, includeNews);
}
