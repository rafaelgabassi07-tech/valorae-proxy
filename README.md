# Valorae Proxy v21.5.13 — Mature Final Release Free

Proxy HTTP/JSON para dados de investimentos, desenhado para **GitHub + Vercel gratuito**, com deploy simples, sem banco obrigatório, sem Redis/KV, sem storage externo, sem cron pago, sem WebSocket e sem worker permanente.

## Status de lançamento

Esta versão adiciona uma vistoria minuciosa final para publicação no GitHub/Vercel hoje:

- `npm run verify` valida sintaxe, testes, contrato TypeScript/SDK sem `tsc`, guardrails free-only, rotas, versão, release readiness, auditoria minuciosa e smoke.
- `npm run build` simula separadamente o build Vercel sem dependências externas obrigatórias.
- `/api/v1/ready` informa se o deploy está pronto sem chamar fontes externas.
- `/api/v1/manifest` expõe capacidades, rotas, aliases, política free-only e recursos de carteira.
- `npm run audit:release` verifica arquivos essenciais, ausência de dependências obrigatórias e contrato de publicação.
- `npm run audit:minutiae` valida detalhes que costumam passar batido: imports locais, handlers default, `HEAD`/query e normalização de path.
- `npm run audit:final` valida maturidade final: `fields/dataFields` com warnings, `scrapeUrl` exato, token admin via query restrito e rate limit efetivo em produção.

## Arquitetura

O VALORAE roda com apenas duas Functions físicas na Vercel:

```text
api/index.js
api/[...path].js
```

Todo o roteamento real fica em `routes/_router.js`, com handlers internos em `routes/` e módulos auxiliares em `lib/`. O núcleo `lib/Valorae-engine.js` permanece como engine central.

## Recursos principais

- Router interno `/api`, `/api/v1/*` e `/api/v2/*`.
- Compatibilidade com URLs antigas via aliases.
- Envelope v2 em `/api/v2/*` ou `?envelope=1`.
- `/api/fields`, `/api/errors`, `/api/openapi`, `/api/v1/ready` e `/api/v1/manifest`.
- `fields=`, `dataFields=`, `lean=1` e `maxItems=`, com `fieldWarnings` para campos inválidos ou inexistentes.
- Views públicas: `instant`, `ultra`, `quote`, `card`, `wallet`, `detail`, `analysis`.
- Profiles públicos: `instant`, `ultra`, `quote`, `card`, `wallet`, `analysis`.
- Normalização financeira em `display/value/unit/source/confidence`.
- Parser resilience, source drift detection, schema stability, quality, confidence e source report.
- Compare intelligence com perfis `dividendos`, `conservador`, `crescimento`, `valor` e `rendaFii`.
- Carteira com análise, risco, renda, rebalanceamento, histórico, transações, ranking, narrativa, metas e simulação de aporte.
- Inspector gratuito em `/inspector.html`.
- SDK TypeScript e SDK Android Java em `public/sdk/`.
- Auditorias locais para free-only, functions físicas, rotas, versão, release readiness e smoke.

## Endpoints essenciais

```text
/api/health
/api/v1/ready
/api/v1/manifest
/api/v1/asset?ticker=PETR4&view=quote&profile=quote
/api/v2/asset?ticker=PETR4&dataFields=ticker,normalized,quality
/api/v1/assets?tickers=PETR4,GARE11&view=card&profile=card
/api/v1/compare?tickers=PETR4,VALE3,PRIO3
/api/v1/market/rankings?type=ACAO
/api/v1/portfolio/analyze
/api/v1/cache/stats
/api/v1/scrape
/api/v1/batch-scrape
/api/fields
/api/errors
/api/openapi
```

## Views e profiles

Aliases públicos de `view`:

```text
instant -> compact
ultra -> compact
quote -> compact
card -> compact
wallet -> standard
detail -> full
analysis -> full
```

Aliases públicos de `profile`:

```text
instant -> instant
ultra -> instant
quote -> fast
card -> fast
wallet -> portfolio
analysis -> deep
balanced -> standard
complete -> deep
```

## Validação local

```bash
npm run verify
```

O `verify` executa:

```text
check -> test -> typecheck -> audit:functions -> audit:free -> audit:version -> audit:routes -> audit:release -> smoke -> build
```

O `typecheck` é intencionalmente livre de dependência externa: valida contrato `.d.ts` e SDK TypeScript com script Node próprio, para evitar falha de build em Vercel limpa sem `typescript` instalado.

## Política free-only

Esta build não usa dependências externas obrigatórias no `package.json` e evita tecnologias pagas/complexas no runtime:

```text
sem Redis
sem Vercel KV
sem banco obrigatório
sem Supabase/Firebase/Mongo/Postgres/Prisma
sem storage externo obrigatório
sem cron pago
sem WebSocket
sem worker permanente
```

O cache padrão é em memória, limitado e compatível com instâncias serverless quentes.

## Deploy Vercel

1. Suba o repositório no GitHub.
2. Importe na Vercel.
3. Use Node.js 20+.
4. Não configure banco, Redis, KV ou storage.
5. Configure `VALORAE_PUBLIC_BASE_URL` somente se quiser URL pública fixa para self-scrape/links.
6. Rode `/api/v1/ready` após o deploy.

## Documentação

```text
docs/CHANGELOG.md
docs/API_CONTRACT.md
docs/DEPLOY_VERCEL_FREE.md
docs/MIGRATION_GUIDE.md
docs/WEB_TYPESCRIPT_GUIDE.md
docs/ANDROID_JAVA_GUIDE.md
docs/RELEASE_CHECKLIST.md
docs/OPERATIONS.md
docs/RELIABILITY_MATRIX.md
```

## Versão

```json
{
  "version": "21.5.13",
  "engine": "21.5.13-mature-final-release-free"
}
```


## v21.5.13 — melhorias recomendadas implementadas

Esta versão aplica somente melhorias recomendadas e viáveis para o projeto atual:

- catálogo seguro de ambiente em `/api/v1/env`;
- catálogo de schemas em `/api/v1/schema`;
- status local de fontes em `/api/v1/source/status`;
- CORS strict opcional via `VALORAE_CORS_STRICT=1`;
- limites de URL/query para evitar abuso em serverless;
- matriz de qualidade por ativo (`dataQualityMatrix`);
- `sourceReliability` por provider;
- carteira com `healthScore`, `incomeStabilityScore` e `dividendCoverage`;
- fixtures extras para ação, ETF, BDR, fonte bloqueada, Yahoo parcial/vazio/429 e Google News vazio/malformado;
- docs de ambiente, troubleshooting, arquitetura, security e contributing.

Continuam fora por decisão de arquitetura: banco, Redis/KV, storage externo, cron pago, WebSocket, worker permanente, frameworks pesados e renda fixa avançada.
