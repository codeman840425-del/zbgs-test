import fs from 'node:fs/promises';
import path from 'node:path';
import {checkManagedOutput} from './package-company.mjs';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import catalog from '../../prototype/src/company/library-catalog.json' with { type: 'json' };
import templates from '../../prototype/src/company/templates-extended.json' with { type: 'json' };
import { appearanceCandidates } from '../../prototype/src/company/appearance-samples.js';
import { prepareCompanyChange } from '../../prototype/src/company/document.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hash = value => createHash('sha256').update(value).digest('hex');
const allowedTop = new Set(['version', 'id', 'name', 'surfaces', 'facilities']);
const facilityBranches = ['desk', 'monitor', 'keyboard', 'desk-microphone', 'chair', 'fill-light', 'sofa', 'plant', 'rug', 'floor-panel', 'wall-panel', 'wall-art', 'window-panel', 'door-frame'];
const baseResourceBranches = new Map([
  ['desk', 'desk'],
  ['monitor', 'monitor'],
  ['keyboard', 'keyboard'],
  ['desk-microphone', 'desk-microphone'],
  ['chair', 'chair'],
  ['fill-light', 'fill-light'],
  ['lounge-sofa', 'sofa'],
  ['timber-sofa', 'sofa'],
  ['plant', 'plant'],
]);

function fail(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  throw error;
}

function checkRecipe(recipe) {
  if (!recipe || recipe.version !== 1 || typeof recipe.id !== 'string' || typeof recipe.name !== 'string') fail('invalid-style-recipe', 'Style recipe requires version 1, id and name');
  for (const key of Object.keys(recipe)) if (!allowedTop.has(key)) fail('invalid-style-recipe', `Unknown style recipe field ${key}`);
  if (!recipe.surfaces && !recipe.facilities) fail('invalid-style-recipe', 'Style recipe must select surfaces or facilities');
  if (recipe.facilities) {
    const checkMap = value => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalid-style-recipe', 'Facility selection must be an object');
      for (const branch of Object.keys(value)) {
        if (!facilityBranches.includes(branch)) fail('invalid-style-recipe', `Unsupported facility branch ${branch}`);
        const ref = value[branch];
        if (!ref || typeof ref.id !== 'string' || !Number.isInteger(ref.version)) fail('invalid-style-recipe', `Facility ${branch} requires an explicit resource reference`);
      }
    };
    checkMap(recipe.facilities.default || {});
    for (const value of Object.values(recipe.facilities.purposes || {})) checkMap(value);
  }
}

function regionPurpose(document, parentById, node) {
  let current = node;
  while (current) {
    if (current.kind === 'room' || current.kind === 'area') return current.purpose || 'public';
    current = parentById.get(current.parentId);
  }
  return 'public';
}

function surfaceOperations(document, surfaces) {
  if (!surfaces) return [];
  const selection = surfaces.default || {};
  const operations = [];
  for (const region of document.nodes.filter(node => ['room', 'area'].includes(node.kind))) {
    const chosen = { ...selection, ...(surfaces.purposes?.[region.purpose || 'public'] || {}) };
    for (const [type, finish] of Object.entries(chosen)) {
      if (!['wall', 'floor', 'ceiling'].includes(type) || !finish?.resource?.id) fail('invalid-style-recipe', `Invalid surface selection ${type}`);
      const sides = type === 'wall' ? ['north', 'south', 'west', 'east'] : [type];
      for (const side of sides) operations.push({ type: 'set-surface-finish', id: region.id, surface: side, finish });
    }
  }
  return operations;
}

function facilityOperations(document, facilities, catalogValue = catalog) {
  if (!facilities) return [];
  const parentById = new Map(document.nodes.map(node => [node.id, node]));
  const candidates = new Map(facilityBranches.map(branch => [branch, new Map(appearanceCandidates(catalogValue, branch).map(value => [value.id, value]))]));
  const branchByResourceId = new Map(baseResourceBranches);
  for (const [branch, values] of candidates) for (const id of values.keys()) branchByResourceId.set(id, branch);
  const operations = [];
  for (const node of document.nodes.filter(value => value.kind === 'facility' && value.resource)) {
    const branch = branchByResourceId.get(node.resource.id);
    if (!branch) continue;
    const chosen = { ...(facilities.default || {}), ...(facilities.purposes?.[regionPurpose(document, parentById, node)] || {}) }[branch];
    if (!chosen || (chosen.id === node.resource.id && chosen.version === node.resource.version)) continue;
    const target = candidates.get(branch).get(chosen.id);
    if (!target || target.version !== chosen.version) fail('invalid-style-recipe', `Resource ${chosen.id}@${chosen.version} is not a compatible ${branch} candidate`);
    operations.push({ type: 'replace-resource', id: node.id, resource: { id: target.id, version: target.version } });
  }
  return operations;
}

export function applyStyleRecipe(document, recipe, options = {}) {
  checkRecipe(recipe);
  const operations = [...surfaceOperations(document, recipe.surfaces), ...facilityOperations(document, recipe.facilities, options.catalog || catalog)];
  if (!operations.length) fail('empty-style-recipe', 'Style recipe selected no changes for this layout');
  const result = prepareCompanyChange(document, operations, { catalog: options.catalog || catalog, templates: options.templates || templates });
  return { document: result.document, operations, recipe: { id: recipe.id, version: recipe.version, name: recipe.name } };
}

export async function publishStyleRecipeResult(outputFile, outputBytes, manifestBytes) {
  const manifestFile = `${outputFile}.style.json`;
  for (const target of [outputFile,manifestFile]) {
    await checkManagedOutput(path.resolve(target),undefined,{allowDelivery:false});
  }
  const tempBase = `${outputFile}.tmp-${process.pid}-${Date.now()}`;
  const tempOutput = `${tempBase}.json`;
  const tempManifest = `${tempBase}.style.json`;
  let outputRenamed = false;
  try {
    for (const file of [outputFile, manifestFile]) {
      try { await fs.access(file); fail('style-output-exists', `Refusing to replace existing style output ${file}`); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    await fs.writeFile(tempOutput, outputBytes, { flag: 'wx' });
    await fs.writeFile(tempManifest, manifestBytes, { flag: 'wx' });
    await fs.rename(tempOutput, outputFile);
    outputRenamed = true;
    await fs.rename(tempManifest, manifestFile);
  } catch (error) {
    await fs.rm(tempOutput, { force: true });
    await fs.rm(tempManifest, { force: true });
    if (outputRenamed) await fs.rm(outputFile, { force: true });
    throw error;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const [layoutFile, recipeFile, outputFile] = process.argv.slice(2);
  if (!outputFile) fail('usage', 'Usage: node apply-style-recipe.mjs LAYOUT RECIPE OUTPUT');
  const layoutBytes = await fs.readFile(layoutFile);
  const recipeBytes = await fs.readFile(recipeFile);
  const result = applyStyleRecipe(JSON.parse(layoutBytes), JSON.parse(recipeBytes));
  const outputBytes = Buffer.from(JSON.stringify(result.document, null, 2) + '\n');
  const manifest = { schema: 'company-style-recipe-result@1', recipe: result.recipe, input: { path: layoutFile, sha256: hash(layoutBytes) }, output: { path: outputFile, sha256: hash(outputBytes) }, operations: result.operations.length };
  await publishStyleRecipeResult(outputFile, outputBytes, Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));
  console.log(JSON.stringify(manifest));
}
