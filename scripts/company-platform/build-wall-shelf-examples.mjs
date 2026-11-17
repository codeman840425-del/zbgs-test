import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createWallShelfSample} from '../../prototype/src/company/wall-shelf-samples.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
const root=new URL('../../',import.meta.url),read=async p=>JSON.parse(await fs.readFile(new URL(p,root)));
assert(process.argv.slice(2).every(a=>a==='--check'),'Only --check is supported');
const catalog=await read('prototype/src/company/library-catalog.json'),templates=await read('prototype/src/company/templates-extended.json');
for(const alternate of [false,true]) {
  const {document}=createWallShelfSample(catalog,templates,{alternate});
  inspectCompanyPlacement(document,catalog,templates);
  const file=new URL(`prototype/src/company/examples/c1-wall-shelf-${alternate?'alternate':'display'}.json`,root),bytes=Buffer.from(JSON.stringify(document,null,2)+'\n');
  if(process.argv.includes('--check'))assert((await fs.readFile(file)).equals(bytes),'Wall-shelf layout differs');
  else await fs.writeFile(file,bytes);
}
console.log(JSON.stringify({status:'passed',inputs:2}));
