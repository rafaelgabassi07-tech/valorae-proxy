# Valorae Proxy v20.1

Servidor proxy self-contained para GitHub + Vercel, com motor `api/lib/Valorae-engine.js`, scraper próprio `api/scrape.js`, schema oficial de qualidade, testes dourados e modo debug.

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
    normalizers/
      financial.js
    quality/
      schema.js
public/
  index.html
test/
  golden.test.js
  fixtures/
    GARE11_golden.json
    PETR4_golden.json
package.json
vercel.json
tsconfig.json
SCHEMA_VALORAE.md
QUALITY_TEST_SUITE.md
COMPARATIVO_SCRAPER4_VALORAE.md
```

## Endpoints

```text
/api/health
/api/scrape?url=https://investidor10.com.br/acoes/petr4/
/api/asset?ticker=PETR4&mode=super&includeNews=1
/api/asset?ticker=PETR4&mode=super&includeNews=1&debug=1&nocache=1
/api/asset?ticker=GARE11&mode=super&includeNews=1
/api/assets?tickers=PETR4,GARE11,VISC11&mode=super&includeNews=1
/api/news?ticker=PETR4
/api/batch-scrape
```

## O que mudou na v20.1

- `schemaVersion` oficial no payload.
- `validation` com campos obrigatórios, ausentes e suspeitos.
- `quality` ampliado com `confidence`, `missing`, `suspect` e `sourcesUsed`.
- `sourceReport` com fontes usadas, tentadas, fallback Yahoo, APIs internas e Google News.
- `debug=1` para diagnóstico sem expor HTML bruto.
- Estatísticas derivadas de FIIs: quantidade de imóveis, ABL total, ABL por estado, maior estado e maiores imóveis.
- Resumo financeiro derivado de ações: valor de mercado, EV, dívida líquida, patrimônio, dívida/patrimônio calculada e ratios-chave.
- Modularização inicial em `api/lib/normalizers` e `api/lib/quality`.
- Testes dourados para PETR4 e GARE11.

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
VALORAE_ASSET_RESULT_CACHE_ENABLED=true
VALORAE_ASSET_RESULT_CACHE_TTL_MS=300000
VALORAE_ASSET_RESULT_CACHE_MAX_ENTRIES=250
VALORAE_ASSET_RESULT_CACHE_MAX_BYTES=33554432
```

Se `VALORAE_PUBLIC_BASE_URL` não for definida, o endpoint monta a base pelo `Host` da requisição.

## Cache e debug

Para ignorar cache:

```text
/api/asset?ticker=PETR4&mode=super&includeNews=1&nocache=1
```

Para diagnóstico:

```text
/api/asset?ticker=PETR4&mode=super&includeNews=1&debug=1&nocache=1
```

O campo `debug` mostra fontes tentadas, cobertura, validação, chaves encontradas, avisos e timings.

## Validação local

```bash
npm run check
npm test
npm run build
```

## Teste de diagnóstico do HTML

```text
/api/scrape?url=https://investidor10.com.br/acoes/petr4/
```

Se vier `blocked: true` ou `status: 403`, o HTML não chegou ao Vercel. Se vier `htmlLength > 0`, o parser tem conteúdo para extrair.
