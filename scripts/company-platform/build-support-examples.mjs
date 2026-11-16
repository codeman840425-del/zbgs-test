import fs from 'node:fs/promises';
import {createSupportSample} from '../../prototype/src/company/support-samples.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
const root=new URL('../../',import.meta.url),read=async name=>JSON.parse(await fs.readFile(new URL(name,root)));
const catalog=await read('prototype/src/company/library-catalog.json'),templates=await read('prototype/src/company/templates-extended.json');
for(const alternate of [false,true]) {
  const result=createSupportSample(catalog,templates,{alternate});inspectCompanyPlacement(result.document,catalog,templates);
  const output=new URL(`prototype/src/company/examples/c1-support-${alternate?'alternate':'display'}.json`,root),bytes=JSON.stringify(result.document,null,2)+'\n';
  if(process.argv.includes('--check')){if(await fs.readFile(output,'utf8')!==bytes)throw Error(`Stale support input ${output}`);}
  else await fs.writeFile(output,bytes);
}
console.log(JSON.stringify({status:'passed',inputs:2,mode:process.argv.includes('--check')?'check':'build'}));
