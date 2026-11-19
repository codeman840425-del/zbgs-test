import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {createCompany,deriveCompany,prepareCompanyChange} from '../../prototype/src/company/document.js';
import {createCompanyAuthoring} from '../../prototype/src/company/authoring.js';
import {decodeCompanySave,encodeCompanySave} from '../../prototype/src/company/persistence.js';
import {preflightLibraryAssets} from './preflight-library-assets.mjs';
import {checkTeaStations} from './check-tea-station.mjs';
import {checkManagedOutput} from './package-company.mjs';

const root=path.resolve(import.meta.dirname,'../..'),opts={catalog,templates};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),json=v=>JSON.stringify(v,null,2)+'\n';
const read=async file=>JSON.parse(await fs.readFile(file,'utf8')),write=(file,d)=>fs.writeFile(file,json(d),{flag:'wx'});
const self=process.argv[1],exec=promisify(execFile),keyFor=id=>'company-platform:v1:'+encodeURIComponent(id);
const getNode=(doc,id)=>doc.nodes.find(n=>n.id===id),ref=(id,version=1)=>({id,version});
const batchScript=path.join(import.meta.dirname,'batch.mjs'),input=path.join(import.meta.dirname,'batch-inputs/tea-station-rooms.json');
const knownFailure={packageManifest:'1306f59e9a6a90f0a83c2d7225c20e439e628e7d41c7b6ed4945c554279e0696',build:'5301d1b046ba'};
const table=catalog.resources.find(r=>r.id==='side-table-round'&&r.version===1);
const resources=doc=>{
  const d=deriveCompany(doc,catalog,templates);
  return [...d.facilities.map(f=>f.resource),...d.surfaceFinishes.map(f=>f.resource),...catalog.resources.filter(r=>r.mountRole==='tea-counter'),table];
};
function storageMap(){
  const values=new Map();
  return {values,getItem:key=>values.get(key)??null,setItem:(key,bytes)=>values.set(key,bytes)};
}
function verifyMeasurement(doc,m){
  const rule=doc.teaStations[0];
  assert(m.ok);assert.equal(m.portalId,rule.portalId);assert.deepEqual(m.roles,rule.roles);
  const {counter,machine,cup}=rule.roles;
  assert.deepEqual(m.contacts.map(x=>[x.childId,x.parentId,x.surfaceId]),[[machine,counter,'counter'],[cup,machine,'tray']]);
  assert(m.contacts.every(c=>c.mesh && c.point.length===3 && c.point.every(Number.isFinite)));
  assert(m.serviceDoors.some(d=>d.portalId===rule.portalId));assert(m.serviceDoors.every(d=>JSON.stringify(d.inside.at(-1))===JSON.stringify(rule.service)));
  assert.deepEqual(m.occupiedCleaningPassage.map(d=>d.portalId),rule.passage?.portalIds??[]);
  return {floorId:m.floorId,portal:m.portalId,contacts:m.contacts,serviceDoors:m.serviceDoors,occupiedPassage:m.occupiedCleaningPassage};
}
const editor=(doc,lib,storage)=>createCompanyAuthoring(new THREE.Scene(),doc,{...opts,storage,assetLibrary:lib});
function visibleModels(session,doc){
  const {roles}=doc.teaStations[0],result={};session.scene.root.updateMatrixWorld(true,true);
  for(const [role,id] of Object.entries(roles)){
    const group=session.scene.root.getObjectByName(id),n=getNode(doc,id);assert(group?.children[0],id);
    const reference=catalog.resources.find(r=>r.id===n.resource.id&&r.version===n.resource.version);
    let vertices=0;group.children[0].traverseVisible(m=>{if(m.isMesh)vertices+=m.geometry.attributes.position.count;});
    assert(vertices>0);result[role]={id,resource:n.resource,asset:reference.asset.sha256,vertices,
      worldPosition:group.getWorldPosition(new THREE.Vector3()).toArray(),parent:n.parentId};
  }
  return result;
}
async function cold(file){
  const bytes=await fs.readFile(file,'utf8'),doc=await decodeCompanySave(bytes,catalog,templates);
  const storage=storageMap();storage.setItem(keyFor(doc.id),bytes);
  let proof;
  await preflightLibraryAssets({root,resources:resources(doc),validate:async lib=>{
    const session=await editor(createCompany({id:'parity-empty'},catalog),lib,storage);
    try{
      assert.equal(session.document.id,'parity-empty');await session.restore(doc.id);
      assert.deepEqual(session.document,doc);assert.equal(session.readSavedText(doc.id),bytes);assert.equal(await session.export(),bytes);
      proof={sha256:sha(bytes),from:'parity-empty',id:doc.id,models:visibleModels(session,doc),
        measurement:verifyMeasurement(doc,(await checkTeaStations(session.document,opts))[0])};
    }finally{session.dispose();}
  }});
  console.log(JSON.stringify(proof));
}
const [first,second,...extra]=process.argv.slice(2);
if(first==='--cold-read'){
  assert(second&&!extra.length);await cold(second);
}else{
  assert(first&&!extra.length,'node test-tea-editor-parity.mjs NEW_OUTPUT_DIRECTORY [COUNTER_ID@VERSION]');
  const selected=second??'tea-counter-open@1';
  const selectedCard=catalog.resources.find(r=>r.mountRole==='tea-counter' && r.id+'@'+r.version===selected);
  assert(selectedCard,'Choose a registered tea-counter ID and version');
  const out=path.resolve(first);
  await checkManagedOutput(out,root,{allowDelivery:false});
  await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out);
  const tmp=path.join(out,'tmp');await fs.mkdir(tmp);
  const optsChild={cwd:root,env:{...process.env,TEMP:tmp,TMP:tmp,TMPDIR:tmp},maxBuffer:16*1024*1024,windowsHide:true};
  const report={status:'running',scope:'CPU transactions using the native authoring entry and batch CLI; independent cold Node processes.',knownFailure,selectedCounter:selected,rooms:[]};
  const savedDir=path.join(out,'rooms'),receipt=path.join(out,'report.json');
  async function command(args,status=0){
    let code,stdout,stderr;
    try{({stdout,stderr}=await exec(process.execPath,args,optsChild));code=0;}
    catch(e){({code,stdout,stderr}=e);}
    assert.equal(code,status,JSON.stringify({args,stdout,stderr}).slice(-2000));return JSON.parse(stdout.trim());
  }
  const spec=await read(input);
  async function cliFailure(label,doc,ops,expected){
    const file=path.join(out,label+'.batch.json'),target=path.join(out,label+'.rejected');
    await write(file,{schema:'company-batch',version:1,items:[{key:doc.id,document:doc,operations:ops}]});
    const run=await command([batchScript,file,target],1),[e]=run.results;
    assert.equal(run.ok,false);assert.equal(e.code,expected,e.message);
    assert.equal(await fs.stat(path.join(target,doc.id)).catch(err=>err.code==='ENOENT'?null:Promise.reject(err)),null);
    return {code:e.code,path:e.path,details:e.details};
  }
  async function exercise(doc,label,hiddenFloorId){
    const rule=doc.teaStations[0],counter=getNode(doc,rule.roles.counter);
    const badRotate={type:'move',id:counter.id,transform:{...counter.transform,yaw:counter.transform.yaw+Math.PI}};
    const badDoc=prepareCompanyChange(doc,[badRotate],opts).document,badBytes=await encodeCompanySave(badDoc,catalog,templates);
    const badService=structuredClone(doc);badService.teaStations[0].service[0]+=.65;
    const invalidService=await encodeCompanySave(badService,catalog,templates);
    const errors={rotation:await cliFailure(label+'-rotation',doc,[badRotate],'tea-station-clearance-outside'),
      service:await cliFailure(label+'-service',badService,[],'tea-station-service-point')};
    const blocker={type:'add-facility',id:rule.regionId+'/parity-side-table',parentId:rule.regionId,resource:ref('side-table-round'),
      transform:{position:rule.passage?[0,0,-.65]:[rule.service[0],0,rule.service[1]],yaw:0}};
    errors.obstruction=await cliFailure(label+'-obstruction',doc,[blocker],'tea-station-clearance-obstructed');
    const row={label,company:doc.id,counterId:counter.id,hiddenFloorId,errors,baseline:verifyMeasurement(doc,(await checkTeaStations(doc,opts))[0]),refusals:[]};
    report.rooms.push(row);
    const storage=storageMap();let latest,coldModels;
    await preflightLibraryAssets({root,resources:resources(doc),validate:async lib=>{
      // Delay one real preload to exercise the ordinary newer-transaction guard without changing asset data.
      let gate;
      const scheduledLibrary=Object.create(lib);
      scheduledLibrary.preload=async requested=>{
        const active=gate;
        if(active){gate=null;active.started();await active.hold;}
        return lib.preload(requested);
      };
      const session=await editor(doc,scheduledLibrary,storage);
      try{
        const saved=await session.export();await session.save();assert.equal(session.readSavedText(doc.id),saved);
        const rendered=visibleModels(session,doc);
        if(!hiddenFloorId){
          await lib.preload([table]);
          const probe=session.scene.createPlacementProbe(),activeRoot=session.scene.root,snapshot=session.snapshot();
          const timings=[];
          const measure=(tag,op,error)=>{
            const start=performance.now();
            try{
              if(error)assert.throws(()=>probe.check([op]),e=>{assert.equal(e.code,error.code);assert.equal(e.path,error.path);return true;});
              else assert.equal(probe.check([op]).valid,true);
            }finally{timings.push({tag,ms:Number((performance.now()-start).toFixed(2))});}
          };
          try{
            const legalDrag=dx=>({...badRotate,transform:{position:counter.transform.position.map((n,i)=>i===0?n+dx:n),yaw:counter.transform.yaw}});
            measure('first-legal',legalDrag(0));const member=probe.visual(counter.id);assert(member);
            for(const dx of (rule.passage?[.008,-.012,.018]:[.008])){
              measure('move-'+dx,legalDrag(dx));assert.equal(probe.visual(counter.id),member);
            }
            measure('turn-rejected',badRotate,errors.rotation);
            measure('actual-side-table-rejected',blocker,errors.obstruction);
            measure('legal-recovered',legalDrag(0));assert.deepEqual(session.snapshot(),snapshot);assert.equal(session.scene.root,activeRoot);
            assert.equal(session.readSavedText(doc.id),saved);
          }finally{probe.dispose();}
          row.drag={roomCount:doc.nodes.filter(n=>n.kind==='room').length,view:'floor',timings,unchangedSave:sha(saved)};
        }
        session.scene.setWallView({mode:'cutaway',cameraPosition:[3,2,3]});
        await session.setView({mode:'room',floorId:row.baseline.floorId,roomId:rule.regionId});
        assert.deepEqual(visibleModels(session,doc),rendered);assert.deepEqual(session.document,doc);assert.equal(await session.export(),saved);
        if(hiddenFloorId){await session.setView({mode:'floor',floorId:hiddenFloorId,roomId:null});assert(!session.scene.root.getObjectByName(counter.id));}
        async function reject(action,call,expected){
          const scene=session.scene.root,snapshot=session.snapshot(),bytes=session.readSavedText(doc.id);
          await assert.rejects(call,e=>{assert.equal(e.code,expected.code,e.message);assert.equal(e.path,expected.path);assert.deepEqual(e.details,expected.details);return true;});
          assert.equal(session.scene.root,scene);assert.deepEqual(session.snapshot(),snapshot);assert.equal(session.readSavedText(doc.id),bytes);
          row.refusals.push({action,code:expected.code,path:expected.path,unchangedSave:sha(bytes)});
        }
        await reject('apply-rotate',()=>session.apply([badRotate]),errors.rotation);
        await reject('apply-obstruction',()=>session.apply([blocker]),errors.obstruction);
        await reject('import-bad-service',()=>session.import(invalidService),errors.service);
        await reject('load-bad-rotation',()=>session.load(badDoc),errors.rotation);
        // A separate restored input carries the historical wrong orientation. The known-good slot stays intact.
        const reader=storage.getItem;let supplied=false;
        storage.getItem=k=>{if(!supplied&&k===keyFor(doc.id)){supplied=true;return badBytes;}return reader(k);};
        try{
          const before=session.snapshot(),scene=session.scene.root;
          await assert.rejects(()=>session.restore(doc.id),e=>{assert.equal(e.code,errors.rotation.code);assert.equal(e.path,errors.rotation.path);return true;});
          assert(supplied);assert.deepEqual(session.snapshot(),before);assert.equal(session.scene.root,scene);assert.equal(storage.values.get(keyFor(doc.id)),saved);
          row.refusals.push({action:'restore-signed-bad-rotation',code:errors.rotation.code,path:errors.rotation.path,unchangedSave:sha(saved)});
        }finally{storage.getItem=reader;}
        // Low-level hosts may change the exposed scene before calling the public save or export.
        let handle,directError;
        try{handle=session.scene.prepareChange([badRotate]);session.scene.commit(handle);}
        catch(e){directError=e;}
        finally{if(handle)session.scene.discard(handle);}
        if(directError){
          assert.equal(directError.code,errors.rotation.code);assert.deepEqual(session.document,doc);
          row.lowLevel={rejectedAt:'prepare/commit',code:directError.code};
        }else{
          assert.equal(getNode(session.document,counter.id).transform.yaw,badRotate.transform.yaw);
          for(const method of ['save','export'])await assert.rejects(()=>session[method](),e=>{
            assert.equal(e.code,errors.rotation.code);assert.equal(e.path,errors.rotation.path);return true;
          });
          assert.equal(session.readSavedText(doc.id),saved);await session.restore(doc.id);assert.deepEqual(session.document,doc);
          if(hiddenFloorId)await session.setView({mode:'floor',floorId:hiddenFloorId,roomId:null});
          row.lowLevel={rejectedAt:['save','export'],code:errors.rotation.code,restoredSha256:sha(saved)};
        }
        const resource=counter.resource.id===selectedCard.id && counter.resource.version===selectedCard.version
          ? ref(selectedCard.id==='tea-counter-open'?'tea-counter-water':'tea-counter-open')
          : ref(selectedCard.id,selectedCard.version);
        const change={type:'replace-resource',id:counter.id,resource};
        let started,release;
        const entered=new Promise(resolve=>{started=resolve;});
        gate={started,hold:new Promise(resolve=>{release=resolve;})};
        const stale=session.apply([badRotate]);
        await entered;
        try{await session.apply([change]);}
        finally{release();}
        await assert.rejects(stale,e=>e.code==='revision-conflict');
        row.race={refused:'revision-conflict',retained:resource};
        if(hiddenFloorId)assert(!session.scene.root.getObjectByName(counter.id));
        assert.deepEqual(getNode(session.document,counter.id).resource,resource);assert.equal(session.document.revision,doc.revision+1);
        await session.save();latest=session.readSavedText(doc.id);
        const legal=session.document,expected=structuredClone(doc);getNode(expected,counter.id).resource=resource;expected.revision=legal.revision;assert.deepEqual(legal,expected);
        const measured=verifyMeasurement(legal,(await checkTeaStations(legal,opts))[0]);assert.deepEqual(measured,row.baseline);
        await session.setView({mode:'floor',floorId:deriveCompany(doc,catalog,templates).floorIds.get(rule.regionId),roomId:null});
        coldModels=visibleModels(session,legal);assert.notEqual(coldModels.counter.asset,rendered.counter.asset);
        assert.deepEqual(coldModels.machine,rendered.machine);assert.deepEqual(coldModels.cup,rendered.cup);
        assert.equal(await session.export(),latest);row.changed={old:rendered.counter,new:coldModels.counter,sha256:sha(latest),measurement:measured};
      }finally{session.dispose();}
    }});
    const file=path.join(out,label+'.save.json');await fs.writeFile(file,latest,{flag:'wx'});
    row.cold=await command([self,'--cold-read',file]);assert.equal(row.cold.sha256,sha(latest));assert.deepEqual(row.cold.models,coldModels);assert.deepEqual(row.cold.measurement,row.changed.measurement);
  }
  try{
    assert((await command([batchScript,input,savedDir])).ok);
    for(const item of spec.items){
      const bytes=await fs.readFile(path.join(savedDir,item.key,'save.json'),'utf8');
      const doc=await decodeCompanySave(bytes,catalog,templates);assert.deepEqual(doc,await read(path.join(savedDir,item.key,'layout.json')));
      await exercise(doc,item.key);
    }
    const floor=structuredClone(spec.items.find(i=>i.key==='tea-floor'));floor.input.scale='building';floor.input.floors.push({id:'upper',name:'观察层'});
    const input2=path.join(out,'two-floor-input.json'),dir2=path.join(out,'two-floor');
    await write(input2,{schema:'company-batch',version:1,items:[floor]});assert((await command([batchScript,input2,dir2])).ok);
    const hidden=await read(path.join(dir2,floor.key,'layout.json'));await exercise(hidden,'hidden-floor',floor.key+'/upper');
    report.status='passed';
  }catch(e){report.status='failed';report.error=e.message;throw e;}
  finally{await fs.writeFile(receipt,json(report),{flag:'wx'});}
  console.log(json({status:report.status,rooms:report.rooms.length,receipt}));
}
