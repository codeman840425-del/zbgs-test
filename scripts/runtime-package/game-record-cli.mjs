import {readFile} from 'node:fs/promises';
import path from 'node:path';
import projectOutputs from '../project-output.cjs';
import {fileURLToPath} from 'node:url';
import {digest, fail, jsonBytes, writeFresh} from './files.mjs';
import {createGameRecordInventory, exportGameRecordInventory} from './game-record-inventory.mjs';
import {readGameRuntimeReview} from './game-runtime-review.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sharedOptions = ['--dist', '--source-root', '--reviewed', '--out', '--records'];
const usage = 'Usage: game-record-cli.mjs inventory|export --dist FIXED_DIST --out NEW_PATH [--source-root EXACT_CHECKOUT] [--reviewed IDENTICAL_REVIEWED_COPY] [--records RECORD_ARRAY_JSON [--shape-pack DATA_DIRECTORY]...] [--inventory INPUT_JSON for export]';
const readJson = async file => JSON.parse(await readFile(path.resolve(file), 'utf8'));

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const options = new Map();
  const shapePacks = [];
  const names = command === 'export' ? [...sharedOptions, '--inventory'] : sharedOptions;
  if (!['inventory', 'export'].includes(command)) throw Error(usage);
  for (let i = 0; i < args.length; i += 2) {
    const [option, value] = [args[i], args[i+1]];
    if (option === '--shape-pack') {
      if (!value || value.startsWith('--') || shapePacks.length >= 4) throw Error(usage);
      shapePacks.push(path.resolve(value));
      continue;
    }
    if (!names.includes(option) || !value || options.has(option)) throw Error(usage);
    options.set(option, value);
  }
  if (['--dist', '--out', ...(command === 'export' ? ['--inventory'] : [])].some(name => !options.has(name))) throw Error(usage);
  const out = await projectOutputs.projectOutput(options.get('--out'), await projectOutputs.productionRoot());
  const external = options.has('--records');
  if (shapePacks.length && !external) fail('invalid-record-input', 'Shape packs require explicit signed records');
  const {sourceDigest} = await readJson(path.join(options.get('--dist'), 'build-info.json'));
  const {bytes:reviewedBytes,reviewed} = await readGameRuntimeReview(sourceDigest,external);
  if (options.has('--reviewed')) {
    const copy = await readFile(path.resolve(options.get('--reviewed')));
    if (!copy.equals(reviewedBytes)) fail('unsupported-build', 'Review metadata must match the repository-reviewed file exactly');
  }
  const common = {
    dist:path.resolve(options.get('--dist')),
    sourceRoot:path.resolve(options.get('--source-root') ?? root),
    reviewed, shapePacks,
    records:external ? await readJson(options.get('--records')) : undefined,
  };
  if (command === 'export') {
    const inventory = await readJson(options.get('--inventory'));
    console.log(JSON.stringify({ok:true, ...await exportGameRecordInventory({...common, inventory, out})}));
    return;
  }
  const inventory = await createGameRecordInventory(common);
  const bytes = jsonBytes(inventory);
  await writeFresh(out, bytes);
  console.log(JSON.stringify({ok:true, files:inventory.files.length, records:inventory.records.length,
    inventorySha256:digest(bytes), runtime:inventory.runtime}));
}

main().catch(error => {
  console.error(JSON.stringify({ok:false, code:error.code ?? 'game-record-package-failed', reason:error.message}));
  process.exitCode = 1;
});
