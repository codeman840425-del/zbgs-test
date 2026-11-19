import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as T from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {createCompany,deriveCompany,pointInTransform,prepareCompanyChange} from '../../prototype/src/company/document.js';
import {createCompanyScene} from '../../prototype/src/company/render.js';
import {encodeCompanySave,decodeCompanySave} from '../../prototype/src/company/persistence.js';
import {CORNER_NAMES,cornerAbsorberTransform,validateCornerAbsorberPlacement,validateCornerAbsorberResource} from '../../prototype/src/company/corner-absorber-data.js';
import {preflightLibraryAssets,installNodeImageDecodeShim} from './preflight-library-assets.mjs';
import {checkManagedOutput} from './package-company.mjs';

const [target,mode,...extra]=process.argv.slice(2);
assert(target && (!mode || mode==='--pilot') && !extra.length,
  'node scripts/company-platform/test-corner-absorber-data.mjs NEW_OUTPUT_DIRECTORY [--pilot]');
const root=path.resolve(import.meta.dirname,'../..'),out=path.resolve(target);
await checkManagedOutput(out,undefined,{allowDelivery:false});
await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out);
const hash=data=>createHash('sha256').update(data).digest('hex');
const pose=(x,y,z,yaw=0)=>({position:[x,y,z],yaw}),q=Math.PI/2,v=(...xyz)=>new T.Vector3(...xyz);
const rounded=p=>p.toArray().map(n=>Math.round(n*1e6)/1e6);
const on=(a,b)=>Math.abs(a-b)<1e-5;
const registered=catalog.resources.find(r=>r.id==='corner-absorber-triangular' && r.version===1);
const pilot=mode==='--pilot';
const card=pilot?{...JSON.parse(await fs.readFile(path.join(root,'assets-source/company-corner-absorber-v1/contract.json'),'utf8')).resource,
  id:'corner-absorber-triangle-pilot',version:1,asset:{format:'glb'},acoustic:{purpose:'corner-absorber',construction:'triangular',configuration:'static'}}:registered;
const report={status:'running',source:pilot?'independent pilot':'registered triangular model',checks:[],invalid:[]};
const fail=(code,location,message,details)=>{throw Object.assign(Error(message),{code,location,details});};
const placement=(inputs)=>validateCornerAbsorberPlacement(inputs,fail);

function base(){
  const doc=createCompany({id:'corner-data-test',width:8,depth:6},catalog),[floor,room]=doc.nodes;
  floor.transform=pose(7,0,-5,Math.PI);room.transform=pose(2,0,-1,q);
  return {doc,floor,room};
}
function windowAt(room,along,edge='north'){
  const transform=edge==='north'?pose(along,1.5,-2.9):pose(along,1.5,2.9,Math.PI);
  return {id:'real-window',kind:'facility',parentId:room.id,resource:{id:'window-opening-square-basic',version:1},state:{openFraction:0},transform};
}
function peer(data,edge,offset){
  const {doc,room,floor}=data;doc.scale='rental-home';
  const other=structuredClone(room);other.id='other-room';
  const west=edge==='west',target=pointInTransform(room.transform,west?[-8,0,0]:[0,0,-6]);
  other.transform={position:target,yaw:room.transform.yaw};doc.nodes.push(other);
  floor.connections=[{id:'shared-portal',from:{regionId:room.id,edge,offset,width:1.4},
    to:{regionId:other.id,edge:west?'east':'south',offset,width:1.4}}];
  return other;
}
function facility(room,corner,resource,bottom=.2) {
  return {id:'corner-treatment',kind:'facility',parentId:room.id,resource:{id:resource.id,version:resource.version},
    transform:cornerAbsorberTransform(room,corner,bottom),attachment:{corner},state:{}};
}

function testInvalid(label,inputs,expected){
  const before=structuredClone(inputs);
  assert.throws(()=>placement(inputs),e=>{
    assert.equal(e.code,expected,e.message);report.invalid.push({label,code:e.code,details:e.details});return true;
  });
  assert.deepEqual(inputs,before);
}

async function testWall(label,corner,model,{setup,missing=[],sampleHeight,contactResource=card}={}){
  const fixture=base();setup?.(fixture);
  const {doc,floor,room}=fixture,node=facility(room,corner,contactResource);
  const before=structuredClone({doc,node}),save=await encodeCompanySave(doc,catalog,templates);
  const d=deriveCompany(doc,catalog,templates),inputs={node,resource:contactResource,region:room,floor,windowOpenings:d.windowOpenings};
  const pureResult=missing.length?null:placement(inputs);
  if (missing.length) assert.throws(()=>placement(inputs),e=>{
    assert.equal(e.code,'corner-bearing-over-opening');assert(missing.includes(e.details.plane));return true;
  });
  else assert.deepEqual(placement({...inputs,windowOpenings:d.windowOpenings.values()}),pureResult);
  const hits={x:[],z:[]},worldPose={};
  await preflightLibraryAssets({root,resources:d.facilities.map(f=>f.resource),validate:assetLibrary=>{
    const scene=createCompanyScene(new T.Scene(),doc,{catalog,templates,assetLibrary,visibleFloorId:floor.id,mirrorPreflight:()=>{}});
    try{
      const parent=scene.root.getObjectByName(room.id),instance=model.clone(true);
      instance.position.fromArray(node.transform.position);instance.rotation.y=node.transform.yaw;
      parent.add(instance);parent.updateWorldMatrix(true,true);
      worldPose.position=rounded(instance.getWorldPosition(v()));worldPose.roomYaw=room.transform.yaw;worldPose.floorYaw=floor.transform.yaw;
      const edges={'north-west':['west','north'],'north-east':['north','east'],'south-east':['east','south'],'south-west':['south','west']}[corner];
      for (const [i,plane] of ['x','z'].entries()){
        const rail=contactResource.cornerMount.bearings[plane],edge=edges[i];
        assert(!pureResult || pureResult.bearings.find(b=>b.plane===plane).edge===edge);
        const walls=scene.walls.filter(m=>m.userData.roomId===room.id&&m.userData.edge===edge);
        const direction=(plane==='x'?v(1,0,0):v(0,0,1)).transformDirection(instance.matrixWorld);
        const height=sampleHeight??[.01,.5,.99];
        for(const fraction of [.01,.5,.99])for(const h of height){
          const along=rail.along[0]+(rail.along[1]-rail.along[0])*fraction;
          const y=rail.y[0]+(rail.y[1]-rail.y[0])*h;
          const point=instance.localToWorld(plane==='x'?v(0,y,along):v(along,y,0));
          const back=new T.Raycaster(point.clone().addScaledVector(direction,-.02),direction,0,.04).intersectObject(instance,true)[0];
          assert(back&&back.point.distanceTo(point)<.001,'The declared '+plane+' mounting patch lacks actual backing at '+point.toArray());
          const wall=new T.Raycaster(point.clone().addScaledVector(direction,.035),direction.clone().negate(),0,.07).intersectObjects(walls,false)[0];
          const gap=wall?wall.point.distanceTo(point):null;
          hits[plane].push({room:rounded(parent.worldToLocal(point.clone())),part:back.object.name,edge,
            wall:wall?.object.name??null,gapM:gap===null?null:Math.round(gap*1e6)/1e6,supported:gap!==null&&gap<.001});
        }
      }
    }finally{scene.dispose();}
  }});
  assert.deepEqual(Object.keys(hits).filter(p=>hits[p].some(h=>!h.supported)),missing,label);
  assert.deepEqual({doc,node},before,label+' mutated source data');
  assert.equal(await encodeCompanySave(doc,catalog,templates),save);
  assert.deepEqual(await decodeCompanySave(save,catalog,templates),doc);
  report.checks.push({label,corner,localTransform:node.transform,worldPose,missing,holes:[...d.windowOpenings.values()].map(o=>o.regions),
    originalSaveSha256:hash(save),hits});
}

try{
  assert(card,'Register corner-absorber-triangular@1 first, or use --pilot in the pilot checkout');
  const file=pilot?'output/corner-absorber-v1/pilot/model.glb':'prototype/public'+card.asset.url;
  const bytes=await fs.readFile(path.join(root,file));report.model={path:file,sha256:hash(bytes)};
  if(!pilot)assert.equal(report.model.sha256,card.asset.sha256);
  const unrelated=catalog.resources.find(r=>r.mountRole==='wall-absorber-panel');
  validateCornerAbsorberResource(unrelated,fail);
  for(const [label,patch,code] of [
    ['wrong role',{mountRole:'wall-absorber-panel'},'invalid-corner-absorber'],
    ['single wall',{mount:'wall'},'invalid-corner-absorber'],
    ['centred footprint',{footprint:{...card.footprint,center:[0,0]}},'invalid-corner-absorber'],
    ['reduced polygon instead of full footprint',{footprint:{...card.footprint,polygon:[[0,0],[.01,0],[0,.01]]}},'invalid-corner-absorber'],
    ['wrong origin',{mounting:{...card.mounting,origin:'center'}},'invalid-corner-absorber'],
    ['missing X bearing',{cornerMount:{bearings:{z:card.cornerMount.bearings.z}}},'invalid-corner-bearing'],
    ['bearing outside solid',{cornerMount:{bearings:{...card.cornerMount.bearings,x:{along:[.24,.36],y:[0,2.1]}}}},'invalid-corner-bearing'],
    ['moving corner',{stateDefaults:{openFraction:0}},'invalid-corner-absorber'],
    ['unsupported construction',{acoustic:{...card.acoustic,construction:'hung-drape'}},'invalid-corner-absorber'],
  ]){
    assert.throws(()=>validateCornerAbsorberResource({...card,...patch},fail),e=>e.code===code);
    report.invalid.push({label,code});
  }
  for(const construction of ['triangular','column','segmented','upholstered']){
    validateCornerAbsorberResource({...card,acoustic:{...card.acoustic,construction}},fail);
  }
  installNodeImageDecodeShim();
  const model=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
  const {room,floor}=base();
  const poses=[pose(-3.9,.2,-2.9),pose(3.9,.2,-2.9,-q),pose(3.9,.2,2.9,Math.PI),pose(-3.9,.2,2.9,q)];
  for(const [i,corner] of CORNER_NAMES.entries()){
    assert.deepEqual(cornerAbsorberTransform(room,corner,.2),poses[i]);await testWall('two intact walls',corner,model);
  }
  const ext=f=>{f.floor.exteriorEntrances=[{id:'west-exit',regionId:f.room.id,edge:'west',offset:-2.10,width:1.4,height:2.2}];};
  await testWall('west exterior door removes only x rail','north-west',model,{setup:ext,missing:['x']});
  await testWall('north window removes only z rail','north-west',model,{setup:f=>f.doc.nodes.push(windowAt(f.room,-3.10)),missing:['z']});
  await testWall('real window clear of both rails','north-west',model,{setup:f=>f.doc.nodes.push(windowAt(f.room,-2.60))});
  await testWall('shared doorway cuts all wall height','north-west',model,{setup:f=>peer(f,'west',-2.10),missing:['x']});
  await testWall('window cut from adjacent room clips only z rail','north-west',model,{setup:f=>f.doc.nodes.push(windowAt(peer(f,'north',1.4),-3.1,'south')),missing:['z']});
  // Restrict the test to an actual lower subpatch of each continuous rail. The window spans its along-wall location,
  // but starts above the physical witness. This is a vertical interval control, independent of whole-rail admission.
  const lowerPatch=structuredClone(card);
  for(const b of Object.values(lowerPatch.cornerMount.bearings))b.y=[.1,.4];
  await testWall('actual lower rail subpatch below sill (interval control)','north-west',model,
    {setup:f=>f.doc.nodes.push(windowAt(f.room,-3.1)),contactResource:lowerPatch});
  const upperPatch=structuredClone(card);
  for(const b of Object.values(upperPatch.cornerMount.bearings))b.y=[2.03,2.08];
  await testWall('actual upper rail subpatch on exterior header (interval control)','north-west',model,{setup:ext,contactResource:upperPatch});
  await testWall('same upper rail subpatch over full-height shared doorway','north-west',model,
    {setup:f=>peer(f,'west',-2.10),contactResource:upperPatch,missing:['x']});
  const node=facility(room,'north-west',card),ctx={region:room,floor,node,resource:card,windowOpenings:new Map()};
  for(const [label,patch,code] of [
    ['only one mounting surface',{attachment:{edge:'north'}},'invalid-corner-attachment'],
    ['corner key must be a string',{attachment:{corner:['north-west']}},'invalid-corner-attachment'],
    ['wrong corner',{attachment:{corner:'north-east'}},'invalid-corner-fit'],
    ['corner shifted away from one wall',{transform:pose(-3.88,.2,-2.9)},'invalid-corner-fit'],
    ['backwards local frame',{transform:pose(-3.9,.2,-2.9,Math.PI)},'invalid-corner-fit'],
    ['below floor',{transform:pose(-3.9,-.03,-2.9)},'invalid-corner-fit'],
    ['above wall head',{transform:pose(-3.9,.65,-2.9)},'invalid-corner-fit'],
    ['wrong room owner',{parentId:'other-room'},'invalid-corner-attachment'],
  ])testInvalid(label,{...ctx,node:{...node,...patch}},code);
  const broken=structuredClone(card);delete broken.cornerMount.bearings.z;
  testInvalid('missing second bearing',{...ctx,resource:broken},'invalid-corner-bearing');
  const rotated={...ctx,node:{...node,transform:pose(-3.9,.3,-2.9,2*Math.PI)}};
  assert(on(placement(rotated).transform.position[1],.3));
  if(!pilot){
    const {doc,room}=base();
    const accepted=prepareCompanyChange(doc,[{type:'add-facility',id:'saved-corner',parentId:room.id,resource:{id:card.id,version:1},
      attachment:{corner:'north-west'}}],{catalog,templates}).document;
    const saved=await encodeCompanySave(accepted,catalog,templates);
    assert.deepEqual(await decodeCompanySave(saved,catalog,templates),accepted);
    const badWindow=windowAt(room,-3.1);
    assert.throws(()=>prepareCompanyChange(accepted,[{...badWindow,type:'add-facility'}],{catalog,templates}),e=>e.code==='corner-bearing-over-opening');
    assert.equal(await encodeCompanySave(accepted,catalog,templates),saved);
    await fs.writeFile(path.join(out,'installed.save.json'),saved,{flag:'wx'});
    report.installedSave={id:'saved-corner',sha256:hash(saved),attachment:{corner:'north-west'},failedWindowPreserved:true};
  }
  report.status='passed';
}catch(e){report.status='failed';report.error=e.message;throw e;}
finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
console.log(JSON.stringify({status:report.status,model:report.model,physicalCases:report.checks.length,rejections:report.invalid.length,output:out}));
