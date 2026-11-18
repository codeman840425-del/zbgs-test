import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {HAIRSTYLES} from '../../prototype/src/hairstyle-catalog.js';
import {FOUNDATION_PROFILES} from '../../prototype/src/foundation-profiles.js';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const OUT = path.join(ROOT, 'evidence/m2-hairstyle-contract-v1/report.json');
async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

async function json(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function sha256(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

function publicFile(url) {
  if (typeof url !== 'string' || !url.startsWith('/assets/')) return null;
  return path.join(ROOT, 'prototype/public', url.slice(1));
}

function bodyTypesFor(entry) {
  return (entry.compatibleBodies ?? []).map(sha => ({
    bodySha256: sha,
    bodyTypes: Object.entries(FOUNDATION_PROFILES)
      .filter(([, profile]) => profile.sha256 === sha)
      .map(([bodyType]) => bodyType),
  }));
}

const rows = [];
for (const entry of HAIRSTYLES) {
  const row = {
    id: entry.id,
    label: entry.label,
    legacyImplicitFit: entry.legacyImplicitFit === true,
    bodyTypes: bodyTypesFor(entry),
    manifest: {url: entry.manifestUrl, exists: false, sha256: null, declaredSha256: entry.manifestSha256 ?? null},
    fit: entry.fit ? {url: entry.fit.url, exists: false, sha256: null, declaredSha256: entry.fit.sha256 ?? null, id: entry.fit.id, version: entry.fit.version} : null,
    checks: [],
  };
  const manifestFile = publicFile(entry.manifestUrl);
  row.manifest.exists = Boolean(manifestFile && await exists(manifestFile));
  if (row.manifest.exists) row.manifest.sha256 = await sha256(manifestFile);
  row.checks.push({name: 'manifest-hash', passed: row.manifest.exists && row.manifest.sha256 === row.manifest.declaredSha256});
  if (entry.fit) {
    const fitFile = publicFile(entry.fit.url);
    row.fit.exists = Boolean(fitFile && await exists(fitFile));
    if (row.fit.exists) row.fit.sha256 = await sha256(fitFile);
    row.checks.push({name: 'explicit-fit-hash', passed: row.fit.exists && row.fit.sha256 === row.fit.declaredSha256});
  } else {
    row.checks.push({name: 'explicit-fit', passed: false});
  }
  row.checks.push({name: 'body-type-closure', passed: row.bodyTypes.length > 0 && row.bodyTypes.every(item => item.bodyTypes.length === 1)});
  row.checks.push({name: 'legacy-explicitly-labelled', passed: row.legacyImplicitFit === (entry.fit == null)});
  row.status = row.legacyImplicitFit ? 'legacy-requires-migration' : row.checks.every(check => check.passed) ? 'candidate-contract-closed' : 'candidate-contract-incomplete';
  rows.push(row);
}

const report = {
  schema: 'm2-hairstyle-contract-v1',
  status: 'candidate-only',
  runtimeAdmissionChanged: false,
  catalogCount: rows.length,
  explicitFitCount: rows.filter(row => !row.legacyImplicitFit).length,
  legacyImplicitFitCount: rows.filter(row => row.legacyImplicitFit).length,
  rows,
  productionRules: [
    'Only rows with an exact body type, explicit fit identity and matching manifest/resource hashes may enter a production request.',
    'legacyImplicitFit rows remain available for historical compatibility and are rejected for new batch production.',
    'A shared asset SHA does not transfer a fit to another body SHA.',
  ],
  gaps: [
    'Most published hairstyle manifests do not carry a bodyType or provenance object.',
    'Medium-length dedicated style package and double-ponytail dual dynamic package are absent.',
    'No row is promoted to runtime admission by this audit.',
  ],
};
await mkdir(path.dirname(OUT), {recursive: true});
await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({status: report.status, catalogCount: report.catalogCount, explicitFitCount: report.explicitFitCount, legacyImplicitFitCount: report.legacyImplicitFitCount, report: path.relative(ROOT, OUT)}));
