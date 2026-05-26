import type { ValoraeAssetPayload, ValoraeAssetType, ValoraeFetchOptions } from './engine/Valorae-engine-types.js';

export declare const VALORAE_ENGINE_VERSION: string;
export declare function canonicalizeTicker(ticker: string): string;
export declare function inferAssetType(ticker: string): ValoraeAssetType;
export declare function validarTicker(ticker: string): string | null;
export declare class ValoraeEngine {
  static version: string;
  static fetchAtivo(ticker: string, type?: ValoraeAssetType, options?: ValoraeFetchOptions): Promise<ValoraeAssetPayload>;
  static fetchAtivosBatch(tickers: string[], options?: ValoraeFetchOptions): Promise<{ version: string; assets: ValoraeAssetPayload[]; errors: unknown[]; stats: Record<string, unknown> }>;
  static clearCaches(scope?: string): Record<string, unknown>;
}
