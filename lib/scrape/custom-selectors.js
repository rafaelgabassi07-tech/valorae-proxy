// Lightweight selector extractor for /api/scrape and /api/batch-scrape.
// v21.5.13 closes gaps found in the complete audit: descendant/direct selectors,
// table-row extraction, attr/data-* extraction, compound CSS-lite tokens and deterministic warnings.

import { inspectSourceDrift } from '../resilience/source-drift.js';

export const VALORAE_CUSTOM_SELECTORS_VERSION = '21.5.13-mature-final-release-free';

function decodeHtml(value = '') {
  return String(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

export function stripTags(value = '') {
  return decodeHtml(String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/tr>|<\/p>|<\/li>|<\/div>|<\/h\d>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function compactText(value = '') { return stripTags(value).replace(/\s+/g, ' ').trim(); }
function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function tagPattern(tag = '[a-z0-9]+') { return tag === '*' ? '[a-z0-9]+' : escapeRe(tag); }
function attr(fragment, name) {
  const re = new RegExp(`${escapeRe(name)}\\s*=\\s*(?:[\"']([^\"']*)[\"']|([^\\s>]+))`, 'i');
  const m = fragment.match(re);
  return decodeHtml(m?.[1] || m?.[2] || '');
}

function parseSelectorToken(rawToken = '') {
  const raw = String(rawToken || '').trim();
  if (!raw) return null;
  const tagMatch = raw.match(/^[a-z0-9]+|^\*/i);
  const tag = tagMatch ? tagMatch[0].toLowerCase() : '*';
  const classes = [...raw.matchAll(/\.([a-zA-Z0-9_-]+)/g)].map(m => m[1]);
  const idMatch = raw.match(/#([a-zA-Z0-9_-]+)/);
  const attrs = [];
  const attrRe = /\[\s*([a-zA-Z0-9_:-]+)\s*(?:(\*?=)\s*(?:["']([^"']*)["']|([^\]\s]+)))?\s*\]/g;
  let m;
  while ((m = attrRe.exec(raw))) attrs.push({ name: m[1], op: m[2] || 'exists', value: String(m[3] ?? m[4] ?? '').trim() });
  const containsMatch = raw.match(/:contains\((?:["']([^"']+)["']|([^)]*))\)/i);
  const nthMatch = raw.match(/:nth-child\((\d+)\)/i) || raw.match(/:eq\((\d+)\)/i);
  const contains = containsMatch ? String(containsMatch[1] ?? containsMatch[2] ?? '').trim() : '';
  const nth = nthMatch ? Number(nthMatch[1]) : null;
  const consumed = raw
    .replace(/^[a-z0-9]+|^\*/i, '')
    .replace(/\.[a-zA-Z0-9_-]+/g, '')
    .replace(/#[a-zA-Z0-9_-]+/g, '')
    .replace(attrRe, '')
    .replace(/:contains\((?:["'][^"']+["']|[^)]*)\)/gi, '')
    .replace(/:nth-child\(\d+\)/gi, '')
    .replace(/:(first-child|last-child|first|last|eq\(\d+\))/gi, '')
    .trim();
  if (consumed) return null;
  return { tag, id: idMatch?.[1] || null, classes, attrs, contains, nth };
}

function tokenSpecToMatcher(spec) {
  if (!spec) return null;
  let pattern = `<(${tagPattern(spec.tag || '*')})\\b`;
  if (spec.id) pattern += `(?=[^>]*\\bid\\s*=\\s*(?:["']${escapeRe(spec.id)}["']|${escapeRe(spec.id)})(?=[\\s>/]))`;
  for (const cls of spec.classes || []) pattern += `(?=[^>]*\\bclass\\s*=\\s*(?:["'][^"']*\\b${escapeRe(cls)}\\b[^"']*["']|[^\\s>]*\\b${escapeRe(cls)}\\b[^\\s>]*))`;
  for (const a of spec.attrs || []) {
    if (a.op === 'exists') pattern += `(?=[^>]*\\b${escapeRe(a.name)}(?:\\s*=|[\\s>/]))`;
    else if (a.op === '*=') pattern += `(?=[^>]*\\b${escapeRe(a.name)}\\s*=\\s*(?:["'][^"']*${escapeRe(a.value)}[^"']*["']|[^\\s>]*${escapeRe(a.value)}[^\\s>]*))`;
    else pattern += `(?=[^>]*\\b${escapeRe(a.name)}\\s*=\\s*(?:["']${escapeRe(a.value)}["']|${escapeRe(a.value)})(?=[\\s>/]))`;
  }
  pattern += '[^>]*>';
  const matcher = new RegExp(pattern, 'gi');
  matcher._contains = spec.contains || '';
  matcher._nth = Number.isFinite(spec.nth) ? spec.nth : null;
  return matcher;
}

function normalizeSelectorSpec(spec) {
  if (typeof spec === 'string') return { selector: spec };
  if (spec && typeof spec === 'object' && !Array.isArray(spec)) return spec;
  return null;
}

function findElementEnd(html, openStart, tag) {
  const source = String(html || '');
  const t = String(tag || '').toLowerCase();
  const openEnd = source.indexOf('>', openStart);
  if (openEnd < 0) return -1;
  if (/^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i.test(t)) return openEnd + 1;
  const re = new RegExp(`<\\/?${escapeRe(t)}\\b[^>]*>`, 'gi');
  re.lastIndex = openStart;
  let depth = 0;
  let m;
  while ((m = re.exec(source))) {
    const token = m[0];
    if (token.startsWith('</')) depth -= 1;
    else if (!token.endsWith('/>')) depth += 1;
    if (depth === 0) return re.lastIndex;
  }
  return source.indexOf(`</${t}>`, openEnd) + t.length + 3 || openEnd + 1;
}

function elementFragments(html, matcher, limit = 200) {
  const out = [];
  let m;
  while ((m = matcher.exec(html)) && out.length < limit) {
    const tag = (m[1] || '').toLowerCase();
    const end = findElementEnd(html, m.index, tag);
    if (end > m.index) out.push(html.slice(m.index, end));
  }
  return out;
}

function tokenToMatcher(token) {
  const raw = String(token || '').trim();
  if (!raw) return null;
  const parsed = parseSelectorToken(raw);
  if (parsed) return tokenSpecToMatcher(parsed);
  return null;
}

function descendantsOf(fragment, token, limit) {
  const matcher = tokenToMatcher(token);
  if (!matcher) return [];
  let fragments = elementFragments(fragment, matcher, limit * 2);
  if (matcher._contains) {
    const needle = String(matcher._contains).toLowerCase();
    fragments = fragments.filter(f => compactText(f).toLowerCase().includes(needle));
  }
  if (matcher._nth) fragments = fragments.filter((_, i) => i + 1 === matcher._nth);
  return fragments.slice(0, limit);
}

function parseSelectorSteps(selector = '') {
  const out = [];
  let buf = '';
  let combinator = 'descendant';
  let quote = '';
  let bracketDepth = 0;
  for (const ch of String(selector || '').trim()) {
    if (quote) { buf += ch; if (ch === quote) quote = ''; continue; }
    if (ch === '"' || ch === "'") { quote = ch; buf += ch; continue; }
    if (ch === '[') { bracketDepth += 1; buf += ch; continue; }
    if (ch === ']') { bracketDepth = Math.max(0, bracketDepth - 1); buf += ch; continue; }
    if (!bracketDepth && ch === '>') {
      if (buf.trim()) out.push({ token: buf.trim(), combinator });
      buf = ''; combinator = 'child';
      continue;
    }
    if (!bracketDepth && /\s/.test(ch)) {
      if (buf.trim()) { out.push({ token: buf.trim(), combinator }); buf = ''; combinator = 'descendant'; }
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) out.push({ token: buf.trim(), combinator });
  return out;
}

function directChildrenOf(fragment, token, limit) {
  // Regex-based direct child approximation: searches only the outer element body and ignores nested matches
  // already captured by deeper descendant steps. This is intentionally lightweight for Vercel free.
  const source = String(fragment || '');
  const outer = source.match(/^<([a-z0-9]+)\b[^>]*>([\s\S]*)<\/\1>\s*$/i);
  const body = outer ? outer[2] : source;
  return descendantsOf(body, token, limit).filter(child => {
    const idx = body.indexOf(child);
    if (idx < 0) return true;
    const before = body.slice(0, idx);
    const openTags = (before.match(/<([a-z0-9]+)\b[^>]*>/gi) || []).length;
    const closeTags = (before.match(/<\/[a-z0-9]+>/gi) || []).length;
    return openTags === closeTags;
  });
}

function resolveSingleSelector(html, selector, limit) {
  const steps = parseSelectorSteps(selector);
  if (!steps.length) return [];
  let fragments = [String(html || '')];
  for (const step of steps) {
    const next = [];
    for (const fragment of fragments) {
      next.push(...(step.combinator === 'child' ? directChildrenOf(fragment, step.token, Math.max(limit * 2, limit)) : descendantsOf(fragment, step.token, Math.max(limit * 2, limit))));
    }
    fragments = next.slice(0, Math.max(limit * 3, limit));
    if (!fragments.length) break;
  }
  return fragments.slice(0, limit);
}

function resolveFragments(html, selector, limit) {
  const out = [];
  const seen = new Set();
  const parts = String(selector || '').split(',').map(x => x.trim()).filter(Boolean);
  for (const part of parts) {
    for (const fragment of resolveSingleSelector(html, part, limit)) {
      const key = fragment.slice(0, 500);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(fragment);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

function extractTableRow(fragment) {
  const cells = String(fragment || '').match(/<t[dh]\b[^>]*>[\s\S]*?<\/t[dh]>/gi) || [];
  const values = cells.map(compactText).filter(Boolean);
  return values.join(' ');
}

function extractTableCells(fragment) {
  const cells = String(fragment || '').match(/<t[dh]\b[^>]*>[\s\S]*?<\/t[dh]>/gi) || [];
  return cells.map(compactText).filter(Boolean);
}

function parseNumericText(value = '') {
  const s = compactText(value).replace(/R\$|US\$|BRL|USD/gi, '').replace(/%/g, '').replace(/\s+/g, '').replace(/\./g, '').replace(/,/g, '.').replace(/[^0-9.+-]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function extractValue(fragment, extract) {
  const mode = String(extract || 'text').trim();
  if (!mode || mode === 'text') return /^<tr\b/i.test(String(fragment).trim()) ? extractTableRow(fragment) : compactText(fragment);
  if (mode === 'html' || mode === 'outerHtml') return fragment;
  if (mode === 'row') return extractTableRow(fragment);
  if (mode === 'cells') return extractTableCells(fragment);
  if (mode === 'number' || mode === 'numeric') return parseNumericText(fragment);
  if (mode === 'percent') return parseNumericText(fragment);
  if (mode === 'href' || mode === 'src' || mode === 'data-url' || mode.startsWith('attr:')) return attr(fragment, mode.startsWith('attr:') ? mode.slice(5) : mode);
  return compactText(fragment);
}

export function extractCustomSelectors(html = '', selectors = {}, options = {}) {
  if (!selectors || typeof selectors !== 'object' || Array.isArray(selectors)) return { results: {}, warnings: ['selectors precisa ser objeto.'] };
  const source = String(html || '');
  const maxSelectors = Math.max(1, Math.min(Number(options.maxSelectors || 40), 100));
  const maxPerSelector = Math.max(1, Math.min(Number(options.maxPerSelector || 200), 1000));
  const results = {};
  const warnings = [];
  const entries = Object.entries(selectors).slice(0, maxSelectors);
  for (const [key, rawSpec] of entries) {
    const spec = normalizeSelectorSpec(rawSpec);
    if (!spec?.selector) { warnings.push(`Selector inválido em ${key}`); continue; }
    const limit = Math.max(1, Math.min(Number(spec.limit || maxPerSelector), maxPerSelector));
    const fragments = resolveFragments(source, spec.selector, limit);
    if (!fragments.length && /\s/.test(String(spec.selector))) warnings.push(`Selector sem resultado: ${key} (${spec.selector})`);
    const values = fragments.map(f => extractValue(f, spec.extract)).filter(v => v !== undefined && v !== null && String(v).trim() !== '');
    results[key] = values;
  }
  const sourceDrift = inspectSourceDrift({
    provider: options.provider || 'custom-selectors',
    url: options.url || '',
    html: source,
    results,
    selectors,
    warnings,
    requiredKeys: options.requiredKeys || [],
    minCoverage: Number(options.minCoverage || 0.55),
  });
  return { results, warnings, sourceDrift, version: VALORAE_CUSTOM_SELECTORS_VERSION };
}

export function parseSelectorsInput(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return null; }
  }
  return null;
}
