import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import document from '../../prototype/src/company/examples/c1-two-stations.json' with {type:'json'};
import catalog from '../../prototype/src/company/facility-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates.json' with {type:'json'};
import {createCompanyScene} from '../../prototype/src/company/render.js';

const rows=[];
const rechecking=process.argv.includes('--recheck');
const affectedNames=new Set([
  'Explicit discard cleans prepared actual Three allocations and prevents commit',
  'Unrelated screen update keeps both occupied seat mesh references alive',
  'Disposing a scene also owns outstanding staged candidate resources',
  'Partial recursive resource failure cleans meshes already built inside unattached groups',
  'Restore invalidates candidates from a previous document even when revision numbers match',
  'Valid legacy document omitting empty chair state survives no-op state edit while occupied',
]);
function check(name,fn){
  if(rechecking&&!affectedNames.has(name))return;
  try{rows.push({name,...fn()});}catch(error){rows.push({name,status:'unexpected-error',code:error.code,error:error.message});}
}
const screenChange=(station,on)=>[{type:'set-state',id:`${station}/monitor`,state:{on}}];
function fixture(doc=document,options={}){const world=new THREE.Scene();return {world,scene:createCompanyScene(world,doc,options)};}
function watchCreation(){
  const geometry=new Map(),material=new Map();
  const originalAdd=THREE.Object3D.prototype.add;
  THREE.Object3D.prototype.add=function(...objects){
    for(const object of objects)object.traverse(node=>{
      if(node.geometry&&!geometry.has(node.geometry)){geometry.set(node.geometry,0);node.geometry.addEventListener('dispose',()=>geometry.set(node.geometry,geometry.get(node.geometry)+1));}
      for(const item of node.material?[node.material].flat():[])if(!material.has(item)){material.set(item,0);item.addEventListener('dispose',()=>material.set(item,material.get(item)+1));}
    });
    return originalAdd.apply(this,objects);
  };
  return {stop(){THREE.Object3D.prototype.add=originalAdd;},counts(){return {geometryCreated:geometry.size,geometryDisposed:[...geometry.values()].filter(value=>value>0).length,geometryUndisposed:[...geometry.values()].filter(value=>value===0).length,
    materialCreated:material.size,materialDisposed:[...material.values()].filter(value=>value>0).length,materialUndisposed:[...material.values()].filter(value=>value===0).length};}};
}

check('Explicit discard cleans prepared actual Three allocations and prevents commit',()=>{
  const {scene}=fixture(),watch=watchCreation();
  try{
    const handle=scene.prepareChange(screenChange('station-1',false));
    const before=watch.counts();scene.discard(handle);scene.discard(handle);
    const after=watch.counts();assert.equal(after.geometryUndisposed,0);assert.equal(after.materialUndisposed,0);
    assert.throws(()=>scene.commit(handle),error=>error.code==='unknown-candidate');
    return {status:'passed',before,after};
  }finally{watch.stop();scene.dispose();}
});

check('A lease acquired after preparation blocks commit and retains live contacts',()=>{
  const {scene}=fixture();try{
    const contact=scene.resolveUsePoint('station-1/chair#seat'),before=scene.save(),root=scene.root;
    const handle=scene.prepareChange([{type:'move',id:'station-1',transform:{position:[-1.5,0,.2],yaw:0}}]);
    assert.throws(()=>scene.commit(handle,{isUsePointBusy:id=>id===contact.id}),error=>error.code==='facility-busy');
    assert.equal(scene.root,root);assert.equal(scene.save(),before);assert.equal(scene.resolveUsePoint(contact.id).chairSeat,contact.chairSeat);
    scene.discard(handle);return {status:'passed'};
  }finally{scene.dispose();}
});

check('A revision-stale candidate rejects and can be discarded cleanly',()=>{
  const {scene}=fixture(),watch=watchCreation();try{
    const stale=scene.prepareChange(screenChange('station-1',false));
    const fresh=scene.prepareChange(screenChange('station-2',false));scene.commit(fresh);
    assert.throws(()=>scene.commit(stale),error=>error.code==='revision-conflict');
    scene.discard(stale);scene.dispose();assert.equal(watch.counts().geometryUndisposed,0);assert.equal(watch.counts().materialUndisposed,0);
    return {status:'passed',resources:watch.counts()};
  }finally{watch.stop();scene.dispose();}
});

check('Unrelated screen update keeps both occupied seat mesh references alive',()=>{
  const {scene}=fixture();try{
    const points=scene.listUsePoints();let disposeCount=0;
    for(const point of points){point.chairSeat.geometry.addEventListener('dispose',()=>disposeCount++);point.chairSeat.material.addEventListener('dispose',()=>disposeCount++);}
    const handle=scene.prepareChange(screenChange('station-1',false),{isUsePointBusy:()=>true});scene.commit(handle,{isUsePointBusy:()=>true});
    for(const point of points)assert.equal(scene.resolveUsePoint(point.id).chairSeat,point.chairSeat);
    assert.equal(disposeCount,0);return {status:'passed'};
  }finally{scene.dispose();}
});

check('Disposing a scene also owns outstanding staged candidate resources',()=>{
  const {scene,world}=fixture(),watch=watchCreation();try{
    const handle=scene.prepareChange(screenChange('station-1',false));
    scene.dispose();const result=watch.counts();assert.equal(world.children.length,0);
    const status=result.geometryUndisposed||result.materialUndisposed?'defect-reproduced':'passed';
    scene.discard(handle);return {status,resourcesAfterSceneDispose:result,expected:'All staged candidate resources must be disposed with their owning scene'};
  }finally{watch.stop();scene.dispose();}
});

check('Partial recursive resource failure cleans meshes already built inside unattached groups',()=>{
  const extended=structuredClone(catalog),bad=structuredClone(extended.resources.find(resource=>resource.id==='desk'));
  bad.version=2;bad.node.children[1].geometry.type='UnsupportedAfterOneValidChild';extended.resources.push(bad);
  const {scene}=fixture(document,{catalog:extended}),watch=watchCreation();try{
    const saved=scene.save(),root=scene.root;
    assert.throws(()=>scene.prepareChange([{type:'replace-resource',id:'station-1/desk',resource:{id:'desk',version:2}}]),error=>error.code==='unsupported-geometry');
    assert.equal(scene.save(),saved);assert.equal(scene.root,root);
    const resources=watch.counts();return {status:resources.geometryUndisposed||resources.materialUndisposed?'defect-reproduced':'passed',resources,liveSceneRetained:true};
  }finally{watch.stop();scene.dispose();}
});

check('Restore invalidates candidates from a previous document even when revision numbers match',()=>{
  const {scene}=fixture();try{
    const handle=scene.prepareChange(screenChange('station-1',false));
    const restored=scene.document;restored.nodes.find(node=>node.id==='station-2/monitor').state.on=false;
    scene.restore(JSON.stringify(restored));
    let code=null;try{scene.commit(handle);}catch(error){code=error.code;scene.discard(handle);}
    const on=scene.root.getObjectByName('station-2/monitor').getObjectByName('monitor-screen').material.emissiveIntensity>0;
    return {status:!code&&on===true?'defect-reproduced':'passed',commitError:code,unrelatedRestoredMonitorOn:on,expected:'Pre-restore candidate must not overwrite the restored state'};
  }finally{scene.dispose();}
});

check('Valid legacy document omitting empty chair state survives no-op state edit while occupied',()=>{
  const withoutState=structuredClone(document);delete withoutState.nodes.find(node=>node.id==='station-1/chair').state;
  const {scene}=fixture(withoutState);try{
    const point=scene.resolveUsePoint('station-1/chair#seat');let disposed=0;point.chairSeat.geometry.addEventListener('dispose',()=>disposed++);
    const handle=scene.prepareChange([{type:'set-state',id:'station-1/chair',state:{}}],{isUsePointBusy:()=>true});scene.commit(handle,{isUsePointBusy:()=>true});
    const same=scene.resolveUsePoint(point.id).chairSeat===point.chairSeat;
    return {status:!same||disposed?'defect-reproduced':'passed',seatReferencePreserved:same,oldSeatGeometryDisposeEvents:disposed,expected:'A semantic no-op state edit must preserve occupied contacts or be rejected'};
  }finally{scene.dispose();}
});

check('Two use points on one synthetic facility both retain references for unrelated edits',()=>{
  const extended=structuredClone(catalog),chair=extended.resources.find(resource=>resource.id==='chair');
  chair.usePoints.push({...structuredClone(chair.usePoints[0]),id:'second-seat'});
  const {scene}=fixture(document,{catalog:extended});try{
    const first=scene.resolveUsePoint('station-1/chair#seat'),second=scene.resolveUsePoint('station-1/chair#second-seat');
    assert.equal(first.chair,second.chair);assert.equal(first.chairSeat,second.chairSeat);
    const handle=scene.prepareChange(screenChange('station-2',false),{isUsePointBusy:()=>true});scene.commit(handle,{isUsePointBusy:()=>true});
    assert.equal(scene.resolveUsePoint(first.id).chairSeat,first.chairSeat);assert.equal(scene.resolveUsePoint(second.id).chairSeat,second.chairSeat);
    return {status:'passed',scope:'Synthetic alias use points sharing actual meshes only. No independent sofa-slot geometry or character use proof.'};
  }finally{scene.dispose();}
});

const inputs=[];
for(const file of ['prototype/src/company/render.js','prototype/src/company/document.js','prototype/src/company/facility-catalog.json','prototype/src/company/templates.json'])inputs.push({path:file,sha256:createHash('sha256').update(await fs.readFile(new URL(`../../${file}`,import.meta.url))).digest('hex')});
const report={configuration:{model:'gpt-6.1-sol',reasoning_effort:'high',reuseKnownConfiguration:true,difficulty:'complex',reason:'Actual Three resource lifecycle, atomic publication and occupied contact references',actualProviderConfiguration:'not independently verified',desktopHookInterception:'not independently verified'},threeRevision:THREE.REVISION,inputs,rows,
  limits:['Actual Three CPU objects and real dispose events. No WebGL/browser/GPU or physical actor usage validation.','Synthetic malformed resource and alias use points test resource ownership/reference behavior only. They do not establish new production assets or independent multi-slot interaction.']};
report.scope=rechecking?'Targeted four original failures plus explicit discard and unrelated state edit. Initial failure evidence retained.':'Initial independent render lifecycle review';
report.status=rows.every(row=>row.status==='passed')?'passed':'failed';
await fs.writeFile(new URL(rechecking?'./recheck.json':'./report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(rows,null,2));
if(rechecking&&report.status!=='passed')process.exitCode=1;
