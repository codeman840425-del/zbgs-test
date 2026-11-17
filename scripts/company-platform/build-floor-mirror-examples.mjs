import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createFloorMirrorSample} from '../../prototype/src/company/floor-mirror-samples.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
const root=new URL('../../',import.meta.url),read=async path=>JSON.parse(await fs.readFile(new URL(path,root)));
const catalog=await read('prototype/src/company/library-catalog.json'),templates=await read('prototype/src/company/templates-extended.json');
for(const alternate of [false,true]) {
  const {document}=createFloorMirrorSample(catalog,templates,{alternate});
  inspectCompanyPlacement(document,catalog,templates);
  const path=new URL(`prototype/src/company/examples/c1-floor-mirror-${alternate?'alternate':'display'}.json`,root),bytes=Buffer.from(JSON.stringify(document,null,2)+'\n');
  if(process.argv.includes('--check'))assert((await fs.readFile(path)).equals(bytes),`Output differs: ${path}`);
  else await fs.writeFile(path,bytes);
}
console.log(JSON.stringify({status:'passed',inputs:2}));
