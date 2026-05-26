# Valorae v20.3 — Investment Portfolio Intelligence Engine

Esta versão transforma o Valorae em uma API mais completa para carteira de investimentos, além de continuar servindo dados de ativos, mercado, comparação e histórico.

## Novos recursos

- Análise consolidada de carteira.
- Alocação por ticker, classe, setor e conta/corretora.
- Rentabilidade não realizada por posição e total.
- Renda passiva estimada mensal/anual.
- Yield on cost e yield sobre valor atual.
- Calendário de eventos/proventos baseado no histórico dos ativos.
- Concentração top 1/top 3 e HHI.
- Score de risco e diversificação.
- Portfolio Score proprietário.
- Rebalanceamento por classe ou ticker.
- Watchlist com score, alertas e qualidade.
- Resumo de transações.
- OpenAPI simplificado em `/api/openapi`.

## Endpoint principal

```http
POST /api/portfolio/analyze
```

Payload recomendado:

```json
{
  "view": "full",
  "positions": [
    { "ticker": "PETR4", "quantity": 100, "averagePrice": 32.10, "targetPercent": 35, "account": "Corretora A" },
    { "ticker": "GARE11", "quantity": 200, "averagePrice": 8.50, "targetPercent": 25, "account": "Corretora A" }
  ],
  "targetsByType": { "ACOES": 50, "FIIS": 35, "ETFS": 10, "CAIXA": 5 },
  "cashAvailable": 1000
}
```

Também funciona por GET para testes rápidos:

```http
/api/portfolio/analyze?tickers=PETR4,GARE11&quantities=100,200&avgPrices=32.10,8.50&view=compact
```

## Endpoints derivados

```http
/api/portfolio/summary
/api/portfolio/allocation
/api/portfolio/income
/api/portfolio/risk
/api/portfolio/rebalance
/api/portfolio/events
/api/portfolio/transactions
/api/watchlist/analyze?tickers=PETR4,GARE11,VALE3
/api/openapi
```

## Views

- `view=compact`: resumo para tela inicial/lista.
- `view=standard`: carteira com posições, score, renda e eventos reduzidos.
- `view=full`: diagnóstico completo com rebalanceamento, eventos, insights e métricas.

## Campos principais de resposta

- `summary`: valor investido, valor atual, lucro/prejuízo não realizado, contagem de ativos e qualidade média.
- `positions`: posição enriquecida com preço, valor atual, resultado, DY, renda estimada, setor, segmento e flags.
- `allocation`: distribuição por ticker, tipo, setor e conta.
- `income`: renda estimada mensal/anual, yield sobre custo e yield sobre valor atual.
- `risk`: concentração, HHI, score de risco e flags.
- `rebalance`: ações estimadas de compra/redução/manutenção.
- `events`: proventos/eventos por posição.
- `portfolioScore`: nota proprietária da carteira.
- `insights`: alertas e pontos positivos.

## Observação sobre impostos

O endpoint `/api/portfolio/transactions` faz apenas resumo operacional bruto. Ele não calcula imposto devido e não substitui controle fiscal oficial.
