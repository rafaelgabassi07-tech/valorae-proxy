# Valorae v20.2 — Market & History Intelligence Engine

Esta versão transforma o projeto em uma plataforma de dados financeiros, incorporando os pontos fortes do Scraper (4).js e adicionando camadas que o Scraper não tinha: confiança por campo, Valorae Score, circuit breaker, views de resposta, batch com estatísticas e endpoints de mercado.

## Novos endpoints

- `/api/asset/history?ticker=PETR4&range=1Y`
- `/api/asset/dividends?ticker=PETR4`
- `/api/asset/next-dividend?ticker=PETR4`
- `/api/portfolio/dividends?tickers=PETR4,GARE11`
- `/api/market/indices`
- `/api/market/ipca`
- `/api/market/rankings?type=ACAO`
- `/api/market/rankings?type=FII`
- `/api/compare?tickers=PETR4,VALE3,PRIO3`

## Views

- `view=compact`: cards, listas e rankings.
- `view=standard`: tela principal do ativo.
- `view=full`: auditoria completa, histórico, fontes, métricas, qualidade e debug.

## Inteligência

Cada ativo agora pode trazer:

- `fieldConfidence`: confiança por campo.
- `valoraeScore`: score proprietário do Valorae.
- `quality`: qualidade global do JSON.
- `validation`: schema e campos suspeitos.
- `sourceReport`: fontes usadas e tentadas.

## Resiliência

- Circuit breaker por fonte: Investidor10, StatusInvest, YahooChart, GoogleNews, BancoCentral.
- Cache com chave versionada.
- Bypass por `nocache=1`.
- Batch com estatísticas de sucesso, parciais, falhas, cache hits e qualidade média.
