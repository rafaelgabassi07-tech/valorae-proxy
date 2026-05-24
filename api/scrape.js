export default async function handler(req, res) {
  // ── CORS ─────────────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ── Validação do payload ──────────────────────────────────────────────────
  const body = req.body;
  if (!body?.url) {
    return res.status(400).json({ error: 'Envie a URL no formato: {"url": "https:..."}' });
  }

  // ── Lê headers enviados pelo Nexus Engine (FIX: antes eram ignorados) ─────
  // O engine manda: body.headers = { 'User-Agent': '...Chrome...', 'X-Cache-Version': '...' }
  const forwardedHeaders = (body.headers && typeof body.headers === 'object')
    ? body.headers
    : {};

  // Remove headers internos do engine que não devem ir para o site-alvo
  const { 'X-Cache-Version': _cv, ...safeForwardedHeaders } = forwardedHeaders;

  const userAgent = safeForwardedHeaders['User-Agent']
    || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

  const startMs = Date.now();

  try {
    const fetchRes = await fetch(body.url, {
      headers: {
        // Base realista de navegador
        'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control':   'no-cache',
        'Pragma':          'no-cache',
        // Sobrescreve com o que o engine enviou (User-Agent stealth etc.)
        ...safeForwardedHeaders,
        'User-Agent': userAgent,
      },
    });

    const html = await fetchRes.text();
    const elapsedMs = Date.now() - startMs;

    // ── Resposta compatível com o Nexus Engine ────────────────────────────
    // O engine lê: json.html || json.data  (FIX: agora ambos estão presentes)
    // O engine lê: json.metrics?.cacheStatus  (FIX: agora retornado)
    return res.status(200).json({
      html,
      data: html,
      metrics: {
        cacheStatus: 'MISS',
        statusCode:  fetchRes.status,
        elapsedMs,
        contentLength: html.length,
      },
    });

  } catch (error) {
    const elapsedMs = Date.now() - startMs;
    return res.status(500).json({
      error: 'Erro no proxy: ' + error.message,
      metrics: { elapsedMs },
    });
  }
}
