/**
 * Vercel Serverless Function: Secure Supabase Sync Proxy (Bridge)
 * Save this file as /api/sync.js in your Vercel project root folder.
 * 
 * Securely communicates with Supabase from Vercel servers, 
 * keeping your private Supabase credentials (URL, Key) confidential.
 */

export default async function handler(req, res) {
  // CORS Configuration
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ 
      error: "O Vercel não possui as variáveis de ambiente SUPABASE_URL ou SUPABASE_ANON_KEY configuradas no Dashboard." 
    });
  }

  const cleanSupabaseUrl = supabaseUrl.replace(/\/$/, '');

  // 1. GET Request: Handles healthcheck / restore
  if (req.method === 'GET') {
    const { user_id } = req.query;

    if (!user_id) {
      // Act as health check / proxy ping
      try {
        const testRes = await fetch(`${cleanSupabaseUrl}/rest/v1/`, {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
          }
        });
        
        if (testRes.ok || testRes.status === 404) {
          return res.status(200).json({ status: "online", message: "Ponte Vercel -> Supabase ativa e respondendo!" });
        } else {
          return res.status(502).json({ error: "Supabase inacessível", details: testRes.statusText });
        }
      } catch (err) {
        return res.status(500).json({ error: "Erro ao testar conexão ao Supabase", details: err.message });
      }
    }

    // Restore Backup logic: Query Supabase safely using server-side variables
    try {
      const fetchUrl = `${cleanSupabaseUrl}/rest/v1/valorae_sync_backups?user_id=eq.${encodeURIComponent(user_id)}`;
      const response = await fetch(fetchUrl, {
        method: 'GET',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      });

      if (!response.ok) {
        return res.status(response.status).json({ error: `Erro ao consultar Supabase: ${response.statusText}` });
      }

      const data = await response.json();
      return res.status(200).json(data);
    } catch (err) {
      return res.status(500).json({ error: "Falha de rede na ponte do serverless", details: err.message });
    }
  }

  // 2. POST Request: Backup upload (Upsert)
  if (req.method === 'POST') {
    try {
      const payload = req.body;
      
      const response = await fetch(`${cleanSupabaseUrl}/rest/v1/valorae_sync_backups`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=representation'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({ 
          error: `Erro ao fazer upsert no Supabase: ${response.statusText}`, 
          details: errorText 
        });
      }

      const result = await response.json();
      return res.status(200).json({ success: true, count: result.length, data: result });
    } catch (err) {
      return res.status(500).json({ error: "Falha de rede ao salvar backup", details: err.message });
    }
  }

  return res.status(405).json({ error: `Método ${req.method} não suportado.` });
}

