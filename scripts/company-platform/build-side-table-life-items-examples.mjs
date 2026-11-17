import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createSideTableLifeItemsSample} from '../../prototype/src/company/side-table-life-items-samples.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
const root=new URL('../../',import.meta.url),read=async p=>JSON.parse(await fs.readFile(new URL(p,root)));
const catalog=await read('prototype/src/company/library-catalog.json'),templates=await read('prototype/src/company/templates-extended.json');
for(const alternate of [false,true]) {
  const {document}=createSideTableLifeItemsSample(catalog,templates,{alternate});
  inspectCompanyPlacement(document,catalog,templates);
  const file=new URL(`prototype/src/company/examples/c1-side-table-life-items-${alternate?'alternate':'display'}.json`,root),bytes=Buffer.from(JSON.stringify(document,null,2)+'\n');
  if(process.argv.includes('--check'))assert((await fs.readFile(file)).equals(bytes),'Life-item layout differs');
  else await fs.writeFile(file,bytes);
}
console.log(JSON.stringify({status:'passed',inputs:2}));
