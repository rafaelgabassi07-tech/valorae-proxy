# Valorae v21.5.13 — Auditoria de Correções Free

Auditoria realizada sobre o pacote v21.5.3 com foco em correções defensivas, previsibilidade do proxy GitHub/Vercel gratuito e compatibilidade com o scraper de referência.

## Pontos encontrados

1. O projeto já mantinha 2 Functions físicas e passava nos testes v21.5.3.
2. O CORS funcionava, mas não tinha allowlist multi-origem com reflexão segura e `Vary: Origin`.
3. O router dependia demais de `req.query`; em alguns ambientes de teste/adaptadores, querystring só existe em `req.url`.
4. Respostas `HEAD` não eram aceitas para rotas `GET`, embora sejam úteis para ETag/health checks leves.
5. `sendJson` calculava ETag, mas não informava `Content-Length` e não tinha fast-path específico para `HEAD`.
6. Seletores customizados suportavam descendência simples, mas ainda falhavam em casos comuns do HTML real: `>` combinator, atributos sem aspas e classes sem aspas.
7. A assinatura de deduplicação de batch não diferenciava `includeHtml` definido por job.
8. Não existia auditoria automática de consistência de versão entre `package.json`, engine e superfícies públicas.

## Correções aplicadas

- CORS com `VALORAE_CORS_ALLOW_ORIGINS` / `CORS_ALLOW_ORIGINS`, reflexão apenas para origens permitidas e `Vary: Origin`.
- Router agora mescla `URLSearchParams` de `req.url` com `req.query`, preservando compatibilidade Vercel e testes locais.
- Rotas `GET` aceitam `HEAD` automaticamente.
- `sendJson` define `Content-Length` e encerra `HEAD` sem body.
- Selectors agora aceitam `section > div.card > a[href*=/acoes/]`, atributos sem aspas, `class=card`, `id=main` e `outerHtml`.
- Batch scrape considera `includeHtml` por job na assinatura de deduplicação e na resposta.
- Novo `scripts/audit-version-consistency.js` e script `npm run audit:version`.
- Novo teste `test/v21-5-4-audit-corrections.test.js`.

## Compatibilidade free-only

Permanece sem Redis, Vercel KV, banco obrigatório, storage externo, cron pago, WebSocket, worker permanente ou dependência paga. A consolidação de Functions continua limitada a `api/index.js` e `api/[...path].js`.

## Validação executada

```bash
npm run check
npm test
npm run audit:functions
npm run audit:free
npm run audit:version
npm run smoke
npm run build
```

Todos os comandos passaram.
