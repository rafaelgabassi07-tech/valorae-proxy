# Auditoria comparativa Scraper (4) → Valorae v21.5.13

Esta rodada comparou o Valorae v21.5.2 contra o arquivo `scraper (4).js`, usado como referência de robustez operacional para scraping em Vercel.

## Pontos fracos encontrados

1. **Seletores customizados limitados**: o Valorae aceitava seletores simples como `h1`, `.price` e `a[href*=...]`, mas não resolvia bem seletores descendentes do tipo `table tbody tr`, `table tbody tr td` ou `div.card a[href*=...]`, usados pelo Scraper (4).
2. **Extração de atributos incompleta para compatibilidade**: `href` e `src` existiam, mas `data-url` e `attr:*` em seletores descendentes eram frágeis.
3. **Batch sem deduplicação explícita por assinatura**: jobs repetidos na mesma chamada podiam depender apenas do cache interno, sem retorno transparente de `uniqueCount`/`dedupedCount`.
4. **Alias legado do endpoint Scraper**: havia `/api/scraper4`, mas não `/api/scraper` como alias de compatibilidade mais natural.

## Melhorias aplicadas

- `lib/scrape/custom-selectors.js` ganhou suporte a seletores descendentes simples, extração de linhas de tabela, `data-url`, `attr:*`, `row/cells`, deduplicação de fragmentos e warnings determinísticos.
- `routes/batch-scrape.js` ganhou deduplicação intra-request por URL/provider/selectors/includeHtml/cache, com `uniqueCount`, `dedupedCount` e `dedupedFrom`.
- `routes/_router.js` ganhou alias `/api/scraper` → `/api/compat/scraper4`.
- Novo teste `test/v21-5-3-scraper-compat-hardening.test.js` cobre `table tbody tr`, `table tbody tr td`, `data-url` e deduplicação batch.

## Free-only

Nada foi adicionado que dependa de Redis, Vercel KV, banco, storage externo, cron pago, WebSocket, worker permanente ou serviço pago obrigatório.
