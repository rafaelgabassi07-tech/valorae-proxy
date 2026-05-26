# Valorae Proxy v19.2

Servidor proxy self-contained para GitHub + Vercel, com motor `lib/Valorae-engine.js` e scraper próprio `api/scrape.js`.

## Estrutura

```text
api/
  asset.js
  assets.js
  scrape.js
  batch-scrape.js
  news.js
  health.js
  index.js
  sync.js
lib/
  Valorae-engine.js
public/
  index.html
package.json
vercel.json
tsconfig.json
```

## Endpoints

```text
/api/health
/api/scrape?url=https://investidor10.com.br/acoes/petr4/
/api/asset?ticker=PETR4&mode=super&includeNews=1
/api/asset?ticker=GARE11&mode=super&includeNews=1
/api/assets?tickers=PETR4,GARE11,VISC11&mode=super&includeNews=1
/api/news?ticker=PETR4
/api/batch-scrape
```

## Como funciona

`/api/asset` chama o `ValoraeEngine`, que por padrão chama o próprio `/api/scrape` do mesmo domínio. O `/api/scrape` busca o HTML público permitido, extrai seletores úteis e devolve `html + results`. O motor então faz o parser completo das seções.

Não há dependência de AeroScrape externo.

## Variáveis opcionais

```bash
VALORAE_PUBLIC_BASE_URL=https://seu-projeto.vercel.app
VALORAE_SCRAPE_ENABLED=1
VALORAE_SCRAPE_FIRST=1
VALORAE_FETCH_TIMEOUT_MS=12000
VALORAE_SCRAPE_TIMEOUT_MS=12000
VALORAE_MAX_HTML_CHARS=3200000
VALORAE_NEWS_LIMIT=8
VALORAE_NEWS_CACHE_TTL_MS=900000
MAX_TICKERS_PER_REQUEST=20
```

Se `VALORAE_PUBLIC_BASE_URL` não for definida, o endpoint monta a base pelo `Host` da requisição.

## Teste de diagnóstico

Primeiro teste o HTML:

```text
/api/scrape?url=https://investidor10.com.br/acoes/petr4/
```

Se vier `blocked: true` ou `status: 403`, o HTML não chegou ao Vercel. Se vier `htmlLength > 0`, o parser terá conteúdo para extrair.
