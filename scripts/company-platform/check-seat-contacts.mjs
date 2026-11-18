import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { Box3, Group, Matrix3, Raycaster, Vector3 } from '../../prototype/node_modules/three/build/three.module.js';
import defaultCatalog from '../../prototype/src/company/library-catalog.json' with { type: 'json' };
import defaultTemplates from '../../prototype/src/company/templates-extended.json' with { type: 'json' };
import { createCompanyAssetLibrary } from '../../prototype/src/company/asset-library.js';
import { CompanyError, composeTransform, createCompany, deriveCompany, identityTransform, pointInTransform } from '../../prototype/src/company/document.js';
import { decodeCompanySave } from '../../prototype/src/company/persistence.js';
import { createCompanyScene } from '../../prototype/src/company/render.js';
import { installNodeImageDecodeShim } from './preflight-library-assets.mjs';

const defaultPublic = fileURLToPath(new URL('../../prototype/public/', import.meta.url));
// Same linear acceptance threshold as the production seat collection.
const tolerance = 1e-6;
const step = .02;
const probes = [
  ['centre', [0, 0, 0]], ['left', [-step, 0, 0]], ['right', [step, 0, 0]],
  ['rear', [0, 0, -step]], ['front', [0, 0, step]],
];
const down = new Vector3(0, -1, 0);
const stageId = 'seat-audit-stage';
const fixtureId = stageId + '/fixture';
const hasSeatContact = point => point.seatHeight !== undefined || point.seatNodeId !== undefined;
const finitePosition = position => Array.isArray(position) && position.length === 3 && position.every(Number.isFinite);
const diagnostic = (error, location) => ({
  code: error.code || 'seat-audit-failed', path: error.path ?? location, message: error.message,
  ...(error.details && Object.keys(error.details).length ? { details: error.details } : {}),
});
const fail = (code, location, message, details) => { throw new CompanyError(code, location, message, details); };

function localAssetLibrary(publicDirectory) {
  installNodeImageDecodeShim();
  const publicRoot = path.resolve(publicDirectory);
  return createCompanyAssetLibrary({
    fetchImpl: async url => {
      if (typeof url !== 'string' || !url.startsWith('/company-assets/') || /[\\?#%]/.test(url) ||
          url.slice(1).split('/').some(part => !part || part === '.' || part === '..'))
        fail('invalid-seat-asset-url', url, 'Expected a local /company-assets/ GLB path');
      const file = path.resolve(publicRoot, '.' + url);
      if (!file.startsWith(path.join(publicRoot, 'company-assets') + path.sep))
        fail('invalid-seat-asset-url', url, 'Asset path escapes company-assets');
      let content;
      try {
        content = await fs.readFile(file);
      } catch (error) {
        fail(error.code === 'ENOENT' ? 'missing-seat-asset' : 'unreadable-seat-asset', file, error.message, { url });
      }
      return { ok: true, arrayBuffer: async () => content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) };
    },
  });
}

async function stageFacility(entry, assetLibrary) {
  const resource = { ...entry.resource, usePoints: (entry.resource.usePoints ?? []).filter(hasSeatContact) };
  // Only stage this fixture. This keeps hidden floors independent of the active
  // view and excludes unrelated materials, meshes, and use points from the rays.
  // Both authored geometry and GLB follow the normal scene builder and state.
  const catalog = { id: stageId, version: 1, resources: [resource] };
  const document = createCompany({ id: stageId, width: 20, depth: 20 }, catalog);
  document.nodes.push({
    kind: 'facility', id: fixtureId, parentId: stageId + '/room-1',
    resource: entry.node.resource, transform: identityTransform(), state: entry.node.state ?? {},
    ...(entry.node.appearance === undefined ? {} : { appearance: entry.node.appearance }),
  });
  if (resource.asset) await assetLibrary.preload([resource]);
  else if (!resource.node) fail('missing-seat-geometry', entry.id, 'Seat resource has neither GLB nor procedural geometry');
  const scene = createCompanyScene(new Group(), document, { catalog, templates: { templates: [] }, assetLibrary });
  const fixture = scene.root.getObjectByName(fixtureId);
  fixture.position.fromArray(entry.world.position);
  fixture.rotation.y = entry.world.yaw;
  fixture.updateWorldMatrix(true, true);
  return { fixture, dispose: () => scene.dispose() };
}

function seatMesh(fixture, nodeId, location) {
  const matches = [];
  fixture.traverse(object => {
    if (object.name === nodeId || object.userData.name === nodeId) matches.push(object);
  });
  if (matches.length !== 1 || !matches[0].isMesh || !matches[0].geometry?.getAttribute('position')?.count) {
    const code = matches.length > 1 ? 'ambiguous-seat-mesh' : 'missing-seat-mesh';
    fail(code, location, 'Seat contact must resolve to one named mesh with actual positions', { seatNodeId: nodeId, matches: matches.length });
  }
  return matches[0];
}

function measure(mesh, expectedHeight, baseY, transform) {
  const bounds = new Box3().setFromObject(mesh, true);
  const matrix = new Matrix3().getNormalMatrix(mesh.matrixWorld);
  return probes.map(([name, offset]) => {
    const [x, , z] = pointInTransform(transform, offset);
    const origin = new Vector3(x, bounds.max.y + .1, z);
    const ray = new Raycaster(origin, down, 0, bounds.max.y - bounds.min.y + .2);
    const hits = ray.intersectObject(mesh, false);
    const topY = hits[0]?.point.y ?? null;
    const upwards = hits.find(hit => topY - hit.point.y <= tolerance && hit.face && hit.face.normal.clone().applyNormalMatrix(matrix).y > 0);
    const actualHeight = topY === null ? null : topY - baseY;
    const error = actualHeight === null ? null : actualHeight - expectedHeight;
    const code = topY === null ? 'seat-contact-miss' : !upwards ? 'seat-contact-not-upward' :
      Math.abs(error) > tolerance ? 'seat-height-mismatch' : null;
    return { name, offset, rayOrigin: origin.toArray(), hit: hits[0]?.point.toArray() ?? null, actualHeight, error,
      ...(code ? { code } : {}) };
  });
}

function pointIdentity(entry, point) {
  return {
    instanceId: entry.id, resource: { id: entry.resource.id, version: entry.resource.version },
    floorId: entry.floorId, roomId: entry.roomId ?? null, pointId: point.id,
    usePointId: `${entry.id}#${point.id}`, seatNodeId: point.seatNodeId ?? null,
    expectedHeight: Number.isFinite(point.seatHeight) ? point.seatHeight : null,
  };
}

function checkPoint(entry, point, fixture, info) {
  const location = info.usePointId;
  if (typeof point.seatNodeId !== 'string' || !point.seatNodeId || !Number.isFinite(point.seatHeight) || point.seatHeight <= 0)
    fail('invalid-seat-metadata', location, 'Expected a seatNodeId and positive finite seatHeight');
  const position = point.position ?? [0, 0, 0], yaw = point.yaw ?? 0;
  if (!finitePosition(position) || !Number.isFinite(yaw))
    fail('invalid-seat-transform', location, 'Expected a finite facility-relative seat position and yaw');
  const baseY = entry.world.position[1];
  const transform = composeTransform(entry.world, { position, yaw });
  const mesh = seatMesh(fixture, point.seatNodeId, location);
  const samples = measure(mesh, point.seatHeight, baseY, transform);
  const [centre] = samples;
  const failed = samples.filter(sample => sample.code);
  return {
    ...info, status: failed.length ? 'failed' : 'passed', geometry: entry.resource.asset ? 'glb' : 'procedural',
    transform, expectedWorldY: baseY + point.seatHeight, actualHeight: centre.actualHeight, error: centre.error,
    failures: [...new Set(failed.map(sample => sample.code))], samples,
  };
}

async function auditSeatContacts(document, { catalog, templates, assetLibrary }) {
  const derived = deriveCompany(document, catalog, templates);
  const results = [];
  for (const entry of derived.facilities) {
    const points = (entry.resource.usePoints ?? []).filter(hasSeatContact);
    if (!points.length) continue;
    let staged, preparationFailure;
    try { staged = await stageFacility(entry, assetLibrary); }
    catch (error) { preparationFailure = error; }
    try {
      for (const point of points) {
        const info = pointIdentity(entry, point);
        try {
          if (preparationFailure) throw preparationFailure;
          results.push(checkPoint(entry, point, staged.fixture, info));
        } catch (error) {
          results.push({ ...info, status: 'failed', actualHeight: null, error: null,
            failures: [error.code || 'seat-audit-failed'], samples: [], diagnostic: diagnostic(error, info.usePointId) });
        }
      }
    } finally { staged?.dispose(); }
  }
  return results;
}

export async function inspectSeatContacts(document, {
  catalog = defaultCatalog, templates = defaultTemplates, publicDirectory = defaultPublic,
} = {}) {
  const assetLibrary = localAssetLibrary(publicDirectory);
  try {
    return await auditSeatContacts(document, { catalog, templates, assetLibrary });
  } finally {
    assetLibrary.dispose();
  }
}

async function checkInput(input, { catalog, templates, assetLibrary }) {
  let raw;
  try {
    const text = (await fs.readFile(input, 'utf8')).replace(/^\uFEFF/, '');
    try { raw = JSON.parse(text); }
    catch (error) { fail('invalid-input-json', input, error.message); }
    const document = raw?.schema === 'company-save' ? await decodeCompanySave(text, catalog, templates) : raw;
    const points = await auditSeatContacts(document, { catalog, templates, assetLibrary });
    return { input, companyId: document.id, revision: document.revision, inputType: raw.schema,
      status: points.some(point => point.status === 'failed') ? 'failed' : 'passed', points };
  } catch (error) {
    const original = raw?.schema === 'company-save' ? raw.document : raw;
    const instance = Array.isArray(original?.nodes) && original.nodes.find(node => node.id === error.path);
    return { input, companyId: original?.id ?? null, status: 'failed', points: [],
      diagnostic: { ...diagnostic(error, input), ...(instance?.resource ? { instanceId: instance.id, resource: instance.resource } : {}) } };
  }
}

function summarize(inputs) {
  const points = inputs.flatMap(input => input.points);
  return { inputs: inputs.length, failedInputs: inputs.filter(input => input.status === 'failed').length,
    points: points.length, passedPoints: points.filter(point => point.status === 'passed').length,
    failedPoints: points.filter(point => point.status === 'failed').length };
}

const readJson = async file => JSON.parse((await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
const json = data => JSON.stringify(data, null, 2) + '\n';
async function main() {
  let assetLibrary;
  const report = { schema: 'company-seat-contact-audit', version: 1, status: 'failed',
    measurement: { toleranceMetres: tolerance, crossOffsetMetres: step, heightReference: 'facility-origin', strict: true }, inputs: [] };
  try {
    const { values, positionals } = parseArgs({ allowPositionals: true, options: {
      strict: { type: 'boolean' }, report: { type: 'string' }, catalog: { type: 'string' }, templates: { type: 'string' },
      'public-dir': { type: 'string' }, help: { type: 'boolean' },
    } });
    if (values.help) {
      console.log('node scripts/company-platform/check-seat-contacts.mjs LAYOUT_OR_SAVE.json [MORE.json ...] [--report NEW_REPORT.json] [--catalog CATALOG.json] [--templates TEMPLATES.json] [--public-dir PUBLIC_DIRECTORY] [--strict]');
      return;
    }
    if (!positionals.length) fail('missing-seat-audit-input', 'arguments', 'Provide at least one company-layout or company-save JSON');
    const [catalog, templates] = await Promise.all([
      values.catalog ? readJson(values.catalog) : defaultCatalog, values.templates ? readJson(values.templates) : defaultTemplates,
    ]);
    assetLibrary = localAssetLibrary(values['public-dir'] ?? defaultPublic);
    for (const input of positionals) report.inputs.push(await checkInput(path.resolve(input), { catalog, templates, assetLibrary }));
    report.summary = summarize(report.inputs);
    report.status = report.summary.failedInputs ? 'failed' : 'passed';
    if (values.report) await fs.writeFile(values.report, json(report), { flag: 'wx' });
  } catch (error) {
    report.diagnostic = diagnostic(error, 'arguments');
    report.status = 'failed';
  } finally { assetLibrary?.dispose(); }
  process.stdout.write(json(report));
  if (report.status !== 'passed') process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
