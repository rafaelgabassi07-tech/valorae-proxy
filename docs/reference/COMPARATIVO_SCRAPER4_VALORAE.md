# Comparativo técnico — Valorae-engine.js v20.0 vs Scraper (4).js

## Resumo

O Scraper (4).js é forte em performance operacional porque usa cache final, coalescing de chamadas em andamento, retries com backoff e um modelo de multi-selector em uma única chamada externa. O Valorae-engine.js v20.0 mantém a vantagem principal do projeto Valorae: é self-contained, versionado, com diagnóstico de fontes, fallback por fonte, parser específico por tipo de ativo e JSON mais estruturado para ações/FIIs.

A v20.0 incorpora os pontos fortes úteis do Scraper (4), mas evita sua dependência obrigatória do AeroScrape externo.

## Melhorias aplicadas na v20.0

1. Cache final de JSON com chave versionada.
   - Evita reprocessar HTML + APIs internas para o mesmo ticker em instâncias quentes.
   - A chave inclui versão do motor, ticker, tipo, modo, includeNews, newsLimit, Yahoo e configuração de APIs internas.
   - `nocache=1`, `refresh=1` ou `cache=false` ignoram o cache.

2. Coalescing de chamadas concorrentes.
   - Se duas requisições iguais chegam ao mesmo tempo, a segunda aguarda a primeira em vez de repetir scraping.

3. Controle de memória do cache final.
   - Limite por quantidade de entradas e por bytes.
   - Remoção LRU simples pelo item mais antigo.

4. Diagnóstico de qualidade no JSON.
   - Novo campo `quality` com score, grade, checks e penalidades.
   - Ajuda a identificar rapidamente quando faltam blocos críticos.

5. Estatísticas de runtime.
   - `/api/health` agora expõe `runtimeStats` com caches ativos, entradas, bytes e TTLs.
   - `metrics.runtime` também aparece no retorno de `/api/asset`.

6. Classificação melhor de tickers terminados em 11.
   - Unidades B3 como `TAEE11`, `KLBN11`, `SANB11`, `BPAC11`, `ALUP11` agora são tratadas como ação/unit, não como FII.

7. Headers de versão.
   - `/api/asset`, `/api/assets` e `/api/news` retornam `X-Valorae-Engine-Version`.

## Variáveis novas

- `VALORAE_ASSET_RESULT_CACHE_ENABLED=true|false`
- `VALORAE_ASSET_RESULT_CACHE_TTL_MS=300000`
- `VALORAE_ASSET_RESULT_CACHE_MAX_ENTRIES=250`
- `VALORAE_ASSET_RESULT_CACHE_MAX_BYTES=33554432`

## Como testar

```text
/api/health
/api/asset?ticker=PETR4&mode=super&includeNews=1&nocache=1
/api/asset?ticker=GARE11&mode=super&includeNews=1&nocache=1
/api/asset?ticker=TAEE11&mode=super&includeNews=1&nocache=1
```

## Objetivo da v20.0

Superar o Scraper (4) em autonomia, manutenção e observabilidade, mantendo os pontos de performance que faziam sentido: cache final, in-flight dedupe, headers estáveis e processamento por seletor em uma única passagem.

## v20.1 — Quality & Test Suite


A v20.1 leva a comparação além de cache/retry e adiciona uma camada que o Scraper (4) não tinha como produto final: schema de resposta, validação de campos, quality score com confidence, estatísticas derivadas por tipo de ativo e testes dourados.

Diferenciais novos:

- `schemaVersion` em todos os payloads.
- `validation` com `missing`, `suspicious` e `errors`.
- `sourceReport` para auditar fontes usadas e tentadas.
- `debug=1` no `/api/asset` para diagnóstico de parser e fallback.
- `portfolioStats` para FIIs.
- `financialSummary` para ações.
- `npm test` com fixtures PETR4/GARE11 para evitar regressões.
