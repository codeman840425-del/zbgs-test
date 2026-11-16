import assert from 'node:assert/strict';
import {readFile, writeFile, mkdtemp, mkdir, readdir, rm, unlink} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createInventory, exportInventory} from './inventory.mjs';
import {digest, jsonBytes, runtimePath, checkedBytes, writeFresh} from './files.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2), options = {};
for (let index=0;index<args.length;index+=2) options[args[index]]=args[index+1];
if (!options['--dist']) throw Error('Usage: node scripts/runtime-package/qa.mjs --dist FIXED_DIST [--out FRESH_REPORT]');
const dist=path.resolve(options['--dist']);
const temporary=await mkdtemp(path.join(tmpdir(),'gamemake-runtime-package-'));
const results=[];
const record=(name)=>results.push({case:name,passed:true});
async function reject(code, operation) {
  await assert.rejects(operation,error=>error.code===code,code);
}
async function packageHashes(dir) {
  const rows=[];
  async function visit(relative='') {
    for (const entry of await readdir(path.join(dir,relative),{withFileTypes:true})) {
      const target=path.posix.join(relative,entry.name);
      if (entry.isDirectory()) await visit(target);
      else rows.push([target,digest(await readFile(path.join(dir,target)))]);
    }
  }
  await visit();return rows.sort(([a],[b])=>a.localeCompare(b,'en'));
}
try {
  const male=JSON.parse(await readFile(path.join(root,'scripts/runtime-package/fixtures/male-outer-shorts.json')));
  const female=JSON.parse(await readFile(path.join(root,'scripts/runtime-package/fixtures/female-default.json')));
  const common={dist,sourceRoot:root};
  const inventory=await createInventory({...common,input:male});
  const femaleInventory=await createInventory({...common,input:female});
  assert(inventory.files.some(row=>row.path.endsWith('coverage-mask.json')));
  assert(inventory.files.some(row=>row.path.endsWith('m1b-shorts-cloth-v4-review1.json')));
  assert(!inventory.files.some(row=>row.path.includes('onepiece')||row.path.includes('base-female')));
  assert(!femaleInventory.files.some(row=>row.path.includes('uniform-skirt')||row.path.includes('base-male')));
  assert(femaleInventory.files.some(row=>row.path.includes('body-coverage-risk')));
  for (const candidate of [inventory,femaleInventory]) {
    const recipe=JSON.parse(candidate.files.find(row=>row.path==='selected-appearance.recipe.json').generated);
    assert.equal(recipe.schema,'workbench-appearance-recipe-v6');
    assert.equal(recipe.materialSelections,undefined);
  }
  record('real male outer-shorts material and female default dependency declarations');
  const repeated=await createInventory({...common,input:male});
  assert.deepEqual(repeated,inventory);record('same explicit input generates identical inventory');
  const first=path.join(temporary,'first'),second=path.join(temporary,'second');
  await exportInventory({...common,inventory,out:first});
  await exportInventory({...common,inventory,out:second});
  assert.deepEqual(await packageHashes(first),await packageHashes(second));
  const femaleOut=path.join(temporary,'female');
  await exportInventory({...common,inventory:femaleInventory,out:femaleOut});
  for (const candidate of [inventory,femaleInventory])
    for (const row of candidate.files) await checkedBytes(candidate===inventory?first:femaleOut,row);
  record('two repeated real exports are byte-identical and both bodies read back with declared hashes');
  const before=await packageHashes(first);
  await reject('output-conflict',()=>exportInventory({...common,inventory,out:first}));
  assert.deepEqual(await packageHashes(first),before);record('existing successful output cannot be overwritten');
  for (const value of ['../outside','/assets/../outside','https://example.com/body.glb','//server/body.glb','C:/body.glb','assets/%2e%2e/body.glb'])
    assert.throws(()=>runtimePath(value),error=>error.code==='unsafe-path');
  record('path traversal and external runtime URLs are rejected');
  const removed=structuredClone(inventory);
  removed.files=removed.files.filter(row=>!row.path.includes('base-male-roundtrip'));
  await reject('inventory-mismatch',()=>exportInventory({...common,inventory:removed,out:path.join(temporary,'removed-body')}));
  record('caller cannot drop a required body row');
  const missingConfig=structuredClone(inventory);
  missingConfig.files=missingConfig.files.filter(row=>!row.path.includes('coverage-mask'));
  await reject('inventory-mismatch',()=>exportInventory({...common,inventory:missingConfig,out:path.join(temporary,'removed-coverage')}));
  record('caller cannot drop a selected dynamic coverage dependency');
  const substituted=structuredClone(inventory),js=substituted.files.find(row=>row.path.endsWith('.js'));
  js.generated='console.log("substituted")';js.bytes=Buffer.byteLength(js.generated);js.sha256=digest(js.generated);
  await reject('inventory-mismatch',()=>exportInventory({...common,inventory:substituted,out:path.join(temporary,'generated-js')}));
  record('generated text cannot replace a fixed runtime bundle');
  const escaped=structuredClone(inventory);escaped.files[0].path='../outside';
  await reject('inventory-mismatch',()=>exportInventory({...common,inventory:escaped,out:path.join(temporary,'escape')}));
  record('edited inventory path cannot escape export staging');
  const bodyPath=inventory.files.find(row=>row.path.includes('base-male-roundtrip')).path;
  const bodyBytes=await readFile(path.join(second,bodyPath));
  await unlink(path.join(second,bodyPath));
  await reject('missing-dependency',()=>exportInventory({dist:second,sourceRoot:root,inventory,out:path.join(temporary,'missing-file')}));
  await writeFile(path.join(second,bodyPath),bodyBytes);
  record('actual missing model file fails before a package is installed');
  const garment=inventory.files.find(row=>row.path.endsWith('m1b-uniform-shorts-v1.glb')).path;
  const garmentBytes=await readFile(path.join(second,garment));
  const damaged=Buffer.from(garmentBytes);damaged[damaged.length-1]^=1;
  await writeFile(path.join(second,garment),damaged);
  await reject('modified-dependency',()=>exportInventory({dist:second,sourceRoot:root,inventory,out:path.join(temporary,'bad-model')}));
  await writeFile(path.join(second,garment),garmentBytes);record('actual modified selected garment bytes are rejected');
  const jsPath=inventory.files.find(row=>row.path.endsWith('.js')).path;
  const originalJs=await readFile(path.join(second,jsPath));
  await writeFile(path.join(second,jsPath),Buffer.concat([originalJs,Buffer.from('\n// changed\n')]));
  await reject('modified-dependency',()=>createInventory({dist:second,sourceRoot:root,input:male}));
  await writeFile(path.join(second,jsPath),originalJs);record('actual modified JS is rejected despite unchanged build-info');
  for (const bad of [{...male,bodyType:'m2-male-jaw-v1'},{...male,outfitIndex:5},
    {...male,appearance:{hairStyle:'male-sidepart-v1'}},{...male,geometry:{mouthWidth:0.12}},
    {...male,geometry:{headWidth:0.1}},{...male,unknown:true}])
    await reject('unsupported-input',()=>createInventory({...common,input:bad}));
  record('unsupported body, outfit, replacement hair, geometry and unknown fields are explicit failures');
  assert(!(await readdir(temporary)).some(name=>name.includes('.stage-')));record('negative cases leave no partial installed package or staging directory');
  const report={schema:'runtime-package-cpu-report-v1',passed:true,results,
    male:{files:inventory.files.length,bytes:inventory.files.reduce((n,row)=>n+row.bytes,0),inventorySha256:digest(jsonBytes(inventory))},
    female:{files:femaleInventory.files.length,bytes:femaleInventory.files.reduce((n,row)=>n+row.bytes,0),inventorySha256:digest(jsonBytes(femaleInventory))},
    runtime:inventory.runtime,scope:'CPU source/config/byte integrity and export only. No browser, GPU, visual or target-device acceptance.'};
  if(options['--out']) await writeFresh(path.resolve(options['--out']),jsonBytes(report));
  console.log(JSON.stringify(report,null,2));
} finally { await rm(temporary,{recursive:true,force:true}); }
