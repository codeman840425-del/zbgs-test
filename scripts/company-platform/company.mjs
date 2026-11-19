import fs from 'node:fs/promises';
import path from 'node:path';
import {checkManagedOutput} from './package-company.mjs';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {createCompany, prepareCompanyChange, deriveCompany, restoreCompany, serializeCompany} from '../../prototype/src/company/document.js';
import {inspectCompanyPlacement,inspectCompanyMotionSweep} from '../../prototype/src/company/placement.js';

const [command, input, operations, output] = process.argv.slice(2);
const read = async file => restoreCompany(await fs.readFile(file,'utf8'),catalog,templates);
async function checkWashroom(document,derived=deriveCompany(document,catalog,templates)) {
  if(!Object.hasOwn(document,'publicWashrooms')&&!derived.facilities.some(item=>item.resource.mountRole==='public-washbasin')) return [];
  const {checkPublicWashrooms}=await import('./check-public-washroom.mjs');
  return checkPublicWashrooms(document,{catalog,templates,derived});
}
async function checkMeeting(document,derived) {
  if (!Object.hasOwn(document,'meetingRooms') && !document.nodes.some(node=>node.publicRole==='meeting-training')) return [];
  const {checkMeetingRooms}=await import('./check-meeting-room.mjs');
  return checkMeetingRooms(document,{catalog,templates,derived});
}
async function checkStorage(document,derived) {
  if (!Object.hasOwn(document,'publicStorageRooms') && !document.nodes.some(node=>node.publicRole==='storage-cleaning')) return [];
  const {checkPublicStorageRooms}=await import('./check-public-storage.mjs');
  return checkPublicStorageRooms(document,{catalog,templates,derived});
}
async function write(file, document) {
  await checkManagedOutput(path.resolve(file),undefined,{allowDelivery:false});
  inspectCompanyPlacement(document,catalog,templates);
  const derived=deriveCompany(document,catalog,templates);
  await checkWashroom(document,derived);
  await checkMeeting(document,derived);
  await checkStorage(document,derived);
  const bytes=serializeCompany(document,catalog,templates);
  const parent=path.dirname(path.resolve(file));
  if(parent!==path.parse(parent).root)await fs.mkdir(parent,{recursive:true});
  const stage=await fs.mkdtemp(path.join(parent,'.company-layout-'));
  const candidate=path.join(stage,'layout.json');
  try {
    const handle=await fs.open(candidate,'wx');
    try {await handle.writeFile(bytes,'utf8');await handle.sync();} finally {await handle.close();}
    await fs.link(candidate,file);
  } finally {
    await fs.rm(candidate,{force:true});
    await fs.rmdir(stage);
  }
}
try {
  if (command==='create' && input) {
    const company=createCompany({},catalog);
    const document=prepareCompanyChange(company,[-1.5,1.5].map((x,i)=>({type:'add-workstation',id:`station-${i+1}`,parentId:'company-demo/room-1',template:{id:'stream-station',version:1},transform:{position:[x,0,0],yaw:0}})),{catalog,templates}).document;
    await write(input,document);console.log(JSON.stringify({ok:true,output:input,revision:document.revision}));
  } else if (command==='validate' && input) {
    const document=await read(input), derived=deriveCompany(document,catalog,templates);
    const placement=inspectCompanyPlacement(document,catalog,templates);
    const publicWashrooms=await checkWashroom(document,derived);
    const meetingRooms=await checkMeeting(document,derived);
    const publicStorageRooms=await checkStorage(document,derived);
    console.log(JSON.stringify({ok:true,id:document.id,revision:document.revision,capacity:derived.capacity,usePointIds:derived.usePoints.map(p=>p.id),placement,...(publicWashrooms.length?{publicWashrooms}:{}),...(meetingRooms.length?{meetingRooms}:{}),...(publicStorageRooms.length?{publicStorageRooms}:{}),scope:'Static authoring and conservative room passage checks only. Real character navigation, contact and use remain C3 validation.'},null,2));
  } else if (command==='apply' && input && operations && output) {
    const previous=await read(input), ops=JSON.parse(await fs.readFile(operations,'utf8'));
    const next=prepareCompanyChange(previous,ops,{catalog,templates}).document;
    inspectCompanyMotionSweep(previous,next,catalog,templates);
    await write(output,next);console.log(JSON.stringify({ok:true,output,previousRevision:previous.revision,revision:next.revision}));
  } else {
    console.log('node scripts/company-platform/company.mjs create NEW_LAYOUT.json\nnode scripts/company-platform/company.mjs validate LAYOUT.json\nnode scripts/company-platform/company.mjs apply LAYOUT.json OPS.json NEW_LAYOUT.json\nOutputs must be new paths; existing valid layouts are never overwritten.');
    if(command && command!=='help')process.exitCode=1;
  }
} catch(error) {
  console.error(JSON.stringify({ok:false,code:error.code||'io-error',path:error.path,message:error.message,details:error.details},null,2));process.exitCode=1;
}
