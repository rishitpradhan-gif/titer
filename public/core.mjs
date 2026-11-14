export const VERSION = 'titer-engine/1.0.0';
export const MAX_RECORDS = 500;
export const MAX_BYTES = 524288;
export const CONTEXT = ['target', 'organism', 'system', 'protocol', 'temperature_C', 'pH', 'incubation_min', 'substrate_nM', 'enzyme_nM'];
export const FIELDS = ['id', 'compound', 'endpoint', 'relation', 'value', 'unit', 'mw_g_mol', ...CONTEXT, 'source'];
const endpoints = new Map([['ic50', 'IC50'], ['ec50', 'EC50'], ['ki', 'Ki'], ['kd', 'Kd']]);
const molarUnits = new Map([['M', 1], ['mM', 1e-3], ['uM', 1e-6], ['nM', 1e-9], ['pM', 1e-12]]);
const massUnits = new Map([['g/L', 1], ['mg/mL', 1], ['ug/mL', 1e-3], ['mg/L', 1e-3], ['ng/mL', 1e-6]]);
const invert = {'=': '=', '>': '<', '>=': '<=', '<': '>', '<=': '>='};
const numericContext = new Set(['temperature_C', 'pH', 'incubation_min', 'substrate_nM', 'enzyme_nM']);
const text = v => v == null ? '' : String(v).trim();
const number = v => /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(text(v)) ? Number(v) : NaN;

// Strict CSV reader. Quoted commas, escaped quotes and multiline fields are retained.
export function parseCSV(input) {
  if (typeof input !== 'string' || new TextEncoder().encode(input).length > MAX_BYTES) throw Error('CSV must be at most 512 KiB.');
  const s = input.replace(/^\uFEFF/, '');
  const rows = []; let row = [], field = '', quoted = false, closed = false;
  const pushField = () => { row.push(field); field = ''; closed = false; };
  const pushRow = () => { pushField(); if (row.some(v => v !== '')) rows.push(row); row = []; if (rows.length > MAX_RECORDS + 1) throw Error('Maximum 500 records.'); };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } }
      else field += c;
    } else if (c === ',') pushField();
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; pushRow(); }
    else if (closed) throw Error('Unexpected text after a closing CSV quote.');
    else if (c === '"') { if (field) throw Error('Unexpected quote in an unquoted CSV field.'); quoted = true; }
    else field += c;
  }
  if (quoted) throw Error('Unclosed CSV quote.');
  if (field || row.length || closed) pushRow();
  const headers = rows.shift()?.map(v => v.trim());
  if (!headers || new Set(headers).size !== headers.length || headers.some(h => !h || h === '__proto__' || h === 'constructor' || h === 'prototype')) throw Error('CSV headers must be unique, nonempty, safe names.');
  for (const h of ['id', 'compound', 'endpoint', 'value', 'unit']) if (!headers.includes(h)) throw Error(`Missing CSV column: ${h}`);
  if (headers.length > 40) throw Error('Maximum 40 columns.');
  return rows.map((r, i) => { if (r.length !== headers.length) throw Error(`Record ${i + 1} has ${r.length} fields; expected ${headers.length}.`); return Object.fromEntries(headers.map((h, j) => [h, r[j]])); });
}

function normalize(record, index) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw Error(`Record ${index + 1} must be an object.`);
  if (Object.keys(record).length > 40 || Object.values(record).some(v => !['string', 'number'].includes(typeof v) || String(v).length > 2000)) throw Error(`Record ${index + 1} fields must be strings or numbers of at most 2,000 characters.`);
  const original = Object.fromEntries(Object.entries(record));
  const row = Object.fromEntries(FIELDS.map(k => [k, text(record[k])]));
  const errors = [], warnings = [];
  for (const k of ['id', 'compound', 'endpoint', 'value', 'unit']) if (!row[k]) errors.push(`Missing ${k}`);
  row.endpoint = endpoints.get(row.endpoint.toLowerCase()) || row.endpoint;
  if (!['IC50', 'EC50', 'Ki', 'Kd'].includes(row.endpoint)) errors.push('Supported endpoints: IC50, EC50, Ki, Kd');
  row.relation ||= '=';
  row.relation = row.relation.replace('≤', '<=').replace('≥', '>=');
  if (!Object.hasOwn(invert, row.relation)) errors.push('Relation must be =, <, <=, >, or >=');
  const value = number(row.value);
  if (!Number.isFinite(value) || value <= 0) errors.push('Value must be a finite positive number');
  const unit = row.unit.replace(/[µμ]/g, 'u');
  let factor = molarUnits.get(unit), conversion = 'molar unit scaling';
  if (massUnits.has(unit)) {
    const mw = number(row.mw_g_mol);
    if (!Number.isFinite(mw) || mw <= 0) errors.push('Mass concentration requires positive mw_g_mol for the measured species');
    else factor = massUnits.get(unit) / mw;
    conversion = 'mass concentration / supplied molecular weight';
    warnings.push('Molecular weight supplied by user; salt, solvate and measured-species identity are not verified');
  } else if (factor === undefined) errors.push(`Unsupported unit: ${row.unit}`);
  for (const k of numericContext) {
    if (!row[k] || row[k] === 'NA') continue;
    const v = number(row[k]);
    if (!Number.isFinite(v) || (k === 'temperature_C' && v < -273.15) || (['incubation_min', 'substrate_nM', 'enzyme_nM'].includes(k) && v < 0)) errors.push(`Invalid ${k}; use a numeric value, blank, or explicit NA`);
    else row[k] = String(v);
  }
  const molar = value * factor;
  if (errors.length === 0 && (!Number.isFinite(molar) || molar <= 0 || !Number.isFinite(molar * 1e9))) errors.push('Conversion exceeds numeric range');
  if (!row.source) warnings.push('No source supplied');
  if (row.relation !== '=') warnings.push('Censored bound; not an exact measurement');
  return {index, original, ...row, errors, warnings, valid: errors.length === 0,
    molar: errors.length ? null : molar, nM: errors.length ? null : molar * 1e9,
    p: errors.length ? null : -Math.log10(molar), p_relation: Object.hasOwn(invert,row.relation) ? invert[row.relation] : null,
    conversion: {method: conversion, molar_factor: Number.isFinite(factor) ? factor : null},
    missing_context: CONTEXT.filter(k => !row[k])};
}

export function analyze(records, referenceIndex = 0) {
  if (!Array.isArray(records) || !records.length || records.length > MAX_RECORDS) throw Error('Provide 1–500 assay records.');
  if (!Number.isInteger(referenceIndex) || referenceIndex < 0 || referenceIndex >= records.length) throw Error('Reference index is outside the dataset.');
  const rows = records.map(normalize), counts = new Map();
  rows.forEach(r => counts.set(r.id, (counts.get(r.id) || 0) + 1));
  rows.forEach(r => { if (counts.get(r.id) > 1) { r.errors.push('Duplicate record ID'); r.valid = false; r.molar = r.nM = r.p = null; } });
  const ref = rows[referenceIndex];
  for (const r of rows) {
    r.differences = ['endpoint', ...CONTEXT].filter(k => r[k] && ref[k] && r[k] !== ref[k]);
    r.unknown = CONTEXT.filter(k => !r[k] || !ref[k]);
    r.comparison = !r.valid || !ref.valid ? 'invalid' : r.differences.length ? 'different' : r.unknown.length ? 'incomplete' : 'matched';
    r.fold_vs_reference = r.comparison === 'matched' && r.relation === '=' && ref.relation === '=' ? r.molar / ref.molar : null;
    if (r.fold_vs_reference !== null && (!Number.isFinite(r.fold_vs_reference) || r.fold_vs_reference <= 0)) { r.fold_vs_reference = null; r.warnings.push('Ratio exceeds numeric range'); }
  }
  return {schema: 'titer-report/1', engine: VERSION, reference_index: referenceIndex, reference_id: ref.id,
    policy: 'Exact endpoint and declared-context match. Blank context blocks ratios; explicit NA matches NA. Censored values are not pooled or treated as exact. Matching fields do not establish experimental equivalence.',
    summary: {records: rows.length, valid: rows.filter(r => r.valid).length, invalid: rows.filter(r => !r.valid).length, matched: rows.filter(r => r.comparison === 'matched').length, different: rows.filter(r => r.comparison === 'different').length, incomplete: rows.filter(r => r.comparison === 'incomplete').length, censored: rows.filter(r => r.valid && r.relation !== '=').length}, rows};
}

export function toCSV(records, fields = FIELDS) {
  const quote = v => { let s = text(v); if (/^[=+@\-\t\r]/.test(s) && !Number.isFinite(number(s)) && s !== '=') s = "'" + s; return '"' + s.replaceAll('"', '""') + '"'; };
  return [fields, ...records.map(r => fields.map(f => r[f] ?? ''))].map(r => r.map(quote).join(',')).join('\r\n');
}
