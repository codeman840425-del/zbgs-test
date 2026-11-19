import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {isDeepStrictEqual as equal} from 'node:util';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const roomLayout = /^data\/rooms\/([a-z][a-z0-9-]{0,62})\/layout\.json$/;
const trainingRooms = document => document.nodes.filter(node => node.kind === 'room' && node.purpose === 'training');
const roomIdentities = document => trainingRooms(document).map(room=>[room.id,room.parentId])
  .sort(([left],[right])=>left.localeCompare(right));
const authoringRooms = new WeakMap();

function originalTrainingRooms(declaration, sha256, context) {
  if (!authoringRooms.has(context)) authoringRooms.set(context,new Map());
  const cache = authoringRooms.get(context);
  if (!cache.has(sha256)) {
    const {catalog,templates,createScaledCompany,createCompanyScaleV2,prepareCompanyChange} = context;
    const input = declaration.input;
    const create = input?.spaceProfile === undefined ? createScaledCompany : createCompanyScaleV2;
    try {
      let original = input ? create(input,catalog,templates) : declaration.document;
      if (declaration.operations?.length)
        original = prepareCompanyChange(original,declaration.operations,{catalog,templates}).document;
      cache.set(sha256,roomIdentities(original));
    } catch (error) { invalid('Cannot reconstruct the source rooms: '+error.message); }
  }
  return cache.get(sha256);
}

function fail(code, location, message) {
  throw Object.assign(new Error(message), {code, path:location});
}
function exact(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value,key));
}
function invalid(message) {
  fail('invalid-training-binding','document.trainingBinding',message);
}

// Keep the exact UTF-8 declaration, so an isolated save can verify the original
// authoring input pin even after its layout/revision and filename have changed.
export function bindingFromSource(document, kind, bytes, context, allowInherited = true) {
  const text = bytes.toString('utf8');
  let declaration;
  try { declaration = JSON.parse(text); } catch { invalid('The pinned training source must contain a JSON declaration.'); }
  let companyId, trainingClearance;
  if (kind === 'batch-input') {
    companyId = (declaration?.input ?? declaration?.document)?.id;
    if (declaration?.document?.trainingBinding !== undefined) {
      if (!allowInherited || declaration.input || declaration.document.id !== document.id)
        invalid('A portable source cannot nest a binding or transfer another company’s binding.');
      const inherited = readTrainingBinding(declaration.document,context);
      if (Object.hasOwn(declaration,'trainingClearance') && !equal(declaration.trainingClearance,inherited.trainingClearance))
        invalid('The batch overrides its source document training rule.');
      return inherited;
    }
    trainingClearance = declaration?.trainingClearance;
    if (trainingClearance === undefined && !declaration?.input) return;
  } else if (kind === 'training-edit' && declaration?.schema === 'training-room-edit@1' &&
      /^[0-9a-f]{64}$/.test(declaration.saveSha256) && declaration.trainingClearance) {
    companyId = declaration.companyId;
    trainingClearance = declaration.trainingClearance;
  } else invalid('Unknown training source kind or malformed edit receipt.');
  if (companyId !== document.id) invalid('The source company differs from the saved company.');
  const rooms = roomIdentities(document);
  if (trainingClearance === undefined && !rooms.length) return;
  // General classrooms have an actual scaled authoring input with no dance rule.
  // A detached explicit document, by itself, is never evidence for that exemption.
  if (trainingClearance !== undefined && (!trainingClearance || typeof trainingClearance !== 'object'))
    invalid('The training source does not declare a valid clearance.');
  const roomId = trainingClearance === undefined ? null : trainingClearance.roomId;
  const room = rooms.find(([id])=>id === roomId);
  if (trainingClearance !== undefined && !room)
    invalid('The source dance room is missing or has a different purpose in this layout.');
  const sha256 = digest(text);
  if (kind === 'batch-input') {
    const sourceRooms = originalTrainingRooms(declaration,sha256,context);
    if (room ? !sourceRooms.some(original=>equal(original,room)) : !equal(sourceRooms,rooms))
      invalid('The source and saved company must identify the same protected room or general classrooms.');
  }
  return {schema:'company-training-binding',version:1,companyId,roomId,trainingClearance:trainingClearance ?? null,
    source:{kind,sha256,text}};
}

export function readTrainingBinding(document, context) {
  if (!Object.hasOwn(document,'trainingBinding')) return;
  const binding = document.trainingBinding;
  if (!exact(binding,['schema','version','companyId','roomId','trainingClearance','source']) ||
      binding.schema !== 'company-training-binding' || binding.version !== 1 ||
      !exact(binding.source,['kind','sha256','text']) || typeof binding.source.text !== 'string' ||
      binding.source.sha256 !== digest(binding.source.text)) invalid('The version, fields or source SHA-256 pin are invalid.');
  const restored = bindingFromSource(document,binding.source.kind,binding.source.text,context,false);
  if (!equal(restored,binding)) invalid('The source declaration, company, room and clearance must match the stored binding.');
  return binding;
}

function reconcile(first, second, location) {
  if (first && second && (!equal(first.trainingClearance,second.trainingClearance) || first.companyId !== second.companyId))
    fail('training-edit-mismatch',location,'The training source and the saved training declaration disagree.');
  return first ?? second;
}

export function bindTrainingDocument(document, evidence, location, context) {
  const binding = reconcile(readTrainingBinding(document,context),evidence,location);
  if (binding) {
    document.trainingBinding = binding;
    readTrainingBinding(document,context);
  } else if (trainingRooms(document).length) {
    fail('training-origin-required',location,'Restore this legacy training layout through its verified source package and --room KEY, or provide the original batch result.');
  }
  return binding?.trainingClearance ?? undefined;
}

export async function editedTrainingBinding(input, document) {
  if (!['save.json','layout.json'].includes(path.basename(input))) return;
  const folder = path.dirname(input);
  let bytes;
  try { bytes = await fs.readFile(path.join(folder,'training-edit.json')); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  const saved = await fs.readFile(path.join(folder,'save.json'));
  const receipt = JSON.parse(bytes);
  if (receipt.schema !== 'training-room-edit@1' || receipt.companyId !== document.id || !receipt.trainingClearance ||
      digest(saved) !== receipt.saveSha256 || !equal(JSON.parse(saved).document,document))
    fail('training-edit-mismatch',input,'The edit receipt, saved layout and company must agree.');
  return bindingFromSource(document,'training-edit',bytes);
}

// Old named packages already pin their original declaration. Exact package paths,
// byte-identical exports and an explicit room selection are migration evidence.
// A company ID alone does not identify the origin of a changed legacy save.
export async function resolveTrainingBinding(root, manifest, input, document, bytes, selected, context) {
  const pins = new Map(manifest.files.map(file => [file.path,file]));
  async function pinned(name) {
    const bytes = await fs.readFile(path.join(root,name));
    const pin = pins.get(name);
    if (!pin || bytes.length !== pin.bytes || digest(bytes) !== pin.sha256)
      fail('training-handoff-file-mismatch',name,'The packaged file differs from its declared manifest pin.');
    return bytes;
  }
  const relative = path.relative(root,path.resolve(input)).split(path.sep).join('/');
  const scopes = [{key:'@default',prefix:'data'}];
  for (const name of pins.keys()) {
    const match = roomLayout.exec(name);
    if (match) scopes.push({key:match[1],prefix:name.slice(0,-'/layout.json'.length)});
  }
  const files = scope => ['save.json','layout.json','batch-result/save.json','batch-result/layout.json'].map(name=>scope.prefix+'/'+name);
  const origin = scopes.find(scope=>files(scope).includes(relative));
  if (origin && digest(bytes) !== pins.get(relative)?.sha256)
    fail('training-handoff-file-mismatch',relative,'The selected package layout differs from its declared pin.');
  const candidates = [];
  for (const scope of scopes) {
    const layout = JSON.parse(await pinned(scope.prefix+'/layout.json'));
    if (layout.id !== document.id) continue;
    let evidence = readTrainingBinding(layout,context);
    for (const [name,kind] of [['batch-result/input.json','batch-input'],['training-edit.json','training-edit']]) {
      const file = scope.prefix+'/'+name;
      if (pins.has(file)) evidence = reconcile(evidence,bindingFromSource(layout,kind,await pinned(file),context),file);
    }
    if (scope.key === '@default' && (layout.id !== manifest.savedCompany.id ||
        !equal(manifest.savedCompany.trainingClearance,evidence?.trainingClearance ?? undefined)))
      fail('training-edit-mismatch',scope.prefix,'The default manifest and the pinned source disagree.');
    scope.evidence = evidence;
    scope.teaStations = layout.teaStations;
    candidates.push(scope);
  }
  const choice = selected === undefined ? undefined : candidates.find(scope=>scope.key === selected);
  if ((selected !== undefined && !choice) || (origin && (!candidates.includes(origin) || (choice && origin !== choice))))
    fail('training-room-origin-mismatch',input,'Select the packaged room that owns this company layout.');
  const identity = digest(bytes);
  const identical = candidates.filter(scope=>files(scope).some(name=>pins.get(name)?.sha256 === identity));
  if (choice && identical.length && !identical.includes(choice))
    fail('training-room-origin-mismatch',input,'The saved bytes belong to a different room.');
  const inherited = reconcile(readTrainingBinding(document,context),origin ? undefined : await editedTrainingBinding(input,document),input);
  const possible = origin ? [origin] : choice ? [choice] : identical.length ? identical : candidates;
  if (possible.some(scope=>!equal(scope.teaStations,possible[0].teaStations)))
    fail('ambiguous-tea-room',input,'Select the original tea station declaration with --room KEY.');
  if (possible.some(scope=>scope.teaStations!==undefined) &&
      !possible.some(scope=>equal(scope.teaStations,document.teaStations)))
    fail('tea-station-binding-mismatch',input,'The tea station declaration differs from the selected saved room.');
  if (inherited) {
    if (possible.length && !possible.some(scope => scope.evidence &&
        equal(scope.evidence.trainingClearance,inherited.trainingClearance)))
      fail('training-edit-mismatch',input,'The saved declaration disagrees with the selected package room.');
    return inherited;
  }
  if (possible.some(scope => !equal(scope.evidence?.trainingClearance,possible[0].evidence?.trainingClearance)))
    fail('ambiguous-training-room',input,'Use the original room path or append --room KEY to select its training declaration.');
  if (origin || choice || identical.length) return possible[0]?.evidence;
}
