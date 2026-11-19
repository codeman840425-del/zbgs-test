import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as T from '../../prototype/node_modules/three/build/three.module.js';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {deriveCompany,prepareCompanyChange} from '../../prototype/src/company/document.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
import {createCompanyAuthoring} from '../../prototype/src/company/authoring.js';
import {encodeCompanySave,decodeCompanySave} from '../../prototype/src/company/persistence.js';
import {wayfindingFloors,measureWayfindingFloor} from '../../prototype/src/company/wayfinding.js';
import {shouldCheckWayfinding,checkWayfindingRooms} from './check-wayfinding.mjs';
import {preflightLibraryAssets} from './preflight-library-assets.mjs';
import {checkManagedOutput} from './package-company.mjs';
import {runCompanyBatch} from './batch.mjs';

const [dir,variantDir,...extra]=process.argv.slice(2);
assert(dir&&!extra.length,'node test-wayfinding.mjs NEW_MANAGED_DIRECTORY [GENERATED_TRAINING_V2_ROOT]');
const out=path.resolve(dir),published=path.join(out,'published'),root=path.resolve(import.meta.dirname,'../..');
await checkManagedOutput(out,undefined,{allowDelivery:false});
await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out);
const batch=JSON.parse(await fs.readFile(new URL('./batch-inputs/public-wayfinding.json',import.meta.url)));
const opts={catalog,templates},sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const save=(key)=>fs.readFile(path.join(published,key,'save.json'),'utf8'),run=items=>runCompanyBatch({...batch,items},{outputDirectory:published});
const ref=(id,version=1)=>({id,version}),replace=(id,resource)=>({type:'replace-resource',id,resource});
const change=(doc,ops,c=catalog)=>prepareCompanyChange(doc,ops,{catalog:c,templates}).document;
async function fingerprint(){
  const pins={};
  for(const item of batch.items)for(const f of ['input.json','layout.json','save.json','report.json'])
    pins[item.key+'/'+f]=sha(await fs.readFile(path.join(published,item.key,f)));
  return pins;
}
const report={status:'running',rooms:[],rejections:[],scope:'Static public doorway reading planes, physical registration supplies and service routes. Eye elevation is a 1.50 m layout reference.'};
try{
  const first=await run(batch.items);assert(first.ok,JSON.stringify(first));
  const pins=await fingerprint(),docs=[];
  for(const item of batch.items){
    const text=await save(item.key),doc=await decodeCompanySave(text,catalog,templates);docs.push(doc);
    const [r]=await checkWayfindingRooms(doc),publishedReport=JSON.parse(await fs.readFile(path.join(published,item.key,'report.json')));
    assert.deepEqual(publishedReport.checks.wayfindingRooms,[r]);assert.deepEqual(doc.wayfindingRooms,item.wayfindingRooms);
    assert(r.ok&&r.signs.length===3&&r.signs.every(s=>s.visible&&s.rays.length===5&&s.resource.imageSha256.length===64&&s.rays.every(a=>a.angleDegrees<=60)));
    assert(r.routes.every(entry=>Object.values(entry.targets).every(p=>p.portalId===r.signs.find(s=>s.boardId===entry.boardId).portalId)));
    assert(r.service.contacts.length===4&&r.service.reachM<=.80);
    report.rooms.push({key:item.key,saveSha256:sha(text),...r});
  }
  assert(report.rooms[0].service.seats.length===2&&report.rooms[1].service.coat?.slot==='left');
  const [arrivals,training]=docs,[a]=arrivals.wayfindingRooms,[t]=training.wayfindingRooms;
  const old=structuredClone(arrivals);delete old.wayfindingRooms;assert(!shouldCheckWayfinding(old));assert.deepEqual(await checkWayfindingRooms(old),[]);
  async function reject(label,doc,ops,codes){
    const response=await run([{key:doc.id,document:doc,operations:ops}]),e=response.results[0];
    assert.equal(e.status,'failed',label+' '+JSON.stringify(e));assert(codes.includes(e.code),label+' '+JSON.stringify(e));
    assert.deepEqual(await fingerprint(),pins);
    report.rejections.push({label,code:e.code,path:e.path,details:e.details});
  }
  const main=t.signs[0],node=training.nodes.find(n=>n.id===main.boardId);
  const backwards={type:'move',id:main.boardId,transform:{...node.transform,yaw:node.transform.yaw+Math.PI}};
  await reject('back of printed board from actual entrance',training,[backwards],['wayfinding-sign-facing']);
  await reject('generic compatible notice has wrong printed destination',training,[replace(main.contentId,ref('wayfinding-lift'))],['wayfinding-content-meaning']);
  const invalid=structuredClone(training);invalid.wayfindingRooms[0].signs[2].portalId=t.signs[1].portalId;
  await reject('stairs sign reads from lift doorway',invalid,[],['wayfinding-doorway']);
  const swapped=structuredClone(arrivals);swapped.wayfindingRooms[0].signs[1].contentId=a.signs[2].contentId;
  await reject('graphic belongs to another installed board',swapped,[],['wayfinding-sign-binding']);
  const mislabeled=structuredClone(training);mislabeled.wayfindingRooms[0].signs[2].meaning='lift';
  await reject('lift graphic at stairs destination',mislabeled,[replace(t.signs[2].contentId,ref('wayfinding-lift'))],['wayfinding-destination']);
  const obstruct={type:'add-facility',id:a.service.regionId+'/blocking-board',parentId:a.service.regionId,
    resource:ref('information-board-floor-notice'),transform:{position:[-.66,0,-.84],yaw:Math.PI/2}};
  await reject('second physical board blocks printed front',arrivals,[obstruct],['wayfinding-print-blocked']);
  await reject('blocked public room door',training,[{type:'move',id:t.service.counterId,transform:{position:[-5.6,0,-1],yaw:0}}],['blocked-portal','disconnected-portal']);
  await reject('cup placed in lieu of notebook and pen',arrivals,[replace(a.service.registerId,ref('side-table-life-cup'))],['wayfinding-part']);
  const d=deriveCompany(training,catalog,templates),resources=[...d.facilities,...d.surfaceFinishes].map(f=>f.resource);
  await preflightLibraryAssets({root,resources,validate:async library=>{
    const memory=new Map(),storage={getItem:k=>memory.get(k)??null,setItem:(k,val)=>memory.set(k,val)};
    const session=await createCompanyAuthoring(new T.Scene(),training,{...opts,assetLibrary:library,storage,mirrorPreflight:()=>{}});
    try{
      const other=training.nodes.find(n=>n.kind==='floor'&&n.id!==t.floorId);
      await session.setView({floorId:other.id});await session.save();const prior=session.readSavedText(training.id);
      await assert.rejects(session.apply([backwards]),e=>e.code==='wayfinding-sign-facing');
      assert.equal(session.readSavedText(training.id),prior);
      const off={type:'set-state',id:main.contentId,state:{visible:false}};
      await session.apply([off,replace(main.boardId,ref('information-board-floor-doorplate'))]);await session.save();
      const saved=session.readSavedText(training.id),decoded=await decodeCompanySave(saved,catalog,templates);
      await session.apply([{...off,state:{visible:true}}]);await session.restore();
      assert.deepEqual(session.document,decoded);
      const [r]=await checkWayfindingRooms(decoded);
      assert(!r.signs[0].visible&&r.signs[0].rays.length===5);
      assert.equal(decoded.nodes.find(n=>n.id===main.contentId).parentId,main.boardId);
      assert.equal(decoded.nodes.find(n=>n.id===main.boardId).resource.id,'information-board-floor-doorplate');
      report.hiddenFloor={view:other.id,checked:t.floorId,oldSave:sha(prior),restoredSave:sha(saved),visible:false,boardId:main.boardId,contentId:main.contentId};
    }finally{session.dispose();}
  }});
  if(variantDir){
    // Read the generated v2 beside its originals. Dispatch its real GLB through the same scene loader.
    const trial=path.resolve(variantDir),collection=JSON.parse(await fs.readFile(path.join(trial,'assets-source/company-wayfinding-v1/collection.json')));
    const row=collection.resources.find(r=>r.version===2);
    assert(row,'The variant collection needs a v2 training face.');
    const alternate=JSON.parse(await fs.readFile(path.join(trial,row.resourcePath)));
    assert.equal(alternate.wayfindingMeaning,'training');
    const updatedCatalog={...catalog,resources:[...catalog.resources.filter(r=>r.id!==alternate.id||r.version!==alternate.version),alternate]};
    const alternateRef=ref(alternate.id,alternate.version),modified=change(training,[replace(main.contentId,alternateRef)],updatedCatalog);
    const encoded=await encodeCompanySave(modified,updatedCatalog,templates),cold=await decodeCompanySave(encoded,updatedCatalog,templates);
    await assert.rejects(decodeCompanySave(encoded,catalog,templates),e=>['missing-resource-version','dependency-mismatch'].includes(e.code)||/missing/i.test(e.message));
    const physical=deriveCompany(cold,updatedCatalog,templates),[group]=wayfindingFloors(cold,physical);
    await preflightLibraryAssets({root,resources:group.resources.filter(r=>r!==alternate),validate:original=>
      preflightLibraryAssets({root:trial,resources:[alternate],validate:replacement=>{
        const assets={instantiate:r=>(r===alternate?replacement:original).instantiate(r)};
        const [r]=measureWayfindingFloor(cold,physical,inspectCompanyPlacement(cold,updatedCatalog,templates),group,{catalog:updatedCatalog,templates,assetLibrary:assets});
        assert.deepEqual(cold.wayfindingRooms,training.wayfindingRooms);assert.equal(r.signs[0].resource.version,2);
        assert.equal(r.signs[0].resource.assetSha256,alternate.asset.sha256);assert.notEqual(r.signs[0].resource.imageSha256,report.rooms[1].signs[0].resource.imageSha256);
        assert.equal(r.signs[0].rays.length,5);report.variant={...r.signs[0],saveSha256:sha(encoded),originalCatalogRefused:true};
      }})});
  }else report.variant={status:'no-v2-input'};
  const repeat=await run(batch.items);assert(repeat.ok,JSON.stringify(repeat));assert.deepEqual(await fingerprint(),pins);
  report.unchanged=pins;report.retry=repeat.results.map(r=>({key:r.key,status:r.status}));report.status='passed';
}catch(e){report.status='failed';report.error={code:e.code,message:e.message};throw e;}
finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({output:out,status:report.status,rooms:report.rooms.length,rejections:report.rejections.length}));
