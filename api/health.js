import { NexusEngineUltra } from '../lib/nexus-engine.js';
import { configureEngineForRequest, setCors } from '../lib/vercel-runtime.js';

export default async function handler(req, res) {
  setCors(res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método não permitido. Use GET.' });
  }

  const runtime = configureEngineForRequest(NexusEngineUltra, req);
  return res.status(200).json({
    ok: true,
    service: 'nexus-proxy',
    version: '1.2.0',
    node: process.version,
    environment: process.env.VERCEL_ENV || 'local',
    vercel: Boolean(process.env.VERCEL),
    runtime: {
      hasInternalProxy: Boolean(runtime.proxyUrl),
      hasBatchProxy: Boolean(runtime.batchUrl),
      baseUrl: runtime.baseUrl || undefined,
    },
    env: {
      supabaseConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY),
      newsLimit: process.env.NEXUS_NEWS_LIMIT || '8',
      fetchTimeoutMs: process.env.FETCH_TIMEOUT_MS || '15000',
      useInternalProxy: process.env.NEXUS_USE_INTERNAL_PROXY || '0',
      useBatchProxy: process.env.NEXUS_USE_BATCH_PROXY || '0',
    },
  });
}
