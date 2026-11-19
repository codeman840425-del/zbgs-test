import {execFileSync} from 'node:child_process';
import {readFile, readdir, realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import projectOutputs from '../project-output.cjs';
import {checkedBytes, digest, fail, jsonBytes, localFile, runtimePath} from './files.mjs';

const here = fileURLToPath(new URL('../../', import.meta.url));
const packageDir = 'scripts/runtime-package/';
const operatorEntries = {
  planner:'scripts/production/variant_batch.py', create:'scripts/character-production-cli.cjs',
  createSchema:'character-production-batch-create-v1', package:packageDir + 'game-record-cli.mjs',
};
const usage = 'node scripts/runtime-package/verify-character-handoff.mjs --operator-root CHECKOUT --runtime-root CHECKOUT --dist FIXED_DIST --package GAME_DIR [--handoff-root DELIVERY_CHECKOUT] [--handoff delivery/character-production-handoff.json]';
function requireValue(ok, code, why) { if (!ok) fail(code, why); }
function equal(actual, expected, code, why) { requireValue(isDeepStrictEqual(actual, expected), code, why); }

// Pointer paths are repository-relative. Reject redirects, including a junction
// to another directory inside the same checkout, before reading its content.
function portable(relative) {
  requireValue(typeof relative === 'string' && !relative.startsWith('/') &&
    runtimePath('/' + relative) === relative && !/[<>"|*]/.test(relative) &&
    relative.split('/').every(part => part && !part.endsWith('.') &&
      !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)),
  'unsafe-path', 'Expected a portable relative path: ' + relative);
  return relative;
}
async function under(root, target) {
  const expected = path.resolve(target);
  const sub = path.relative(root, expected);
  requireValue(!path.isAbsolute(sub) && sub !== '..' && !sub.startsWith('..' + path.sep),
    'unsafe-path', 'Path escapes project: ' + target);
  const resolved = await realpath(expected);
  requireValue(!path.relative(expected, resolved), 'unsafe-path', 'Redirected path: ' + target);
  return resolved;
}
async function file(root, relative) {
  const lexical = path.join(root, portable(relative));
  const actual = await localFile(root, relative);
  requireValue(!path.relative(lexical, actual), 'unsafe-path', 'Redirected file: ' + relative);
  return lexical;
}
export async function pinned(root, row, legacySize = false) {
  const actual = await readFile(await file(root, row?.path));
  requireValue((actual.length === row.bytes || (legacySize && row.bytes === undefined)) &&
    digest(actual) === row.sha256, 'modified-dependency', 'Pinned file differs: ' + row.path);
  return actual;
}

function git(root, args) {
  const env = {...process.env, GIT_OPTIONAL_LOCKS:'0'};
  // Ignore repository/index overrides inherited from an enclosing git command.
  for (const key of Object.keys(env)) if (/^GIT_(DIR|COMMON_DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|NAMESPACE)$/i.test(key)) delete env[key];
  return execFileSync('git', ['-C',root,...args], {env, encoding:'utf8', windowsHide:true}).trim();
}
async function exactCheckout(root, commit) {
  requireValue(/^[a-f0-9]{40}$/.test(commit) && git(root,['rev-parse','HEAD']) === commit &&
    !path.relative(root, git(root,['rev-parse','--show-toplevel'])), 'checkout-mismatch', 'Checkout does not match ' + commit);
  requireValue(!git(root,['status','--porcelain','--untracked-files=no','--','scripts','prototype']),
    'modified-checkout','Tracked production code or runtime inputs changed in ' + root);
}
async function trackedFile(root, relative) {
  const name = await file(root, relative);
  const object = git(root,['rev-parse','HEAD:' + relative]);
  requireValue(git(root,['hash-object','--no-filters','--',name]) === object,
    'modified-checkout', 'Tracked bytes differ: ' + relative);
  return name;
}
export async function registeredReview(operatorRoot, runtime) {
  const index = JSON.parse(await readFile(await trackedFile(operatorRoot, packageDir + 'game-runtime-reviews.json')));
  const row = Object.hasOwn(index.externalRecords, runtime.sourceDigest) && index.externalRecords[runtime.sourceDigest];
  requireValue(row && /^game-record-[a-z0-9-]+-reviewed\.json$/.test(row.file),
    'unsupported-build','No registered external-record review for ' + runtime.sourceDigest);
  const bytes = await readFile(await trackedFile(operatorRoot, packageDir + row.file));
  const review = JSON.parse(bytes);
  requireValue(digest(bytes) === row.sha256 && review.sourceCommit === runtime.sourceCommit &&
    review.sourceDigest === runtime.sourceDigest && runtime.buildId === review.sourceDigest.slice(0,12),
  'unsupported-build','Reviewed runtime differs from handoff or operator registry');
  return review;
}

export async function verifyPackage(packageRoot, inventory, inventoryBytes, fileCount) {
  const expected = new Set(inventory.files.map(row => portable(row.path)));
  expected.add('runtime-package.json');
  requireValue(expected.size === inventory.files.length + 1 && expected.size === fileCount,
    'package-mismatch','Declared package count or paths differ');
  async function visit(directory, prefix) {
    for (const entry of await readdir(directory, {withFileTypes:true})) {
      const relative = prefix + entry.name;
      const physical = await under(packageRoot, path.join(directory, entry.name));
      if (entry.isDirectory()) await visit(physical, relative + '/');
      else requireValue(entry.isFile() && expected.delete(relative),
        'package-mismatch','Unexpected package entry: ' + relative);
    }
  }
  await visit(packageRoot, '');
  requireValue(!expected.size,'package-mismatch','Missing package files: ' + [...expected].join(', '));
  requireValue((await readFile(await file(packageRoot,'runtime-package.json'))).equals(inventoryBytes),
    'inventory-mismatch','Physical package manifest differs from regenerated inventory');
  for (const row of inventory.files) await checkedBytes(packageRoot, row);
}

export function compareSignedLook(job, records, selectedAppearance = {}) {
  const record = records.find(row => row.identity.id === job.identity.id);
  const outfit = record?.appearanceRecipe?.equipment;
  const selections = job.edits.filter(edit => edit.domain === 'outfit');
  const selection = selections[0]?.selection;
  requireValue(outfit && selections.length === 1 && selection && job.edits.every(
    edit => edit.domain === 'outfit' || edit.domain === 'appearance'),
    'selection-mismatch','No signed outfit for ' + job.identity.id);
  equal(record.identity, job.identity,'selection-mismatch','Signed identity differs for ' + job.identity.id);
  equal(record.appearanceRecipe.base, {bodyType:job.bodyType, sha256:selection.bodySha256},
    'selection-mismatch','Signed body differs for ' + job.identity.id);
  const equipment = Object.values(outfit.resources).map(({id,slot,sha256}) => ({id,slot,sha256}));
  const byId = (a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  equal({role:outfit.role,equipment:equipment.sort(byId)},
    {role:selection.role,equipment:[...selection.equipment].sort(byId)},
    'selection-mismatch','Signed outfit differs for ' + job.identity.id);
  // The planner omits a no-op edit when the author explicitly chose a default.
  // Its saved selection still pins that appearance field in the delivered character.
  const appearanceEdits = job.edits.filter(edit => edit.domain === 'appearance').map(edit => edit.values);
  for (const values of [selectedAppearance, ...appearanceEdits]) {
    for (const [key,value] of Object.entries(values)) {
      const actual = record.appearanceRecipe.appearance;
      requireValue(Object.hasOwn(actual,key) && isDeepStrictEqual(actual[key],value),
        'selection-mismatch','Signed appearance differs for ' + job.identity.id + ': ' + key);
    }
  }
}

function inspectOperator(args) {
  const script = fileURLToPath(new URL('./inspect-handoff-plan.py', import.meta.url));
  return JSON.parse(execFileSync('python', ['-I','-B','-X','utf8',script,...args],
    {encoding:'utf8', windowsHide:true, maxBuffer:4*1024*1024}));
}
async function verifyPlan({operatorRoot,runtimeRoot,handoffRoot,inputs,records}) {
  const paths = [inputs.variantMatrix.path, inputs.candidateRequest.path].map(p => path.join(handoffRoot, p));
  const result = inspectOperator([operatorRoot,runtimeRoot,handoffRoot,...paths]);
  await verifyPlannedInputs(handoffRoot,inputs,records,result);
}
export async function verifyPlannedInputs(handoffRoot,inputs,records,result) {
  requireValue(result.mode === 'technical-candidate' && !result.rejectedCount && result.candidateCount > 0 &&
    !result.acceptedCount, 'plan-mismatch','Diagnostic planning failed: ' +
      result.items.filter(row => row.status !== 'candidate').map(row => row.reason).join(', '));
  const jobs = result.items.map(row => row.request);
  for (const row of result.items) compareSignedLook(row.request, records, row.selection.appearance);
  if (!inputs.authoredPlan) {
    requireValue(!inputs.authoredRequests,'plan-mismatch','Authored requests require their plan');
    return;
  }
  equal(records.map(row => row.identity.id), jobs.map(job => job.identity.id),
    'selection-mismatch','Signed record order or identities differ from authored batch');
  const plan = JSON.parse(await pinned(handoffRoot, inputs.authoredPlan));
  equal(plan.source,{matrix:inputs.variantMatrix,request:inputs.candidateRequest},'plan-mismatch','Plan input pins differ');
  const {creationBatches, source, ...body} = plan;
  requireValue(creationBatches?.length === 1 && jobs.length <= 4,'plan-mismatch','Expected one D02 creation batch');
  for (const row of result.items) {
    const bytes = jsonBytes(row.request);
    delete row.request;
    row.requestPin = {path:'diagnostic-requests/' + row.stableId + '.request.json',sha256:digest(bytes),bytes:bytes.length};
  }
  equal(body,result,'plan-mismatch','Pinned plan differs from the exact operator diagnostic replay');
  const batch = creationBatches[0];
  equal(batch.ids,jobs.map(job => job.identity.id),'plan-mismatch','Creation batch IDs differ from plan');
  const relative = path.posix.join(path.posix.dirname(inputs.authoredPlan.path), portable(batch.path));
  const bytes = await pinned(handoffRoot, inputs.authoredRequests ?? {...batch, path:relative});
  requireValue(bytes.length === batch.bytes && digest(bytes) === batch.sha256 &&
    bytes.equals(jsonBytes({schema:operatorEntries.createSchema,requests:jobs})),
  'plan-mismatch','Actual creation batch differs from the operator diagnostic replay');
}

// Budget evidence belongs to these signed looks and to the reviewed game source.
// The handoff remains diagnostic even when the static limits are met.
const aggregateEvidenceFields = ['sumAcrossSelectedActors','temporaryAggregateLimits','closureUnionFileCount','closureUnionSourceBytes'];
function hasAggregateEvidence(report) {
  return aggregateEvidenceFields.some(field => Object.hasOwn(report,field));
}
function readBudgetAggregate(report, limits, runtimeFiles) {
  const match = (ok, why) => requireValue(ok, 'budget-mismatch', why);
  const count = value => Number.isSafeInteger(value) && value >= 0;
  const totals = {placedNodeTriangles:0,rgba8MipBytes:0,textureObjects:0};
  const closure = new Map();
  match(limits?.status === 'temporary-unmeasured' && limits.ordinaryPCPerformance === 'unmeasured' &&
    ['fileBytes','rgba8MipBytes','textureObjects'].every(key=>count(limits[key]) && limits[key] > 0) &&
    isDeepStrictEqual(report.temporaryAggregateLimits,limits), 'Temporary budget limits differ from the operator');
  for (const record of report.records) {
    for (const metric of Object.keys(totals)) {
      const value = record.selectedCost.totals?.[metric];
      match(count(value) && count(totals[metric] + value), 'Invalid selected actor total for ' + metric);
      totals[metric] += value;
    }
    match(Array.isArray(record.files) && record.files.length > 0, 'Missing budget closure for ' + record.id);
    const paths = new Set();
    let bytes = 0;
    for (const file of record.files) {
      const existing = closure.get(file?.path);
      match(typeof file?.path === 'string' && !paths.has(file.path) && count(file.bytes) &&
        /^[a-f0-9]{64}$/.test(file.sha256) && (!existing || (existing.bytes === file.bytes && existing.sha256 === file.sha256)),
      'Invalid or inconsistent budget closure file for ' + record.id);
      bytes += file.bytes;
      paths.add(file.path);
      closure.set(file.path,file);
    }
    match(count(bytes) && record.closureSourceBytes === bytes, 'Per-record budget closure bytes differ for ' + record.id);
  }
  match(isDeepStrictEqual(report.sumAcrossSelectedActors,totals), 'Selected actor sums differ from the measured records');
  const closureSourceBytes = [...closure.values()].reduce((sum,file)=>sum + file.bytes,0);
  match(count(closureSourceBytes) && report.closureUnionSourceBytes === closureSourceBytes &&
    report.closureUnionFileCount === closure.size, 'Budget union closure totals differ from the measured records');
  if (runtimeFiles) {
    match(runtimeFiles.length === closure.size && runtimeFiles.every(file => {
      const measured = closure.get(file.path);
      return measured?.sha256 === file.sha256 && measured.bytes === file.bytes;
    }), 'Budget union closure differs from the signed game resource inventory');
  }
  const comparisons = {fileBytes:closureSourceBytes,rgba8MipBytes:totals.rgba8MipBytes,textureObjects:totals.textureObjects};
  const excesses = Object.entries(comparisons).filter(([metric,actual])=>actual > limits[metric])
    .map(([metric,actual])=>({metric,actual,limit:limits[metric]}));
  return {status:excesses.length ? 'over-temporary-reference' : 'within-temporary-reference',
    sumAcrossSelectedActors:totals, closureUnionFileCount:closure.size, closureUnionSourceBytes:closureSourceBytes,
    temporaryAggregateLimits:limits, excesses};
}

export function readStaticBudget(report, pointer, records, configBytes, temporaryLimits, runtimeFiles) {
  const match = (ok, why) => requireValue(ok, 'budget-mismatch', why);
  match(report.schema === 'zbgs-character-record-budget-result-v1' &&
    report.readOnly === true && report.inputSha256 === pointer.inputs.signedRecords.sha256 &&
    report.sourceCommit === pointer.runtime.sourceCommit, 'Budget measured different records or runtime');
  const version = JSON.parse(configBytes).version;
  match(report.budgetVersion === version && report.budgetFileSha256 === digest(configBytes),
    'Static limits differ from the operator configuration');
  match(report.ordinaryPCPerformance === 'unmeasured' && Array.isArray(report.records) &&
    report.records.length === records.length && records.length > 0, 'Incomplete record budget');
  const rows = report.records.map((row, i) => {
    const record = records[i];
    match(row.id === record.identity.id && row.recordSha256 === record.integrity.recordSha256 &&
      row.avatarSha256 === record.appearanceRecipe.base.sha256, 'Budget identity differs at row ' + i);
    const scopes = [row.selectedCost, row.startupAndSelectedCost];
    match(row.models?.length > 0 && row.models.every(m => Array.isArray(m.assetExcesses)) &&
      scopes.every(s => Array.isArray(s?.aggregateExcesses)), 'Missing per-model or aggregate budget checks');
    const over = row.models.some(m => m.assetExcesses.length) || scopes.some(s => s.aggregateExcesses.length);
    match(row.status === (over ? 'over-budget' : 'within-static-limits'), 'Record budget result contradicts its limits');
    return {id:row.id, recordSha256:row.recordSha256, status:row.status};
  });
  match(report.status === (rows.some(r => r.status === 'over-budget') ? 'over-budget' : 'within-static-limits'),
    'Batch budget result contradicts its records');
  // The producer's status covers each record. Compare the combined estimates separately.
  const aggregate = hasAggregateEvidence(report) ? readBudgetAggregate(report,temporaryLimits,runtimeFiles) : {status:'unmeasured'};
  return {status:report.status, budgetVersion:version, ordinaryPCPerformance:report.ordinaryPCPerformance,
    evidenceSha256:pointer.staticBudgetEvidence.sha256, records:rows, aggregate};
}

export async function verifyHandoff({handoffRoot=here, handoff='delivery/character-production-handoff.json',
  operatorRoot,runtimeRoot,dist,packageRoot}) {
  const boundary = await projectOutputs.productionRoot();
  [handoffRoot,operatorRoot,runtimeRoot,dist,packageRoot] = await Promise.all(
    [handoffRoot,operatorRoot,runtimeRoot,dist,packageRoot].map(target => under(boundary, target)));
  const pointer = JSON.parse(await readFile(await file(handoffRoot,handoff)));
  requireValue(pointer.schema === 'character-production-handoff-v1' && pointer.status === 'diagnostic-candidate',
    'unsupported-handoff','Expected a v1 diagnostic-candidate handoff');
  const {commit,...entries} = pointer.operator;
  for (const [name,value] of Object.entries(operatorEntries))
    equal(entries[name],value,'unsupported-operator','Unexpected operator entry: ' + name);
  await Promise.all([exactCheckout(operatorRoot,commit),exactCheckout(runtimeRoot,pointer.runtime.sourceCommit)]);
  for (const name of ['planner','create','package']) await trackedFile(operatorRoot, entries[name]);
  const review = await registeredReview(operatorRoot,pointer.runtime);
  const inputs = pointer.inputs;
  for (const row of [inputs.variantMatrix,inputs.candidateRequest,pointer.receiverEvidence,pointer.freshBuildEvidence])
    await pinned(handoffRoot,row);
  if (pointer.previousHandoff) await pinned(handoffRoot,pointer.previousHandoff,true);
  const records = JSON.parse(await pinned(handoffRoot, inputs.signedRecords));
  const inventoryBytes = await pinned(handoffRoot,pointer.fixedGamePackage.inventory);
  const inventoryModule = await trackedFile(operatorRoot, packageDir+'game-record-inventory.mjs');
  const {createGameRecordInventory} = await import(pathToFileURL(inventoryModule).href);
  const inventory = await createGameRecordInventory({dist,sourceRoot:runtimeRoot,reviewed:review,records});
  equal(inventory.runtime,pointer.runtime,'runtime-mismatch','Build-info, entry or reviewed runtime differs from handoff');
  requireValue(jsonBytes(inventory).equals(inventoryBytes),'inventory-mismatch','Signed records and runtime produce a different inventory');
  await verifyPackage(packageRoot,inventory,inventoryBytes,pointer.fixedGamePackage.files);
  await verifyPlan({operatorRoot,runtimeRoot,handoffRoot,inputs,records});
  let staticBudget;
  if (Object.hasOwn(pointer,'staticBudgetEvidence')) {
    const report = JSON.parse(await pinned(handoffRoot,pointer.staticBudgetEvidence));
    const config = await readFile(await trackedFile(operatorRoot,'scripts/production/asset-budgets-v1.json'));
    let limits;
    if (hasAggregateEvidence(report)) {
      await trackedFile(operatorRoot,'scripts/production/selected_look_budget.py');
      limits = inspectOperator(['--budget-limits',operatorRoot]);
    }
    const runtimeFiles = inventory.files.filter(row => !Object.hasOwn(review.files,row.path) && row.generated === undefined);
    staticBudget = readStaticBudget(report,pointer,records,config,limits,runtimeFiles);
  }
  return {schema:'character-production-handoff-readback-v1',status:'verified',handoffStatus:pointer.status,
    formalAdmission:false,operatorCommit:commit,runtime:inventory.runtime,files:pointer.fixedGamePackage.files,
    ...(staticBudget ? {staticBudget} : {}),
    inventorySha256:digest(inventoryBytes),records:inventory.records.map(({id,revision,recordSha256}) => ({id,revision,recordSha256}))};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const flags = {'--operator-root':'operatorRoot','--runtime-root':'runtimeRoot','--dist':'dist','--package':'packageRoot',
      '--handoff-root':'handoffRoot','--handoff':'handoff'};
    const args = {};
    for (let i=2; i<process.argv.length; i+=2) {
      const key = flags[process.argv[i]];
      requireValue(key && !Object.hasOwn(args,key) && process.argv[i+1],'usage',usage);
      args[key] = process.argv[i+1];
    }
    requireValue(['operatorRoot','runtimeRoot','dist','packageRoot'].every(key => args[key]),'usage',usage);
    console.log(JSON.stringify(await verifyHandoff(args)));
  } catch (error) {
    console.error(JSON.stringify({status:'rejected',code:error.code ?? 'handoff-failed',reason:error.message}));
    process.exitCode = 1;
  }
}
