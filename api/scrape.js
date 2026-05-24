export default async function handler(req, res) {
  // 1. Libera o CORS (para o seu app conseguir conectar sem bloqueio)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 2. Extrai a URL para onde devemos apontar
  const body = req.body;
  if (!body || !body.url) {
    return res.status(400).json({ error: 'Envie a URL no formato: {"url": "https:..."}' });
  }

  try {
    // 3. O Proxy vai até o site fingindo ser um navegador comum
    const fetchRes = await fetch(body.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const html = await fetchRes.text();

    // 4. Devolve as informações para o seu Nexus!
    res.status(200).json({
      data: html
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro no proxy: ' + error.message });
  }
}
