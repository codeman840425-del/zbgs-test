// Reuse the game's existing offline bind verification; does not render or animate.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {verifyEquipmentBindings} from '../verify-catalog-bindings.mjs';
const [folder, bodyFile] = process.argv.slice(2);
const root = fs.realpathSync(folder);
function read(relative) {
  const full = fs.realpathSync(path.resolve(root, relative));
  if (!full.startsWith(root + path.sep)) throw Error('Path outside candidate');
  return fs.readFileSync(full);
}
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const body = read(bodyFile);
const manifest = JSON.parse(read('equipment.json'));
const results = manifest.items.map(item => {
  const garment = read(item.url);
  if (hash(body) !== item.compatibleAvatarSha256 || hash(garment) !== item.sha256 || garment.length !== item.bytes) throw Error('Resource identity mismatch: ' + item.id);
  return {id:item.id, ...verifyEquipmentBindings(garment, body, item)};
});
console.log(JSON.stringify(results));
