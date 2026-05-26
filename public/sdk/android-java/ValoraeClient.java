package valorae;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;

public class ValoraeClient {
    private final String baseUrl;
    private final int connectTimeoutMs;
    private final int readTimeoutMs;

    public ValoraeClient(String baseUrl) {
        this(baseUrl, 10000, 15000);
    }

    public ValoraeClient(String baseUrl, int connectTimeoutMs, int readTimeoutMs) {
        this.baseUrl = baseUrl.replaceAll("/$", "");
        this.connectTimeoutMs = connectTimeoutMs;
        this.readTimeoutMs = readTimeoutMs;
    }

    private static String enc(String v) throws Exception {
        return URLEncoder.encode(v == null ? "" : v, "UTF-8");
    }

    private HttpURLConnection open(String path, String method) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(baseUrl + path).openConnection();
        c.setRequestMethod(method);
        c.setConnectTimeout(connectTimeoutMs);
        c.setReadTimeout(readTimeoutMs);
        c.setRequestProperty("Accept", "application/json");
        c.setRequestProperty("User-Agent", "ValoraeClient-AndroidJava/21.5.13");
        return c;
    }

    private String get(String path) throws Exception {
        return read(open(path, "GET"));
    }

    private String post(String path, String json) throws Exception {
        HttpURLConnection c = open(path, "POST");
        c.setDoOutput(true);
        c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        try (OutputStream os = c.getOutputStream()) {
            os.write((json == null ? "{}" : json).getBytes(StandardCharsets.UTF_8));
        }
        return read(c);
    }

    private String read(HttpURLConnection c) throws Exception {
        int code = c.getResponseCode();
        InputStream raw = code >= 400 ? c.getErrorStream() : c.getInputStream();
        if (raw == null) raw = new ByteArrayInputStream(new byte[0]);
        String body;
        try (InputStream in = raw; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) >= 0) out.write(buf, 0, n);
            body = out.toString("UTF-8");
        }
        if (code < 200 || code >= 300) {
            throw new IOException("Valorae HTTP " + code + (body.isEmpty() ? "" : ": " + body.substring(0, Math.min(180, body.length()))));
        }
        return body;
    }

    public String assetJson(String ticker, String view, String profile) throws Exception { return get("/api/v1/asset?ticker=" + enc(ticker) + "&view=" + enc(view) + "&profile=" + enc(profile)); }
    public String assetV2Json(String ticker, String dataFields) throws Exception { return get("/api/v2/asset?ticker=" + enc(ticker) + "&dataFields=" + enc(dataFields)); }
    public String assetsJson(String tickersCsv) throws Exception { return get("/api/v1/assets?tickers=" + enc(tickersCsv)); }
    public String compareJson(String tickersCsv) throws Exception { return get("/api/v1/compare?tickers=" + enc(tickersCsv)); }
    public String rankingsJson(String type) throws Exception { return get("/api/v1/market/rankings?type=" + enc(type == null ? "ACAO" : type)); }
    public String historyJson(String ticker, String range) throws Exception { return get("/api/v1/asset/history?ticker=" + enc(ticker) + "&range=" + enc(range == null ? "1Y" : range)); }
    public String dividendsJson(String ticker) throws Exception { return get("/api/v1/asset/dividends?ticker=" + enc(ticker)); }
    public String portfolioAnalyzeJson(String bodyJson) throws Exception { return post("/api/v1/portfolio/analyze", bodyJson); }
    public String readyJson() throws Exception { return get("/api/v1/ready"); }
    public String manifestJson() throws Exception { return get("/api/v1/manifest"); }
    public String envJson() throws Exception { return get("/api/v1/env"); }
    public String schemaJson() throws Exception { return get("/api/v1/schema"); }
    public String sourceStatusJson() throws Exception { return get("/api/v1/source/status"); }
    public String fieldsJson() throws Exception { return get("/api/v1/fields"); }
    public String errorsJson() throws Exception { return get("/api/v1/errors"); }
    public String cacheStatsJson() throws Exception { return get("/api/v1/cache/stats"); }
    public String openApiJson() throws Exception { return get("/api/v1/openapi"); }
}
