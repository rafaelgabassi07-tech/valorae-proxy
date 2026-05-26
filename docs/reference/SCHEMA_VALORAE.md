# Schema Valorae v20.2

Versão do schema: `2026-05-26-v20.2`.

## Campos de topo

```json
{
  "schemaVersion": "2026-05-26-v20.2",
  "version": "20.2.0-market-history-intelligence",
  "status": "OK",
  "partial": false,
  "ticker": "PETR4",
  "type": "ACAO",
  "mode": "super",
  "results": {},
  "coverage": {},
  "validation": {},
  "sourceReport": {},
  "quality": {},
  "metrics": {}
}
```

## `validation`

`validation` indica se os campos essenciais do tipo de ativo foram encontrados e se algum campo parece contaminado por menu, checklist ou texto genérico.

```json
{
  "schemaVersion": "2026-05-26-v20.2",
  "ok": true,
  "type": "FII",
  "fieldsChecked": 8,
  "required": [],
  "missing": [],
  "suspicious": [],
  "errors": []
}
```

## `quality`

`quality` combina cobertura, validação, suspeitas e fontes usadas.

```json
{
  "score": 94,
  "grade": "A",
  "confidence": 0.94,
  "missing": [],
  "suspect": [],
  "sourcesUsed": ["ValoraeScrape", "Investidor10HTML", "Investidor10InternalAPIs", "YahooChart"],
  "summary": "Qualidade 94/100; schema essencial atendido."
}
```

## FII: enriquecimento derivado

Quando houver `sections.listaImoveis`, o motor adiciona:

```json
"portfolioStats": {
  "quantidadeImoveis": 36,
  "quantidadeEstados": 10,
  "ablTotalM2": 430000,
  "ablMediaM2": 11944.44,
  "estados": [],
  "topEstado": {},
  "maioresImoveis": [],
  "concentracaoMaiorEstadoPct": 42.1
}
```

## Ação: enriquecimento derivado

Quando houver `informacoesEmpresa`, o motor adiciona:

```json
"financialSummary": {
  "valorDeMercado": 599410206000,
  "valorDeFirma": 923501206000,
  "dividaLiquida": 324091000000,
  "patrimonioLiquido": 445189000000,
  "dividaLiquidaPatrimonioCalculada": 0.73,
  "evSobreMarketCap": 1.54,
  "ratiosChave": {}
}
```

## Debug

Use `debug=1` somente em desenvolvimento. O debug não inclui HTML bruto por padrão.


## v20.2 additions

Campos novos: `fieldConfidence`, `valoraeScore`, `view`, endpoints de mercado/histórico e suporte a `view=compact|standard|full`.
