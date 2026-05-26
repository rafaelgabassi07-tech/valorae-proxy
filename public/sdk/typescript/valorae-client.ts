export type ValoraeQuery = Record<string, string | number | boolean | undefined | null>;
export type ValoraeAssetType = 'ACAO' | 'FII' | 'ETF' | 'BDR' | string;
export type ValoraeView = 'instant' | 'ultra' | 'tiny' | 'quote' | 'card' | 'wallet' | 'detail' | 'analysis' | 'compact' | 'standard' | 'full';
export type ValoraeProfile = 'instant' | 'ultra' | 'tiny' | 'quote' | 'card' | 'wallet' | 'analysis' | 'fast' | 'standard' | 'deep' | 'portfolio';

export interface ValoraeFinancialField {
  display?: string;
  value?: number | null;
  unit?: string;
  source?: string;
  confidence?: number;
}

export interface ValoraeAssetPayload {
  version: string;
  schemaVersion?: string;
  status?: 'OK' | 'PARTIAL' | 'ERROR' | string;
  partial?: boolean;
  ticker: string;
  type: ValoraeAssetType;
  view?: string;
  requestedView?: string;
  results?: Record<string, unknown>;
  normalized?: Record<string, ValoraeFinancialField | unknown>;
  parserResilience?: Record<string, unknown>;
  schemaStability?: Record<string, unknown>;
  quality?: Record<string, unknown>;
  dataQualityMatrix?: Record<string, unknown>;
  sourceReliability?: Array<Record<string, unknown>>;
  errors?: unknown[];
}

export interface EnvelopeV2<T> {
  ok: boolean;
  schemaVersion: 'envelope-v2';
  version?: string;
  requestId?: string;
  data: T;
  meta: Record<string, unknown>;
}

export interface PortfolioPosition {
  ticker: string;
  quantity?: number;
  averagePrice?: number;
  currentPrice?: number;
  currentValue?: number;
  investedValue?: number;
  targetPercent?: number;
  type?: 'ACAO' | 'FII' | 'ETF' | 'BDR' | 'CASH' | 'RENDA_FIXA' | string;
  annualRatePercent?: number;
  indexer?: string;
  liquidityDays?: number;
  maturityDate?: string;
  issuer?: string;
  currency?: string;
  riskLevel?: string;
  taxExempt?: boolean;
  objective?: string;
  account?: string;
  tags?: string[];
}

export interface PortfolioIntelligence {
  healthScore?: Record<string, unknown>;
  incomeCalendar?: Record<string, unknown>;
  incomeCoverage?: Record<string, unknown>;
  incomeStabilityScore?: Record<string, unknown>;
  dividendCoverage?: Record<string, unknown>;
  liquidity?: Array<Record<string, unknown>>;
  goalProjection?: Record<string, unknown>;
  dataCompleteness?: Record<string, unknown>;
  taxPlanner?: Record<string, unknown>;
  technologyReadiness?: Record<string, unknown>;
  concentrationMap?: Record<string, unknown>;
  positionRanking?: Record<string, unknown>;
  passiveIncomeProjection?: Record<string, unknown>;
  rebalanceRoadmap?: Record<string, unknown>;
  objectiveProgress?: Record<string, unknown>;
  portfolioNarrative?: Record<string, unknown>;
  actionPlan?: Array<Record<string, unknown>>;
}

export interface ValoraeClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class ValoraeHttpError extends Error {
  constructor(public status: number, public bodyText: string) {
    super(`Valorae HTTP ${status}${bodyText ? `: ${bodyText.slice(0, 160)}` : ''}`);
    this.name = 'ValoraeHttpError';
  }
}

export class ValoraeClient {
  private baseUrl: string;
  private timeoutMs: number;
  private fetchImpl: typeof fetch;

  constructor(options: string | ValoraeClientOptions = '') {
    if (typeof options === 'string') options = { baseUrl: options };
    this.baseUrl = options.baseUrl || '';
    this.timeoutMs = options.timeoutMs ?? 15000;
    this.fetchImpl = options.fetchImpl || fetch;
  }

  private qs(query: ValoraeQuery = {}) {
    const p = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p.set(k, String(v)); });
    const s = p.toString();
    return s ? `?${s}` : '';
  }

  private async request<T>(path: string, init: RequestInit = {}, query?: ValoraeQuery): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}${path}${this.qs(query)}`, { ...init, signal: controller.signal });
      const text = await res.text();
      if (!res.ok) throw new ValoraeHttpError(res.status, text);
      return text ? JSON.parse(text) as T : (null as T);
    } finally {
      clearTimeout(timer);
    }
  }

  private get<T>(path: string, query?: ValoraeQuery) { return this.request<T>(path, {}, query); }
  private post<T>(path: string, body: unknown, query?: ValoraeQuery) {
    return this.request<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, query);
  }

  asset(ticker: string, query: ValoraeQuery & { view?: ValoraeView; profile?: ValoraeProfile } = {}) { return this.get<ValoraeAssetPayload>('/api/v1/asset', { ticker, ...query }); }
  assetV2(ticker: string, query: ValoraeQuery & { view?: ValoraeView; profile?: ValoraeProfile } = {}) { return this.get<EnvelopeV2<ValoraeAssetPayload>>('/api/v2/asset', { ticker, ...query }); }
  assets(tickers: string[] | string, query: ValoraeQuery = {}) { return this.get<{ assets: ValoraeAssetPayload[]; errors: unknown[] }>('/api/v1/assets', { tickers: Array.isArray(tickers) ? tickers.join(',') : tickers, ...query }); }
  compare(tickers: string[] | string, query: ValoraeQuery = {}) { return this.get<Record<string, unknown>>('/api/v1/compare', { tickers: Array.isArray(tickers) ? tickers.join(',') : tickers, ...query }); }
  rankings(type = 'ACAO', query: ValoraeQuery = {}) { return this.get<Record<string, unknown>>('/api/v1/market/rankings', { type, ...query }); }
  history(ticker: string, range = '1Y') { return this.get<Record<string, unknown>>('/api/v1/asset/history', { ticker, range }); }
  dividends(ticker: string) { return this.get<Record<string, unknown>>('/api/v1/asset/dividends', { ticker }); }
  portfolioAnalyze(body: { positions?: PortfolioPosition[]; monthlyContribution?: number; projectionYears?: number; expectedReturnAnnualPercent?: number; [key: string]: unknown }, query: ValoraeQuery = {}) { return this.post<Record<string, unknown> & { intelligence?: PortfolioIntelligence }>('/api/v1/portfolio/analyze', body, query); }
  portfolioIncome(body: { positions?: PortfolioPosition[]; [key: string]: unknown }, query: ValoraeQuery = {}) { return this.post<Record<string, unknown>>('/api/v1/portfolio/income', body, query); }
  portfolioRisk(body: { positions?: PortfolioPosition[]; [key: string]: unknown }, query: ValoraeQuery = {}) { return this.post<Record<string, unknown>>('/api/v1/portfolio/risk', body, query); }
  ready() { return this.get<Record<string, unknown>>('/api/v1/ready'); }
  manifest() { return this.get<Record<string, unknown>>('/api/v1/manifest'); }
  env() { return this.get<Record<string, unknown>>('/api/v1/env'); }
  schema() { return this.get<Record<string, unknown>>('/api/v1/schema'); }
  sourceStatus() { return this.get<Record<string, unknown>>('/api/v1/source/status'); }
  fields() { return this.get<Record<string, unknown>>('/api/v1/fields'); }
  errors() { return this.get<Record<string, unknown>>('/api/v1/errors'); }
  cacheStats() { return this.get<Record<string, unknown>>('/api/v1/cache/stats'); }
  openapi() { return this.get<Record<string, unknown>>('/api/v1/openapi'); }
}
