import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInventory, exportInventory} from './inventory.mjs';
import {digest, jsonBytes, writeFresh} from './files.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
async function main() {
  const [command,...args] = process.argv.slice(2), options = {};
  for (let index=0;index<args.length;index+=2) {
    const key = args[index];
    if (!['--input','--inventory','--dist','--out','--source-root'].includes(key) || !args[index+1] || Object.hasOwn(options,key))
      throw Object.assign(Error(`Invalid CLI option ${key}`), {code:'invalid-arguments'});
    options[key] = args[index+1];
  }
  if (!['inventory','export'].includes(command) || !options['--dist'] || !options['--out'] ||
      !options[command === 'inventory' ? '--input' : '--inventory'])
    throw Object.assign(Error('Usage: cli.mjs inventory --input LOOK --dist FIXED_DIST --out INVENTORY | export --inventory INVENTORY --dist FIXED_DIST --out FRESH_DIRECTORY [--source-root REPOSITORY]'), {code:'invalid-arguments'});
  const common = {dist:path.resolve(options['--dist']), sourceRoot:path.resolve(options['--source-root'] || root)};
  if (command === 'inventory') {
    const input = JSON.parse(await readFile(options['--input'],'utf8'));
    const inventory = await createInventory({...common,input});
    const bytes = jsonBytes(inventory);
    await writeFresh(path.resolve(options['--out']),bytes);
    console.log(JSON.stringify({ok:true,files:inventory.files.length,inventorySha256:digest(bytes),runtime:inventory.runtime}));
  } else {
    const inventory = JSON.parse(await readFile(options['--inventory'],'utf8'));
    console.log(JSON.stringify({ok:true,...await exportInventory({...common,inventory,out:options['--out']})}));
  }
}
main().catch(error => {console.error(JSON.stringify({ok:false,code:error.code || 'runtime-package-failed',reason:error.message}));process.exitCode=1;});
