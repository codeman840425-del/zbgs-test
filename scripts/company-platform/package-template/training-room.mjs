import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const roomLayout = /^data\/rooms\/([a-z][a-z0-9-]{0,62})\/layout\.json$/;

function fail(code, location, message) {
  throw Object.assign(new Error(message), {code, path:location});
}

export async function editedTrainingConstraint(input, document) {
  const name = path.basename(input);
  if (name !== 'save.json' && name !== 'layout.json') return;
  const folder = path.dirname(input);
  let receipt;
  try {
    receipt = JSON.parse(await fs.readFile(path.join(folder, 'training-edit.json'), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  const saved = await fs.readFile(path.join(folder, 'save.json'));
  if (receipt.schema !== 'training-room-edit@1' || receipt.companyId !== document.id || !receipt.trainingClearance ||
      digest(saved) !== receipt.saveSha256 || !isDeepStrictEqual(JSON.parse(saved).document, document))
    fail('training-edit-mismatch', input, 'The training receipt, saved layout and company must agree.');
  return receipt.trainingClearance;
}

// V1 packages already pin the batch inputs or edit receipts for each named room.
// Resolve the contract for the supplied layout before changing its revision or geometry.
export async function resolveTrainingConstraint(root, manifest, input, document, bytes, selected) {
  const pins = new Map(manifest.files.map(file => [file.path, file]));
  async function pinnedJson(name) {
    const bytes = await fs.readFile(path.join(root, name));
    const pin = pins.get(name);
    if (bytes.length !== pin.bytes || digest(bytes) !== pin.sha256)
      fail('training-handoff-file-mismatch', name, 'The packaged training input differs from its manifest.');
    return JSON.parse(bytes);
  }
  const relative = path.relative(root, path.resolve(input)).split(path.sep).join('/');
  const scopes = [{key:'@default', prefix:'data', id:manifest.savedCompany.id, constraint:manifest.savedCompany.trainingClearance}];
  for (const name of pins.keys()) {
    const match = roomLayout.exec(name);
    if (!match) continue;
    const prefix = name.slice(0, -'/layout.json'.length);
    const {id} = await pinnedJson(name);
    let constraint;
    if (id === document.id) {
      const receipt = prefix + '/training-edit.json', recipe = prefix + '/batch-result/input.json';
      if (pins.has(receipt)) constraint = (await pinnedJson(receipt)).trainingClearance;
      else if (pins.has(recipe)) constraint = (await pinnedJson(recipe)).trainingClearance;
    }
    scopes.push({key:match[1], prefix, id, constraint});
  }
  const files = scope => ['save.json', 'layout.json', 'batch-result/save.json', 'batch-result/layout.json']
    .map(name => scope.prefix + '/' + name);
  const origin = scopes.find(scope => files(scope).includes(relative));
  const candidates = scopes.filter(scope => scope.id === document.id);
  const choice = selected === undefined ? undefined : candidates.find(scope => scope.key === selected);
  if ((selected !== undefined && !choice) || (origin && (origin.id !== document.id || (choice && origin !== choice))))
    fail('training-room-origin-mismatch', input, 'Select the packaged room that owns this company layout.');
  if (origin) return origin.constraint;

  const inherited = await editedTrainingConstraint(input, document);
  if (inherited) {
    const allowed = choice ? [choice] : candidates;
    if (allowed.length && !allowed.some(scope => isDeepStrictEqual(scope.constraint, inherited)))
      fail('training-edit-mismatch', input, 'The edit receipt differs from the company training contract in this package.');
    return inherited;
  }
  const hash = digest(bytes);
  const identical = candidates.filter(scope => files(scope).some(name => pins.get(name)?.sha256 === hash));
  const possible = identical.length ? identical : candidates;
  if (choice) {
    if (!possible.includes(choice)) fail('training-room-origin-mismatch', input, 'The saved bytes belong to a different room.');
    return choice.constraint;
  }
  const first = possible[0]?.constraint;
  if (possible.some(scope => !isDeepStrictEqual(scope.constraint, first)))
    fail('ambiguous-training-room', input, 'Use the original packaged room path or append --room KEY to select the intended room.');
  return first;
}
