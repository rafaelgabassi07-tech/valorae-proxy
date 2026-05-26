# Changelog — Valorae Proxy

## v21.5.13 — Mature Final Release Free

- Adiciona `fieldWarnings` para `fields`/`dataFields` inválidos ou inexistentes, sem vazar payload completo quando todos os campos solicitados são inválidos.
- Endurece `scrapeUrl` customizado: agora precisa apontar exatamente para `/api/scrape`, evitando caminhos parecidos.
- Restringe token admin via query em produção; só funciona com override explícito `VALORAE_ADMIN_ALLOW_QUERY_TOKEN_IN_PRODUCTION=1`.
- Corrige `securityRuntimeStats.rateLimit` para diferenciar `disabledRequested` e `disabledEffective`.
- Usa `isReadLikeMethod` no limite de body, preservando semântica correta para `GET` e `HEAD`.
- Adiciona `npm run audit:final` e teste comportamental v21.5.13.

- Implementa somente melhorias recomendadas/viáveis da auditoria de 190 itens.
- Adiciona `/api/v1/env`, `/api/v1/schema` e `/api/v1/source/status`.
- Adiciona CORS strict opcional, limites de URL/query e proteção contra rate-limit desligado acidentalmente em produção.
- Adiciona `dataQualityMatrix`, `sourceReliability`, `healthScore`, `incomeStabilityScore` e `dividendCoverage`.
- Adiciona fixtures extras de Investidor10/Yahoo/Google News para regressão de parser/source drift.
- Adiciona `.nvmrc`, `.env.example`, `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`, `docs/ENVIRONMENT.md`, `docs/TROUBLESHOOTING.md`, `docs/ARCHITECTURE.md` e `docs/QUALITY_MATRIX.md`.
- Mantém 2 Functions físicas, zero dependências obrigatórias e política free-only.

# CHANGELOG

## v21.5.11 — Final Minute Audit Free

- Corrige `HEAD` em rotas `GET` para preservar `req.query`, evitando 400 indevido em URLs como `/api/v1/asset?ticker=PETR4`.
- Corrige normalização de path para remover apenas `/api` ou `/api/`, sem truncar caminhos parecidos como `/apiary`.
- Adiciona `npm run audit:minutiae`, com validação de imports locais, handlers default, HEAD/query, path normalization, versão pública e guardrails finais.
- Ajusta `npm run verify` para verificação rápida de lançamento; `npm run build` permanece como simulação separada do build Vercel.
- Adiciona `/api/v1/ready` para validar prontidão local sem chamadas externas.
- Adiciona `/api/v1/manifest` com capacidades, rotas, aliases e política free-only.
- Substitui `tsc --noEmit` por `scripts/typecheck-free.js`, evitando falha de build em Vercel limpa sem dependência `typescript`.
- Adiciona `npm run audit:release` e inclui essa auditoria no `build` e no `verify`.
- Adiciona documentação de operação, matriz de confiabilidade e checklist de lançamento.
- Atualiza README, página pública, smoke test, OpenAPI e auditorias para lançamento GitHub/Vercel.
- Mantém 2 Functions físicas, zero dependências obrigatórias e cache memory-only.

## v21.5.9 — Portfolio Intelligence & Source Reliability

- Adiciona fixtures leves de fonte para testar parser sem internet.
- Adiciona source drift detection em scrape, batch-scrape e parser resilience.
- Adiciona `/api/v1/cache/stats` com métricas de cache em memória.
- Adiciona `profile=instant`/`profile=ultra` para apps e dashboards de baixa latência.
- Amplia carteira com ranking por posição, narrativa, concentração por objetivo/emissor/tag, projeção de renda passiva e roteiro de rebalanceamento por aporte.

## v21.5.8 — Portfolio Tech Supremacy Free

- Reforça compatibilidade com o Scraper (4), incluindo `fiiList`, `historico_12m` por ticker e lista flat de proventos em `proventos_carteira`.
- Amplia carteira para caixa/renda informada pelo usuário com taxa anual, indexador, vencimento, liquidez, emissor, isenção e objetivo, sem depender de fonte externa paga.
- Adiciona `portfolio.intelligence`: calendário de renda, cobertura de pagadores, liquidez, projeção de objetivos, tax planner educativo, prontidão tecnológica e plano de ação.
- Amplia selectors customizados com `cells`, `number`, `percent`, `data-url` e `attr:*`.
- Atualiza OpenAPI, catálogo de campos, SDK TypeScript e testes comportamentais.

## v21.5.7 — Contract Safety Hardening Free

- Implementa aliases reais de `view`: `quote/card -> compact`, `wallet -> standard`, `detail/analysis -> full`.
- Implementa aliases reais de `profile`: `quote/card -> fast`, `wallet -> portfolio`, `analysis/complete -> deep`, `balanced -> standard`.
- Remove o fallback `Function(...)` do parser JSON; agora o parser usa apenas `JSON.parse` e normalização JS-like segura, sem eval.
- Padroniza `AbortController` com `finally` em fetches de Yahoo Chart e Google News.
- Corrige o SDK TypeScript e o `.d.ts` para `moduleResolution: NodeNext`.
- Reestrutura `/api/openapi` para usar `components.schemas` e parâmetros OpenAPI em formato de objeto.
- Faz `compareAssets` priorizar `normalized.*.value` antes de cair para `results` bruto.
- Deixa ETag menos volátil ao ignorar `requestId`, `generatedAt` e `checkedAt` no hash.
- Retorna `/api/sync` como legado desativado com HTTP `410` na build free-only.
- Amplia catálogo `/api/errors` e `/api/fields` com aliases, erros de contrato e `SYNC_DISABLED_FREE_ONLY`.
- Reforça `audit:free` contra `Function(...)`, `eval(...)` e tecnologias complexas.

## v21.5.6 — Final Review Hardening Free

- Remove CORS amplo de `/api/*` no `vercel.json`; CORS da API fica no runtime.
- Remove a ponte opcional Supabase da rota `/api/sync` para manter free-only puro.
- Corrige texto antigo no OpenAPI.
- Reforça auditorias `audit:free` e `audit:routes`.

## v21.5.5 — Complete Audit Hardening Free

- CORS/preflight mais robusto com headers expostos e `Vary` correto.
- ETag/304 ajustado para listas em `If-None-Match`.
- Router preserva query params repetidos.
- Seletores CSS-lite ampliados: múltiplas classes e atributos existentes.
- Batch scrape deduplica com assinatura mais segura considerando limites de selectors.
- OpenAPI referencia rotas v1 principais.
- Adiciona `npm run audit:routes`.

## v21.5.4 — Audit Corrections Free

- CORS com allowlist multi-origem e `Vary: Origin`.
- Router com fallback de querystring via `req.url`.
- `HEAD` automático para rotas `GET`, `Content-Length` e ETag preservado.
- Selectors customizados com suporte a `>`, atributos/classes sem aspas e `outerHtml`.
- Batch scrape considera `includeHtml` por job na deduplicação.
- Adiciona `audit:version`.

## v21.5.3 — Scraper Compatibility Hardening Free

- Corrige gaps encontrados ao comparar o VALORAE com `scraper (4).js`.
- Adiciona suporte a seletores descendentes simples em `/api/scrape` e `/api/batch-scrape`.
- Amplia extração de atributos com `data-url`, `attr:*`, `row` e `cells`.
- Adiciona deduplicação intra-request no batch scrape.
- Adiciona alias legado `/api/scraper` para `/api/compat/scraper4`.

## v21.5.2 — Router Contract Free

- Consolida o deploy Vercel em duas Functions físicas: `api/index.js` e `api/[...path].js`.
- Move handlers para `routes/` e suporte compartilhado para `lib/`.
- Adiciona router interno com aliases legados, prefixos `/api/v1/*` e envelope `/api/v2/*`.
- Reforça `audit:functions`, `audit:free`, smoke tests e validação de build.
- Publica guias em `docs/` e SDKs estáticos TypeScript/Java.

## v21.5.1 — Audit Hardening Free

- Adiciona `/api/fields`, `/api/errors` e inspector estático.
- Endurece Host/X-Forwarded-Host e cache memory-only.

## v21.5.0 — Professional Refinement

- Normalização universal, parser resilience, schema stability, compare intelligence e carteira avançada.
