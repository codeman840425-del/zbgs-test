import fs from 'node:fs/promises';
import path from 'node:path';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {createCompany, prepareCompanyChange, deriveCompany, restoreCompany, serializeCompany} from '../../prototype/src/company/document.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';

const [command, input, operations, output] = process.argv.slice(2);
const read = async file => restoreCompany(await fs.readFile(file,'utf8'),catalog,templates);
async function write(file, document) {
  inspectCompanyPlacement(document,catalog,templates);
  const bytes=serializeCompany(document,catalog,templates);
  await fs.mkdir(path.dirname(path.resolve(file)),{recursive:true});
  const handle=await fs.open(file,'wx');
  try { await handle.writeFile(bytes,'utf8'); await handle.sync(); } finally { await handle.close(); }
}
try {
  if (command==='create' && input) {
    const company=createCompany({},catalog);
    const document=prepareCompanyChange(company,[-1.5,1.5].map((x,i)=>({type:'add-workstation',id:`station-${i+1}`,parentId:'company-demo/room-1',template:{id:'stream-station',version:1},transform:{position:[x,0,0],yaw:0}})),{catalog,templates}).document;
    await write(input,document);console.log(JSON.stringify({ok:true,output:input,revision:document.revision}));
  } else if (command==='validate' && input) {
    const document=await read(input), derived=deriveCompany(document,catalog,templates);
    const placement=inspectCompanyPlacement(document,catalog,templates);
    console.log(JSON.stringify({ok:true,id:document.id,revision:document.revision,capacity:derived.capacity,usePointIds:derived.usePoints.map(p=>p.id),placement,scope:'Static authoring and conservative room passage checks only. Real character navigation, contact and use remain C3 validation.'},null,2));
  } else if (command==='apply' && input && operations && output) {
    const previous=await read(input), ops=JSON.parse(await fs.readFile(operations,'utf8'));
    const next=prepareCompanyChange(previous,ops,{catalog,templates}).document;
    await write(output,next);console.log(JSON.stringify({ok:true,output,previousRevision:previous.revision,revision:next.revision}));
  } else {
    console.log('node scripts/company-platform/company.mjs create NEW_LAYOUT.json\nnode scripts/company-platform/company.mjs validate LAYOUT.json\nnode scripts/company-platform/company.mjs apply LAYOUT.json OPS.json NEW_LAYOUT.json\nOutputs must be new paths; existing valid layouts are never overwritten.');
    if(command && command!=='help')process.exitCode=1;
  }
} catch(error) {
  console.error(JSON.stringify({ok:false,code:error.code||'io-error',path:error.path,message:error.message,details:error.details},null,2));process.exitCode=1;
}
