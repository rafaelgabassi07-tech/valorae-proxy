# Auditoria de Funcionamento — Valorae Proxy v20.8

Versão: `20.8.0-scraper-supremacy-audit`

## Objetivo

Auditar o código do Valorae Proxy para uso no GitHub/Vercel, corrigindo pontos que poderiam afetar funcionamento, segurança operacional, consistência de respostas e integração com Web/APK.

## Principais achados corrigidos

1. **Rotas com tratamento inconsistente de erro**  
   Algumas rotas podiam lançar exceções e deixar o Vercel responder HTML/500 genérico. Agora as rotas principais usam resposta JSON padronizada com `requestId`, `status`, `code` e `error`.

2. **Headers e CORS inconsistentes entre endpoints**  
   As rotas foram alinhadas para usar guard comum com CORS, `X-Request-Id`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-RateLimit-*` e `X-Valorae-Engine-Version`.

3. **`scrapeUrl` público podia redirecionar chamadas internas**  
   Agora o `scrapeUrl` enviado por clientes é ignorado por padrão. O proxy usa o próprio `/api/scrape` do mesmo deploy ou `VALORAE_SCRAPE_URL` definido no ambiente. Override público só funciona com `VALORAE_ALLOW_CLIENT_SCRAPE_URL=true` e validação de host/path.

4. **Rate limit e body limit não eram uniformes**  
   Foi adicionado `beginRoute()` para aplicar rate limit e limite de payload de maneira consistente nas rotas públicas, portfolio, watchlist, market, scrape, batch e sync.

5. **Métodos HTTP pouco rígidos**  
   Endpoints agora retornam erro JSON 405 para métodos indevidos, em vez de seguir fluxo inesperado.

6. **Validação de tickers em rotas auxiliares**  
   Comparação, ranking, portfolio dividends e watchlist agora validam tickers e retornam lista de erros de entrada quando necessário.

7. **`vercel.json` com CORS incompleto para admin/ETag**  
   O header global agora permite `Authorization`, `X-Valorae-Admin-Token`, `X-Request-Id` e `If-None-Match`.

8. **Token admin por query string**  
   Foi bloqueado por padrão para evitar exposição em histórico/logs. Só é aceito com `VALORAE_ADMIN_ALLOW_QUERY_TOKEN=true`.

9. **Endpoint sync opcional**  
   Sem Supabase configurado, `/api/sync` retorna status JSON `DISABLED` em vez de erro 500, mantendo o Proxy funcionando sem dependência externa.

## Arquivos principais adicionados/alterados

- `api/lib/http/route.js`
- `api/lib/security/guard.js`
- `api/asset.js`
- `api/assets.js`
- `api/scrape.js`
- `api/batch-scrape.js`
- `api/news.js`
- `api/compare.js`
- `api/asset/history.js`
- `api/asset/dividends.js`
- `api/asset/next-dividend.js`
- `api/market/indices.js`
- `api/market/ipca.js`
- `api/market/rankings.js`
- `api/portfolio/*.js`
- `api/watchlist/analyze.js`
- `api/index.js`
- `api/health.js`
- `api/openapi.js`
- `api/sync.js`
- `vercel.json`
- `test/routes-audit.test.js`

## Compatibilidade GitHub/Vercel

- Sem dependências obrigatórias novas.
- Sem Redis/KV/banco obrigatório.
- Sem filesystem persistente obrigatório.
- Sem WebSocket, worker permanente ou processo longo.
- Cache padrão continua em memória.
- Rotas continuam em `api/*.js` e subpastas compatíveis com Vercel.
- `vercel.json` permanece simples.

## Validação local executada

```bash
npm run check
npm test
npm run build
```

Resultados:

- `npm run check`: OK
- `npm test`: OK
- `npm run build`: OK

## Testes adicionados

`test/routes-audit.test.js` valida:

- `/api/health` retorna JSON, versão e headers de segurança.
- `/api/asset` com ticker ausente retorna erro JSON 400.
- `/api/compare` com apenas um ticker retorna erro JSON 400.
- `/api/scrape` sem URL retorna erro JSON 400.
- `/api/portfolio/transactions` via GET retorna JSON 405.
- `/api/sync` sem Supabase configurado retorna `DISABLED`.
- `scrapeUrl` externo malicioso é ignorado por padrão.

