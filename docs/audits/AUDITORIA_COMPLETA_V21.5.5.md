# Valorae v21.5.13 — Auditoria Completa e Hardening Free

Auditoria feita sobre a v21.5.4 com foco em correções, robustez para GitHub/Vercel gratuito e compatibilidade com o `scraper (4).js`.

## Pontos verificados

- Guardrail de duas Functions físicas: `api/index.js` e `api/[...path].js`.
- Router interno v1/v2 e aliases antigos.
- Envelope v2, `fields`, `dataFields`, `lean` e `maxItems`.
- CORS, headers de cache, ETag, HEAD e 304.
- Catálogos `/api/fields`, `/api/errors` e OpenAPI.
- Scrape/batch scrape com seletores customizados e deduplicação.
- Política free-only sem Redis, KV, banco obrigatório, storage externo, cron pago, WebSocket ou worker permanente.

## Correções aplicadas

1. CORS expõe headers úteis (`ETag`, `X-Request-Id`, `X-Valorae-Engine-Version`, `X-RateLimit-*`) e aceita headers solicitados no preflight com validação simples.
2. IP de rate limit agora prioriza `x-real-ip`/`x-vercel-forwarded-for` antes de `x-forwarded-for`.
3. ETag agora aceita listas em `If-None-Match` e remove `Content-Length` em respostas 304.
4. Query parser do router preserva parâmetros repetidos como array.
5. Batch scrape inclui `maxSelectors` e `maxPerSelector` na assinatura de deduplicação para evitar reaproveitamento incorreto.
6. Seletor customizado ganhou suporte CSS-lite mais forte: múltiplas classes (`div.card.primary`), atributo existente (`a[href]`, `a[data-url]`) e tokens compostos.
7. OpenAPI passou a declarar também rotas `/api/v1/*` principais.
8. Novo `npm run audit:routes` valida contrato de rotas, handlers físicos e presença mínima no OpenAPI.
9. Auditoria de versão ficou menos frágil: valida prefixo da versão do pacote, não um sufixo fixo antigo.

## Validações

```bash
npm run check
npm test
npm run audit:functions
npm run audit:free
npm run audit:version
npm run audit:routes
npm run smoke
npm run build
```

Resultado: todas as validações passaram.

## Resultado

A v21.5.13 mantém o projeto como proxy gratuito para GitHub/Vercel e melhora a previsibilidade operacional sem quebrar o núcleo `lib/Valorae-engine.js`.
