import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { enrichAssetResults, buildSchemaValidation, buildSourceReport, augmentQualityReport } from '../lib/quality/schema.js';
import { buildFieldConfidence } from '../lib/quality/confidence.js';
import { buildValoraeScore } from '../lib/quality/valorae-score.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));

function prepare(payload) {
  payload.results = enrichAssetResults(payload.ticker, payload.type, payload.results);
  payload.validation = buildSchemaValidation(payload);
  payload.sourceReport = buildSourceReport(payload);
  payload.quality = augmentQualityReport(payload);
  payload.fieldConfidence = buildFieldConfidence(payload);
  payload.valoraeScore = buildValoraeScore(payload);
  return payload;
}

const gare = prepare(fixture('GARE11_golden.json'));
assert.equal(gare.validation.ok, true, JSON.stringify(gare.validation, null, 2));
assert.equal(gare.results.dividendYield, '11,97%');
assert.equal(gare.results.numeroCotistas > 500000, true);
assert.equal(gare.results.portfolioStats.quantidadeImoveis, 2);
assert.equal(gare.results.portfolioStats.ablTotalM2, 82463);
assert.equal(gare.quality.score >= 85, true);
assert.equal(gare.fieldConfidence.dividendYield.validated, true);
assert.equal(gare.valoraeScore.value >= 60, true);

const petr = prepare(fixture('PETR4_golden.json'));
assert.equal(petr.validation.ok, true, JSON.stringify(petr.validation, null, 2));
assert.equal(petr.results.indicadores.margemLiquida, '21,60%');
assert.equal(petr.results.indicadores.pCapGiro, -11.5);
assert.equal(petr.results.financialSummary.dividaLiquidaPatrimonioCalculada, 0.73);
assert.equal(petr.results.cotacao.precoAtual, 43.4);
assert.equal(petr.quality.score >= 85, true);
assert.equal(petr.fieldConfidence.margemLiquida.validated, true);
assert.equal(petr.valoraeScore.value >= 60, true);

console.log('Golden tests OK: GARE11 e PETR4 passaram no contrato atual.');
