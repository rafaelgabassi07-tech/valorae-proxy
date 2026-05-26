// @ts-nocheck
/// <reference types="node" />
import { z } from 'zod';
// ════════════════════════════════════════════════════════════════════════════
// 2. CONSTANTES PRÉ-COMPILADAS DE MÓDULO
// ════════════════════════════════════════════════════════════════════════════
const RE_MOEDA = /[R$\s]/g;
const RE_MILHAR = /\./g;
const RE_DECIMAL = /,/;
const RE_SA = /\.SA$/i;
const RE_BDR = /3[2-5]$/;
/**
 * ATUALIZADO v16 — Aceita 4 letras + 1-2 dígitos (B3) OU 1-5 letras puras
 * (STOCK estrangeiro, ex: AAPL, MSFT) OU tickers com sufixo F fracionado.
 */
const RE_TICKER = /^(?:[A-Z]{4}\d{1,2}F?|[A-Z]{1,5})$/;
const RE_ESPACO = /\s+/g;
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
const YAHOO_HOSTS = ['query1', 'query2'];
/**
 * ATUALIZADO v16 — ETFs B3 conhecidos, incluindo fundos lançados até 2026.
 */
const ETFS_CONHECIDOS = new Set([
    'BOVA11', 'IVVB11', 'SMAL11', 'DIVO11', 'FIND11', 'MATB11', 'GOVE11', 'XFIX11',
    'GOLD11', 'SPXI11', 'HASH11', 'BOVB11', 'BOVS11', 'BRAP11', 'BRRJ11', 'BRAX11',
    'XINA11', 'EURP11', 'FIXA11', 'TCHE11', 'ECOO11', 'ACWI11', 'NASD11',
    'USTK11', 'NSDQ11', 'DEFI11', 'ESGE11', 'SUST11', 'AGRI11', 'IFRA11',
    'BDIV11', 'BLKB11', 'BNDX11', 'BOVV11', 'BRCO11', 'CSMO11', 'VALE11', 'QUAL11',
    'REIT11', 'TRET11', 'WRLD11', 'XBOV11', 'PIBB11', 'SMAC11', 'MOAT11', 'PORD11',
    // NOVO v16 — fundos lançados/mapeados a partir de 2024-2026
    'GLDL11', 'BITI11', 'SOLB11', 'TECC11', 'HFOF11', 'BITH11', 'COIN11',
    'EMAG11', 'AGRO11', 'MCHI11', 'WEGE11', 'MAGO11', 'BLOK11', 'USIG11',
    'SPAB11', 'CRYP11', 'ESGB11', 'SEMI11', 'RNDP11', 'FIDC11', 'ARGT11',
]);
const DIAS_POR_PERIODO = {
    '1mo': 30, '3mo': 90, '6mo': 180, '1y': 365, '5y': 1825, 'max': 10950,
};
/**
 * NOVO v16 — Versão de cache do NexusProxy.
 * Incrementar sempre que seletores ou templates forem alterados.
 */
const NEXUS_PROXY_CACHE_VERSION = '2026-05-25-nexus-v18-1';
// ════════════════════════════════════════════════════════════════════════════
// 3. GUARD: process.cpuUsage (Node-specific)
// ════════════════════════════════════════════════════════════════════════════
const hasCpuUsage = typeof process !== 'undefined' && typeof process.cpuUsage === 'function';
function safeCpuStart() { return hasCpuUsage ? process.cpuUsage() : null; }
function safeCpuDeltaMs(start) {
    if (!start || !hasCpuUsage)
        return 0;
    const d = process.cpuUsage(start);
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
export function normalizeBRNumber(raw) {
    if (!raw)
        return '';
    let limpo = raw.replace(RE_MOEDA, '').toUpperCase().trim();
    if (limpo.includes('%'))
        return limpo;
    let mult = 1;
    // Detecta sufixos em PT-BR após strip de espaços
    // ex: "621,67BILHÕES", "1,22TRILHÃO", "140,03BILHÕES"
    const wordIdx = limpo.search(/BILH|TRILH|MILH(?!AR)|MIL\b/);
    if (wordIdx > 0) {
        const suffix = limpo.slice(wordIdx);
        if (suffix.startsWith('BILH'))
            mult = 1e9;
        else if (suffix.startsWith('TRILH'))
            mult = 1e12;
        else if (suffix.startsWith('MILH'))
            mult = 1e6;
        else if (suffix.startsWith('MIL'))
            mult = 1e3;
        limpo = limpo.slice(0, wordIdx).trim();
    }
    else {
        // Sufixos curtos (K/M/B) — retrocompatível
        const ult = limpo[limpo.length - 1];
        if (ult === 'K') {
            mult = 1_000;
            limpo = limpo.slice(0, -1);
        }
        else if (ult === 'M') {
            mult = 1_000_000;
            limpo = limpo.slice(0, -1);
        }
        else if (ult === 'B') {
            mult = 1_000_000_000;
            limpo = limpo.slice(0, -1);
        }
    }
    limpo = limpo.replace(RE_MILHAR, '').replace(RE_DECIMAL, '.');
    const num = parseFloat(limpo);
    return isNaN(num) ? raw.trim() : num * mult;
}
/**
 * ATUALIZADO v16 — inferAssetType com suporte a STOCK.
 * Tickers puramente alfabéticos (sem dígito) são considerados STOCK.
 */
export function inferAssetType(ticker) {
    const t = ticker.trim().toUpperCase();
    if (ETFS_CONHECIDOS.has(t))
        return 'ETF';
    if (RE_BDR.test(t))
        return 'BDR';
    if (t.endsWith('11'))
        return 'FII';
    if (/^[A-Z]{1,5}$/.test(t))
        return 'STOCK';
    return 'ACAO';
}
export function canonicalizeTicker(raw) {
    if (!raw)
        return '';
    return raw.replace(RE_SA, '').trim().toUpperCase();
}
export function validarTicker(ticker) {
    const clean = ticker.trim().toUpperCase();
    if (!clean)
        return 'Ticker vazio';
    if (!RE_TICKER.test(clean))
        return `Ticker inválido: ${clean}`;
    return null;
}
export function backoffMs(attempt, baseDelay = 500) {
    const cap = 15000;
    const delay = Math.min(cap, baseDelay * Math.pow(2, attempt));
    return Math.random() * delay;
}
function getRandomAgent() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}
class LRUCache {
    maxSize;
    mapa = new Map();
    _opCount = 0;
    _cleanEvery = 50;
    constructor(maxSize) {
        this.maxSize = maxSize;
        if (maxSize < 1)
            throw new RangeError('LRUCache: maxSize deve ser >= 1');
    }
    _maybeClean() {
        if (++this._opCount < this._cleanEvery)
            return;
        this._opCount = 0;
        const now = Date.now();
        for (const [k, v] of this.mapa) {
            if (now > v.expiresAt)
                this.mapa.delete(k);
        }
    }
    get(key) {
        const entry = this.mapa.get(key);
        if (!entry)
            return null;
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
    set(key, data, staleMs = 5 * 60 * 1_000, ttlMs = 24 * 60 * 60 * 1_000) {
        this._maybeClean();
        if (this.mapa.has(key))
            this.mapa.delete(key);
        else if (this.mapa.size >= this.maxSize)
            this.mapa.delete(this.mapa.keys().next().value);
        const now = Date.now();
        this.mapa.set(key, { data, staleAt: now + staleMs, expiresAt: now + ttlMs });
    }
    delete(key) { return this.mapa.delete(key); }
    clear() { this.mapa.clear(); this._opCount = 0; }
    get tamanho() { return this.mapa.size; }
    get tamanhoMax() { return this.maxSize; }
    /** NOVO v16.1 — Exporta entradas não-expiradas como objeto para persistência no disco. */
    serialize() {
        const obj = {};
        const now = Date.now();
        for (const [k, v] of this.mapa) {
            if (now <= v.expiresAt) {
                obj[k] = v;
            }
        }
        return obj;
    }
    /** NOVO v16.1 — Popula o cache a partir de objeto desserializado. */
    populate(items) {
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
    rps;
    burst;
    tokens;
    lastRefill;
    constructor(rps = 2, burst = 5) {
        this.rps = rps;
        this.burst = burst;
        this.tokens = burst;
        this.lastRefill = performance.now();
    }
    async acquire() {
        while (true) {
            this.refill();
            if (this.tokens >= 1) {
                this.tokens -= 1;
                return;
            }
            const waitMs = ((1 - this.tokens) / this.rps) * 1000;
            await new Promise(resolve => setTimeout(() => resolve(), Math.max(1, waitMs)));
        }
    }
    refill() {
        const now = performance.now();
        const elapsedMs = now - this.lastRefill;
        const newTokens = elapsedMs * (this.rps / 1000);
        if (newTokens > 0) {
            this.tokens = Math.min(this.burst, this.tokens + newTokens);
            this.lastRefill = now;
        }
    }
}
class CircuitBreaker {
    threshold;
    resetMs;
    state = 'FECHADO';
    failures = 0;
    lastFailureTime = 0;
    successCount = 0;
    constructor(threshold = 3, resetMs = 30_000) {
        this.threshold = threshold;
        this.resetMs = resetMs;
    }
    /** getState() não produz side-effects — transição ocorre apenas em isOpen(). */
    getState() { return this.state; }
    isOpen() {
        if (this.state === 'ABERTO') {
            if (Date.now() - this.lastFailureTime > this.resetMs) {
                this.state = 'SEMI_ABERTO';
                return false;
            }
            return true;
        }
        return false;
    }
    recordSuccess() {
        if (this.state === 'SEMI_ABERTO') {
            this.successCount++;
            if (this.successCount >= 2)
                this.reset();
        }
        else {
            this.failures = 0;
        }
    }
    recordFailure() {
        this.failures++;
        this.lastFailureTime = Date.now();
        this.successCount = 0;
        if (this.failures >= this.threshold)
            this.state = 'ABERTO';
    }
    reset() {
        this.state = 'FECHADO';
        this.failures = 0;
        this.successCount = 0;
        this.lastFailureTime = 0;
    }
    getFalhas() { return this.failures; }
}
// ════════════════════════════════════════════════════════════════════════════
// 8. STEALTH HEADERS (por domínio)
// ════════════════════════════════════════════════════════════════════════════
const _hostnameCache = new Map();
function extractHostname(url) {
    const match = url.match(/^https?:\/\/[^\/]+/);
    const origin = match ? match[0] : url;
    let h = _hostnameCache.get(origin);
    if (h)
        return h;
    try {
        h = new URL(url).hostname;
    }
    catch {
        h = url;
    }
    if (_hostnameCache.size >= 64)
        _hostnameCache.delete(_hostnameCache.keys().next().value);
    _hostnameCache.set(origin, h);
    return h;
}
const REFERER_CACHE = new Map();
const ACCEPT_LANGS = [
    'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'pt-BR,pt;q=0.8,en-US;q=0.5,en;q=0.3',
    'pt-BR,pt;q=0.9,en;q=0.8',
    'pt-BR,pt;q=0.9',
];
function getRandomIP() {
    const r = () => Math.floor(Math.random() * 254) + 1;
    return `${r()}.${r()}.${r()}.${r()}`;
}
function getStealthHeaders(url, precomputedHostname) {
    const hostname = precomputedHostname || extractHostname(url);
    const lang = ACCEPT_LANGS[Math.floor(Math.random() * ACCEPT_LANGS.length)];
    const ip = getRandomIP();
    return {
        'User-Agent': getRandomAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': lang,
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Cache-Control': 'max-age=0',
        'Upgrade-Insecure-Requests': '1',
        'DNT': '1',
        'Referer': hostname.includes('statusinvest') ? 'https://www.google.com/' : `https://${hostname}/`,
        /** ATUALIZADO v16 — Sec-Ch-Ua atualizado para Chrome 136. */
        'Sec-Ch-Ua': '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Connection': 'keep-alive',
        'X-Forwarded-For': ip,
        'Client-IP': ip,
        'X-Real-IP': ip,
        'CF-Connecting-IP': ip,
    };
}
// ════════════════════════════════════════════════════════════════════════════
// 9. UNIVERSAL LEXER — ZERO-AST COM SLIDING WINDOW + extractGroups
// ════════════════════════════════════════════════════════════════════════════
/** Cache de RegExp compiladas para o modo `multiple`. */
const _regexCache = new Map();
function getGlobalRegex(source) {
    let r = _regexCache.get(source);
    if (!r) {
        r = new RegExp(source, 'g');
        _regexCache.set(source, r);
    }
    r.lastIndex = 0;
    return r;
}
/** Cache de anchor.toLowerCase() para evitar alocações no hot path. */
const _anchorLowerCache = new Map();
const ANCHOR_STRATEGIES = [
    (htmlLower, anchorLower) => htmlLower.indexOf(`>${anchorLower}<`),
    (htmlLower, anchorLower) => htmlLower.indexOf(`"${anchorLower}"`),
    (htmlLower, anchorLower) => htmlLower.indexOf(`>${anchorLower} `),
    (htmlLower, anchorLower) => htmlLower.indexOf(`'${anchorLower}'`),
    (htmlLower, anchorLower) => htmlLower.indexOf(anchorLower),
];
export function universalLexer(html, template, existingResults = {}, precomputedHtmlLower) {
    const results = { ...existingResults };
    const htmlLower = precomputedHtmlLower || html.toLowerCase();
    for (const rule of template.rules) {
        // Para multiple, refaz se ainda não tiver resultado
        if (results[rule.name] !== undefined && !rule.multiple)
            continue;
        if (rule.multiple && Array.isArray(results[rule.name]) && results[rule.name].length > 0)
            continue;
        for (const anchor of rule.anchors) {
            let anchorLower = _anchorLowerCache.get(anchor);
            if (!anchorLower) {
                anchorLower = anchor.toLowerCase();
                _anchorLowerCache.set(anchor, anchorLower);
            }
            // ULTRA OPTIMIZATION: Match pre-check. If anchor text is not present in the HTML at all,
            // skip attempting any strategies to avoid multiple expensive substring searches.
            if (!htmlLower.includes(anchorLower))
                continue;
            let idx = -1;
            for (const strategy of ANCHOR_STRATEGIES) {
                idx = strategy(htmlLower, anchorLower);
                if (idx !== -1)
                    break;
            }
            if (idx === -1)
                continue;
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
                        if (!val || VALORES_INVALIDOS.has(val))
                            return null;
                        return rule.formatter ? rule.formatter(val) : val;
                    })
                        .filter((v) => v !== null && v !== undefined);
                    if (extracted.length > 0) {
                        results[rule.name] = extracted;
                        break;
                    }
                }
            }
            else {
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
// 9.1 FALLBACK POR TEXTO VISÍVEL — aumenta cobertura no Investidor10
// ════════════════════════════════════════════════════════════════════════════
function decodeBasicEntities(s) {
    return s
        .replace(/&nbsp;|&#160;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>');
}
function htmlToVisibleText(html) {
    return decodeBasicEntities(html)
        .replace(/<script\b[\s\S]*?<\/script>/gi, '\n')
        .replace(/<style\b[\s\S]*?<\/style>/gi, '\n')
        .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, '\n')
        .replace(/<svg\b[\s\S]*?<\/svg>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>|<\/div>|<\/li>|<\/tr>|<\/td>|<\/th>|<\/h\d>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\r/g, '\n')
        .replace(/[ \t\f\v]+/g, ' ')
        .replace(/\n\s+/g, '\n')
        .replace(/\n{2,}/g, '\n')
        .trim();
}
function stripAccentsLower(s) {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}
function normalizeLabel(s) {
    return stripAccentsLower(s).replace(/[()]/g, '').replace(/\s+/g, ' ').trim();
}
const VALUE_TOKEN_RE = /(?:R\$\s*)?[+-]?(?:\d{1,3}(?:\.\d{3})*|\d+)(?:,\d+)?\s*(?:%|[KMB]|mil(?:h(?:ões|oes|ão|ao)?)?|bilh(?:ões|oes|ão|ao)?|trilh(?:ões|oes|ão|ao)?)?/i;
function valueLooksUseful(raw) {
    const v = raw.trim();
    if (!v || VALORES_INVALIDOS.has(v))
        return false;
    if (/^(setor|subsetor|segmento|comparacao|comparação)\b/i.test(v))
        return false;
    return true;
}
function findValueAfterLabel(lines, labels, opts = {}) {
    const normLabels = labels.map(normalizeLabel);
    const maxLookahead = opts.maxLookahead ?? 8;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const norm = normalizeLabel(line);
        for (const lab of normLabels) {
            if (norm === lab || norm.startsWith(lab + ' ') || norm.includes(' ' + lab + ' ')) {
                const after = line.slice(Math.max(0, line.toLowerCase().indexOf(labels[0].toLowerCase()) + labels[0].length)).trim();
                const inlineMatch = after.match(VALUE_TOKEN_RE);
                if (inlineMatch && valueLooksUseful(inlineMatch[0]))
                    return inlineMatch[0].trim();
                for (let j = 1; j <= maxLookahead && i + j < lines.length; j++) {
                    const cand = lines[i + j].trim();
                    if (!cand || /^(setor|subsetor|segmento|comparando|sem comparativos|comparativos)/i.test(cand))
                        continue;
                    const m = cand.match(VALUE_TOKEN_RE);
                    if (m && valueLooksUseful(m[0])) {
                        const val = m[0].trim();
                        if (opts.preferPct && !/%/.test(val))
                            continue;
                        if (opts.preferMoney && !/R\$/i.test(cand) && !/(milh|bilh|trilh|[KMB])/i.test(cand))
                            continue;
                        return val;
                    }
                    // Se chegamos em outra etiqueta clara, para de procurar para evitar pegar valor errado.
                    if (/^[A-ZÀ-ÿ0-9\/\.\-\s]{2,35}$/.test(cand) && !VALUE_TOKEN_RE.test(cand))
                        break;
                }
            }
        }
    }
    return undefined;
}
function findTextAfterLabel(lines, labels, maxLookahead = 6) {
    const normLabels = labels.map(normalizeLabel);
    for (let i = 0; i < lines.length; i++) {
        const norm = normalizeLabel(lines[i]);
        if (!normLabels.some(l => norm === l || norm.startsWith(l + ' ')))
            continue;
        for (let j = 1; j <= maxLookahead && i + j < lines.length; j++) {
            const cand = lines[i + j].trim();
            if (!cand || VALORES_INVALIDOS.has(cand))
                continue;
            if (/^(R\$|[+-]?\d)/.test(cand))
                continue;
            return cand;
        }
    }
    return undefined;
}
function findRawAfterLabel(lines, labels, maxLookahead = 4) {
    const normLabels = labels.map(normalizeLabel);
    for (let i = 0; i < lines.length; i++) {
        const norm = normalizeLabel(lines[i]);
        if (!normLabels.some(l => norm === l || norm.startsWith(l + ' ')))
            continue;
        for (let j = 1; j <= maxLookahead && i + j < lines.length; j++) {
            const cand = lines[i + j].trim();
            if (cand && !VALORES_INVALIDOS.has(cand))
                return cand;
        }
    }
    return undefined;
}
function parseTextDividendRows(text) {
    const rows = [];
    const seen = new Set();
    const re = /\b(Dividendos|JSCP|JCP|Rend\.?\s*Trib\.?)\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+([\d,.]+)/gi;
    let m;
    while ((m = re.exec(text)) !== null && rows.length < 240) {
        const tipo = m[1].replace(/\s+/g, ' ').trim();
        const dataCom = m[2];
        const dataPagamento = m[3];
        const valor = parseFloat(m[4].replace(/\./g, '').replace(',', '.'));
        if (!Number.isFinite(valor))
            continue;
        const key = `${tipo}|${dataCom}|${dataPagamento}|${valor}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        rows.push({ tipo, dataCom, dataPagamento, valor });
    }
    return rows;
}
function parseYieldsDistribuicoes(text) {
    const out = {};
    const specs = [
        ['yield1m', /YIELD\s+1\s*M[ÊE]S\s+([\d,.]+\s*%)\s+R\$\s*([\d,.]+)/i],
        ['yield3m', /YIELD\s+3\s*MESES\s+([\d,.]+\s*%)\s+R\$\s*([\d,.]+)/i],
        ['yield6m', /YIELD\s+6\s*MESES\s+([\d,.]+\s*%)\s+R\$\s*([\d,.]+)/i],
        ['yield12m', /YIELD\s+12\s*MESES\s+([\d,.]+\s*%)\s+R\$\s*([\d,.]+)/i],
    ];
    for (const [field, re] of specs) {
        const m = text.match(re);
        if (m) {
            out[field] = COMMON_FORMATTERS.pct(m[1]);
            out[`${field}Valor`] = COMMON_FORMATTERS.num(m[2]);
        }
    }
    return out;
}
function parseRentabilidade(text) {
    const idx = stripAccentsLower(text).indexOf('rentabilidade de');
    if (idx < 0)
        return undefined;
    const chunk = text.slice(idx, idx + 1600);
    const labels = [
        ['1m', '1 mês'], ['3m', '3 meses'], ['1a', '1 ano'], ['2a', '2 anos'], ['5a', '5 anos'], ['10a', '10 anos']
    ];
    const out = {};
    for (const [key, label] of labels) {
        const re = new RegExp(label.replace('ê', '[êe]') + '[\\s\\S]{0,80}?([+-]?\\d+[,.]\\d+\\s*%)', 'i');
        const m = chunk.match(re);
        if (m)
            out[key] = COMMON_FORMATTERS.pct(m[1]);
    }
    return Object.keys(out).length ? out : undefined;
}
function parseChecklist(text) {
    const norm = stripAccentsLower(text);
    const idx = norm.indexOf('checklist do investidor buy and hold');
    if (idx < 0)
        return undefined;
    const chunk = text.slice(idx, idx + 1200);
    const lines = chunk.split('\n').map(l => l.trim()).filter(Boolean);
    const start = lines.findIndex(l => /checklist do investidor/i.test(l));
    const out = [];
    for (const line of lines.slice(Math.max(0, start + 1))) {
        if (/Esta ferramenta|Carteira Investidor|ADICIONAR/i.test(line))
            break;
        if (line.length >= 10 && !/^imagem|image$/i.test(line))
            out.push(line);
        if (out.length >= 20)
            break;
    }
    return out.length ? out : undefined;
}
function textFallbackLexer(html, template, existingResults = {}) {
    const out = { ...existingResults };
    const text = htmlToVisibleText(html);
    if (!text)
        return out;
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const isFii = /FII/i.test(template.name);
    const numericFields = {
        precoAtual: ['Preço atual', 'Cotação', 'Valor atual'],
        variacaoDay: ['Variação', 'Var. Dia', 'Var%'],
        variacao12m: ['VARIAÇÃO (12M)', 'Variação 12M', 'VAR 12M'],
        dy12m: ['DY atual', 'DY 12M', 'DY (12M)'],
        dividendYield: ['Dividend Yield', 'DY atual', 'DY (12M)', 'VISC11 DY (12M)'],
        dyMedio5a: ['DY médio em 5 anos', 'DY médio 5 anos', 'DY Médio 5 anos'],
        pl: ['P/L', 'P/Lucro'],
        pvp: ['P/VP'],
        psr: ['P/Receita (PSR)', 'P/Receita', 'PSR'],
        payout: ['Payout'],
        margemLiquida: ['Margem Líquida', 'Margem Liquida'],
        margemBruta: ['Margem Bruta'],
        margemEbit: ['Margem Ebit', 'Margem EBIT'],
        margemEbitda: ['Margem Ebtida', 'Margem Ebitda', 'Margem EBITDA'],
        evEbitda: ['EV/Ebitda', 'EV/EBITDA'],
        evEbit: ['EV/Ebit', 'EV/EBIT'],
        pEbitda: ['P/Ebitda', 'P/EBITDA'],
        pEbit: ['P/Ebit', 'P/EBIT'],
        pAtivo: ['P/Ativo'],
        pCapGiro: ['P/Cap.Giro', 'P/Capital de Giro'],
        pAtivoCircLiq: ['P/Ativo Circ. Liq.', 'P/Ativo Circ Liq'],
        vpa: ['VPA'],
        lpa: ['LPA'],
        giroAtivos: ['Giro Ativos', 'Giro de Ativos'],
        roe: ['ROE'],
        roic: ['ROIC'],
        roa: ['ROA'],
        dividaLiquidaPatrimonio: ['Dívida Líquida / Patrimônio', 'Divida Liquida / Patrimonio'],
        dividaLiquidaEbitda: ['Dívida Líquida / Ebitda', 'Dívida Liq/EBITDA'],
        dividaLiquidaEbit: ['Dívida Líquida / Ebit', 'Dívida Liq/EBIT'],
        dividaBrutaPatrimonio: ['Dívida Bruta / Patrimônio', 'Divida Bruta / Patrimonio'],
        patrimonioAtivos: ['Patrimônio / Ativos', 'Patrimonio / Ativos'],
        passivosAtivos: ['Passivos / Ativos'],
        liquidezCorrente: ['Liquidez Corrente'],
        cagrReceitas5a: ['CAGR Receitas 5 anos', 'CAGR Receitas 5A'],
        cagrLucros5a: ['CAGR Lucros 5 anos', 'CAGR Lucros 5A'],
        valorDeMercado: ['Valor de Mercado'],
        valorDeFirma: ['Valor de Firma', 'Enterprise Value'],
        patrimonioLiquido: ['Patrimônio Líquido', 'Patrimonio Liquido'],
        ativosTotais: ['Ativos Totais', 'Total de Ativos'],
        ativoCirculante: ['Ativo Circulante'],
        dividaLiquida: ['Dívida Líquida', 'Divida Liquida'],
        dividaBruta: ['Dívida Bruta', 'Divida Bruta'],
        disponibilidade: ['Disponibilidade', 'Caixa e Equivalentes'],
        liquidezMediaDiaria: ['Liquidez Média Diária', 'Liquidez Media Diaria'],
        faturamento12m: ['Faturamento', 'Receita Líquida', 'Receita (12M)'],
        lucro12m: ['Lucro Líquido', 'Lucro Liquido', 'Lucro (12M)'],
        totalDividendos12m: ['Total pago nos últimos 12 meses', 'pagou o total de'],
        liquidezDiaria: ['Liquidez Diária', 'Liquidez Diaria'],
        yield1m: ['YIELD 1 MÊS', 'Yield 1M'],
        yield3m: ['YIELD 3 MESES', 'Yield 3M'],
        yield6m: ['YIELD 6 MESES', 'Yield 6M'],
        yield12m: ['YIELD 12 MESES', 'Yield 12M'],
        ultimoRendimento: ['Último Rendimento', 'Último Dividendo'],
        valorPatrimonial: ['VAL. PATRIMONIAL P/ COTA', 'Valor Patrimonial por Cota', 'VP/Cota'],
        valorPatrimonialTotal: ['VALOR PATRIMONIAL', 'Valor Patrimonial Total'],
        magicNumber: ['Magic Number'],
        vacanciaFisica: ['Vacância Física', 'VACÂNCIA'],
        vacanciaFinanceira: ['Vacância Financeira'],
        numeroCotistas: ['NUMERO DE COTISTAS', 'Número de Cotistas', 'Nº Cotistas'],
        cotasEmitidas: ['COTAS EMITIDAS', 'Nº de Cotas'],
    };
    for (const [field, labels] of Object.entries(numericFields)) {
        if (out[field] !== undefined)
            continue;
        const val = findValueAfterLabel(lines, labels, { preferPct: /yield|dy|margem|roe|roic|roa|cagr|payout|vacancia|var/i.test(field) });
        if (val !== undefined)
            out[field] = /yield|dy|margem|roe|roic|roa|cagr|payout|vacancia|var/i.test(field) ? COMMON_FORMATTERS.pct(val) : COMMON_FORMATTERS.num(val);
    }
    const textFields = {
        razaoSocial: ['Razão Social'],
        cnpj: ['CNPJ'],
        setor: ['Setor'],
        subsetor: ['Subsetor'],
        segmento: isFii ? ['SEGMENTO'] : ['Segmento'],
        segmentoFii: ['SEGMENTO'],
        tipoFundo: ['TIPO DE FUNDO', 'Tipo de Fundo'],
        mandato: ['MANDATO', 'Mandato'],
        publicoAlvo: ['PÚBLICO-ALVO', 'Publico Alvo'],
        tipoGestao: ['TIPO DE GESTÃO', 'Tipo de Gestão'],
        prazoDuracao: ['PRAZO DE DURAÇÃO', 'Prazo de Duração'],
        taxaAdministracao: ['TAXA DE ADMINISTRAÇÃO', 'Taxa de Administração'],
        segmentoListagem: ['Segmento de Listagem'],
        freeFloat: ['Free Float'],
        tagAlong: ['Tag Along'],
    };
    for (const [field, labels] of Object.entries(textFields)) {
        if (out[field] !== undefined)
            continue;
        if (field === 'cnpj') {
            const m = text.match(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/);
            if (m)
                out[field] = m[0];
            continue;
        }
        const val = findTextAfterLabel(lines, labels);
        if (val)
            out[field] = val;
    }
    const divRows = parseTextDividendRows(text);
    if ((!Array.isArray(out.historicoDividendos) || out.historicoDividendos.length === 0) && divRows.length) {
        out.historicoDividendos = divRows;
    }
    Object.assign(out, parseYieldsDistribuicoes(text));
    const rentabilidade = parseRentabilidade(text);
    if (rentabilidade)
        out.rentabilidade = rentabilidade;
    const checklist = parseChecklist(text);
    if (checklist)
        out.checklistBah = checklist;
    // Captura narrativas úteis do fim da página sem sobrescrever campos estruturados.
    const resumoMatch = text.match(/(?:vale a pena\?|Quanto rende|Como comprar)[\s\S]{0,1200}/i);
    if (resumoMatch && !out.resumoInvestidor10)
        out.resumoInvestidor10 = resumoMatch[0].replace(/\s+/g, ' ').trim();
    return out;
}
// ════════════════════════════════════════════════════════════════════════════
// 9.2 SUPER SECTION PARSER INVESTIDOR10 — seções, tabelas e gráficos embutidos
// ════════════════════════════════════════════════════════════════════════════
const BR_STATES = new Set([
    'Acre', 'Alagoas', 'Amapá', 'Amazonas', 'Bahia', 'Ceará', 'Distrito Federal', 'Espírito Santo', 'Goiás', 'Maranhão', 'Mato Grosso', 'Mato Grosso do Sul', 'Minas Gerais', 'Pará', 'Paraíba', 'Paraná', 'Pernambuco', 'Piauí', 'Rio de Janeiro', 'Rio Grande do Norte', 'Rio Grande do Sul', 'Rondônia', 'Roraima', 'Santa Catarina', 'São Paulo', 'Sergipe', 'Tocantins'
].map(stripAccentsLower));
const I10_SECTION_STOP_PATTERNS = [
    'preco justo do ativo', 'preco teto do ativo', 'indicadores fundamentalistas', 'historico de indicadores',
    'checklist do investidor', 'historico de dividendos', 'radar de dividendos', 'payout de', 'comparador de acoes',
    'comparacao de', 'comparando', 'sobre a empresa', 'dados sobre a empresa', 'informacoes sobre a empresa',
    'regioes onde', 'negocios que geram receita', 'posicao acionaria', 'receitas e lucros', 'lucro x cotacao',
    'resultados ', 'evolucao do patrimonio', 'balanco patrimonial', 'comunicados do', 'noticias sobre',
    'informacoes sobre ', 'distribuicoes nos ultimos 12 meses', 'dividend yield', 'lista de imoveis',
    'media do tipo e segmento', 'carteira investidor 10'
];
const FIELD_LABELS_I10 = [
    ['pl', 'P/L'], ['psr', 'P/Receita (PSR)'], ['pvp', 'P/VP'], ['dividendYield', 'Dividend Yield'], ['payout', 'Payout'],
    ['margemLiquida', 'Margem Líquida'], ['margemBruta', 'Margem Bruta'], ['margemEbit', 'Margem Ebit'], ['margemEbitda', 'Margem Ebtida'],
    ['evEbitda', 'EV/Ebitda'], ['evEbit', 'EV/Ebit'], ['pEbitda', 'P/Ebitda'], ['pEbit', 'P/Ebit'], ['pAtivo', 'P/Ativo'],
    ['pCapGiro', 'P/Cap.Giro'], ['pAtivoCircLiq', 'P/Ativo Circ. Liq.'], ['vpa', 'VPA'], ['lpa', 'LPA'], ['giroAtivos', 'Giro Ativos'],
    ['roe', 'ROE'], ['roic', 'ROIC'], ['roa', 'ROA'], ['dividaLiquidaPatrimonio', 'Dívida Líquida / Patrimônio'],
    ['dividaLiquidaEbitda', 'Dívida Líquida / Ebitda'], ['dividaLiquidaEbit', 'Dívida Líquida / Ebit'],
    ['dividaBrutaPatrimonio', 'Dívida Bruta / Patrimônio'], ['patrimonioAtivos', 'Patrimônio / Ativos'], ['passivosAtivos', 'Passivos / Ativos'],
    ['liquidezCorrente', 'Liquidez Corrente'], ['cagrReceitas5a', 'CAGR Receitas 5 anos'], ['cagrLucros5a', 'CAGR Lucros 5 anos']
];
function cleanI10Line(line) {
    return decodeBasicEntities(String(line || ''))
        .replace(/^[#*•\s]+/g, '').replace(/^-\s+/, '')
        .replace(/\s+/g, ' ')
        .trim();
}
function splitVisibleLines(html) {
    return htmlToVisibleText(html).split('\n').map(cleanI10Line).filter(Boolean);
}
function isStopLine(line, ownPatterns) {
    const n = stripAccentsLower(line);
    const own = (ownPatterns || []).map(stripAccentsLower);
    if (own.some(p => n.includes(p)))
        return false;
    return I10_SECTION_STOP_PATTERNS.some(p => n.includes(p));
}
function extractSectionLinesByPattern(lines, startPatterns, stopPatterns, maxLines = 700) {
    const starts = startPatterns.map(stripAccentsLower);
    const stops = (stopPatterns || []).map(stripAccentsLower);
    let start = -1;
    for (let i = 0; i < lines.length; i++) {
        const n = stripAccentsLower(lines[i]);
        if (starts.some(p => n.includes(p))) {
            start = i;
            break;
        }
    }
    if (start < 0)
        return [];
    const out = [];
    for (let i = start; i < lines.length && out.length < maxLines; i++) {
        if (i > start) {
            const n = stripAccentsLower(lines[i]);
            if (stops.some(p => n.includes(p)))
                break;
            if (isStopLine(lines[i], startPatterns))
                break;
        }
        out.push(lines[i]);
    }
    return out;
}
function findNextValueInLines(lines, idx, maxLookahead = 5) {
    for (let j = 1; j <= maxLookahead && idx + j < lines.length; j++) {
        const cand = lines[idx + j];
        const m = cand.match(VALUE_TOKEN_RE);
        if (m && valueLooksUseful(m[0]))
            return m[0].trim();
    }
    return undefined;
}
function parsePeriodPercentLines(lines) {
    const periods = [
        ['1m', ['1 mes', '1 mês']], ['3m', ['3 meses']], ['6m', ['6 meses']], ['1a', ['1 ano']],
        ['2a', ['2 anos']], ['5a', ['5 anos']], ['10a', ['10 anos']], ['15a', ['15 anos']], ['ytd', ['ytd']]
    ];
    const out = {};
    for (let i = 0; i < lines.length; i++) {
        const n = normalizeLabel(lines[i]);
        for (const [key, labs] of periods) {
            if (!labs.some(l => normalizeLabel(l) === n))
                continue;
            const val = findNextValueInLines(lines, i, 4);
            if (val && /%/.test(val))
                out[key] = COMMON_FORMATTERS.pct(val);
        }
    }
    return out;
}
function parseRentabilidadeDetalhada(lines) {
    const sec = extractSectionLinesByPattern(lines, ['rentabilidade de'], ['preco justo do ativo', 'informacoes sobre']);
    if (!sec.length)
        return undefined;
    const realIdx = sec.findIndex(l => stripAccentsLower(l).includes('rentabilidade real'));
    const nominalStart = sec.findIndex(l => normalizeLabel(l) === 'rentabilidade');
    const nominalLines = sec.slice(nominalStart >= 0 ? nominalStart + 1 : 1, realIdx > 0 ? realIdx : sec.length);
    const realLines = realIdx >= 0 ? sec.slice(realIdx + 1) : [];
    const nominal = parsePeriodPercentLines(nominalLines);
    const real = parsePeriodPercentLines(realLines);
    const out = { titulo: sec[0], nominal, real };
    return (Object.keys(nominal).length || Object.keys(real).length) ? out : undefined;
}
function parseIndicadoresComparativos(lines) {
    const sec = extractSectionLinesByPattern(lines, ['indicadores fundamentalistas'], ['historico de indicadores', 'checklist do investidor'], 400);
    if (!sec.length)
        return undefined;
    const items = [];
    const byField = {};
    for (let i = 0; i < sec.length; i++) {
        const nl = normalizeLabel(sec[i]);
        const spec = FIELD_LABELS_I10.find(([, label]) => normalizeLabel(label) === nl);
        if (!spec)
            continue;
        const [field, label] = spec;
        const value = findNextValueInLines(sec, i, 4);
        const compLine = sec.slice(i + 1, i + 8).find(l => /Setor\s*:/i.test(l) || /Subsetor\s*:/i.test(l) || /Segmento\s*:/i.test(l));
        const comparativos = {};
        if (compLine) {
            const mSetor = compLine.match(/Setor\s*:\s*([+-]?[\d,.]+\s*%?)/i);
            const mSubsetor = compLine.match(/Subsetor\s*:\s*([+-]?[\d,.]+\s*%?)/i);
            const mSegmento = compLine.match(/Segmento\s*:\s*([+-]?[\d,.]+\s*%?)/i);
            if (mSetor)
                comparativos.setor = /%/.test(mSetor[1]) ? COMMON_FORMATTERS.pct(mSetor[1]) : COMMON_FORMATTERS.num(mSetor[1]);
            if (mSubsetor)
                comparativos.subsetor = /%/.test(mSubsetor[1]) ? COMMON_FORMATTERS.pct(mSubsetor[1]) : COMMON_FORMATTERS.num(mSubsetor[1]);
            if (mSegmento)
                comparativos.segmento = /%/.test(mSegmento[1]) ? COMMON_FORMATTERS.pct(mSegmento[1]) : COMMON_FORMATTERS.num(mSegmento[1]);
        }
        const formatted = value && /%/.test(value) ? COMMON_FORMATTERS.pct(value) : (value ? COMMON_FORMATTERS.num(value) : undefined);
        const item = { field, label, value: formatted, comparativos };
        items.push(item);
        byField[field] = item;
    }
    const ctx = {};
    const joined = sec.join(' ');
    const m1 = joined.match(/Comparando com Setor:\s*([^\.]+)\./i);
    const m2 = joined.match(/Comparando com Subsetor:\s*([^\.]+)\./i);
    const m3 = joined.match(/Comparando com Segmento:\s*([^\.]+)\./i);
    if (m1)
        ctx.setor = m1[1].trim();
    if (m2)
        ctx.subsetor = m2[1].trim();
    if (m3)
        ctx.segmento = m3[1].trim();
    return items.length ? { contexto: ctx, items, byField } : undefined;
}
function parseChecklistDetalhado(lines) {
    const sec = extractSectionLinesByPattern(lines, ['checklist do investidor buy and hold'], ['historico de dividendos', 'distribuicoes nos ultimos 12 meses', 'carteira investidor 10'], 80);
    if (!sec.length)
        return undefined;
    const criterios = [];
    for (const line of sec.slice(1)) {
        if (/Esta ferramenta|Carteira Investidor|ADICIONAR|Saiba mais/i.test(line))
            break;
        if (line.length < 8 || /^imagem$/i.test(line))
            continue;
        const n = stripAccentsLower(line);
        let status = 'indeterminado';
        if (/(aprov|positivo|sim|ok|cumpre|✓|check)/i.test(line))
            status = 'aprovado';
        if (/(reprov|negativo|nao|não|x|falha)/i.test(line))
            status = 'reprovado';
        criterios.push({ criterio: line, status });
    }
    return criterios.length ? { criterios, total: criterios.length } : undefined;
}
function parseComunicados(lines) {
    const sec = extractSectionLinesByPattern(lines, ['comunicados do'], ['noticias sobre'], 180);
    if (!sec.length)
        return undefined;
    const out = [];
    for (let i = 1; i < sec.length; i++) {
        const dateMatch = sec[i].match(/Data de Divulga(?:ç|c)[aã]o\s*:\s*(\d{2}\/\d{2}\/\d{4})/i);
        if (!dateMatch)
            continue;
        let title = '';
        for (let j = i - 1; j >= Math.max(1, i - 5); j--) {
            const cand = sec[j].trim();
            if (!cand || /^Abrir$/i.test(cand) || /^Anterior|^Pr[oó]xima|^\d+$/.test(cand))
                continue;
            if (/Data de Divulga/i.test(cand))
                continue;
            title = cand;
            break;
        }
        if (title)
            out.push({ titulo: title, dataDivulgacao: dateMatch[1] });
    }
    return out.length ? out : undefined;
}
function parseEmpresaDados(lines) {
    const out = {};
    const sobreSec = extractSectionLinesByPattern(lines, ['sobre a empresa'], ['dados sobre a empresa'], 200);
    if (sobreSec.length) {
        const paragraphs = sobreSec.slice(1).filter(l => !/Média de avaliações|Avalie|Deixar de seguir|Seguir|Isso não é/i.test(l));
        if (paragraphs.length)
            out.sobre = paragraphs.join('\n');
    }
    const dadosSec = extractSectionLinesByPattern(lines, ['dados sobre a empresa'], ['informacoes sobre a empresa'], 100);
    if (dadosSec.length) {
        const dados = {};
        const joined = dadosSec.join('\n');
        const specs = [
            ['nomeEmpresa', /Nome da Empresa\s*:\s*([^\n]+)/i], ['cnpj', /CNPJ\s*:\s*([\d.\/\-]+)/i],
            ['anoBolsa', /Ano de estreia na bolsa\s*:\s*(\d{4})/i], ['funcionarios', /N[uú]mero de funcion[aá]rios\s*:\s*([\d.]+)/i],
            ['anoFundacao', /Ano de funda(?:ç|c)[aã]o\s*:\s*(\d{4})/i]
        ];
        for (const [k, re] of specs) {
            const m = joined.match(re);
            if (m)
                dados[k] = /ano/i.test(k) || k === 'funcionarios' ? COMMON_FORMATTERS.int(m[1]) : m[1].trim();
        }
        const papeis = [...joined.matchAll(/\b[A-Z]{4}\d{1,2}F?\b/g)].map(m => m[0]);
        if (papeis.length)
            dados.papeis = [...new Set(papeis)];
        out.dados = dados;
    }
    const infoSec = extractSectionLinesByPattern(lines, ['informacoes sobre a empresa'], ['regioes onde'], 180);
    if (infoSec.length) {
        const info = {};
        const specs = [
            ['valorDeMercado', ['Valor de mercado']], ['valorDeFirma', ['Valor de firma']], ['patrimonioLiquido', ['Patrimônio Líquido']],
            ['totalPapeis', ['Nº total de papeis', 'Nº total de papéis']], ['ativosTotais', ['Ativos']], ['ativoCirculante', ['Ativo Circulante']],
            ['dividaBruta', ['Dívida Bruta']], ['dividaLiquida', ['Dívida Líquida']], ['disponibilidade', ['Disponibilidade']],
            ['liquidezMediaDiaria', ['Liquidez Média Diária']]
        ];
        for (const [field, labels] of specs) {
            const v = findValueAfterLabel(infoSec, labels, { maxLookahead: 4 });
            if (v)
                info[field] = COMMON_FORMATTERS.num(v);
        }
        const joined = infoSec.join(' ');
        const sl = joined.match(/Segmento de Listagem\s+([^\n]+?)(?:\s+Free Float|$)/i);
        const ff = joined.match(/Free Float\s+([\d,.]+\s*%)/i);
        const ta = joined.match(/Tag Along\s+([\d,.]+\s*%)/i);
        if (sl)
            info.segmentoListagem = sl[1].trim();
        if (ff)
            info.freeFloat = COMMON_FORMATTERS.pct(ff[1]);
        if (ta)
            info.tagAlong = COMMON_FORMATTERS.pct(ta[1]);
        out.informacoesFinanceiras = info;
    }
    return Object.keys(out).length ? out : undefined;
}
function parseSimpleSectionAvailability(lines, startPatterns, stopPatterns) {
    const sec = extractSectionLinesByPattern(lines, startPatterns, stopPatterns, 120);
    if (!sec.length)
        return undefined;
    const useful = sec.slice(1).filter(l => !/^\*$/.test(l) && !/ARRASTE O QUADRO/i.test(l));
    return { available: true, titulo: sec[0], texto: useful.slice(0, 40).join('\n') };
}
function parseFiisInformacoes(lines) {
    const sec = extractSectionLinesByPattern(lines, ['informacoes sobre'], ['historico de indicadores'], 120);
    if (!sec.length)
        return undefined;
    const map = {
        razaoSocial: ['Razão Social'], cnpj: ['CNPJ'], publicoAlvo: ['PÚBLICO-ALVO', 'Publico-alvo'], mandato: ['MANDATO'],
        segmentoFii: ['SEGMENTO'], tipoFundo: ['TIPO DE FUNDO'], prazoDuracao: ['PRAZO DE DURAÇÃO'], tipoGestao: ['TIPO DE GESTÃO'],
        taxaAdministracao: ['TAXA DE ADMINISTRAÇÃO'], vacanciaFisica: ['VACÂNCIA'], numeroCotistas: ['NUMERO DE COTISTAS', 'NÚMERO DE COTISTAS'],
        cotasEmitidas: ['COTAS EMITIDAS'], valorPatrimonial: ['VAL. PATRIMONIAL P/ COTA'], valorPatrimonialTotal: ['VALOR PATRIMONIAL'], ultimoRendimento: ['ÚLTIMO RENDIMENTO']
    };
    const out = {};
    for (const [field, labels] of Object.entries(map)) {
        const rawDirect = findRawAfterLabel(sec, labels, 3);
        const txt = findTextAfterLabel(sec, labels, 3);
        const val = findValueAfterLabel(sec, labels, { maxLookahead: 3 });
        const raw = /^(razaoSocial|cnpj|publicoAlvo|mandato|segmentoFii|tipoFundo|prazoDuracao|tipoGestao|taxaAdministracao)$/.test(field)
            ? (rawDirect || txt || val)
            : (val || rawDirect || txt);
        if (!raw)
            continue;
        if (field === 'cnpj')
            out[field] = String(raw).trim();
        else if (/^(numeroCotistas|cotasEmitidas)$/.test(field))
            out[field] = COMMON_FORMATTERS.int(raw);
        else if (/^(valorPatrimonial|valorPatrimonialTotal|ultimoRendimento)$/.test(field))
            out[field] = COMMON_FORMATTERS.num(raw);
        else if (/vacancia/i.test(field))
            out[field] = COMMON_FORMATTERS.pct(raw);
        else
            out[field] = String(raw).trim();
    }
    return Object.keys(out).length ? out : undefined;
}
function parseDistribuicoes12m(lines) {
    const sec = extractSectionLinesByPattern(lines, ['distribuicoes nos ultimos 12 meses'], ['dividend yield'], 80);
    if (!sec.length)
        return undefined;
    const text = sec.join('\n');
    const parsed = parseYieldsDistribuicoes(text);
    const out = { ...parsed };
    const rows = [];
    const re = /YIELD\s+(1\s*M[ÊE]S|3\s*MESES|6\s*MESES|12\s*MESES)\s+([\d,.]+\s*%)\s+R\$\s*([\d,.]+)/gi;
    let m;
    while ((m = re.exec(text)) !== null)
        rows.push({ periodo: m[1].replace(/\s+/g, ' '), yield: COMMON_FORMATTERS.pct(m[2]), valor: COMMON_FORMATTERS.num(m[3]) });
    if (rows.length)
        out.rows = rows;
    return Object.keys(out).length ? out : undefined;
}
function parseDividendYieldSection(lines) {
    const sec = extractSectionLinesByPattern(lines, ['dividend yield'], ['historico de dividendos', 'gare11 dividendos', 'sobre a'], 120);
    if (!sec.length)
        return undefined;
    const joined = sec.join(' ');
    const out = {};
    const atual = joined.match(/DY atual\s*:\s*([\d,.]+\s*%)/i);
    const medio = joined.match(/DY m[eé]dio em 5 anos\s*:\s*([\d,.]+\s*%)/i);
    if (atual)
        out.dyAtual = COMMON_FORMATTERS.pct(atual[1]);
    if (medio)
        out.dyMedio5a = COMMON_FORMATTERS.pct(medio[1]);
    return Object.keys(out).length ? out : undefined;
}
function parseListaImoveis(lines) {
    const sec = extractSectionLinesByPattern(lines, ['lista de imoveis'], ['comunicados do', 'media do tipo'], 900);
    if (!sec.length)
        return undefined;
    const porEstado = [];
    const imoveis = [];
    for (let i = 1; i < sec.length; i++) {
        const stateNorm = stripAccentsLower(sec[i]);
        if (BR_STATES.has(stateNorm) && /^\d+$/.test(sec[i + 1] || '')) {
            porEstado.push({ estado: sec[i], quantidade: Number(sec[i + 1]) });
            i++;
            continue;
        }
        const estadoM = sec[i].match(/^Estado\s*:\s*(.+)$/i);
        if (estadoM) {
            let nome = '';
            for (let j = i - 1; j >= Math.max(1, i - 6); j--) {
                const cand = sec[j].trim();
                if (!cand || /^\d+$/.test(cand) || BR_STATES.has(stripAccentsLower(cand)) || /^Área bruta/i.test(cand))
                    continue;
                nome = cand;
                break;
            }
            let area = undefined;
            const areaLine = sec.slice(i + 1, i + 4).find(l => /^Área bruta locável/i.test(l));
            if (areaLine) {
                const m = areaLine.match(/([\d.]+,?\d*)\s*m/i);
                if (m)
                    area = Number(String(m[1]).replace(/\./g, '').replace(',', '.'));
            }
            imoveis.push({ nome, estado: estadoM[1].trim(), areaBrutaLocavelM2: area });
        }
    }
    return (porEstado.length || imoveis.length) ? { porEstado, imoveis, totalImoveisExtraidos: imoveis.length } : undefined;
}
function parseMediaTipoSegmento(lines) {
    const sec = extractSectionLinesByPattern(lines, ['media do tipo e segmento'], ['noticias', 'comentarios'], 100);
    if (!sec.length)
        return undefined;
    const text = sec.join(' ');
    const out = { descricao: '' };
    const desc = text.match(/Comparando\s+.+?\./i);
    if (desc)
        out.descricao = desc[0].trim();
    const specs = [
        ['pvp', /P\/VP\s*:\s*([\d,.]+)\s*Comparação\s*:\s*([\d,.]+)/i],
        ['dy12m', /DY\s*\(12M\)\s*:\s*([\d,.]+\s*%)\s*Comparação\s*:\s*([\d,.]+\s*%)/i],
        ['valorPatrimonial', /Valor Patrimonial\s*:\s*([\d,.]+\s*(?:Milh[õo]es|Bilh[õo]es|Trilh[õo]es|[KMB])?)\s*Comparação\s*:\s*([\d,.]+\s*(?:Milh[õo]es|Bilh[õo]es|Trilh[õo]es|[KMB])?)/i],
        ['valorPatrimonialPorCota', /Val\. Patrimonial p\/ Cota\s*:\s*R\$\s*([\d,.]+)\s*Comparação\s*:\s*R\$\s*([\d,.]+)/i]
    ];
    out.metricas = {};
    for (const [field, re] of specs) {
        const m = text.match(re);
        if (!m)
            continue;
        out.metricas[field] = {
            ativo: /%/.test(m[1]) ? COMMON_FORMATTERS.pct(m[1]) : COMMON_FORMATTERS.num(m[1]),
            comparacao: /%/.test(m[2]) ? COMMON_FORMATTERS.pct(m[2]) : COMMON_FORMATTERS.num(m[2]),
        };
    }
    return Object.keys(out.metricas).length || out.descricao ? out : undefined;
}
function parseHtmlTables(html) {
    const tables = [];
    const tableRe = /<table\b[^>]*>[\s\S]*?<\/table>/gi;
    let m;
    while ((m = tableRe.exec(html)) !== null && tables.length < 30) {
        const tableHtml = m[0];
        const headers = [];
        const thRe = /<th\b[^>]*>([\s\S]*?)<\/th>/gi;
        let th;
        while ((th = thRe.exec(tableHtml)) !== null)
            headers.push(cleanI10Line(th[1].replace(/<[^>]+>/g, ' ')));
        const rows = [];
        const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
        let tr;
        while ((tr = trRe.exec(tableHtml)) !== null && rows.length < 300) {
            const cells = [];
            const tdRe = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
            let td;
            while ((td = tdRe.exec(tr[1])) !== null)
                cells.push(cleanI10Line(td[1].replace(/<[^>]+>/g, ' ')));
            if (cells.length)
                rows.push(cells);
        }
        if (rows.length)
            tables.push({ headers, rows });
    }
    return tables;
}
function parseEmbeddedChartCandidates(html) {
    const candidates = [];
    const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => decodeBasicEntities(m[1] || ''));
    for (const script of scripts) {
        if (!/(series|datasets|labels|chart|grafico|Highcharts|ApexCharts|Chart\()/i.test(script))
            continue;
        const compact = script.replace(/\s+/g, ' ').trim();
        if (!compact)
            continue;
        const labelMatch = compact.match(/(?:name|title|label)\s*[:=]\s*['"]([^'"]{2,80})['"]/i);
        const nums = [...compact.matchAll(/[\[{,]\s*(-?\d+(?:\.\d+)?)\s*[,\]}]/g)].slice(0, 80).map(m => Number(m[1])).filter(Number.isFinite);
        const labels = [...compact.matchAll(/['"]((?:20\d{2}|\d{2}\/\d{2}\/\d{4}|\d{2}\/\d{4}|1T\d{2}|2T\d{2}|3T\d{2}|4T\d{2})[^'"]*)['"]/g)].slice(0, 80).map(m => m[1]);
        if (nums.length || labels.length) {
            candidates.push({ label: labelMatch ? labelMatch[1] : undefined, numericSample: nums, labelSample: labels, rawSample: compact.slice(0, 1200) });
        }
        if (candidates.length >= 20)
            break;
    }
    const dataAttrRe = /data-(?:chart|series|labels|values|json)=["']([^"']{10,5000})["']/gi;
    let dm;
    while ((dm = dataAttrRe.exec(html)) !== null && candidates.length < 30) {
        const raw = decodeBasicEntities(dm[1]);
        try {
            candidates.push({ from: 'data-attribute', data: JSON.parse(raw) });
        }
        catch {
            candidates.push({ from: 'data-attribute', rawSample: raw.slice(0, 1200) });
        }
    }
    return candidates;
}
function parseInvestidor10DeepSections(html, template, existingResults = {}) {
    const out = { ...existingResults };
    const lines = splitVisibleLines(html);
    if (!lines.length)
        return out;
    const text = lines.join('\n');
    const isFii = /FII/i.test(template.name);
    const sections = { ...(out.sections || {}) };
    const rentabilidade = parseRentabilidadeDetalhada(lines);
    if (rentabilidade)
        sections.rentabilidade = rentabilidade;
    const indicadores = parseIndicadoresComparativos(lines);
    if (indicadores) {
        sections.indicadoresFundamentalistas = indicadores;
        for (const item of indicadores.items)
            if (out[item.field] === undefined && item.value !== undefined)
                out[item.field] = item.value;
    }
    const checklist = parseChecklistDetalhado(lines);
    if (checklist) {
        sections.checklistBuyAndHold = checklist;
        if (!out.checklistBah)
            out.checklistBah = checklist.criterios.map(c => c.criterio);
    }
    const dividendos = parseTextDividendRows(text);
    if (dividendos.length) {
        out.historicoDividendos = out.historicoDividendos && out.historicoDividendos.length ? out.historicoDividendos : dividendos;
        sections.dividendos = { ...(sections.dividendos || {}), historico: dividendos };
    }
    const comunicados = parseComunicados(lines);
    if (comunicados)
        sections.comunicados = comunicados;
    const tables = parseHtmlTables(html);
    if (tables.length)
        sections.tabelasHtml = tables;
    const chartCandidates = parseEmbeddedChartCandidates(html);
    if (chartCandidates.length)
        sections.graficosEmbutidos = chartCandidates;
    if (isFii) {
        const infoFii = parseFiisInformacoes(lines);
        if (infoFii) {
            sections.informacoesFundo = infoFii;
            for (const [k, v] of Object.entries(infoFii))
                if (out[k] === undefined)
                    out[k] = v;
        }
        const dist = parseDistribuicoes12m(lines);
        if (dist)
            sections.distribuicoes12m = dist;
        const dySec = parseDividendYieldSection(lines);
        if (dySec) {
            sections.dividendYield = dySec;
            if (out.dividendYield === undefined && dySec.dyAtual)
                out.dividendYield = dySec.dyAtual;
            if (out.dyMedio5a === undefined && dySec.dyMedio5a)
                out.dyMedio5a = dySec.dyMedio5a;
        }
        const listaImoveis = parseListaImoveis(lines);
        if (listaImoveis)
            sections.listaImoveis = listaImoveis;
        const media = parseMediaTipoSegmento(lines);
        if (media)
            sections.mediaTipoSegmento = media;
        sections.historicoIndicadores = parseSimpleSectionAvailability(lines, ['historico de indicadores'], ['comparacao de']);
        sections.comparacaoIndices = parseSimpleSectionAvailability(lines, ['comparacao de'], ['comparando com outros']);
        sections.comparacaoOutrosFiis = parseSimpleSectionAvailability(lines, ['comparando com outros fiis'], ['checklist do investidor']);
    }
    else {
        const empresa = parseEmpresaDados(lines);
        if (empresa) {
            sections.empresa = empresa;
            if (empresa.dados)
                for (const [k, v] of Object.entries(empresa.dados))
                    if (out[k] === undefined)
                        out[k] = v;
            if (empresa.informacoesFinanceiras)
                for (const [k, v] of Object.entries(empresa.informacoesFinanceiras))
                    if (out[k] === undefined)
                        out[k] = v;
        }
        const radar = parseSimpleSectionAvailability(lines, ['radar de dividendos inteligente'], ['payout de']);
        if (radar)
            sections.radarDividendos = radar;
        sections.historicoIndicadores = parseSimpleSectionAvailability(lines, ['historico de indicadores'], ['checklist do investidor']);
        sections.payoutHistorico = parseSimpleSectionAvailability(lines, ['payout de'], ['preco teto do ativo', 'comparador de']);
        sections.comparadorAcoes = parseSimpleSectionAvailability(lines, ['comparador de acoes'], ['comparacao de']);
        sections.comparacaoIndices = parseSimpleSectionAvailability(lines, ['comparacao de'], ['comparando']);
        sections.comparacaoBrent = parseSimpleSectionAvailability(lines, ['comparando', 'petroleo brent'], ['sobre a empresa']);
        sections.regioesReceita = parseSimpleSectionAvailability(lines, ['regioes onde'], ['negocios que geram receita']);
        sections.negociosReceita = parseSimpleSectionAvailability(lines, ['negocios que geram receita'], ['posicao acionaria']);
        sections.posicaoAcionaria = parseSimpleSectionAvailability(lines, ['posicao acionaria'], ['receitas e lucros']);
        sections.receitasLucros = parseSimpleSectionAvailability(lines, ['receitas e lucros'], ['lucro x cotacao']);
        sections.lucroCotacao = parseSimpleSectionAvailability(lines, ['lucro x cotacao'], ['resultados']);
        sections.resultados = parseSimpleSectionAvailability(lines, ['resultados'], ['evolucao do patrimonio']);
        sections.evolucaoPatrimonio = parseSimpleSectionAvailability(lines, ['evolucao do patrimonio'], ['balanco patrimonial']);
        sections.balancoPatrimonial = parseSimpleSectionAvailability(lines, ['balanco patrimonial'], ['comunicados do']);
    }
    for (const k of Object.keys(sections))
        if (sections[k] === undefined)
            delete sections[k];
    if (Object.keys(sections).length)
        out.sections = sections;
    out._i10Coverage = {
        sectionKeys: Object.keys(sections),
        htmlTables: tables.length,
        embeddedChartCandidates: chartCandidates.length,
        parserVersion: 'super-i10-v18',
    };
    return out;
}
export function enhancedUniversalLexer(html, template, existingResults = {}) {
    const firstPass = universalLexer(html, template, existingResults);
    const textPass = textFallbackLexer(html, template, firstPass);
    return parseInvestidor10DeepSections(html, template, textPass);
}
// ════════════════════════════════════════════════════════════════════════════
// 10. SCHEMAS ZOD POR TIPO DE ATIVO
// ════════════════════════════════════════════════════════════════════════════
const zNumStr = () => z.union([z.number(), z.string()]).optional();
const zStr = () => z.string().optional();
const zArr = () => z.array(z.any()).optional();
/**
 * ATUALIZADO v16 — B3Schema massivamente expandido com todos os indicadores
 * fundamentalistas mapeados no guia de scraping do Investidor10.
 */
export const B3Schema = z.object({
    // ── Hero / Cabeçalho ──────────────────────────────────────────────────
    precoAtual: zNumStr(),
    variacaoDay: zStr(),
    variacao12m: zStr(),
    dy12m: zStr(),
    dyMedio5a: zStr(),
    pl: zNumStr(),
    pvp: zNumStr(),
    dividendYield: zStr(),
    marketCap: zNumStr(),
    // ── Indicadores Fundamentalistas ─────────────────────────────────────
    psr: zNumStr(), // P/Receita
    payout: zStr(),
    margemLiquida: zStr(),
    margemBruta: zStr(),
    margemEbit: zStr(), // Margem Operacional (EBIT)
    margemEbitda: zStr(),
    margemOperacional: zStr(), // retrocompat (= margemEbit)
    evEbitda: zNumStr(),
    evEbit: zNumStr(),
    pEbitda: zNumStr(),
    pEbit: zNumStr(),
    pAtivo: zNumStr(),
    pCapGiro: zNumStr(),
    pAtivoCircLiq: zNumStr(),
    vpa: zNumStr(),
    lpa: zNumStr(),
    giroAtivos: zNumStr(),
    roe: zStr(),
    roic: zStr(),
    roa: zStr(),
    // ── Endividamento ─────────────────────────────────────────────────────
    dividaLiquidaPatrimonio: zNumStr(),
    dividaLiquidaEbitda: zNumStr(),
    dividaLiquidaEbit: zNumStr(),
    dividaBrutaPatrimonio: zNumStr(),
    patrimonioAtivos: zNumStr(),
    passivosAtivos: zNumStr(),
    liquidezCorrente: zNumStr(),
    dividaBruta: zNumStr(),
    dividaLiquida: zNumStr(),
    disponibilidade: zNumStr(),
    // ── Crescimento ───────────────────────────────────────────────────────
    cagrReceitas5a: zStr(),
    cagrLucros5a: zStr(),
    // ── Dados Financeiros ─────────────────────────────────────────────────
    valorDeMercado: zNumStr(),
    valorDeFirma: zNumStr(), // EV / Enterprise Value
    patrimonioLiquido: zNumStr(),
    totalPapeis: zNumStr(),
    ativosTotais: zNumStr(),
    ativoCirculante: zNumStr(),
    liquidezMediaDiaria: zNumStr(),
    faturamento12m: zNumStr(),
    lucro12m: zNumStr(),
    // ── Informações da Empresa ────────────────────────────────────────────
    cnpj: zStr(),
    setor: zStr(),
    subsetor: zStr(),
    segmento: zStr(),
    segmentoListagem: zStr(),
    funcionarios: zNumStr(),
    anoFundacao: zNumStr(),
    anoBolsa: zNumStr(),
    freeFloat: zStr(),
    tagAlong: zStr(),
    // ── Histórico de Dividendos ───────────────────────────────────────────
    historicoDividendos: zArr(), // DividendItem[]
    totalDividendos12m: zNumStr(),
    // ── Checklist BAH (Buy and Hold) ──────────────────────────────────────
    checklistBah: zArr(), // boolean[]
    // ── Campos preenchidos pelo Yahoo Finance ────────────────────────────
    regularMarketPrice: zNumStr(),
}).passthrough();
/**
 * ATUALIZADO v16 — FIISchema expandido com todos os campos do guia de scraping.
 */
export const FIISchema = z.object({
    // ── Hero / Cabeçalho ──────────────────────────────────────────────────
    precoAtual: zNumStr(),
    variacaoDay: zStr(),
    variacao12m: zStr(),
    dividendYield: zStr(), // DY 12M
    pvp: zNumStr(),
    liquidezDiaria: zNumStr(),
    // ── Rentabilidade / Yield ─────────────────────────────────────────────
    yield1m: zStr(),
    yield3m: zStr(),
    yield6m: zStr(),
    yield12m: zStr(),
    dyMedio5a: zStr(),
    totalDividendos12m: zNumStr(),
    ultimoRendimento: zNumStr(),
    // ── Dados Patrimoniais ────────────────────────────────────────────────
    valorPatrimonial: zNumStr(), // Val. Patrimonial por cota
    valorPatrimonialTotal: zNumStr(),
    patrimonioLiquido: zNumStr(),
    // ── Indicadores FII ───────────────────────────────────────────────────
    magicNumber: zNumStr(),
    vacanciaFisica: zStr(),
    vacanciaFinanceira: zStr(),
    // ── Informações do Fundo ──────────────────────────────────────────────
    cnpj: zStr(),
    numeroCotistas: zNumStr(),
    cotasEmitidas: zNumStr(),
    taxaAdministracao: zStr(),
    tipoFundo: zStr(), // Papel / Tijolo / Híbrido
    segmentoFii: zStr(),
    mandato: zStr(),
    publicoAlvo: zStr(),
    tipoGestao: zStr(),
    prazoDuracao: zStr(),
    // ── Histórico de Dividendos ───────────────────────────────────────────
    historicoDividendos: zArr(), // DividendItem[]
    // ── Comparação com Médias do Tipo ────────────────────────────────────
    pvpMedioTipo: zNumStr(),
    dyMedioTipo: zStr(),
}).passthrough();
export const ETFSchema = z.object({
    precoAtual: zNumStr(),
    dividendYield: zStr(),
    pvp: zNumStr(),
    patrimonioLiquido: zNumStr(),
    taxaAdmin: zStr(),
    variacaoDay: zStr(),
    variacao12m: zStr(),
}).passthrough();
/**
 * NOVO v16 — StockSchema para ações estrangeiras (Stocks) listadas no
 * Investidor10 via /stocks/{TICKER}/. Usa os mesmos indicadores de Ação.
 */
export const StockSchema = B3Schema.extend({
    moeda: zStr(), // USD, EUR, etc.
    exchange: zStr(), // NYSE, NASDAQ, etc.
});
// ════════════════════════════════════════════════════════════════════════════
// 11. TEMPLATES POR TIPO DE ATIVO
// ════════════════════════════════════════════════════════════════════════════
const COMMON_FORMATTERS = {
    num: (r) => normalizeBRNumber(r),
    pct: (r) => {
        const s = r.trim();
        return s.includes('%') ? s : s + '%';
    },
    int: (r) => {
        const n = normalizeBRNumber(r);
        return typeof n === 'number' ? Math.round(n) : r;
    },
    str: (r) => r.trim(),
};
/** Formatter para linhas de tabela de dividendos (extractGroups: true). */
const dividendRowFormatter = (m) => {
    const tipo = m[1]?.trim();
    const dataCom = m[2]?.trim();
    const dataPag = m[3]?.trim();
    const valor = m[4]?.trim();
    if (!tipo || !dataCom || !valor)
        return null;
    const v = parseFloat(valor.replace(',', '.'));
    if (isNaN(v))
        return null;
    return { tipo, dataCom, dataPagamento: dataPag ?? '', valor: v };
};
/**
 * ATUALIZADO v16 — acaoTemplate expandido com todos os indicadores do guia.
 * Mapeado a partir das seções 1.1 a 1.8 do investidor10_scraping_guide.md.
 */
export const acaoTemplate = {
    name: 'B3_ACAO',
    schema: B3Schema,
    rules: [
        // ── Hero / Cabeçalho ────────────────────────────────────────────────
        { name: 'precoAtual',
            anchors: ['Cotação', 'Preço Atual', 'cotacao', 'Valor atual'],
            extractRegex: />\s*R?\$?\s*([\d,.]+)\s*</, formatter: COMMON_FORMATTERS.num },
        { name: 'variacaoDay',
            anchors: ['Variação', 'variacao', 'Var. Dia', 'var-day', 'Var%'],
            extractRegex: />\s*([+-]?[\d,.]+\s*%?)\s*</, formatter: COMMON_FORMATTERS.pct },
        { name: 'variacao12m',
            anchors: ['VARIAÇÃO (12M)', 'Variação (12M)', 'Variação 12M', 'VAR 12M', 'Var 12M'],
            extractRegex: />\s*([+-]?[\d,.]+\s*%?)\s*</, formatter: COMMON_FORMATTERS.pct },
        { name: 'dy12m',
            anchors: ['DY', 'DY (12M)', 'DY 12M', 'Dividend Yield 12M'],
            extractRegex: />\s*([\d,.]+\s*%?)\s*</, formatter: COMMON_FORMATTERS.pct },
        // ── Indicadores fundamentalistas (Seção 1.3) ─────────────────────────
        { name: 'pl',
            anchors: ['P/L', 'P/Lucro', 'P / L', 'Preço/Lucro'],
            extractRegex: />\s*([+-]?[\d,.-]+)\s*</, formatter: COMMON_FORMATTERS.num,
            chunkSize: 800 }, // FIX v16.1: default 400 não alcançava o valor no HTML do Investidor10
        { name: 'pvp',
            anchors: ['P/VP', 'P/Valor Patrimonial', 'P / VP'],
            extractRegex: />\s*([\d,.-]+)\s*</, formatter: COMMON_FORMATTERS.num },
        { name: 'psr',
            anchors: ['P/Receita', 'PSR', 'P/Rev', 'P/Rec'],
            extractRegex: />\s*([\d,.-]+)\s*</, formatter: COMMON_FORMATTERS.num },
        { name: 'dividendYield',
            anchors: ['Dividend Yield', 'Div. Yield', 'Yield'],
            extractRegex: />\s*([\d,.]+\s*%?)\s*</, formatter: COMMON_FORMATTERS.pct },
        { name: 'payout',
            anchors: ['Payout'],
            extractRegex: />\s*([\d,.]+\s*%?)\s*</, formatter: COMMON_FORMATTERS.pct },
        { name: 'margemLiquida',
            anchors: ['Margem Líquida', 'Margem Liquida'],
            extractRegex: />\s*([+-]?[\d,.]+\s*%?)\s*</, formatter: COMMON_FORMATTERS.pct },
        { name: 'margemBruta',
            anchors: ['Margem Bruta'],
            extractRegex: />\s*([+-]?[\d,.]+\s*%?)\s*</, formatter: COMMON_FORMATTERS.pct },
        { name: 'margemEbit',
            anchors: ['Margem Ebit', 'Margem EBIT', 'Margem Operacional'],
            extractRegex: />\s*([+-]?[\d,.]+\s*%?)\s*</, formatter: COMMON_FORMATTERS.pct },
        { name: 'margemEbitda',
            anchors: ['Margem Ebitda', 'Margem EBITDA'],
            extractRegex: />\s*([+-]?[\d,.]+\s*%?)\s*</, formatter: COMMON_FORMATTERS.pct },
        { name: 'evEbitda',
            anchors: ['EV/EBITDA', 'EV/Ebitda'],
            extractRegex: />\s*([\d,.-]+)\s*</, formatter: COMMON_FORMATTERS.num },
        { name: 'evEbit',
            anchors: ['EV/EBIT', 'EV/Ebit'],
            extractRegex: />\s*([\d,.-]+)\s*</, formatter: COMMON_FORMATTERS.num },
        { name: 'pEbitda',
            anchors: ['P/EBITDA', 'P/Ebitda'],
            extractRegex: />\s*([\d,.-]+)\s*</, formatter: COMMON_FORMATTERS.num },
        { name: 'pEbit',
            anchors: ['P/EBIT', 'P/Ebit'],
            extractRegex: />\s*([\d,.-]+)\s*</, formatter: COMMON_FORMATTERS.num },
        { name: 'pAtivo',
            anchors: ['P/Ativo'],
            extractRegex: />\s*([+-]?[\d,.-]+)\s*</, formatter: COMMON_FORMATTERS.num },
        { name: 'pCapGiro',
            anchors: ['P/Cap.Giro', 'P/Capital de Giro', 'P/Cap Giro'],
            extractRegex: />\s*([+-]?[\d,.-]+)\s*</, formatter: COMMON_FORMATTERS.num },
        { name: 'pAtivoCircLiq',
            anchors: ['P/Ativo Circ. Liq.', 'P/Ativo Circ Liq', 'P/ACL'],
            extractRegex: />\s*([+-]?[\d,.-]+)\s*</, formatter: COMMON_FORMATTERS.num },
        { name: 'vpa',
            anchors: ['VPA', 'Valor Patrimonial por Ação', 'Val. Pat. por Ação'],
            extractRegex: />\s*([\d,.-]+)\s*</, formatter: COMMON_FORMATTERS.num },
        { name: 'lpa',
            anchors: ['LPA', 'Lucro por Ação'],
            extractRegex: />\s*([+-]?[\d,.-]+)\s*</, formatter: COMMON_FORMATTERS.num },
        { name: 'giroAtivos',
            anchors: ['Giro Ativos', 'Giro de Ativos'],
            extractRegex: />\s*([\d,.-]+)\s*</, formatter: COMMON_FORMATTERS.num },
        { name: 'roe',
            anchors: ['ROE', 'Retorno sobre Patrimônio'],
            extractRegex: />\s*([+-]?[\d,.]+\s*%?)\s*</, formatter: COMMON_FORMATTERS.pct },
        { name: 'roic',
            anchors: ['ROIC'],
            extractRegex: />\s*([+-]?[\d,.]+\s*%?)\s*</, formatter: COMMON_FORMATTERS.pct },
        { name: 'roa',
            anchors: ['ROA', 'Retorno sobre Ativos'],
            extractRegex: />\s*([+-]?[\d,.]+\s*%?)\s*</, formatter: COMMON_FORMATTERS.pct },
        // ── Endividamento ────────────────────────────────────────────────────
        { name: 'dividaLiquidaPatrimonio',
            anchors: ['Dívida Líquida / Patrimônio', 'Div Liq/PL', 'Dívida Liq/Patrimônio'],
            extractRegex: />\s*([+-]?[\d,.-]+)\s*</, formatter: COMMON_FORMATTERS.num },
        { name: 'dividaLiquidaEbitda',
            anchors: ['Dívida Líquida / Ebitda', 'Dívida Liq/EBITDA', 'Dív Líq/EBITDA'],
            extractRegex: />\s*([+-]?[\d,.-]+)\s*</, formatter: COMMON_FORMATTERS.num },
        { name: 'dividaLiquidaEbit',
            anchors: ['Dívida Líquida / Ebit', 'Dívida Liq/EBIT'],
            extractRegex: />\s*([+-]?[\d,.-]+)\s*</, formatter: COMMON_FORMATTERS.num },
        { name: 'dividaBrutaPatrimonio',
            anchors: ['Dívida Bruta / Patrimônio', 'Div Bruta/PL'],
            extractRegex: />\s*([\d,.-]+)\s*</, formatter: COMMON_FORMATTERS.num },
        { name: 'patrimonioAtivos',
            anchors: ['Patrimônio / Ativos', 'PL/Ativos'],
            extractRegex: />\s*([\d,.-]+)\s*</, formatter: COMMON_FORMATTERS.num },
        { name: 'passivosAtivos',
            anchors: ['Passivos / Ativos', 'Passivo/Ativo'],
            extractRegex: />\s*([\d,.-]+)\s*</, formatter: COMMON_FORMATTERS.num },
        { name: 'liquidezCorrente',
            anchors: ['Liquidez Corrente'],
            extractRegex: />\s*([\d,.-]+)\s*</, formatter: COMMON_FORMATTERS.num },
        // ── Crescimento ──────────────────────────────────────────────────────
        { name: 'cagrReceitas5a',
            anchors: ['CAGR Receitas 5 anos', 'CAGR Receitas 5A', 'CAGR Receitas'],
            extractRegex: />\s*([+-]?[\d,.]+\s*%?)\s*</, formatter: COMMON_FORMATTERS.pct },
        { name: 'cagrLucros5a',
            anchors: ['CAGR Lucros 5 anos', 'CAGR Lucros 5A', 'CAGR Lucros'],
            extractRegex: />\s*([+-]?[\d,.]+\s*%?)\s*</, formatter: COMMON_FORMATTERS.pct },
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
            extractRegex: />\s*([\d,.]+\s*%?)\s*</, formatter: COMMON_FORMATTERS.pct },
        { name: 'totalDividendos12m',
            anchors: ['Total pago nos últimos 12 meses', 'Total pago (12M)', 'Total pago'],
            extractRegex: />\s*R?\$?\s*([\d,.]+)\s*</, formatter: COMMON_FORMATTERS.num },
        // ── Informações da Empresa (Seção 1.7) ───────────────────────────────
        { name: 'cnpj',
            anchors: ['CNPJ'],
            extractRegex: />\s*([\d]{2}\.[\d]{3}\.[\d]{3}\/[\d]{4}-[\d]{2})\s*</,
            formatter: COMMON_FORMATTERS.str },
        { name: 'setor',
            anchors: ['Setor'],
            extractRegex: />\s*([A-Za-zÀ-ÿ][^<]{2,60})\s*</, formatter: COMMON_FORMATTERS.str },
        { name: 'subsetor',
            anchors: ['Subsetor'],
            extractRegex: />\s*([A-Za-zÀ-ÿ][^<]{2,60})\s*</, formatter: COMMON_FORMATTERS.str },
        { name: 'segmento',
            anchors: ['Segmento'],
            extractRegex: />\s*([A-Za-zÀ-ÿ][^<]{2,60})\s*</, formatter: COMMON_FORMATTERS.str },
        { name: 'segmentoListagem',
            anchors: ['Segmento de Listagem', 'Listagem'],
            extractRegex: />\s*([A-Za-zÀ-ÿ][^<]{1,40})\s*</, formatter: COMMON_FORMATTERS.str },
        { name: 'funcionarios',
            anchors: ['Número de funcionários', 'Funcionários', 'Nº funcionários'],
            extractRegex: />\s*([\d,.]+)\s*</, formatter: COMMON_FORMATTERS.int },
        { name: 'anoFundacao',
            anchors: ['Ano de fundação', 'Fundação', 'Fundado em'],
            extractRegex: />\s*(1[89]\d{2}|20\d{2})\s*</, formatter: COMMON_FORMATTERS.int },
        { name: 'anoBolsa',
            anchors: ['Ano de estreia na Bolsa', 'Estreia na Bolsa', 'IPO'],
            extractRegex: />\s*(1[89]\d{2}|20\d{2})\s*</, formatter: COMMON_FORMATTERS.int },
        { name: 'freeFloat',
            anchors: ['Free Float'],
            extractRegex: />\s*([\d,.]+\s*%?)\s*</, formatter: COMMON_FORMATTERS.pct },
        { name: 'tagAlong',
            anchors: ['Tag Along'],
            extractRegex: />\s*([\d,.]+\s*%?)\s*</, formatter: COMMON_FORMATTERS.pct },
        // ── Histórico de Dividendos — multi-coluna (Seção 1.6) ───────────────
        {
            name: 'historicoDividendos',
            anchors: ['historico-dividendos', 'Histórico de Dividendos', 'HISTÓRICO DE DIVIDENDOS', 'Dividendos pagos'],
            extractRegex: /<td[^>]*>\s*(Dividendos|JSCP|Rend\.?\s*Trib\.?)\s*<\/td>\s*<td[^>]*>\s*([\d]{2}\/[\d]{2}\/[\d]{4})\s*<\/td>\s*<td[^>]*>\s*([\d]{2}\/[\d]{2}\/[\d]{4})\s*<\/td>\s*<td[^>]*>\s*([\d,.]+)\s*<\/td>/i,
            multiple: true,
            extractGroups: true,
            chunkSize: 25000,
            formatter: dividendRowFormatter,
        },
    ],
};
/**
 * ATUALIZADO v16 — fiiTemplate expandido com todos os campos do guia (Parte 2).
 */
export const fiiTemplate = {
    name: 'B3_FII',
    schema: FIISchema,
    rules: [
        // ── Hero / Cabeçalho (Seção 2.1) ─────────────────────────────────────
        { name: 'precoAtual',
            anchors: ['Cotação', 'Preço Atual', 'Valor atual'],
            extractRegex: />\s*R?\$?\s*([\d,.]+)\s*</, formatter: COMMON_FORMATTERS.num },
        { name: 'variacaoDay',
            anchors: ['Variação', 'variacao', 'Var%'],
            extractRegex: />\s*([+-]?[\d,.]+\s*%?)\s*</, formatter: COMMON_FORMATTERS.pct },
        { name: 'variacao12m',
            anchors: ['VARIAÇÃO (12M)', 'Variação (12M)', 'Variação 12M', 'VAR 12M'],
            extractRegex: />\s*([+-]?[\d,.]+\s*%?)\s*</, formatter: COMMON_FORMATTERS.pct },
        { name: 'dividendYield',
            anchors: ['Dividend Yield', 'DY', 'DY (12M)', 'Yield'],
            extractRegex: />\s*([\d,.]+\s*%?)\s*</, formatter: COMMON_FORMATTERS.pct },
        { name: 'pvp',
            anchors: ['P/VP', 'P / VP'],
            extractRegex: />\s*([\d,.]+)\s*</, formatter: COMMON_FORMATTERS.num },
        { name: 'liquidezDiaria',
            anchors: ['Liquidez Diária', 'Liquidez', 'Liq. Diária'],
            extractRegex: />\s*([\d,.]+\s*(?:[KMB]|Milh[^\s<]{0,6})?)\s*</, formatter: COMMON_FORMATTERS.num },
        // ── Distribuições / Yield por período (Seção 2.4) ────────────────────
        { name: 'yield1m',
            anchors: ['1 Mês', '1 mês', 'Yield 1M', '1M'],
            extractRegex: />\s*([\d,.]+\s*%?)\s*</, formatter: COMMON_FORMATTERS.pct },
        { name: 'yield3m',
            anchors: ['3 Meses', '3 meses', 'Yield 3M', '3M'],
            extractRegex: />\s*([\d,.]+\s*%?)\s*</, formatter: COMMON_FORMATTERS.pct },
        { name: 'yield6m',
            anchors: ['6 Meses', '6 meses', 'Yield 6M', '6M'],
            extractRegex: />\s*([\d,.]+\s*%?)\s*</, formatter: COMMON_FORMATTERS.pct },
        { name: 'yield12m',
            anchors: ['12 Meses', '12 meses', 'DY 12M'],
            extractRegex: />\s*([\d,.]+\s*%?)\s*</, formatter: COMMON_FORMATTERS.pct },
        { name: 'dyMedio5a',
            anchors: ['DY médio 5 anos', 'DY Médio 5 anos', 'DY médio'],
            extractRegex: />\s*([\d,.]+\s*%?)\s*</, formatter: COMMON_FORMATTERS.pct },
        { name: 'totalDividendos12m',
            anchors: ['Total pago (12M)', 'Total pago nos últimos 12 meses', 'Total pago'],
            extractRegex: />\s*R?\$?\s*([\d,.]+)\s*</, formatter: COMMON_FORMATTERS.num },
        { name: 'ultimoRendimento',
            anchors: ['Último Rendimento', 'Últ. Rendimento', 'Último Dividendo'],
            extractRegex: />\s*R?\$?\s*([\d,.]+)\s*</, formatter: COMMON_FORMATTERS.num },
        // ── Dados Patrimoniais (Seção 2.6) ────────────────────────────────────
        { name: 'valorPatrimonial',
            anchors: ['Valor Patrimonial por Cota', 'Val. Pat. por Cota', 'VP/Cota', 'Valor Patrimonial'],
            extractRegex: />\s*R?\$?\s*([\d,.]+)\s*</, formatter: COMMON_FORMATTERS.num },
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
            extractRegex: />\s*([\d,.]+)\s*</, formatter: COMMON_FORMATTERS.num },
        { name: 'vacanciaFisica',
            anchors: ['Vacância Física', 'Vacância Física', 'Vacância'],
            extractRegex: />\s*([\d,.]+\s*%?)\s*</, formatter: COMMON_FORMATTERS.pct },
        { name: 'vacanciaFinanceira',
            anchors: ['Vacância Financeira'],
            extractRegex: />\s*([\d,.]+\s*%?)\s*</, formatter: COMMON_FORMATTERS.pct },
        // ── Informações do Fundo (Seção 2.3) ──────────────────────────────────
        { name: 'cnpj',
            anchors: ['CNPJ'],
            extractRegex: />\s*([\d]{2}\.[\d]{3}\.[\d]{3}\/[\d]{4}-[\d]{2})\s*</,
            formatter: COMMON_FORMATTERS.str },
        { name: 'numeroCotistas',
            anchors: ['Número de Cotistas', 'Cotistas', 'Nº Cotistas'],
            extractRegex: />\s*([\d,.]+)\s*</, formatter: COMMON_FORMATTERS.int },
        { name: 'cotasEmitidas',
            anchors: ['Cotas Emitidas', 'Nº de Cotas'],
            extractRegex: />\s*([\d,.]+\s*(?:Milh[^\s<]{0,6}|[KMB])?)\s*</, formatter: COMMON_FORMATTERS.num },
        { name: 'taxaAdministracao',
            anchors: ['Taxa de Administração', 'Taxa Admin', 'Taxa Adm.'],
            extractRegex: />\s*([\d,.]+\s*%?[^<]{0,30})\s*</, formatter: COMMON_FORMATTERS.str },
        { name: 'tipoFundo',
            anchors: ['Tipo de Fundo', 'Tipo Fundo'],
            extractRegex: />\s*([A-Za-zÀ-ÿ][^<]{1,30})\s*</, formatter: COMMON_FORMATTERS.str },
        { name: 'segmentoFii',
            anchors: ['Segmento'],
            extractRegex: />\s*([A-Za-zÀ-ÿ][^<]{1,40})\s*</, formatter: COMMON_FORMATTERS.str },
        { name: 'mandato',
            anchors: ['Mandato'],
            extractRegex: />\s*([A-Za-zÀ-ÿ][^<]{1,40})\s*</, formatter: COMMON_FORMATTERS.str },
        { name: 'publicoAlvo',
            anchors: ['Público-alvo', 'Publico Alvo'],
            extractRegex: />\s*([A-Za-zÀ-ÿ][^<]{1,30})\s*</, formatter: COMMON_FORMATTERS.str },
        { name: 'tipoGestao',
            anchors: ['Tipo de Gestão', 'Tipo de Gestao', 'Gestão'],
            extractRegex: />\s*([A-Za-zÀ-ÿ][^<]{1,20})\s*</, formatter: COMMON_FORMATTERS.str },
        { name: 'prazoDuracao',
            anchors: ['Prazo de Duração', 'Prazo Duração', 'Prazo'],
            extractRegex: />\s*([A-Za-zÀ-ÿ0-9][^<]{1,30})\s*</, formatter: COMMON_FORMATTERS.str },
        // ── Comparação com médias do tipo (Seção 2.7) ─────────────────────────
        { name: 'pvpMedioTipo',
            anchors: ['Média Mesmo Tipo', 'Média do Tipo', 'Média Tipo'],
            extractRegex: />\s*([\d,.]+)\s*</, formatter: COMMON_FORMATTERS.num },
        // ── Histórico de Dividendos — multi-coluna (Seção 2.5) ───────────────
        {
            name: 'historicoDividendos',
            anchors: ['historico-dividendos', 'Histórico de Dividendos', 'HISTÓRICO DE DIVIDENDOS'],
            extractRegex: /<td[^>]*>\s*(Dividendos)\s*<\/td>\s*<td[^>]*>\s*([\d]{2}\/[\d]{2}\/[\d]{4})\s*<\/td>\s*<td[^>]*>\s*([\d]{2}\/[\d]{2}\/[\d]{4})\s*<\/td>\s*<td[^>]*>\s*([\d,.]+)\s*<\/td>/i,
            multiple: true,
            extractGroups: true,
            chunkSize: 20000,
            formatter: dividendRowFormatter,
        },
    ],
};
// Templates aliasados para BDR (mesmo schema de Ação)
export const bdrTemplate = acaoTemplate;
/** ATUALIZADO v16 — ETF template com variacao12m. */
export const etfTemplate = {
    name: 'B3_ETF',
    schema: ETFSchema,
    rules: [
        { name: 'precoAtual', anchors: ['Cotação', 'Preço Atual', 'Valor atual'], extractRegex: />\s*R?\$?\s*([\d,.]+)\s*</, formatter: COMMON_FORMATTERS.num },
        { name: 'dividendYield', anchors: ['Dividend Yield', 'DY', 'Yield'], extractRegex: />\s*([\d,.]+\s*%?)\s*</, formatter: COMMON_FORMATTERS.pct },
        { name: 'pvp', anchors: ['P/VP'], extractRegex: />\s*([\d,.-]+)\s*</, formatter: COMMON_FORMATTERS.num },
        { name: 'patrimonioLiquido', anchors: ['Patrimônio Líquido', 'Patrimônio'], extractRegex: />\s*([\d,.]+[KMB]?)\s*</, formatter: COMMON_FORMATTERS.num },
        { name: 'taxaAdmin', anchors: ['Taxa de Administração', 'Taxa Admin'], extractRegex: />\s*([\d,.]+\s*%?[^<]{0,20})\s*</, formatter: COMMON_FORMATTERS.str },
        { name: 'variacaoDay', anchors: ['Variação', 'variacao'], extractRegex: />\s*([+-]?[\d,.]+\s*%?)\s*</, formatter: COMMON_FORMATTERS.pct },
        { name: 'variacao12m', anchors: ['VARIAÇÃO (12M)', 'Variação (12M)', 'VAR 12M'], extractRegex: />\s*([+-]?[\d,.]+\s*%?)\s*</, formatter: COMMON_FORMATTERS.pct },
    ],
};
/**
 * NOVO v16 — stockTemplate para ações estrangeiras (/stocks/{TICKER}/).
 * Reutiliza todas as regras de acaoTemplate com âncoras adicionais em inglês.
 */
export const stockTemplate = {
    name: 'I10_STOCK',
    schema: StockSchema,
    rules: [
        ...acaoTemplate.rules,
        // Âncoras adicionais em inglês para páginas de Stocks
        { name: 'moeda', anchors: ['Currency', 'Moeda'], extractRegex: />\s*([A-Z]{3})\s*</, formatter: COMMON_FORMATTERS.str },
        { name: 'exchange', anchors: ['Exchange', 'Bolsa'], extractRegex: />\s*(NASDAQ|NYSE|AMEX|LSE|[A-Z]{2,6})\s*</, formatter: COMMON_FORMATTERS.str },
    ],
};
// ════════════════════════════════════════════════════════════════════════════
// 12. ASSET PRESETS POR TIPO
// ════════════════════════════════════════════════════════════════════════════
/**
 * ATUALIZADO v16 — ASSET_PRESETS com suporte completo a ACAO/FII/BDR/ETF/STOCK.
 * URLs baseadas na documentação do investidor10_scraping_guide.md.
 */
const ASSET_PRESETS = {
    ACAO: { i10Base: 'https://investidor10.com.br/acoes', siBase: 'https://statusinvest.com.br/acoes', template: acaoTemplate },
    FII: { i10Base: 'https://investidor10.com.br/fiis', siBase: 'https://statusinvest.com.br/fundos-imobiliarios', template: fiiTemplate },
    BDR: { i10Base: 'https://investidor10.com.br/bdrs', siBase: 'https://statusinvest.com.br/bdrs', template: bdrTemplate },
    ETF: { i10Base: 'https://investidor10.com.br/etfs', siBase: 'https://statusinvest.com.br/etfs', template: etfTemplate },
    /** NOVO v16 — Stocks estrangeiros listados no Investidor10. */
    STOCK: { i10Base: 'https://investidor10.com.br/stocks', siBase: 'https://statusinvest.com.br/acoes', template: stockTemplate },
};
const _jsonInFlight = new Map();
async function fetchJson(url, timeoutMs) {
    const existing = _jsonInFlight.get(url);
    if (existing)
        return existing;
    const p = (async () => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
            const fetchOpts = {
                signal: ctrl.signal,
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'User-Agent': getRandomAgent(),
                    'Origin': 'https://finance.yahoo.com',
                    'Referer': 'https://finance.yahoo.com/',
                },
            };
            const ultraOpts = NexusEngineUltra._options;
            if (ultraOpts && ultraOpts.fetchDispatcher) {
                fetchOpts.dispatcher = ultraOpts.fetchDispatcher;
            }
            const res = await fetch(url, fetchOpts);
            if (res.status === 403 || res.status === 401) {
                console.warn(`[Yahoo Finance] HTTP ${res.status} para ${url} — ignorando.`);
                return null;
            }
            if (!res.ok)
                throw new Error(`HTTP ${res.status}`);
            const text = await res.text();
            try {
                return JSON.parse(text);
            }
            catch {
                throw new Error(`JSON inválido: ${text.slice(0, 20)}`);
            }
        }
        finally {
            clearTimeout(timer);
            _jsonInFlight.delete(url);
        }
    })();
    _jsonInFlight.set(url, p);
    return p;
}
/** Promise.any() para corrida entre hosts — o mais rápido vence. */
async function yahooQuote(ticker, timeoutMs) {
    // Para STOCKs, não adicionar sufixo .SA
    const isStock = /^[A-Z]{1,5}$/.test(ticker);
    const symbols = isStock ? [ticker] : [`${ticker}.SA`, ticker.toUpperCase()];
    try {
        const meta = await Promise.any(symbols.flatMap(symbol => YAHOO_HOSTS.map(async (host) => {
            const json = await fetchJson(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d&includePrePost=false`, timeoutMs);
            const m = json?.chart?.result?.[0]?.meta;
            if (!m?.regularMarketPrice)
                throw new Error('Sem meta');
            return m;
        })));
        const prev = meta.chartPreviousClose ?? meta.regularMarketPreviousClose;
        return {
            regularMarketPrice: meta.regularMarketPrice,
            regularMarketChangePercent: prev ? ((meta.regularMarketPrice - prev) / prev) * 100 : undefined,
            trailingPE: meta.trailingPE,
            priceToBook: meta.priceToBook,
            bookValue: meta.bookValue,
            epsTrailingTwelveMonths: meta.epsTrailingTwelveMonths,
            trailingAnnualDividendYield: meta.trailingAnnualDividendYield,
            marketCap: meta.marketCap,
        };
    }
    catch {
        return null;
    }
}
async function yahooFundamentals(ticker, timeoutMs) {
    const isStock = /^[A-Z]{1,5}$/.test(ticker);
    const symbols = isStock ? [ticker] : [`${ticker}.SA`, ticker.toUpperCase()];
    const modules = 'financialData,defaultKeyStatistics';
    try {
        const fd = await Promise.any(symbols.flatMap(symbol => YAHOO_HOSTS.map(async (host) => {
            const json = await fetchJson(`https://${host}.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}`, timeoutMs);
            const data = json?.quoteSummary?.result?.[0]?.financialData;
            if (!data)
                throw new Error('Sem financialData');
            return data;
        })));
        return {
            profitMargins: fd.profitMargins?.raw,
            returnOnEquity: fd.returnOnEquity?.raw,
            revenuePerShare: fd.revenuePerShare?.raw,
            returnOnAssets: fd.returnOnAssets?.raw,
            grossMargins: fd.grossMargins?.raw,
            operatingMargins: fd.operatingMargins?.raw,
            debtToEquity: fd.debtToEquity?.raw,
        };
    }
    catch { }
    return {};
}
// ════════════════════════════════════════════════════════════════════════════
// 14. MOTOR PRINCIPAL — NEXUS ENGINE ULTRA v16
// ════════════════════════════════════════════════════════════════════════════
export class NexusEngineUltra {
    static _urlInFlight = new Map();
    static _tickerInFlight = new Map();
    static _newsCache = new LRUCache(200);
    static _cache = new LRUCache(500);
    static _circuitBreakers = new Map();
    static _startTime = Date.now();
    static _totalRequests = 0;
    static _totalSuccess = 0;
    static _totalFailures = 0;
    static _sessionMetrics = { cacheHits: 0, cacheStale: 0, cacheMisses: 0 };
    static _options = {
        cacheTtlMs: 24 * 60 * 60 * 1_000,
        cacheStaleMs: 5 * 60 * 1_000,
        maxRetries: 3,
        retryBaseDelay: 500,
        fetchTimeoutMs: 15_000,
        concurrencyLimit: 5,
        domainRps: 2,
        domainBurst: 5,
        /** NOVO v16 */
        useNexusProxy: true,
        nexusProxyUrl: '',
        nexusProxyBatchUrl: '',
        nexusProxyTimeoutMs: 12_000,
        nexusProxyRetries: 2,
        /** NOVO v17 */
        fetchDispatcher: undefined,
    };
    static _rateLimiters = new Map();
    static configure(opts) {
        this._options = { ...this._options, ...opts };
        this._rateLimiters.clear();
    }
    static getRateLimiter(domain) {
        let limiter = this._rateLimiters.get(domain);
        if (!limiter) {
            limiter = new DomainRateLimiter(this._options.domainRps, this._options.domainBurst);
            this._rateLimiters.set(domain, limiter);
        }
        return limiter;
    }
    // ── CB helpers ──────────────────────────────────────────────────────────
    static getCB(domain) {
        if (!this._circuitBreakers.has(domain)) {
            this._circuitBreakers.set(domain, new CircuitBreaker());
        }
        return this._circuitBreakers.get(domain);
    }
    static resetCircuitBreaker(domain) {
        this._circuitBreakers.get(domain)?.reset();
    }
    // ── Resolução de URLs NexusProxy (env vars + override) ───────────────────
    /**
     * NOVO v16 — Resolve URL do NexusProxy com precedência:
     * 1. _options.nexusProxyUrl (via configure())
     * 2. env NEXUS_PROXY_URL
     * 3. Endpoint público padrão
     */
    static _getNexusProxyUrl() {
        return this._options.nexusProxyUrl
            || (typeof process !== 'undefined' ? process.env?.NEXUS_PROXY_URL ?? '' : '')
            || '';
    }
    static _getNexusProxyBatchUrl() {
        return this._options.nexusProxyBatchUrl
            || (typeof process !== 'undefined' ? process.env?.NEXUS_PROXY_BATCH_URL ?? '' : '')
            || '';
    }
    static _getNexusProxyTargetUA() {
        return (typeof process !== 'undefined' ? process.env?.NEXUS_PROXY_TARGET_USER_AGENT ?? '' : '')
            || USER_AGENTS[0];
    }
    // ── Fetch com timeout e retry ITERATIVO ─────────────────────────────────
    static async fetchWithJitter(url, requireStealth) {
        let lastErr = new Error('fetch falhou');
        const hostname = extractHostname(url);
        const domain = hostname.replace('www.', '').split('.')[0];
        const limiter = this.getRateLimiter(domain);
        for (let attempt = 0; attempt < this._options.maxRetries; attempt++) {
            await limiter.acquire();
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), this._options.fetchTimeoutMs);
            try {
                const fetchOpts = {
                    signal: ctrl.signal,
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
                    err.retryAfterMs = delay;
                    throw err;
                }
                if (res.status === 404 || res.status === 410 || res.status === 451) {
                    throw new Error(`Critical HTTP ${res.status}`);
                }
                if (!res.ok) {
                    if (res.status === 403 || res.status === 401) {
                        // Nunca gerar dados financeiros sintéticos. Em bloqueio/WAF, falha de forma explícita
                        // para o orquestrador cair em outra fonte real (NexusProxy/Yahoo/StatusInvest).
                        throw new Error(`WAF HTTP ${res.status}`);
                    }
                    throw new Error(`HTTP ${res.status}`);
                }
                return res;
            }
            catch (err) {
                clearTimeout(timer);
                lastErr = err;
                if (lastErr.message.includes('Critical'))
                    throw lastErr;
                if (attempt < this._options.maxRetries - 1) {
                    const isRateLimit = lastErr.message.includes('RateLimit');
                    let delay = backoffMs(attempt, this._options.retryBaseDelay) * (isRateLimit ? 2 : 1);
                    if (isRateLimit && lastErr.retryAfterMs)
                        delay = lastErr.retryAfterMs;
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
     * cache/isolamento via proxy Vercel, coalescing de requests duplicados.
     *
     * Headers do payload incluídos para melhor cache coalescing (doc NexusProxy v3.8).
     * `includeScripts: false` ativa o fast path single-pass do NexusProxy.
     */
    static async _fetchViaNexusProxy(source, cb) {
        const nexusProxyUrl = this._getNexusProxyUrl();
        const targetUA = this._getNexusProxyTargetUA();
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), this._options.nexusProxyTimeoutMs);
        try {
            const res = await fetch(nexusProxyUrl, {
                method: 'POST',
                signal: ctrl.signal,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: source.url,
                    returnHtml: true,
                    includeScripts: false, // Ativa fast path single-pass
                    cacheTtl: 900_000, // 15 min — balanceia frescor e cache hit rate
                    headers: {
                        'User-Agent': targetUA,
                        'X-Cache-Version': NEXUS_PROXY_CACHE_VERSION,
                    },
                }),
            });
            clearTimeout(timer);
            if (!res.ok)
                throw new Error(`NexusProxy HTTP ${res.status}`);
            const json = await res.json();
            const html = json.html || json.data;
            if (!html) {
                throw new Error(`NexusProxy: html ausente na resposta`);
            }
            const rawData = enhancedUniversalLexer(html, source.template, {});
            const parsed = source.template.schema.safeParse(rawData);
            cb.recordSuccess();
            this._totalSuccess++;
            return {
                data: parsed.success ? parsed.data : rawData,
                bytes: html.length,
                earlyAbort: false,
                cacheStatus: json.metrics?.cacheStatus ?? 'MISS',
            };
        }
        catch (err) {
            clearTimeout(timer);
            cb.recordFailure();
            this._totalFailures++;
            throw err;
        }
    }
    // ── execute: ponto de entrada + cache ────────────────────────────────────
    static async execute(sources) {
        const cacheKey = `nexus:${sources.map(s => s.url).join('|')}`;
        const cached = this._cache.get(cacheKey);
        if (cached) {
            if (cached.isStale) {
                this._sessionMetrics.cacheStale++;
                if (!this._tickerInFlight.has(cacheKey)) {
                    const bg = this._executeNetwork(sources)
                        .then(fresh => this._cache.set(cacheKey, fresh, this._options.cacheStaleMs, this._options.cacheTtlMs))
                        .catch(() => { });
                    this._tickerInFlight.set(cacheKey, bg);
                    bg.finally(() => this._tickerInFlight.delete(cacheKey));
                }
                return { ...cached.data, cacheStatus: 'STALE' };
            }
            this._sessionMetrics.cacheHits++;
            return { ...cached.data, cacheStatus: 'HIT' };
        }
        const inflight = this._tickerInFlight.get(cacheKey);
        if (inflight)
            return inflight;
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
    static async _executeNetwork(sources) {
        let lastErr = new Error('Nenhuma fonte disponível');
        let openCBs = 0;
        let bestData = {};
        let totalBytes = 0;
        let anyEarlyAbort = false;
        for (const source of sources) {
            const hostname = extractHostname(source.url);
            const domain = hostname.replace('www.', '').split('.')[0];
            const cb = this.getCB(domain);
            if (cb.isOpen()) {
                openCBs++;
                continue;
            }
            try {
                let fetchPromise = this._urlInFlight.get(source.url);
                if (!fetchPromise) {
                    this._totalRequests++;
                    fetchPromise = this._streamAndParse(source, cb);
                    this._urlInFlight.set(source.url, fetchPromise);
                    fetchPromise.finally(() => this._urlInFlight.delete(source.url));
                }
                const result = await fetchPromise;
                // Acumula o melhor resultado parcial de múltiplas fontes
                for (const [k, v] of Object.entries(result.data)) {
                    if (v !== undefined && bestData[k] === undefined) {
                        bestData[k] = v;
                    }
                }
                totalBytes += result.bytes;
                anyEarlyAbort = anyEarlyAbort || result.earlyAbort;
                const hasAll = source.template.rules.every(r => bestData[r.name] !== undefined);
                if (hasAll)
                    return { data: bestData, bytes: totalBytes, earlyAbort: anyEarlyAbort };
                continue;
            }
            catch (err) {
                lastErr = err;
                if (lastErr.message.includes('Critical'))
                    break;
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
    static async _streamAndParse(source, cb) {
        /**
         * NOVO v16 — Tenta NexusProxy primeiro se configurado.
         * O NexusProxy tem seu próprio CB ('nexusproxy'). Se falhar, cai para fetch direto.
         * Vantagens: cache, coalescing, métricas separadas e menor fan-out do cliente.
         */
        if (this._options.useNexusProxy && this._getNexusProxyUrl()) {
            const proxyCB = this.getCB('nexusproxy');
            if (!proxyCB.isOpen()) {
                try {
                    const proxyResult = await this._fetchViaNexusProxy(source, proxyCB);
                    return { data: proxyResult.data, bytes: proxyResult.bytes, earlyAbort: proxyResult.earlyAbort };
                }
                catch (proxyErr) {
                    console.warn(`[Nexus Engine] NexusProxy falhou para ${source.url}. Caindo para fetch direto:`, proxyErr.message);
                    // Continua para o fetch direto abaixo
                }
            }
        }
        // ── Fetch direto com streaming (comportamento original) ────────────────
        try {
            const res = await this.fetchWithJitter(source.url, !!source.requireStealth);
            if (!res.body)
                throw new Error('No response body');
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let htmlBuffer = '';
            let fullHtmlBuffer = '';
            const shouldFullParseI10 = source.url.includes('investidor10.com.br');
            const FULL_PARSE_LIMIT = Number(process.env.NEXUS_FULL_PARSE_LIMIT || 2_500_000);
            let rawData = {};
            let bytesRead = 0;
            let earlyAbort = false;
            let stagnantChunks = 0;
            let lastFieldCount = 0;
            const MAX_WINDOW = 30_000;
            const MAX_ANCHOR = source.template.rules.reduce((max, r) => r.anchors.reduce((m, a) => Math.max(m, a.length), max), 0);
            const OVERLAP_SIZE = Math.max(MAX_ANCHOR + 256, 512);
            let htmlLowerBuffer = '';
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done)
                        break;
                    bytesRead += value.length;
                    const decoded = decoder.decode(value, { stream: true });
                    htmlBuffer += decoded;
                    if (fullHtmlBuffer.length < FULL_PARSE_LIMIT) {
                        fullHtmlBuffer += decoded.slice(0, Math.max(0, FULL_PARSE_LIMIT - fullHtmlBuffer.length));
                    }
                    htmlLowerBuffer += decoded.toLowerCase();
                    if (htmlBuffer.length > MAX_WINDOW) {
                        htmlBuffer = htmlBuffer.slice(-(MAX_WINDOW - OVERLAP_SIZE));
                        htmlLowerBuffer = htmlLowerBuffer.slice(-(MAX_WINDOW - OVERLAP_SIZE));
                    }
                    rawData = universalLexer(htmlBuffer, source.template, rawData, htmlLowerBuffer);
                    const currentFieldCount = Object.keys(rawData).length;
                    if (!shouldFullParseI10 && bytesRead > 100_000) {
                        if (currentFieldCount === lastFieldCount) {
                            stagnantChunks++;
                            if (stagnantChunks >= 10) {
                                reader.cancel().catch(() => { });
                                earlyAbort = true;
                                break;
                            }
                        }
                        else {
                            stagnantChunks = 0;
                            lastFieldCount = currentFieldCount;
                        }
                    }
                    else {
                        lastFieldCount = currentFieldCount;
                    }
                    const hasAll = source.template.rules.every(r => rawData[r.name] !== undefined);
                    if (hasAll && !shouldFullParseI10) {
                        reader.cancel().catch(() => { });
                        earlyAbort = true;
                        break;
                    }
                }
                // Flush final do TextDecoder
                const tail = decoder.decode();
                if (tail) {
                    htmlBuffer += tail;
                    if (fullHtmlBuffer.length < FULL_PARSE_LIMIT) {
                        fullHtmlBuffer += tail.slice(0, Math.max(0, FULL_PARSE_LIMIT - fullHtmlBuffer.length));
                    }
                    htmlLowerBuffer += tail.toLowerCase();
                    rawData = universalLexer(htmlBuffer, source.template, rawData, htmlLowerBuffer);
                }
            }
            finally {
                try {
                    reader.releaseLock();
                }
                catch { /* ignore */ }
            }
            rawData = enhancedUniversalLexer(fullHtmlBuffer || htmlBuffer, source.template, rawData);
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
        }
        catch (err) {
            const isRateLimit = err instanceof Error && err.message.includes('RateLimit');
            if (!isRateLimit)
                cb.recordFailure();
            this._totalFailures++;
            throw err;
        }
    }
    // ── fetchAtivo: API de alto nível com Yahoo como complemento ─────────────
    static async fetchAtivo(ticker, type = 'ACAO', includeNews = false) {
        const cleanTicker = canonicalizeTicker(ticker);
        const erroVal = validarTicker(cleanTicker);
        if (erroVal) {
            return { ticker: cleanTicker, type, results: {}, cacheStatus: 'ERROR', metrics: { error: erroVal } };
        }
        const preset = ASSET_PRESETS[type];
        const t = cleanTicker.toLowerCase();
        const sources = [
            { url: `${preset.i10Base}/${t}/`, template: preset.template, requireStealth: true },
            { url: `${preset.siBase}/${t}/`, template: preset.template, requireStealth: true },
        ];
        const startTime = performance.now();
        const startCpu = safeCpuStart();
        const [scrapeResult, yahooResult, yahooFund] = await Promise.allSettled([
            this.execute(sources),
            yahooQuote(cleanTicker, this._options.fetchTimeoutMs),
            yahooFundamentals(cleanTicker, this._options.fetchTimeoutMs),
        ]);
        const scrape = scrapeResult.status === 'fulfilled' ? scrapeResult.value : { data: {}, bytes: 0, earlyAbort: false, cacheStatus: 'ERROR' };
        const quote = yahooResult.status === 'fulfilled' ? yahooResult.value : null;
        const fund = yahooFund.status === 'fulfilled' ? yahooFund.value : {};
        const combined = { ...scrape.data };
        /** Preenche lacunas com dados do Yahoo — não sobrescreve dados já extraídos. */
        const fill = (k, v) => {
            if (combined[k] !== undefined || v == null)
                return;
            if (typeof v === 'number') {
                combined[k] = v;
                return;
            }
            const s = String(v).trim();
            if (!VALORES_INVALIDOS.has(s))
                combined[k] = s;
        };
        if (quote) {
            fill('precoAtual', quote.regularMarketPrice);
            fill('variacaoDay', quote.regularMarketChangePercent != null
                ? quote.regularMarketChangePercent.toFixed(2) + '%' : undefined);
            fill('pl', quote.trailingPE);
            fill('pvp', quote.priceToBook);
            fill('vpa', quote.bookValue);
            fill('lpa', quote.epsTrailingTwelveMonths);
            fill('dividendYield', quote.trailingAnnualDividendYield != null
                ? (quote.trailingAnnualDividendYield * 100).toFixed(2) + '%' : undefined);
            fill('marketCap', quote.marketCap);
            fill('valorDeMercado', quote.marketCap);
        }
        if (fund) {
            fill('margemLiquida', fund.profitMargins != null ? (fund.profitMargins * 100).toFixed(2) + '%' : undefined);
            fill('margemBruta', fund.grossMargins != null ? (fund.grossMargins * 100).toFixed(2) + '%' : undefined);
            fill('roe', fund.returnOnEquity != null ? (fund.returnOnEquity * 100).toFixed(2) + '%' : undefined);
            fill('roa', fund.returnOnAssets != null ? (fund.returnOnAssets * 100).toFixed(2) + '%' : undefined);
            fill('margemEbit', fund.operatingMargins != null ? (fund.operatingMargins * 100).toFixed(2) + '%' : undefined);
            fill('margemOperacional', fund.operatingMargins != null ? (fund.operatingMargins * 100).toFixed(2) + '%' : undefined);
            fill('dividaBruta', fund.debtToEquity);
        }
        // Propaga margemEbit → margemOperacional para retrocompatibilidade
        if (combined.margemEbit && !combined.margemOperacional) {
            combined.margemOperacional = combined.margemEbit;
        }
        const newsData = includeNews ? await this.fetchNews(cleanTicker, combined).catch(() => []) : undefined;
        const totalTimeMs = performance.now() - startTime;
        const sources_used = [];
        if (scrapeResult.status === 'fulfilled' && Object.keys(scrape.data).length > 0)
            sources_used.push('Scraper');
        if (quote)
            sources_used.push('YahooFinance');
        if (Object.keys(fund ?? {}).length)
            sources_used.push('YahooFundamentals');
        return {
            ticker: cleanTicker,
            type,
            results: combined,
            cacheStatus: scrape.cacheStatus || 'MISS',
            ...(newsData ? { news: newsData } : {}),
            metrics: {
                totalTimeMs,
                bytesProcessed: scrape.bytes,
                foundKeys: Object.keys(combined),
                successRate: Object.keys(combined).length / preset.template.rules.length,
                earlyAbort: scrape.earlyAbort,
                source: sources_used.join(' + ') || 'None',
                cpuUsageMs: safeCpuDeltaMs(startCpu),
                estimatedMemoryMb: Number((scrape.bytes / 1024 / 1024).toFixed(2)),
            },
        };
    }
    // ── fetchB3: retrocompatibilidade ────────────────────────────────────────
    static async fetchB3(ticker) {
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
    static async fetchAtivosBatch(ativos, includeNews = false) {
        const nexusProxyBatchUrl = this._getNexusProxyBatchUrl();
        // Sem URL de batch configurada, usa concorrência local e evita payloads enormes entre funções Vercel.
        // Se for o proxy Valorae, ele ainda não suporta batch nativamente, então pulamos para o fallback
        if (!nexusProxyBatchUrl || (this._options.useNexusProxy && nexusProxyBatchUrl.includes('valorae-proxy'))) {
            return this.executeBatch(ativos.map(({ ticker, type }) => () => this.fetchAtivo(ticker, type, includeNews)));
        }
        if (!this._options.useNexusProxy) {
            // Fallback para executeBatch individual
            return this.executeBatch(ativos.map(({ ticker, type }) => () => this.fetchAtivo(ticker, type, includeNews)));
        }
        const targetUA = this._getNexusProxyTargetUA();
        // Monta jobs para o batch — 2 fontes por ativo (i10 + SI)
        const jobs = ativos.flatMap(({ ticker, type }) => {
            const clean = canonicalizeTicker(ticker);
            const preset = ASSET_PRESETS[type];
            const t = clean.toLowerCase();
            return [
                {
                    id: `${clean}_i10`,
                    url: `${preset.i10Base}/${t}/`,
                    returnHtml: true,
                    includeScripts: false,
                    cacheTtl: 900_000,
                    headers: { 'User-Agent': targetUA, 'X-Cache-Version': NEXUS_PROXY_CACHE_VERSION },
                },
                {
                    id: `${clean}_si`,
                    url: `${preset.siBase}/${t}/`,
                    returnHtml: true,
                    includeScripts: false,
                    cacheTtl: 900_000,
                    headers: { 'User-Agent': targetUA, 'X-Cache-Version': NEXUS_PROXY_CACHE_VERSION },
                },
            ];
        });
        // NexusProxy limita a 25 jobs por batch
        const BATCH_LIMIT = 25;
        if (jobs.length > BATCH_LIMIT) {
            console.warn(`[Nexus] batch de ${jobs.length} jobs excede limite de ${BATCH_LIMIT}. Dividindo em sub-batches.`);
            const chunks = [];
            for (let i = 0; i < jobs.length; i += BATCH_LIMIT)
                chunks.push(jobs.slice(i, i + BATCH_LIMIT));
            const allResults = await Promise.all(chunks.map(chunk => this._sendNexusProxyBatch(chunk, nexusProxyBatchUrl)));
            const flatResults = allResults.flat();
            return this._processBatchResults(ativos, flatResults, includeNews);
        }
        try {
            const batchResults = await this._sendNexusProxyBatch(jobs, nexusProxyBatchUrl);
            return this._processBatchResults(ativos, batchResults, includeNews);
        }
        catch (err) {
            console.warn('[Nexus] NexusProxy batch falhou, caindo para executeBatch individual:', err.message);
            return this.executeBatch(ativos.map(({ ticker, type }) => () => this.fetchAtivo(ticker, type, includeNews)));
        }
    }
    /** Envia um sub-batch ao NexusProxy e retorna os resultados. */
    static async _sendNexusProxyBatch(jobs, url) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), this._options.nexusProxyTimeoutMs * 2);
        try {
            const res = await fetch(url, {
                method: 'POST',
                signal: ctrl.signal,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobs, concurrency: 8 }),
            });
            clearTimeout(timer);
            if (!res.ok)
                throw new Error(`NexusProxy batch HTTP ${res.status}`);
            const json = await res.json();
            return (json.results ?? []);
        }
        finally {
            clearTimeout(timer);
        }
    }
    /** Processa resultados do batch, mapeando HTMLs de volta para fetchAtivo results. */
    static async _processBatchResults(ativos, batchResults, includeNews) {
        const resultMap = new Map();
        for (const r of batchResults) {
            if (r.id && r.html)
                resultMap.set(r.id, r);
        }
        return Promise.all(ativos.map(async ({ ticker, type }) => {
            const clean = canonicalizeTicker(ticker);
            const preset = ASSET_PRESETS[type];
            const i10Res = resultMap.get(`${clean}_i10`);
            const siRes = resultMap.get(`${clean}_si`);
            // Se nenhum resultado de batch disponível, cai para fetchAtivo individual
            if (!i10Res && !siRes) {
                return this.fetchAtivo(ticker, type, includeNews);
            }
            let combined = {};
            for (const r of [i10Res, siRes]) {
                if (!r?.html)
                    continue;
                const extracted = enhancedUniversalLexer(r.html, preset.template, combined);
                for (const [k, v] of Object.entries(extracted)) {
                    if (v !== undefined && combined[k] === undefined)
                        combined[k] = v;
                }
            }
            const cacheStatus = i10Res?.metrics?.cacheStatus ?? siRes?.metrics?.cacheStatus ?? 'MISS';
            const news = includeNews ? await this.fetchNews(clean, combined).catch(() => []) : undefined;
            return {
                ticker: clean,
                type,
                results: combined,
                cacheStatus,
                ...(news ? { news } : {}),
                metrics: {
                    foundKeys: Object.keys(combined),
                    successRate: Object.keys(combined).length / preset.template.rules.length,
                    source: 'NexusProxy Batch',
                },
            };
        }));
    }
    // ── fetchHistoricoGrafico ─────────────────────────────────────────────────
    static async fetchHistoricoGrafico(ticker, range = '1y', interval = '1d') {
        const cleanTicker = canonicalizeTicker(ticker);
        const isStock = /^[A-Z]{1,5}$/.test(cleanTicker);
        const symbols = isStock ? [cleanTicker] : [`${cleanTicker}.SA`, cleanTicker];
        try {
            const result = await Promise.any(symbols.flatMap(symbol => YAHOO_HOSTS.map(async (host) => {
                const json = await fetchJson(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`, this._options.fetchTimeoutMs);
                const res = json?.chart?.result?.[0];
                if (!res?.timestamp || !res.indicators?.quote?.[0])
                    throw new Error('Sem dados');
                return res;
            })));
            const timestamps = result.timestamp;
            const quote = result.indicators.quote[0];
            return timestamps
                .map((ts, i) => ({
                date: new Date(ts * 1000).toISOString(),
                open: quote.open[i],
                high: quote.high[i],
                low: quote.low[i],
                close: quote.close[i],
                volume: quote.volume[i],
            }))
                .filter((d) => d.close != null);
        }
        catch { }
        return [];
    }
    // ── fetchDividends ────────────────────────────────────────────────────────
    static async fetchDividends(ticker) {
        const cleanTicker = canonicalizeTicker(ticker);
        const isStock = /^[A-Z]{1,5}$/.test(cleanTicker);
        const symbols = isStock ? [cleanTicker] : [`${cleanTicker}.SA`, cleanTicker];
        try {
            const events = await Promise.any(symbols.flatMap(symbol => YAHOO_HOSTS.map(async (host) => {
                const json = await fetchJson(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5y&interval=1mo&events=div&includePrePost=false`, this._options.fetchTimeoutMs);
                const evs = json?.chart?.result?.[0]?.events?.dividends;
                if (!evs)
                    throw new Error('Sem dividendos');
                return evs;
            })));
            return Object.values(events)
                .map((d) => ({ date: new Date(d.date * 1000).toISOString(), amount: d.amount }))
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        }
        catch { }
        return [];
    }
    // ── searchTicker ──────────────────────────────────────────────────────────
    static async searchTicker(query) {
        const endpoints = [
            `https://query2.finance.yahoo.com/v2/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0`,
            `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0`,
        ];
        try {
            const json = await Promise.any(endpoints.map(url => fetchJson(url, this._options.fetchTimeoutMs)));
            return (json?.quotes ?? []).filter((q) => q.exchange === 'SAO' || q.exchange === 'BVMF' || q.symbol?.endsWith('.SA'));
        }
        catch {
            // Fallback para DuckDuckGo Lite scraper
            try {
                const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query + ' acao b3 fundo')}`;
                const ctrl = new AbortController();
                const timer = setTimeout(() => ctrl.abort(), this._options.fetchTimeoutMs);
                const fetchOpts = { signal: ctrl.signal, headers: { 'User-Agent': getRandomAgent() } };
                if (this._options.fetchDispatcher)
                    fetchOpts.dispatcher = this._options.fetchDispatcher;
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
                    if (results.length > 0)
                        return results;
                }
            }
            catch (e) {
                // Ignora erro no fallback
            }
            return [];
        }
    }
    // ── fetchNews ─────────────────────────────────────────────────────────────
    static _decodeRssText(raw = '') {
        return decodeBasicEntities(String(raw || ''))
            .replace(/^<!\[CDATA\[/, '')
            .replace(/\]\]>$/, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }
    static _extractXmlTag(xml, tag) {
        const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
        const m = re.exec(xml);
        return m ? this._decodeRssText(m[1]) : undefined;
    }
    static _assetAliases(ticker, context = {}) {
        const clean = canonicalizeTicker(ticker);
        const aliases = new Set([clean, `${clean}.SA`]);
        const candidates = [
            context?.nome,
            context?.razaoSocial,
            context?.companyName,
            context?.shortName,
            context?.longName,
            context?.empresa?.nome,
            context?.empresa?.razaoSocial,
            context?.sections?.empresa?.nome,
            context?.sections?.empresa?.dados?.razaoSocial,
            context?.sections?.informacoesFundo?.razaoSocial,
        ];
        for (const raw of candidates) {
            if (!raw || typeof raw !== 'string')
                continue;
            const cleaned = raw.replace(/\bS\.?A\.?\b/gi, '').replace(/\bS\.A\.\b/gi, '').replace(/\s+/g, ' ').trim();
            if (cleaned.length >= 4 && cleaned.length <= 80)
                aliases.add(cleaned);
            const words = cleaned.split(/\s+/).filter(Boolean);
            const firstWords = words.slice(0, 3).join(' ');
            if (firstWords.length >= 4)
                aliases.add(firstWords);
            for (const word of words) {
                const normalized = stripAccentsLower(word);
                if (word.length >= 5 && !['brasileiro', 'brasileira', 'participacoes', 'companhia', 'empresa', 'fundo', 'investimento', 'imobiliario'].includes(normalized)) {
                    aliases.add(word);
                }
            }
        }
        return [...aliases].filter(Boolean);
    }
    static _buildGoogleNewsQuery(ticker, context = {}) {
        const clean = canonicalizeTicker(ticker);
        const aliases = this._assetAliases(clean, context).slice(0, 8);
        const aliasQuery = aliases.map(a => /\s/.test(a) ? `"${a}"` : a).join(' OR ');
        return `(${aliasQuery}) (B3 OR ações OR ação OR bolsa OR dividendos OR proventos OR resultados OR balanço OR FII OR "fundo imobiliário")`;
    }
    static _buildGoogleNewsUrl(query) {
        const params = new URLSearchParams({
            q: query,
            hl: 'pt-BR',
            gl: 'BR',
            ceid: 'BR:pt-419',
        });
        return `https://news.google.com/rss/search?${params.toString()}`;
    }
    static _scoreNewsItem(item, ticker, aliases) {
        const clean = canonicalizeTicker(ticker);
        const hay = stripAccentsLower([item.title, item.snippet, item.source].filter(Boolean).join(' '));
        let score = 0;
        if (hay.includes(stripAccentsLower(clean)))
            score += 8;
        if (hay.includes(stripAccentsLower(`${clean}.SA`)))
            score += 4;
        for (const alias of aliases) {
            const a = stripAccentsLower(alias);
            if (a.length >= 4 && hay.includes(a))
                score += /\s/.test(alias) ? 5 : 3;
        }
        if (/\b(dividendo|provento|resultado|balanco|balanço|lucro|receita|fii|fundo imobiliario|acao|ações|b3|bolsa|cotacao|cotação)\b/i.test(hay))
            score += 2;
        return score;
    }
    static async fetchNews(ticker, context = {}) {
        const clean = canonicalizeTicker(ticker);
        const query = this._buildGoogleNewsQuery(clean, context);
        const url = this._buildGoogleNewsUrl(query);
        const limit = Math.max(1, Math.min(Number(process.env.NEXUS_NEWS_LIMIT || 8), 20));
        const cacheTtlMs = Math.max(60_000, Number(process.env.NEXUS_NEWS_CACHE_TTL_MS || 15 * 60_000));
        const cacheKey = `news:${clean}:${stripAccentsLower(query)}`;
        const aliases = this._assetAliases(clean, context);
        const cached = this._newsCache.get(cacheKey);
        if (cached)
            return cached.data.slice(0, limit);
        const existing = this._urlInFlight.get(url);
        if (existing)
            return existing;
        const p = (async () => {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), this._options.fetchTimeoutMs);
            try {
                const fetchOpts = {
                    signal: ctrl.signal,
                    headers: {
                        'User-Agent': getRandomAgent(),
                        'Accept': 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
                        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.6,en;q=0.4',
                    },
                };
                if (this._options.fetchDispatcher)
                    fetchOpts.dispatcher = this._options.fetchDispatcher;
                const res = await fetch(url, fetchOpts);
                clearTimeout(timer);
                if (!res.ok)
                    return [];
                const xml = await res.text();
                const items = [];
                const seen = new Set();
                const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
                let match;
                while ((match = itemRegex.exec(xml)) !== null && items.length < 60) {
                    const itemXml = match[1];
                    const title = this._extractXmlTag(itemXml, 'title');
                    const link = this._extractXmlTag(itemXml, 'link');
                    if (!title || !link)
                        continue;
                    const pubRaw = this._extractXmlTag(itemXml, 'pubDate');
                    const source = this._extractXmlTag(itemXml, 'source');
                    const snippet = this._extractXmlTag(itemXml, 'description');
                    const item = {
                        title,
                        link,
                        pubDate: pubRaw ? new Date(pubRaw) : undefined,
                        source,
                        snippet,
                        query,
                    };
                    item.relevanceScore = this._scoreNewsItem(item, clean, aliases);
                    if (item.relevanceScore < 5)
                        continue;
                    const dedupeKey = stripAccentsLower(`${title}|${source || ''}`).replace(/[^a-z0-9]+/g, ' ').trim();
                    if (seen.has(dedupeKey))
                        continue;
                    seen.add(dedupeKey);
                    items.push(item);
                }
                items.sort((a, b) => {
                    const scoreDiff = (b.relevanceScore || 0) - (a.relevanceScore || 0);
                    if (scoreDiff)
                        return scoreDiff;
                    return (b.pubDate ? b.pubDate.getTime() : 0) - (a.pubDate ? a.pubDate.getTime() : 0);
                });
                const finalItems = items.slice(0, limit);
                this._newsCache.set(cacheKey, finalItems, cacheTtlMs, cacheTtlMs);
                return finalItems;
            }
            catch {
                return [];
            }
            finally {
                clearTimeout(timer);
                this._urlInFlight.delete(url);
            }
        })();
        this._urlInFlight.set(url, p);
        return p;
    }
    // ── executeBatch: PRESERVA ORDEM DOS RESULTADOS ──────────────────────────
    static async executeBatch(tasks, concurrency = this._options.concurrencyLimit) {
        const results = new Array(tasks.length);
        const executing = new Set();
        for (let i = 0; i < tasks.length; i++) {
            const idx = i;
            const p = tasks[idx]()
                .then(res => { results[idx] = res; })
                .catch(err => { results[idx] = err instanceof Error ? err : new Error(String(err)); })
                .finally(() => { executing.delete(p); });
            executing.add(p);
            if (executing.size >= concurrency)
                await Promise.race(executing);
        }
        await Promise.all(executing);
        return results;
    }
    // ── Cache e Diagnóstico ──────────────────────────────────────────────────
    static clearCache() {
        this._cache = new LRUCache(500);
        this._newsCache = new LRUCache(200);
        _hostnameCache.clear();
        _regexCache.clear();
        _anchorLowerCache.clear();
    }
    static invalidateCache(ticker, type) {
        const clean = canonicalizeTicker(ticker);
        const types = type ? [type] : ['ACAO', 'FII', 'BDR', 'ETF', 'STOCK'];
        for (const t of types) {
            const preset = ASSET_PRESETS[t];
            const key = `nexus:${preset.i10Base}/${clean.toLowerCase()}/|${preset.siBase}/${clean.toLowerCase()}/`;
            this._cache.delete(key);
        }
    }
    static getCacheStats() {
        const cbMetrics = {};
        this._circuitBreakers.forEach((cb, domain) => {
            cbMetrics[domain] = { estado: cb.getState(), falhas: cb.getFalhas() };
        });
        const uptime = Date.now() - this._startTime;
        return {
            cache: { tamanho: this._cache.tamanho, tamanhoMax: this._cache.tamanhoMax },
            session: this._sessionMetrics,
            uptime,
            totalRequests: this._totalRequests,
            totalSuccess: this._totalSuccess,
            totalFailures: this._totalFailures,
            successRate: this._totalRequests > 0
                ? ((this._totalSuccess / this._totalRequests) * 100).toFixed(1) + '%' : 'N/A',
            inFlightRequests: this._urlInFlight.size + this._tickerInFlight.size,
            rateLimiters: Array.from(this._rateLimiters.keys()),
            circuitBreakers: Object.keys(cbMetrics).length > 0 ? cbMetrics : {
                investidor10: { estado: 'FECHADO', falhas: 0 },
                statusinvest: { estado: 'FECHADO', falhas: 0 },
                nexusproxy: { estado: 'FECHADO', falhas: 0 },
            },
        };
    }
    static getDetailedReport() {
        return {
            engine: 'Nexus Engine Ultra v16.0',
            status: 'Operational',
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
export async function runNexusBatch(tickers, type = 'ACAO', _opts, includeNews) {
    // If useNexusProxy is true, delegate to fetchAtivosBatch
    if (NexusEngineUltra._options?.useNexusProxy) {
        return NexusEngineUltra.fetchAtivosBatch(tickers.map(ticker => ({ ticker, type })), includeNews);
    }
    return NexusEngineUltra.executeBatch(tickers.map(ticker => async () => {
        const t0 = performance.now();
        try {
            const result = await NexusEngineUltra.fetchAtivo(ticker, type, includeNews);
            return { ...result, metrics: { ...result.metrics, totalTimeMs: performance.now() - t0 } };
        }
        catch (e) {
            return {
                ticker: canonicalizeTicker(ticker),
                type,
                results: {},
                error: e.message,
                cacheStatus: 'ERROR',
                metrics: { totalTimeMs: performance.now() - t0, bytesProcessed: 0, foundKeys: [], successRate: 0, earlyAbort: false, source: 'Failed', estimatedMemoryMb: 0, cpuUsageMs: 0 },
            };
        }
    }));
}
/**
 * runNexusBatchAuto infers asset type automatically via inferAssetType.
 * NOVO v16: support Stock for pure alphabetic tickers.
 */
export async function runNexusBatchAuto(tickers, _opts, includeNews) {
    return NexusEngineUltra.executeBatch(tickers.map(ticker => async () => {
        const type = inferAssetType(ticker);
        const t0 = performance.now();
        try {
            const result = await NexusEngineUltra.fetchAtivo(ticker, type, includeNews);
            return { ...result, metrics: { ...result.metrics, totalTimeMs: performance.now() - t0 } };
        }
        catch (e) {
            return {
                ticker: canonicalizeTicker(ticker),
                type,
                results: {},
                error: e.message,
                cacheStatus: 'ERROR',
                metrics: { totalTimeMs: performance.now() - t0, bytesProcessed: 0, foundKeys: [], successRate: 0, earlyAbort: false, source: 'Failed', estimatedMemoryMb: 0, cpuUsageMs: 0 },
            };
        }
    }));
}
/**
 * NOVO v16 — fetchAtivosBatch: high-level mixed portfolio batch API.
 * Uses NexusProxy batch when available with automatic fallback.
 */
export async function fetchAtivosBatch(ativos, includeNews) {
    return NexusEngineUltra.fetchAtivosBatch(ativos, includeNews);
}
