import fs from 'node:fs/promises';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {createWindowSample} from '../../prototype/src/company/window-samples.js';
for(const alternate of [false,true]){
  const {document}=createWindowSample(catalog,templates,{alternate});
  const file=new URL(`../../prototype/src/company/examples/${alternate?'c2-window-alternate':'c2-window-company'}.json`,import.meta.url);
  const text=JSON.stringify(document,null,2)+'\n';
  if(process.argv.includes('--check')){if(await fs.readFile(file,'utf8')!==text)throw Error('Window sample is stale');}
  else await fs.writeFile(file,text);
  console.log(document.id);
}
