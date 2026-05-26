// Ponte opcional Vercel -> Supabase. Mantém credenciais privadas no servidor.

function cors(req, res) {
  const origin = process.env.CORS_ALLOW_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  if (origin !== '*') res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS, POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With, X-CSRF-Token');
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'SUPABASE_URL ou SUPABASE_ANON_KEY ausente no Vercel.' });
  }

  const base = supabaseUrl.replace(/\/$/, '');
  const headers = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` };

  if (req.method === 'GET') {
    const { user_id } = req.query;
    if (!user_id) {
      try {
        const test = await fetch(`${base}/rest/v1/`, { headers });
        return res.status(test.ok || test.status === 404 ? 200 : 502).json({ ok: test.ok || test.status === 404, status: test.status });
      } catch (err) {
        return res.status(500).json({ error: 'Erro ao testar Supabase.', details: err?.message });
      }
    }
    try {
      const url = `${base}/rest/v1/valorae_sync_backups?user_id=eq.${encodeURIComponent(user_id)}`;
      const response = await fetch(url, { headers });
      const text = await response.text();
      return res.status(response.status).send(text);
    } catch (err) {
      return res.status(500).json({ error: 'Falha ao consultar Supabase.', details: err?.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const response = await fetch(`${base}/rest/v1/valorae_sync_backups`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(req.body || {}),
      });
      const text = await response.text();
      return res.status(response.status).send(text);
    } catch (err) {
      return res.status(500).json({ error: 'Falha ao salvar no Supabase.', details: err?.message });
    }
  }

  return res.status(405).json({ error: `Método ${req.method} não suportado.` });
}
