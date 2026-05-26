import { ValoraeEngine } from '../lib/Valorae-engine.js';
import { sendJson } from '../lib/performance/http.js';
import { beginRoute } from '../lib/http/route.js';
import { VIEW_ALIASES, PROFILE_ALIASES, TTL_MATRIX } from '../lib/catalogs/valorae-catalogs.js';

const FIELD_CATALOG_VERSION = '21.5.13-mature-final-release-free';

const stableAssetFields = [
  { path: 'version', type: 'string', description: 'Versão do engine que gerou o payload.' },
  { path: 'schemaVersion', type: 'string', description: 'Versão lógica do schema de ativo, quando disponível.' },
  { path: 'status', type: 'string', description: 'OK, PARTIAL ou ERROR.' },
  { path: 'partial', type: 'boolean', description: 'Indica payload incompleto por fallback, bloqueio ou falta de fonte.' },
  { path: 'ticker', type: 'string', description: 'Ticker canônico.' },
  { path: 'type', type: 'string', description: 'Tipo inferido: ACAO, FII, ETF, BDR ou outro.' },
  { path: 'results', type: 'object', description: 'Dados brutos/estruturados por domínio: cotação, indicadores, dividendos e empresa/fundo.' },
  { path: 'normalized', type: 'object', description: 'Campos financeiros normalizados em display/value/unit/source/confidence.' },
  { path: 'parserResilience', type: 'object', description: 'Pontuação, avisos, campos críticos ausentes e campos suspeitos.' },
  { path: 'schemaStability', type: 'object', description: 'Chaves estáveis, presentes e ausentes no contrato asset-v1.' },
  { path: 'quality', type: 'object', description: 'Score de qualidade/cobertura de dados.' },
  { path: 'fieldConfidence', type: 'object', description: 'Confiança por campo extraído ou derivado.' },
  { path: 'valoraeScore', type: 'object', description: 'Score analítico derivado para comparação.' },
  { path: 'alerts', type: 'array', description: 'Alertas analíticos e de qualidade.' },
  { path: 'sourceReport', type: 'object', description: 'Fontes usadas/tentadas e fallback.' },
  { path: 'performance', type: 'object', description: 'Perfil, timing e política de execução.' }
];

const normalizedFields = [
  'precoAtual','variacaoDay','variacao12m','dividendYield','dyMedio5a','pvp','pl','roe','roic','roa','margemLiquida','margemEbitda','payout','valorPatrimonialCota','patrimonioLiquido','valorDeMercado','liquidezMediaDiaria','vacanciaFisica','yield1m','yield3m','yield6m','yield12m'
].map(path => ({ path: `normalized.${path}`, shape: 'FinancialField', fields: ['display','value','unit','source','confidence'] }));

const portfolioFields = [
  { path: 'portfolio.summary', description: 'Totais, rentabilidade, contagem e qualidade média.' },
  { path: 'portfolio.positions[].annualRatePercent', description: 'Taxa anual informada para renda fixa/caixa remunerado.' },
  { path: 'portfolio.positions[].liquidityDays', description: 'Liquidez declarada em dias para reserva, CDB, LCI/LCA, Tesouro etc.' },
  { path: 'portfolio.intelligence.incomeCalendar', description: 'Calendário estimado de renda mensal por eventos/projeção.' },
  { path: 'portfolio.intelligence.goalProjection', description: 'Projeção educativa por aporte mensal, retorno esperado e inflação.' },
  { path: 'portfolio.intelligence.taxPlanner', description: 'Checklist fiscal educativo por classe de ativo.' },
  { path: 'portfolio.intelligence.technologyReadiness', description: 'Score de prontidão para dashboards, apps e automações.' },
  { path: 'portfolio.intelligence.positionRanking', description: 'Ranking por posição com score, fatores, aderência à meta e ação sugerida.' },
  { path: 'portfolio.intelligence.portfolioNarrative', description: 'Narrativa em linguagem natural com pontos fortes, atenção e próximos passos.' },
  { path: 'portfolio.intelligence.passiveIncomeProjection', description: 'Projeção educativa de renda passiva com aportes futuros.' },
  { path: 'portfolio.intelligence.rebalanceRoadmap', description: 'Roteiro de aportes para rebalanceamento por metas.' },
  { path: 'portfolio.intelligence.concentrationMap', description: 'Concentração por ticker, classe, setor, emissor/conta, objetivo e tags.' },
  { path: 'scrape.sourceDrift', description: 'Detecção de mudança de fonte/seletores em /api/scrape e /api/batch-scrape.' },
  { path: 'cache.stats', description: 'Métricas em memória: entries, bytes, in-flight, hit/miss e driver free-only.' },
];

const queryControls = [
  { name: 'fields', example: 'ticker,type,status,normalized,quality.score', description: 'Recorta o payload final por caminhos separados por vírgula.' },
  { name: 'dataFields', example: 'ticker,normalized,parserResilience', description: 'Recorta o campo data quando o endpoint usa envelope.' },
  { name: 'lean', example: '1', description: 'Remove blocos pesados como debug, rawHtml, html e text.' },
  { name: 'maxItems', example: '20', description: 'Limita arrays em todo o payload para reduzir resposta em Web/APK.' },
  { name: 'view', example: 'instant|ultra|tiny|quote|card|wallet|detail|analysis|compact|standard|full', description: 'Controla o nível de detalhe antes do recorte por fields.' },
  { name: 'profile', example: 'instant|quote|card|wallet|analysis|fast|standard|deep|portfolio', description: 'Perfil de performance/completude.' }
];

export default async function handler(req, res) {
  const route = beginRoute(req, res, { version: ValoraeEngine.version, methods: ['GET'], route: 'fields', rateMax: Number(process.env.VALORAE_RATE_LIMIT_HEALTH_MAX || 180), profile: 'fields', cacheControl: TTL_MATRIX.staticCatalog.cacheControl });
  if (route.done) return;
  return sendJson(req, res, {
    version: ValoraeEngine.version,
    catalogVersion: FIELD_CATALOG_VERSION,
    requestId: route.requestId,
    endpoint: 'fields',
    freeOnly: true,
    stableAssetFields,
    normalizedFields,
    portfolioFields,
    queryControls,
    financialFieldShape: { display: 'string', value: 'number|null', unit: 'BRL|%|ratio|m2|number', source: 'string', confidence: '0..1' },
    viewAliases: VIEW_ALIASES,
    profileAliases: PROFILE_ALIASES,
    cacheTtlMatrix: TTL_MATRIX
  }, { status: 200, engineVersion: ValoraeEngine.version, profile: 'fields', cachePolicy: 'etag', cacheControl: TTL_MATRIX.staticCatalog.cacheControl });
}
