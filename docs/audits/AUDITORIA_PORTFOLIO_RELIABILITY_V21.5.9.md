# Valorae v21.5.13 — Portfolio Intelligence & Source Reliability

Esta versão aplica as melhorias solicitadas exceto a sugestão nº 4 de renda fixa avançada. O projeto permanece free-only, sem dependências obrigatórias, sem Redis/KV, sem banco/storage externo, sem cron pago, sem WebSocket e com apenas duas Functions físicas para GitHub/Vercel gratuito.

## Melhorias realizadas

1. **Fixtures reais/leves de fonte**
   - `test/fixtures/source/investidor10-fii-sample.html`
   - `test/fixtures/source/yahoo-chart-sample.json`
   - `test/fixtures/source/google-news-sample.xml`
   - Novo teste `test/v21-5-9-source-reliability-portfolio.test.js` valida parser sem depender da internet.

2. **Source drift detection**
   - Novo módulo `lib/resilience/source-drift.js`.
   - `/api/scrape` e `/api/batch-scrape` retornam `sourceDrift` quando seletores esperados deixam de bater.
   - `parserResilience` passa a incluir relatório de drift para payloads de ativo.

3. **Carteira mais completa**
   - Nova concentração por emissor/conta, indexador, objetivo e tags.
   - Projeção educativa de renda passiva com aportes futuros.
   - Roteiro de rebalanceamento por aporte.
   - Progresso por meta de patrimônio e renda mensal.
   - Narrativa em linguagem natural para pontos fortes, atenção e próximos passos.

4. **Ranking de carteira**
   - `portfolio.intelligence.positionRanking` com score por posição.
   - Fatores: qualidade, renda, risco, liquidez, aderência à meta e diversificação.

5. **Explicações em linguagem natural**
   - `portfolio.intelligence.portfolioNarrative` resume força, atenção e próximos passos.

6. **Cache metrics**
   - Nova rota `/api/v1/cache/stats`.
   - Métricas de entries, bytes, in-flight, hit/miss, stale hits, evictions e driver free-only.

7. **Auditoria de parser**
   - Testes verificam `data-url`, `src`, `table tbody tr`, `cells`, source drift e modo instant.

8. **OpenAPI ampliado**
   - Adicionada rota `/api/v1/cache/stats`.
   - Schemas expandidos para `SourceDriftReport`, `CacheStats` e blocos novos de carteira.

9. **Modo ultra-fast**
   - Novo `profile=instant` / `profile=ultra`.
   - Reduz timeout, HTML máximo, evita APIs internas e prioriza cache/Yahoo/seletores leves.

## Correções adicionais

- `cacheDriver` agora reporta sempre `memory` para não sugerir driver externo.
- Métricas de cache de ativo e mercado agora têm hit/miss/stale/sets/evictions/in-flight joins.
- SDK TypeScript e SDK Java ganharam método para cache stats.
- Catálogo de erros inclui `SOURCE_DRIFT_DETECTED`.

## Validação

Comandos executados:

```bash
npm run verify
javac -d /tmp/valorae_java_check_2159 public/sdk/android-java/ValoraeClient.java
```

Resultado: sintaxe, testes, typecheck, auditorias, smoke, build e SDK Java passaram.
