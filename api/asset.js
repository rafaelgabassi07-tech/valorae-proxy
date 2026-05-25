import { NexusEngineUltra, inferAssetType } from './lib/nexus-engine';

export default async function handler(req: any, res: any) {
  const { ticker } = req.query;

  if (!ticker) {
    return res.status(400).json({ error: 'Ticker is required' });
  }

  try {
    // 1. Identifica o tipo automaticamente (Ação, FII, Stock, etc)
    const type = inferAssetType(ticker as string);
    
    // 2. Chama a Versão Ultra do seu motor
    const result = await NexusEngineUltra.fetchAtivo(ticker as string, type);
    
    // 3. Cache de 1 hora para performance (SWR)
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    
    // 4. Retorna no formato que o APK já espera
    res.status(200).json({ 
      data: result.results, 
      info: {
        ticker: result.ticker,
        type: result.type,
        cacheStatus: result.cacheStatus,
        metrics: result.metrics
      }
    });
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
}
