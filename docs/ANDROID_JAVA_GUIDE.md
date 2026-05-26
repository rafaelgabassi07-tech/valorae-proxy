# Android Java Guide — Valorae v21.5.13

O cliente Java puro fica em:

```text
public/sdk/android-java/ValoraeClient.java
```

Ele usa apenas APIs padrão do Java/Android:

- `HttpURLConnection`
- timeouts configuráveis
- tratamento de erro HTTP
- fechamento seguro de streams

Exemplo:

```java
ValoraeClient client = new ValoraeClient("https://seu-deploy.vercel.app");
String ready = client.readyJson();
String manifest = client.manifestJson();
String petr4 = client.assetJson("PETR4", "quote", "quote");
String carteira = client.portfolioAnalyzeJson("{\"positions\":[{\"ticker\":\"PETR4\",\"quantity\":10,\"averagePrice\":32}]}");
```

## Rotas úteis

- `readyJson()`
- `manifestJson()`
- `assetJson()`
- `assetV2Json()`
- `assetsJson()`
- `compareJson()`
- `rankingsJson()`
- `portfolioAnalyzeJson()`
- `cacheStatsJson()`
- `openApiJson()`
