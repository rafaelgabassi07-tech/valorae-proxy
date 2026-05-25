// ── Domínios permitidos (allowlist anti-SSRF) ──────────────────────────────
// Toda URL enviada ao proxy é validada contra esta lista antes do fetch.
// Sem este controle qualquer cliente pode usar o servidor como relay para
// atacar serviços internos (SSRF) ou exfiltrar dados de terceiros.
const ALLOWED_HOSTS = new Set([
  'investidor10.com.br',
  'www.investidor10.com.br',
  'statusinvest.com.br',
  'www.statusinvest.com.br',
]);

// Tempo máximo de espera pelo site-alvo.
// Vercel Hobby tem limite de 10 s; usamos 8 s para deixar margem ao runtime.
const FETCH_TIMEOUT_MS = 8_000;

// Headers Sec-Fetch-* + Client Hints que o Cloudflare analisa para distinguir
// navegadores reais de bots. Omiti-los aumenta muito a chance de bloqueio.
const STEALTH_HEADERS = {
  'Sec-Ch-Ua':          '"Chromium";v="136", "Google Chrome";v="136", "Not-A.Brand";v="99"',
  'Sec-Ch-Ua-Mobile':   '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest':     'document',
  'Sec-Fetch-Mode':     'navigate',
  'Sec-Fetch-Site':     'none',
  'Sec-Fetch-User':     '?1',
  'Upgrade-Insecure-Requests': '1',
};

export default async function handler(req, res) {
  // ── CORS ──────────────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Aceita apenas POST — GET não tem body estruturado
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  // ── Validação do payload ──────────────────────────────────────────────────
  const body = req.body;
  if (!body?.url || typeof body.url !== 'string') {
    return res.status(400).json({ error: 'Envie a URL no formato: {"url": "https://..."}' });
  }

  // ── Validação da URL (anti-SSRF) ─────────────────────────────────────────
  let parsedUrl;
  try {
    parsedUrl = new URL(body.url);
  } catch {
    return res.status(400).json({ error: 'URL inválida.' });
  }

  if (parsedUrl.protocol !== 'https:') {
    return res.status(400).json({ error: 'Apenas URLs HTTPS são permitidas.' });
  }

  if (!ALLOWED_HOSTS.has(parsedUrl.hostname)) {
    return res.status(403).json({ error: `Domínio não permitido: ${parsedUrl.hostname}` });
  }

  // ── Headers encaminhados pelo Nexus Engine ────────────────────────────────
  // O engine envia body.headers com User-Agent stealth e X-Cache-Version.
  // Removemos cabeçalhos internos e sensíveis antes de repassar ao alvo.
  const forwarded = (body.headers && typeof body.headers === 'object') ? body.headers : {};
  const {
    'X-Cache-Version': _cv,
    'host': _h,
    'authorization': _a,
    'cookie': _c,         // nunca repassar cookies do cliente ao site-alvo
    ...safeForwarded
  } = forwarded;

  const userAgent = safeForwarded['User-Agent']
    || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';

  // ── Fetch com timeout ─────────────────────────────────────────────────────
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const startMs    = Date.now();

  try {
    const fetchRes = await fetch(body.url, {
      signal: controller.signal,
      headers: {
        // Perfil base de navegador real
        'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control':   'no-cache',
        'Pragma':          'no-cache',
        'Referer':         `https://${parsedUrl.hostname}/`,
        // Headers anti-bot (Sec-Fetch-* + Client Hints)
        ...STEALTH_HEADERS,
        // Sobrescreve com o que o engine enviou (User-Agent stealth rotacionado)
        ...safeForwarded,
        'User-Agent': userAgent,
      },
    });

    clearTimeout(timeoutId);
    const elapsedMs = Date.now() - startMs;

    // ── Propaga erros HTTP do site-alvo ───────────────────────────────────
    // Sem este check, um 403/429/503 retorna HTML de bot-detection ao engine,
    // que tenta parsear como dado válido e falha silenciosamente.
    if (!fetchRes.ok) {
      return res.status(502).json({
        error: `Site-alvo retornou ${fetchRes.status} ${fetchRes.statusText}`,
        metrics: { statusCode: fetchRes.status, elapsedMs },
      });
    }

    const html = await fetchRes.text();

    // ── Resposta compatível com Nexus Engine ──────────────────────────────
    // O engine lê: json.html || json.data  e json.metrics?.cacheStatus
    return res.status(200).json({
      html,
      data: html,
      metrics: {
        cacheStatus:   'MISS',
        statusCode:    fetchRes.status,
        elapsedMs,
        contentLength: html.length,
      },
    });

  } catch (error) {
    clearTimeout(timeoutId);
    const elapsedMs = Date.now() - startMs;

    const isTimeout = error.name === 'AbortError';
    return res.status(isTimeout ? 504 : 500).json({
      error: isTimeout
        ? `Timeout: o site-alvo não respondeu em ${FETCH_TIMEOUT_MS}ms`
        : `Erro no proxy: ${error.message}`,
      metrics: { elapsedMs },
    });
  }
}
