import fs from 'node:fs/promises';
import {createClockSample} from '../../prototype/src/company/clock-samples.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
const root=new URL('../../',import.meta.url),read=async name=>JSON.parse(await fs.readFile(new URL(name,root)));
const catalog=await read('prototype/src/company/library-catalog.json'),templates=await read('prototype/src/company/templates-extended.json');
for(const alternate of [false,true]) {
  const {document}=createClockSample(catalog,templates,{alternate});inspectCompanyPlacement(document,catalog,templates);
  const output=new URL(`prototype/src/company/examples/c1-clock-${alternate?'alternate':'display'}.json`,root),bytes=JSON.stringify(document,null,2)+'\n';
  if(process.argv.includes('--check')){if(await fs.readFile(output,'utf8')!==bytes)throw Error(`Stale clock input ${output}`);}
  else await fs.writeFile(output,bytes);
}
console.log(JSON.stringify({status:'passed',inputs:2}));
