import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {digest, fail, jsonBytes, writeFresh} from './files.mjs';
import {createGameRecordInventory, exportGameRecordInventory} from './game-record-inventory.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sharedOptions = ['--dist', '--source-root', '--reviewed', '--out', '--records'];
const usage = 'Usage: game-record-cli.mjs inventory|export --dist FIXED_DIST --out NEW_PATH [--source-root EXACT_CHECKOUT] [--reviewed IDENTICAL_REVIEWED_COPY] [--records RECORD_ARRAY_JSON] [--inventory INPUT_JSON for export]';
const readJson = async file => JSON.parse(await readFile(path.resolve(file), 'utf8'));

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const options = new Map();
  const names = command === 'export' ? [...sharedOptions, '--inventory'] : sharedOptions;
  if (!['inventory', 'export'].includes(command)) throw Error(usage);
  for (let i = 0; i < args.length; i += 2) {
    const [option, value] = [args[i], args[i+1]];
    if (!names.includes(option) || !value || options.has(option)) throw Error(usage);
    options.set(option, value);
  }
  if (['--dist', '--out', ...(command === 'export' ? ['--inventory'] : [])].some(name => !options.has(name))) throw Error(usage);
  const external = options.has('--records');
  const candidates = external ? [
    './game-record-production-runtime-reviewed.json',
    './game-record-production-iris-reviewed.json',
    './game-record-production-skin-reviewed.json',
    './game-record-production-lip-reviewed.json',
    './game-record-production-shared-normal-reviewed.json',
  ]
    : ['./game-record-runtime-reviewed.json'];
  const {sourceDigest} = await readJson(path.join(options.get('--dist'), 'build-info.json'));
  const reviews = await Promise.all(candidates.map(name => readFile(new URL(name, import.meta.url))));
  const reviewedBytes = reviews.find(bytes => JSON.parse(bytes).sourceDigest === sourceDigest);
  if (!reviewedBytes) fail('unsupported-build', 'No repository review for selected game runtime');
  if (options.has('--reviewed')) {
    const copy = await readFile(path.resolve(options.get('--reviewed')));
    if (!copy.equals(reviewedBytes)) fail('unsupported-build', 'Review metadata must match the repository-reviewed file exactly');
  }
  const common = {
    dist:path.resolve(options.get('--dist')),
    sourceRoot:path.resolve(options.get('--source-root') ?? root),
    reviewed:JSON.parse(reviewedBytes),
    records:external ? await readJson(options.get('--records')) : undefined,
  };
  const out = path.resolve(options.get('--out'));
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
