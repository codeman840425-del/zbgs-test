import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Scene} from '../../prototype/node_modules/three/build/three.module.js';
import {createCompanyAuthoring} from '../../prototype/src/company/authoring.js';
import {preflightLibraryAssets} from './preflight-library-assets.mjs';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {deriveCompany,prepareCompanyChange} from '../../prototype/src/company/document.js';
import {createCompanyScaleV2} from '../../prototype/src/company/scale-v2.js';
import {encodeCompanySave,decodeCompanySave} from '../../prototype/src/company/persistence.js';
import {checkPublicWashrooms,shouldCheckPublicWashrooms} from './check-public-washroom.mjs';
import {checkManagedOutput} from './package-company.mjs';
import {runCompanyBatch} from './batch.mjs';

const [directory,...extra]=process.argv.slice(2);
assert(directory&&!extra.length,'node test-public-washroom.mjs NEW_MANAGED_OUTPUT_DIRECTORY');
const out=path.resolve(directory),published=path.join(out,'published'), options={catalog,templates};
await checkManagedOutput(out,undefined,{allowDelivery:false});
await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out);
const input=JSON.parse(await fs.readFile(new URL('./batch-inputs/public-washrooms.json',import.meta.url)));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const report={status:'running',scope:'Static installed facility meshes, cleaning volume and public doorway routes. No person, gestures, flowing water or operation simulation.',rooms:[],looks:[],rejections:[]};
const writeReceipt=()=>fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
async function pins(){
  const result={};
  for(const item of input.items)for(const file of ['input.json','layout.json','save.json','report.json']){
    const name=item.key+'/'+file; result[name]=sha(await fs.readFile(path.join(published,name)));
  }
  return result;
}
const apply=(doc,ops)=>prepareCompanyChange(doc,ops,options).document;
const move=(id,position,yaw=0)=>({type:'move',id,transform:{position,yaw}});
const replace=(id,res)=>({type:'replace-resource',id,resource:{id:res,version:1}});

async function authoringTransactions(base,building,ordinary) {
  const results=[];
  for(const doc of [base,building,ordinary]){
    const derived=deriveCompany(doc,catalog,templates),refs=[...derived.facilities,...derived.surfaceFinishes].map(f=>f.resource);
    await preflightLibraryAssets({root:path.resolve(import.meta.dirname,'../..'),resources:refs,validate:async library=>{
      const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
      let pumpInstances=0,gate=null;
      const tracked={...library,instantiate:resource=>{
        if(resource.mountRole==='washroom-dispenser')pumpInstances++;
        return library.instantiate(resource);
      },preload:async resources=>{
        if(gate&&resources.some(r=>r.mountRole==='washroom-dispenser')){
          const pause=gate;gate=null;pause.started();await pause.wait;
        }
        await library.preload(resources);
      }};
      const session=await createCompanyAuthoring(new Scene(),doc,{...options,assetLibrary:tracked,storage,mirrorPreflight:()=>{}});
      try{
        await session.save();const before=session.readSavedText(doc.id);
        if(!doc.publicWashrooms){
          assert.equal(pumpInstances,0);assert.deepEqual(await decodeCompanySave(before,catalog,templates),doc);
          results.push({kind:'ordinary-room-single-basin',saveSha256:sha(before)});return;
        }
        const tall=doc.scale==='building',{dispenser}=doc.publicWashrooms[0].roles;
        const current=doc.nodes.find(n=>n.id===dispenser).transform;
        const bad=move(dispenser,tall?[2.9,1.12,-.96]:[1.6,1.12,-1.4],current.yaw);
        const next=current.position.slice();next[tall?2:0]+=.05;
        const good=move(dispenser,next,current.yaw);
        const invalid=apply(doc,[bad]); // The wall, its height and its opening all accept this mounting point.
        let switchesSkipped=false;
        if(tall){
          const start=pumpInstances;
          await session.setView({mode:'building'});
          await session.setView({mode:'floor',floorId:doc.id+'/ground'});
          assert.equal(pumpInstances,start,'Changing to views which contain no dispenser must not re-run washroom geometry.');
          switchesSkipped=true;
        }
        const root=session.scene.root;
        const signId=doc.publicWashrooms[0].roles.sign;
        const graphic=doc.nodes.find(n=>n.parentId===signId&&catalog.resources.some(r=>r.id===n.resource?.id&&r.mount==='information-surface'));
        await assert.rejects(session.apply([{type:'set-state',id:graphic.id,state:{visible:false}}]),{code:'washroom-sign-content'});
        const floor=derived.floorIds.get(signId);
        await assert.rejects(session.apply([move(floor+'/stair-access/service-sign',[0,0,-1.09])]),{code:'blocked-portal'});
        assert.equal(session.scene.root,root);assert.deepEqual(session.document,doc);assert.equal(session.readSavedText(doc.id),before);
        await assert.rejects(session.apply([bad]),{code:'washroom-dispenser-reach'});
        assert.equal(session.scene.root,root);assert.deepEqual(session.document,doc);assert.equal(session.readSavedText(doc.id),before);
        await assert.rejects(session.import(await encodeCompanySave(invalid,catalog,templates)),{code:'washroom-dispenser-reach'});
        assert.equal(session.scene.root,root);assert.deepEqual(session.document,doc);assert.equal(session.readSavedText(doc.id),before);
        await session.apply([good]);await session.save();
        const saved=session.readSavedText(doc.id),valid=session.document;
        assert.notEqual(saved,before);assert.deepEqual(await decodeCompanySave(saved,catalog,templates),valid);
        // A lower-level renderer caller cannot export or write an unchecked installation.
        const handle=session.scene.prepareChange([bad]);
        try{session.scene.commit(handle);}finally{session.scene.discard(handle);}
        await assert.rejects(session.save(),{code:'washroom-dispenser-reach'});
        await assert.rejects(session.export(),{code:'washroom-dispenser-reach'});
        assert.equal(session.readSavedText(doc.id),saved);
        await session.restore();assert.deepEqual(session.document,valid);
        let reached,release;
        const started=new Promise(resolve=>{reached=resolve;});
        gate={started:reached,wait:new Promise(resolve=>{release=resolve;})};
        const stale=session.apply([bad]);
        await started;
        await session.setView({mode:'building'});release();
        await assert.rejects(stale,{code:'revision-conflict'});
        assert.deepEqual(session.document,valid);assert.equal(session.readSavedText(doc.id),saved);
        results.push({kind:doc.scale,regionId:doc.publicWashrooms[0].regionId,viewChangeSkippedGeometry:switchesSkipped,
          validSaveSha256:sha(saved),oldSaveSha256:sha(before),rejected:['hidden sign','blocked upstream public portal','wall-valid unreachable move','invalid imported save','unchecked renderer save and export','superseded preload']});
      }finally{session.dispose();}
    }});
  }
  return results;
}

try{
  const initial=await runCompanyBatch(input,{outputDirectory:published});assert(initial.ok,JSON.stringify(initial));
  const originalPins=await pins(),docs=[];
  for(const item of input.items){
    const bytes=await fs.readFile(path.join(published,item.key,'save.json'));
    const doc=await decodeCompanySave(bytes.toString(),catalog,templates);docs.push(doc);
    const rule=doc.publicWashrooms[0];
    assert.deepEqual(doc.publicWashrooms,item.publicWashrooms);
    assert(shouldCheckPublicWashrooms(doc,options));
    const [check]=await checkPublicWashrooms(doc,options);
    assert(check.ok&&check.publicApproach.legs.length>0&&check.route.approach.length>0&&check.route.inside.length>0);
    assert.equal(check.route.portalId,rule.portalId);assert.equal(check.publicApproach.legs.at(-1).to,check.route.fromRegion);
    const batchReport=JSON.parse(await fs.readFile(path.join(published,item.key,'report.json'),'utf8'));
    assert.deepEqual(batchReport.checks.publicWashrooms,[check]);
    report.rooms.push({key:item.key,saveSha256:sha(bytes),scale:doc.scale,check});
  }
  const [base]=docs,rule=base.publicWashrooms[0],{basin,mirror,dispenser,sign}=rule.roles;
  const basins=catalog.resources.filter(r=>r.mountRole==='public-washbasin'&&r.version===1);
  const pumps=catalog.resources.filter(r=>r.mountRole==='washroom-dispenser'&&r.version===1);
  for(const [role,group,id] of [['basin',basins,basin],['dispenser',pumps,dispenser]]){
    assert(group.length>=4);
    for(const resource of group){
      const changed=apply(base,[replace(id,resource.id)]);
      const saved=await encodeCompanySave(changed,catalog,templates), restored=await decodeCompanySave(saved,catalog,templates);
      assert.deepEqual(restored,changed);
      assert.deepEqual(restored.publicWashrooms,base.publicWashrooms);
      assert.deepEqual(restored.nodes.filter(n=>n.id!==id),base.nodes.filter(n=>n.id!==id));
      const [check]=await checkPublicWashrooms(restored,options);
      assert.equal(check.assets[id].sha256,resource.asset.sha256);
      report.looks.push({role,id:resource.id,sha256:resource.asset.sha256,saveSha256:sha(saved),service:check.service,
        basin:check.basin.frontHit,mirror:check.mirror.frontHit,actuator:check.dispenser.actuatorHit,reachM:check.dispenser.distanceM});
    }
  }
  async function reject(label,doc,operations,expected){
    const bad={schema:'company-batch',version:1,items:[{key:base.id,document:doc,operations}]};
    const result=await runCompanyBatch(bad,{outputDirectory:published});
    assert.equal(result.ok,false,label+' '+JSON.stringify(result));const error=result.results[0];assert.equal(error.status,'failed');
    assert(expected.includes(error.code),label+' '+JSON.stringify(error));
    assert.deepEqual(await pins(),originalPins,label+' changed previously published files');
    report.rejections.push({label,code:error.code,path:error.path,details:error.details});
  }
  const missing=structuredClone(base);delete missing.publicWashrooms;
  assert(shouldCheckPublicWashrooms(missing,options));await reject('installed basin requires declaration',missing,[],['washroom-declaration-required']);
  const unmanaged=apply(missing,[{type:'remove',id:basin}]);
  assert(!shouldCheckPublicWashrooms(unmanaged,options));assert.deepEqual(await checkPublicWashrooms(unmanaged,options),[]);
  const empty=createCompanyScaleV2(input.items[0].input,catalog,templates);
  const privateRoom=empty.nodes.find(n=>n.kind==='room'),displayId=privateRoom.id+'/display-basin';
  const addDisplay={type:'add-facility',id:displayId,parentId:privateRoom.id,resource:{id:'public-washbasin-frame-round',version:1},
    transform:{position:[0,0,0],yaw:0}};
  const ordinary=apply(empty,[addDisplay]);
  assert(!shouldCheckPublicWashrooms(ordinary,options));
  assert(!shouldCheckPublicWashrooms(ordinary,{catalog,derived:deriveCompany(ordinary,catalog,templates)}));
  assert.deepEqual(await checkPublicWashrooms(ordinary,options),[]);
  const singleKey='single-basin-display',singleOut=path.join(out,'single-basin');
  const sample=await runCompanyBatch({schema:'company-batch',version:1,items:[{key:singleKey,input:input.items[0].input,operations:[addDisplay]}]},{outputDirectory:singleOut});
  assert(sample.ok,JSON.stringify(sample));
  const singleSave=await fs.readFile(path.join(singleOut,singleKey,'save.json'),'utf8');
  const coldDisplay=await decodeCompanySave(singleSave,catalog,templates);
  assert.deepEqual(coldDisplay.nodes,ordinary.nodes);assert.deepEqual(await checkPublicWashrooms(coldDisplay,options),[]);
  const singleChecks=JSON.parse(await fs.readFile(path.join(singleOut,singleKey,'report.json'),'utf8')).checks;
  assert(!Object.hasOwn(singleChecks,'publicWashrooms'));
  report.ordinaryDisplay={roomId:privateRoom.id,basinId:displayId,saveSha256:sha(singleSave),published:sample.results[0].status};
  report.authoring=await authoringTransactions(base,docs[1],coldDisplay);
  const wrongArea=structuredClone(base);
  wrongArea.publicWashrooms=[{...structuredClone(rule),regionId:privateRoom.id,roles:{...rule.roles,basin:displayId}}];
  assert(shouldCheckPublicWashrooms(wrongArea,options));
  await reject('explicit public declaration on an ordinary room',wrongArea,[],['washroom-region']);
  const wrongDoor=structuredClone(base);wrongDoor.publicWashrooms[0].portalId=base.id+'/ground/portal-lobby-stair';
  await reject('wrong public door',wrongDoor,[],['washroom-portal']);
  const rear=structuredClone(base);rear.publicWashrooms[0].service=[-2.79,-.72];
  await reject('standing point behind basin',rear,[],['washroom-service-side']);
  await reject('original sign blocks front cleaning space',base,[move(sign,[-1.7,0,-.72])],['washroom-cleaning-obstructed']);
  await reject('wall mirror spans doorway opening',base,[move(mirror,[0,1.55,-1.4])],['wall-display-over-portal']);
  await reject('solid wall behind an incorrectly oriented mirror',base,[move(mirror,[-1.92,1.55,1.4],Math.PI)],['washroom-mirror-face']);
  await reject('actuator out of reach',base,[move(dispenser,[2.9,1.12,0],3*Math.PI/2)],['washroom-dispenser-reach']);
  await reject('original sign blocks public washroom entrance',base,[move(sign,[0,0,-1.09])],['room-door-unreachable','blocked-portal']);
  await reject('public lobby link is blocked from the stair side',base,[move(base.id+'/ground/stair-access/service-sign',[0,0,-1.09])],['room-door-unreachable','blocked-portal']);
  const labelId=base.nodes.find(n=>n.parentId===sign&&catalog.resources.some(r=>r.id===n.resource?.id&&r.mount==='information-surface')).id;
  await reject('empty washroom sign',base,[{type:'remove',id:labelId}],['washroom-sign-content']);
  await reject('hidden washroom graphic',base,[{type:'set-state',id:labelId,state:{visible:false}}],['washroom-sign-content']);
  const board=base.nodes.find(n=>n.id===sign).transform;
  await reject('graphic faces away from entry',base,[move(sign,board.position,board.yaw+Math.PI)],['washroom-sign-facing']);
  const repeat=await runCompanyBatch(input,{outputDirectory:published});assert(repeat.ok,JSON.stringify(repeat));
  assert.deepEqual(await pins(),originalPins);report.repeat=repeat.results.map(r=>({key:r.key,status:r.status}));
  report.unchangedAfterFailures=originalPins;report.status='passed';
}catch(e){report.status='failed';report.failure={message:e.message,code:e.code,path:e.path};throw e;}finally{await writeReceipt();}
console.log(JSON.stringify({ok:true,rooms:report.rooms.length,looks:report.looks.length,rejections:report.rejections.length,out}));
