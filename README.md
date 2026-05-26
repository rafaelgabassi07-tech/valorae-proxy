# Nexus Proxy — Investidor10 Super Scraping

Projeto pronto para subir no GitHub e sincronizar automaticamente com o Vercel.

## Arquivos incluídos

- `api/asset.js` — busca um ativo.
- `api/assets.js` — busca múltiplos ativos.
- `api/scrape.js` — proxy seguro para scraping HTML.
- `api/batch-scrape.js` — proxy batch com cache/concorrência.
- `api/news.js` — notícias via Google News RSS com filtro por ticker/alias.
- `api/sync.js` — ponte Supabase opcional.
- `api/health.js` — teste de saúde do deploy.
- `lib/nexus-engine.js` — motor principal usado em produção.
- `lib/nexus-engine.ts` — fonte TypeScript do motor.
- `lib/vercel-runtime.js` — configurações runtime/env.
- `package.json`, `tsconfig.json`, `vercel.json` — configuração do projeto.

## Como usar

Envie todos os arquivos deste ZIP para a raiz do seu repositório GitHub.
O Vercel detectará o projeto e publicará as funções em `/api/*`.

## Endpoints de teste

```bash
/api/health
/api/news?ticker=PETR4
/api/asset?ticker=PETR4&mode=super&includeNews=1
/api/asset?ticker=GARE11&mode=super&includeNews=1
/api/assets?tickers=PETR4,GARE11,VISC11&mode=super&includeNews=1
```

## Variáveis recomendadas no Vercel

```bash
FETCH_TIMEOUT_MS=12000
MAX_TICKERS_PER_REQUEST=20
MAX_BATCH_JOBS=25
BATCH_CONCURRENCY=6
MAX_HTML_RESPONSE_CHARS=3200000
MAX_BATCH_TOTAL_HTML_CHARS=3200000
NEXUS_FULL_PARSE_LIMIT=2500000
NEXUS_NEWS_LIMIT=8
NEXUS_NEWS_CACHE_TTL_MS=900000
```

Variáveis opcionais:

```bash
NEXUS_USE_INTERNAL_PROXY=1
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
CORS_ALLOW_ORIGIN=*
```

## Validação local

```bash
npm install
npm run check
vercel dev
```

Observação: o sistema não inventa dados quando uma página está bloqueada ou incompleta. Nesses casos, retorna erro ou dados parciais com métricas.
