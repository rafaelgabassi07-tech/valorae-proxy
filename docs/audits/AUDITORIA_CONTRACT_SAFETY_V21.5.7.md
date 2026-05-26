# Auditoria v21.5.13 — Contract Safety Hardening Free

## Status

A v21.5.13 aplica a auditoria técnica da v21.5.6 e corrige pontos que ainda estavam documentados, mas não plenamente implementados.

## Correções aplicadas

1. Aliases reais de `view`:
   - `quote/card -> compact`
   - `wallet -> standard`
   - `detail/analysis -> full`
2. Aliases reais de `profile`:
   - `quote/card -> fast`
   - `wallet -> portfolio`
   - `analysis/complete -> deep`
   - `balanced -> standard`
3. Parser JSON sem `Function(...)` ou `eval(...)`.
4. `safeParseJson` usa apenas `JSON.parse`, `decodeHtml` e normalização JS-like segura.
5. Timers de fetch em Yahoo Chart e Google News limpos com `finally`.
6. Compare intelligence passa a priorizar `normalized.*.value`.
7. OpenAPI usa `components.schemas` e parâmetros em formato de objeto.
8. `.d.ts` corrigido para NodeNext com import `.js`.
9. `tsconfig.json` inclui `api`, `routes`, `lib` e SDK TypeScript.
10. Novo `npm run typecheck` e `npm run verify`.
11. SDK TypeScript tipado com `EnvelopeV2<T>`, `ValoraeAssetPayload`, `ValoraeFinancialField`, views e profiles.
12. SDK Android Java com timeouts, tratamento de erro HTTP e `getErrorStream()` nulo.
13. ETag menos volátil, ignorando `requestId`, `generatedAt` e `checkedAt` no hash.
14. `/api/sync` passa a retornar HTTP 410 como legado desativado free-only.
15. `/api/errors` cobre `SYNC_DISABLED_FREE_ONLY`, `ROUTE_NOT_FOUND`, `INVALID_VIEW`, `INVALID_PROFILE`, `INVALID_FIELDS` e erros de scrape/fonte.
16. `/api/fields` expõe aliases de view/profile.
17. `audit:free` bloqueia `Function(...)`, `eval(...)` e tecnologias complexas.
18. `audit:routes` valida presença de `components.schemas` e evita referências OpenAPI legadas `#/schemas/*`.
19. README, CHANGELOG, API_CONTRACT, MIGRATION_GUIDE, DEPLOY_VERCEL_FREE e WEB_TYPESCRIPT_GUIDE atualizados.
20. Teste comportamental `test/v21-5-7-contract-safety-hardening.test.js` adicionado.

## Validações executadas

```bash
npm run verify
javac -d /tmp/valorae_java_check public/sdk/android-java/ValoraeClient.java
```

Resultado:

- `npm run check`: OK, 80 arquivos JS verificados.
- `npm test`: OK, todos os testes passaram.
- `npm run typecheck`: OK.
- `npm run audit:functions`: OK, 2 Functions físicas.
- `npm run audit:free`: OK, sem Redis/KV/banco/storage/WebSocket/import complexo.
- `npm run audit:version`: OK, versão 21.5.13.
- `npm run audit:routes`: OK, 32 rotas internas.
- `npm run smoke`: OK.
- `npm run build`: OK.
- `javac`: OK, com nota de API Java deprecatada padrão para `HttpURLConnection`, sem erro de compilação.

## Observações

- A validação não executa chamadas reais contra fontes externas em produção; Yahoo, Investidor10 e Google News dependem de rede, bloqueios e disponibilidade.
- O projeto continua sem dependências obrigatórias no `package.json`.
- O núcleo `lib/Valorae-engine.js` permanece como arquivo central, com módulos auxiliares ao redor.
