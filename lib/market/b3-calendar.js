// Calendário B3 aproximado, inspirado na lógica operacional do Scraper (4).js,
// mas autocontido para Vercel/serverless. Não depende de banco nem filesystem.

export const B3_CALENDAR_VERSION = '21.5.13-mature-final-release-free';

function pad2(value) { return String(value).padStart(2, '0'); }

export function toDateKey(yearOrDate, month, day) {
  if (yearOrDate instanceof Date) {
    return `${yearOrDate.getUTCFullYear()}-${pad2(yearOrDate.getUTCMonth() + 1)}-${pad2(yearOrDate.getUTCDate())}`;
  }
  return `${yearOrDate}-${pad2(month)}-${pad2(day)}`;
}

export function parseDateKey(dateKey) {
  const [y, m, d] = String(dateKey || '').slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

export function shiftDateKey(dateKey, deltaDays) {
  const date = parseDateKey(dateKey);
  if (!date) return dateKey;
  date.setUTCDate(date.getUTCDate() + Number(deltaDays || 0));
  return toDateKey(date);
}

export function calculateEasterDateKey(year) {
  // Algoritmo gregoriano de Meeus/Jones/Butcher.
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return toDateKey(year, month, day);
}

const holidayCache = new Map();

export function getB3HolidaySet(year) {
  const y = Number(year);
  if (!Number.isFinite(y)) return new Set();
  if (holidayCache.has(y)) return holidayCache.get(y);
  const easter = calculateEasterDateKey(y);
  const holidays = new Set([
    toDateKey(y, 1, 1),   // Confraternização Universal
    toDateKey(y, 4, 21),  // Tiradentes
    toDateKey(y, 5, 1),   // Dia do Trabalho
    toDateKey(y, 9, 7),   // Independência
    toDateKey(y, 10, 12), // Nossa Senhora Aparecida
    toDateKey(y, 11, 2),  // Finados
    toDateKey(y, 11, 15), // Proclamação da República
    toDateKey(y, 11, 20), // Consciência Negra
    toDateKey(y, 12, 25), // Natal
    shiftDateKey(easter, -48), // Carnaval segunda
    shiftDateKey(easter, -47), // Carnaval terça
    shiftDateKey(easter, -2),  // Sexta-feira Santa
    shiftDateKey(easter, 60),  // Corpus Christi
  ]);
  holidayCache.set(y, holidays);
  return holidays;
}

export function isWeekend(dateKey) {
  const date = parseDateKey(dateKey);
  if (!date) return false;
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

export function isB3TradingDay(dateKey) {
  const key = String(dateKey || '').slice(0, 10);
  const date = parseDateKey(key);
  if (!date) return false;
  return !isWeekend(key) && !getB3HolidaySet(date.getUTCFullYear()).has(key);
}

export function previousB3TradingDay(fromDateKey = toDateKey(new Date()), maxLookback = 15) {
  let key = String(fromDateKey || toDateKey(new Date())).slice(0, 10);
  for (let i = 0; i < maxLookback; i++) {
    key = shiftDateKey(key, i === 0 ? 0 : -1);
    if (isB3TradingDay(key)) return key;
  }
  return key;
}

export function nextB3TradingDay(fromDateKey = toDateKey(new Date()), maxForward = 15) {
  let key = String(fromDateKey || toDateKey(new Date())).slice(0, 10);
  for (let i = 0; i < maxForward; i++) {
    key = shiftDateKey(key, i === 0 ? 0 : 1);
    if (isB3TradingDay(key)) return key;
  }
  return key;
}

function saoPauloParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map(p => [p.type, p.value]));
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second),
  };
}

export function getB3MarketSession(date = new Date()) {
  const sp = saoPauloParts(date);
  const minutes = sp.hour * 60 + sp.minute;
  const tradingDay = isB3TradingDay(sp.dateKey);
  const regularOpen = 10 * 60;
  const regularClose = 17 * 60 + 55;
  let status = 'closed';
  if (tradingDay && minutes >= regularOpen && minutes <= regularClose) status = 'open';
  else if (tradingDay && minutes < regularOpen) status = 'pre-market';
  else if (tradingDay && minutes > regularClose) status = 'after-hours';
  return {
    timezone: 'America/Sao_Paulo',
    date: sp.dateKey,
    tradingDay,
    status,
    regularOpen: '10:00',
    regularClose: '17:55',
    previousTradingDay: previousB3TradingDay(shiftDateKey(sp.dateKey, -1)),
    nextTradingDay: nextB3TradingDay(shiftDateKey(sp.dateKey, 1)),
  };
}

export function normalizeB3Range(rawRange = '1Y') {
  const raw = String(rawRange || '1Y').trim();
  const upper = raw.toUpperCase();
  if (upper === '1A') return '1Y';
  if (upper === '5A') return '5Y';
  if (upper === 'TUDO') return 'MAX';
  if (upper === '1D' || upper === '5D' || upper === '1M' || upper === '3M' || upper === '6M' || upper === 'YTD' || upper === '1Y' || upper === '2Y' || upper === '5Y' || upper === '10Y' || upper === 'MAX') return upper;
  return '1Y';
}

export function decorateHistoryWithB3Calendar(points = []) {
  const clean = Array.isArray(points) ? points : [];
  const lastPoint = clean.length ? clean[clean.length - 1] : null;
  const lastKey = lastPoint?.date ? String(lastPoint.date).slice(0, 10) : null;
  return {
    calendar: 'B3',
    calendarVersion: B3_CALENDAR_VERSION,
    session: getB3MarketSession(),
    lastPointDate: lastKey,
    lastPointTradingDay: lastKey ? isB3TradingDay(lastKey) : undefined,
    previousTradingDay: previousB3TradingDay(),
    nextTradingDay: nextB3TradingDay(shiftDateKey(toDateKey(new Date()), 1)),
  };
}
