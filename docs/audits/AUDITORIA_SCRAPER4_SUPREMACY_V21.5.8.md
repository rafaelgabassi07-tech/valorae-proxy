# Valorae v21.5.13 — Scraper 4 Comparison + Portfolio Tech Supremacy

Esta versão compara o VALORAE com o arquivo `scraper (4).js` e corrige pontos fracos mantendo o projeto **free-only**, serverless e compatível com GitHub/Vercel gratuito.

## Pontos fortes observados no Scraper (4)

- Cache quente por modo e cache de resposta de scrape com limite de entradas/bytes.
- In-flight de-duplication para evitar chamadas duplicadas.
- Batch com fallback para chamadas individuais.
- Headers estáveis para coalescing/cache.
- Multi-selector em uma única chamada.
- Modos legados: `fundamentos`, `rankings`, `indices`, `ipca`, `proventos_carteira`, `historico_portfolio`, `historico_12m`, `proximo_provento`, `cotacao_historica`.
- Tratamento específico de carteira/proventos por `fiiList`.

## Correções aplicadas no VALORAE

1. Compatibilidade `/api/scraper` e `/api/compat/scraper4` reforçada.
2. `proventos_carteira` agora aceita `payload.fiiList`, `payload.tickers`, `payload.fiis` e retorna lista flat de proventos com `symbol`, `paymentDate`, `value` e `type`.
3. `historico_12m` agora segue o comportamento esperado do Scraper 4 para um ticker, retornando histórico de proventos em vez de tentar montar histórico de carteira.
4. Selectors customizados ganharam `extract: cells`, `extract: number`, `extract: percent`, `data-url`, `attr:*`, `outerHtml`, descendentes e `>`.
5. Carteira agora aceita renda fixa e caixa de forma explícita: `CDB`, `LCI`, `LCA`, `CRI`, `CRA`, `DEBENTURE`, `TESOURO_SELIC`, `TESOURO_IPCA`, `CASH`, `CAIXA`.
6. Posições de carteira aceitam `annualRatePercent`, `indexer`, `liquidityDays`, `maturityDate`, `issuer`, `taxExempt`, `objective`, `riskLevel` e `currency`.
7. Novo bloco `portfolio.intelligence` com calendário de renda, cobertura de pagadores, liquidez, projeção de objetivos, tax planner educativo, prontidão tecnológica e plano de ação.
8. OpenAPI, catálogo de campos, TypeScript SDK e testes foram atualizados.

## Resultado

O VALORAE passa a ser mais amplo que o Scraper 4: mantém compatibilidade de modos e velocidade, mas adiciona contrato v1/v2, envelope, SDKs, OpenAPI, auditorias, payload control, inteligência de carteira, normalização universal, qualidade/confiança e guardrails free-only.

## Validações

- `npm run verify`
- `javac -d /tmp/valorae_java_check_2158 public/sdk/android-java/ValoraeClient.java`

Ambos executados com sucesso na auditoria local.
