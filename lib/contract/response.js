export const VALORAE_CONTRACT_RESPONSE_VERSION = '21.5.13-mature-final-release-free';

const DANGEROUS_PATH_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function boolParam(v, fallback = false) {
  if (v === undefined || v === null || v === '') return fallback;
  return ['1','true','yes','sim','on'].includes(String(v).toLowerCase());
}

function parseFieldsDetailed(value) {
  const rawProvided = value !== undefined && value !== null && value !== '';
  if (!rawProvided) return { rawProvided: false, fields: [], invalid: [] };
  const raw = Array.isArray(value) ? value.join(',') : String(value);
  const tokens = raw.split(',').map(s => s.trim()).filter(Boolean);
  const fields = [];
  const invalid = [];
  for (const path of tokens) {
    const valid = path.split('.').every(part => part && !DANGEROUS_PATH_KEYS.has(part) && /^[A-Za-z0-9_$-]+$/.test(part));
    if (valid) fields.push(path);
    else invalid.push(path);
  }
  return { rawProvided: true, fields, invalid };
}

function parseFields(value) {
  return parseFieldsDetailed(value).fields;
}

function pickPath(source, path) {
  return String(path).split('.').reduce((acc, k) => acc == null ? undefined : acc[k], source);
}

function setPath(target, path, value) {
  if (value === undefined) return false;
  const parts = String(path).split('.');
  if (!parts.length || parts.some(p => DANGEROUS_PATH_KEYS.has(p))) return false;
  let cur = target;
  for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]] ||= {};
  cur[parts.at(-1)] = value;
  return true;
}

function pickFieldsDetailed(payload, fields) {
  if (!payload || typeof payload !== 'object' || !fields.length) return { value: payload, missing: [] };
  const out = {};
  const missing = [];
  for (const f of fields) {
    const value = pickPath(payload, f);
    if (value === undefined) missing.push(f);
    else setPath(out, f, value);
  }
  return { value: out, missing };
}

function pickFields(payload, fields) {
  return pickFieldsDetailed(payload, fields).value;
}

function fieldWarning(type, field, scope) {
  return { type, field, scope, message: type === 'invalid' ? `Campo ${field} é inválido ou perigoso e foi ignorado.` : `Campo ${field} não existe no payload selecionado.` };
}

function attachFieldWarnings(payload, warnings, scope = 'payload') {
  if (!warnings?.length) return payload;
  if (!payload || typeof payload !== 'object') return { value: payload, fieldWarnings: warnings };
  const out = Array.isArray(payload) ? { value: payload } : { ...payload };
  if (out.schemaVersion === 'envelope-v2') {
    out.meta = { ...(out.meta || {}), fieldWarnings: [...(out.meta?.fieldWarnings || []), ...warnings] };
    return out;
  }
  out.fieldWarnings = [...(out.fieldWarnings || []), ...warnings.map(w => ({ ...w, scope }))];
  return out;
}

function limitArrays(payload, maxItems = 80) {
  if (!payload || typeof payload !== 'object') return payload;
  if (Array.isArray(payload)) return payload.slice(0, maxItems).map(x => limitArrays(x, maxItems));
  const out = {};
  for (const [k, v] of Object.entries(payload)) out[k] = limitArrays(v, maxItems);
  return out;
}

function stripHeavy(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  if (Array.isArray(payload)) return payload.map(stripHeavy);
  const deny = new Set(['debug','rawHtml','html','sections','raw','text','dom','pageText']);
  const out = {};
  for (const [k, v] of Object.entries(payload)) {
    if (deny.has(k)) continue;
    out[k] = stripHeavy(v);
  }
  return out;
}

function wantsEnvelope(req = {}) {
  const q = req?.query || {};
  const path = String(req?.url || '');
  return boolParam(q.envelope, false) || q.apiVersion === 'v2' || path.includes('/api/v2/');
}

function wrapEnvelope(data, req = {}) {
  const generatedAt = data?.metrics?.generatedAt || data?.generatedAt || new Date().toISOString();
  return {
    ok: !(data && (data.status === 'ERROR' || data.error)),
    schemaVersion: 'envelope-v2',
    version: data?.version,
    requestId: data?.requestId,
    data,
    meta: {
      apiVersion: 'v2',
      generatedAt,
      payloadControls: {
        fields: req?.query?.fields || null,
        dataFields: req?.query?.dataFields || null,
        lean: boolParam(req?.query?.lean, false),
        maxItems: req?.query?.maxItems || req?.query?.limitItems || null,
      },
    },
  };
}

export function transformResponsePayload(payload, req = {}) {
  const q = req?.query || {};
  let transformed = payload;
  if (boolParam(q.lean, false)) transformed = stripHeavy(transformed);
  const maxItems = Number(q.maxItems || q.limitItems || 0);
  if (Number.isFinite(maxItems) && maxItems > 0) transformed = limitArrays(transformed, Math.max(1, Math.min(maxItems, 500)));

  const fieldSpec = parseFieldsDetailed(q.fields);
  const fieldWarnings = [
    ...fieldSpec.invalid.map(f => fieldWarning('invalid', f, 'fields'))
  ];
  if (fieldSpec.rawProvided) {
    if (fieldSpec.fields.length) {
      const picked = pickFieldsDetailed(transformed, fieldSpec.fields);
      transformed = picked.value;
      fieldWarnings.push(...picked.missing.map(f => fieldWarning('missing', f, 'fields')));
    } else {
      // Não devolver o payload completo quando o cliente pediu fields=... mas todos os campos eram inválidos.
      transformed = {};
    }
  }
  transformed = attachFieldWarnings(transformed, fieldWarnings, 'fields');

  if (wantsEnvelope(req)) transformed = wrapEnvelope(transformed, req);

  const dataFieldSpec = parseFieldsDetailed(q.dataFields);
  const dataFieldWarnings = [
    ...dataFieldSpec.invalid.map(f => fieldWarning('invalid', f, 'dataFields'))
  ];
  if (dataFieldSpec.rawProvided && transformed && typeof transformed === 'object' && transformed.data) {
    if (dataFieldSpec.fields.length) {
      const picked = pickFieldsDetailed(transformed.data, dataFieldSpec.fields);
      transformed = { ...transformed, data: picked.value };
      dataFieldWarnings.push(...picked.missing.map(f => fieldWarning('missing', f, 'dataFields')));
    } else {
      transformed = { ...transformed, data: {} };
    }
  }
  transformed = attachFieldWarnings(transformed, dataFieldWarnings, 'dataFields');
  return transformed;
}

export const _test = { parseFields, parseFieldsDetailed, pickFields, pickFieldsDetailed, limitArrays, stripHeavy, transformResponsePayload };
