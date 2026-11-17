import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createInformationSample} from '../../prototype/src/company/information-samples.js';
const root=new URL('../../',import.meta.url);
const catalog=JSON.parse(await fs.readFile(new URL('prototype/src/company/library-catalog.json',root)));
const templates=JSON.parse(await fs.readFile(new URL('prototype/src/company/templates-extended.json',root)));
for(const alternate of [false,true]) {
  const doc=createInformationSample(catalog,templates,{alternate}).document;
  const target=new URL(`prototype/src/company/examples/c1-information-${alternate?'alternate':'display'}.json`,root);
  const text=JSON.stringify(doc,null,2)+'\n';
  if(process.argv.includes('--check'))assert.equal(await fs.readFile(target,'utf8'),text);
  else await fs.writeFile(target,text);
}
console.log(JSON.stringify({status:'passed',inputs:2}));
