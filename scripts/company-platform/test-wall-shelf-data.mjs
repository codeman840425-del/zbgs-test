import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {WALL_SHELF_IDS,WALL_SHELF_DESIGNS,WALL_SHELF_MOUNTING,WALL_SHELF_FOOTPRINT,WALL_SHELF_SUPPORTS,WALL_SHELF_NODES,validateWallShelfResource} from '../../prototype/src/company/wall-shelf-data.js';
import {validateSupportResource} from '../../prototype/src/company/support-data.js';
import {createWallShelfSample} from '../../prototype/src/company/wall-shelf-samples.js';
import {deriveCompany,prepareCompanyChange} from '../../prototype/src/company/document.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
import {compareFacilityFunction} from '../../prototype/src/company/appearance-contract.js';
import {encodeCompanySave,decodeCompanySave} from '../../prototype/src/company/persistence.js';

const synthetic=process.argv.includes('--synthetic');
const output=path.resolve(process.argv[2]||'evidence/company-wall-shelf-data-v1/actual');
await fs.mkdir(output,{recursive:true});
const clone=structuredClone,hash=b=>createHash('sha256').update(b).digest('hex');
const base=JSON.parse(await fs.readFile('prototype/src/company/library-catalog.json','utf8'));
const templates=JSON.parse(await fs.readFile('prototype/src/company/templates-extended.json','utf8'));
const shelves=synthetic?WALL_SHELF_IDS.map((id,i)=>({id,version:1,category:'decor',mountRole:'wall-shelf',productionBranch:'wall-shelf',mount:'wall',
  mounting:clone(WALL_SHELF_MOUNTING),footprint:clone(WALL_SHELF_FOOTPRINT),supportSurfaces:clone(WALL_SHELF_SUPPORTS),supportNodes:clone(WALL_SHELF_NODES),
  coordinates:{units:'metres',up:'+Y',forward:'+Z'},provenance:{sourceDesign:WALL_SHELF_DESIGNS[i]},stateDefaults:{},usePoints:[],
  asset:{format:'glb',url:'/synthetic-wall-shelf.glb',sha256:'0'.repeat(64),bytes:20}})):WALL_SHELF_IDS.map(id=>base.resources.find(r=>r.id===id&&r.version===1));
assert(shelves.every(Boolean),'Missing registered wall shelf');
const catalog={...base,resources:[...base.resources.filter(r=>!WALL_SHELF_IDS.includes(r.id)),...shelves]};
const options={catalog,templates},ref=r=>({id:r.id,version:r.version}),fail=(code,location,message)=>{throw Object.assign(Error(message),{code,path:location});};
const checks=[];
async function check(name,run){try{checks.push({name,status:'passed',result:await run()});}catch(e){checks.push({name,status:'failed',code:e.code,error:e.stack});}}
function input(alternate=false){return createWallShelfSample(catalog,templates,{alternate}).document;}
function change(doc,ops){const next=prepareCompanyChange(doc,ops,options).document;inspectCompanyPlacement(next,catalog,templates);return next;}
const node=(doc,id)=>doc.nodes.find(n=>n.id===id),near=(a,b)=>a.forEach((x,i)=>assert(Math.abs(x-b[i])<1e-8,`${a} != ${b}`));

await check('Four resources share one function, support ordering is irrelevant, new identity/version accepted',()=>{
  const future={...clone(shelves[0]),id:'future-wall-shelf',version:2};future.supportSurfaces.reverse();
  for(const r of [...shelves,future]){validateWallShelfResource(r,fail);validateSupportResource(r,fail);assert(compareFacilityFunction(shelves[0],r).compatible);}
  return{resources:shelves.map(ref),future:ref(future),synthetic};
});
await check('Incorrect wall/support/state contracts cannot enter as compatible appearances',()=>{
  const edits=[r=>r.mount='floor-surface',r=>r.mountRole='storage-shelf',r=>r.productionBranch='storage-shelf',r=>r.mounting.origin='center',r=>r.mounting.depth=.4,
    r=>r.footprint.blocking=false,r=>r.footprint.center[1]=0,r=>r.supportSurfaces[0].topY=.36,r=>r.supportSurfaces[0].halfSize[0]=.45,
    r=>r.supportSurfaces[2].clearanceHeight=.3,r=>r.supportSurfaces.push(clone(r.supportSurfaces[0])),r=>r.supportNodes.top='other-board',
    r=>r.stateDefaults.open=true,r=>r.usePoints.push({id:'seat'}),r=>r.provenance.sourceDesign='unverified',r=>r.materialSlots={wood:['']},r=>r.extra=true];
  for(const edit of edits){const bad=clone(shelves[0]);edit(bad);assert.throws(()=>validateSupportResource(bad,fail),e=>e.code==='invalid-wall-shelf-contract');}
  return{rejected:edits.length};
});
await check('Two orientations use the same three support planes and correct world transforms',()=>{
  const result=[];
  for(const alternate of [false,true]){
    const doc=input(alternate),d=deriveCompany(doc,catalog,templates);inspectCompanyPlacement(doc,catalog,templates);
    const cup=d.facilities.find(f=>f.id==='wall-shelf/cup'),top=d.facilities.find(f=>f.id==='wall-shelf/pen-notebook');
    near(cup.world.position,alternate?[3.21,.7,.22]:[-.98,.7,-2.335]);
    near(top.world.position,alternate?[3.21,1.9,.4]:[-.8,1.9,-2.335]);
    assert.equal(d.obstacles.filter(o=>o.id==='wall-shelf/primary').length,1);
    result.push({id:doc.id,cup:cup.world.position,top:top.world.position});
  }return result;
});
await check('Wall relocation, group copy and appearance change retain child edits, identity and support layer',async()=>{
  let doc=change(input(),[{type:'move',id:'wall-shelf/tissue',transform:{position:[.1,.95,.19],yaw:Math.PI/2}}]);
  const child=clone(node(doc,'wall-shelf/tissue'));
  doc=change(doc,[{type:'move',id:'wall-shelf/primary',transform:{position:[3.4,.35,.4],yaw:Math.PI*1.5}}]);
  assert.deepEqual(node(doc,'wall-shelf/tissue'),child);
  doc=change(doc,[{type:'copy-facility',id:'wall-shelf/primary',newId:'shelf-copy',transform:{position:[3.4,.35,-1.4],yaw:Math.PI*1.5}}]);
  const children=doc.nodes.filter(n=>n.parentId==='shelf-copy');assert.equal(children.length,4);assert(children.every(n=>!input().nodes.some(old=>old.id===n.id)));
  for(const r of shelves){doc=change(doc,[{type:'replace-resource',id:'wall-shelf/primary',resource:ref(r)}]);assert.deepEqual(node(doc,'wall-shelf/tissue'),child);
    const bytes=await encodeCompanySave(doc,catalog,templates);assert.deepEqual(await decodeCompanySave(bytes,catalog,templates),doc);}
  const moved=change(doc,[{type:'attach-surface',id:'wall-shelf/cup',parentId:'wall-shelf/primary',surfaceId:'middle',transform:{position:[-.22,.95,.19],yaw:0}}]);
  assert.equal(node(moved,'wall-shelf/cup').attachment.surfaceId,'middle');
  return{appearances:shelves.length,copiedChildren:children.map(n=>n.id),savedAllNodes:doc.nodes.length};
});
await check('Bad installation and child edits reject without mutating the original document',()=>{
  const doc=input(),before=JSON.stringify(doc),cases=[
    [{type:'move',id:'wall-shelf/primary',transform:{position:[-.8,.35,-2.5],yaw:0}}],
    [{type:'move',id:'wall-shelf/primary',transform:{position:[-.8,1.1,-2.525],yaw:0}}],
    [{type:'move',id:'wall-shelf/primary',transform:{position:[3.1,.35,-2.525],yaw:0}}],
    [{type:'move',id:'wall-shelf/cup',transform:{position:[-.18,.36,.19],yaw:0}}],
    [{type:'move',id:'wall-shelf/cup',transform:{position:[-.38,.35,.19],yaw:0}}],
    [{type:'move',id:'wall-shelf/cup',transform:{position:[.18,.35,.19],yaw:0}}],
    [{type:'attach-surface',id:'wall-shelf/cup',parentId:'wall-shelf/primary',surfaceId:'absent',transform:{position:[0,.35,.19],yaw:0}}],
    [{type:'copy-facility',id:'wall-shelf/primary',newId:'overlap',transform:{position:[-.4,.35,-2.525],yaw:0}}],
    [{type:'set-state',id:'wall-shelf/primary',state:{openFraction:1}}],
    [{type:'group-facilities',id:'invalid-wall-group',parentId:doc.nodes[1].id,memberIds:['wall-shelf/primary']}],
  ];const codes=[];
  for(const ops of cases){assert.throws(()=>change(doc,ops),e=>{assert(e.code);codes.push(e.code);return true;});assert.equal(JSON.stringify(doc),before);}
  assert.equal(codes.at(-1),'missing-mount-region');
  return{rejected:cases.length,codes};
});
await check('Actual resource SHA and legacy complete definitions remain consistent',async()=>{
  if(synthetic)return{skipped:'Synthetic metadata only; production SHA and legacy snapshot checked after registration'};
  const legacy=JSON.parse(await fs.readFile('evidence/company-wall-shelf-data-v1/legacy-resources-before.json','utf8'));
  assert.equal(legacy.length,157);
  for(const old of legacy)assert.deepEqual(catalog.resources.find(r=>r.id===old.id&&r.version===old.version),old);
  const files=[];for(const r of shelves){const p=`prototype/public${r.asset.url}`,b=await fs.readFile(p);assert.equal(hash(b),r.asset.sha256);assert.equal(b.length,r.asset.bytes);files.push({path:p,sha256:hash(b)});}
  return{unchangedLegacyResources:legacy.length,files};
});
const sourceHashes={};
for(const file of ['prototype/src/company/wall-shelf-data.js','prototype/src/company/wall-shelf-samples.js','prototype/src/company/support-data.js',
  'prototype/src/company/document.js','prototype/src/company/appearance-contract.js','scripts/company-platform/test-wall-shelf-data.mjs'])sourceHashes[file]=hash(await fs.readFile(file));
const report={status:checks.every(c=>c.status==='passed')?'passed':'failed',mode:synthetic?'synthetic-metadata':'production-descriptors-and-file-hashes',checks,sourceHashes,
  limits:['No actual GLB loading, renderer, pixels or browser restart in this CPU data test. Those require independent geometry and runtime evidence.','No C3 characters, physics or ordinary-PC performance claim.']};
await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output,status:report.status,checks:checks.map(({name,status,code})=>({name,status,code}))},null,2));
if(report.status!=='passed')process.exitCode=1;
