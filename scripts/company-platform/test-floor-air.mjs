import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {checkManagedOutput} from './package-company.mjs';
import {fileURLToPath} from 'node:url';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {createCompanyAssetLibrary} from '../../prototype/src/company/asset-library.js';
import {createCompanyAuthoring} from '../../prototype/src/company/authoring.js';
import {compareFacilityFunction} from '../../prototype/src/company/appearance-contract.js';
import {validateFloorAirGeometry} from '../../prototype/src/company/floor-air.js';
import {decodeCompanySave} from '../../prototype/src/company/persistence.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
import {runCompanyBatch} from './batch.mjs';
import {installNodeImageDecodeShim} from './preflight-library-assets.mjs';

const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const [argument,...extra]=process.argv.slice(2);
if(!argument || extra.length) throw Error('Usage: node scripts/company-platform/test-floor-air.mjs NEW_OUTPUT');
const requested=path.resolve(argument), outputParent=path.dirname(requested);
if(requested===outputParent) throw Error('Choose a new directory inside an existing output parent');
const resolvedParent=await fs.realpath(outputParent);
if(path.relative(outputParent,resolvedParent)!=='')
  throw Error('Supply the resolved output parent instead of an alias: '+resolvedParent);
const out=path.join(resolvedParent,path.basename(requested));
await checkManagedOutput(out,undefined,{allowDelivery:false});
await fs.mkdir(out);

const home='air-home', rental='air-rental', role='floor-air', branch='fan-and-air-purifier';
const ids=['tower','pedestal','circulator','purifier'].map(type=>role+'-'+type);
const rotorIds=new Set([role+'-pedestal',role+'-circulator']);
const indicatorNames=['air-power-indicator','air-speed-1','air-speed-2','air-speed-3'];
const fixture=path.join(root,'scripts/company-platform/batch-inputs/floor-air-rooms.json');
const authorRecipe=path.join(root,'assets-source/company-floor-air-v1/parameters.json');
const vec=(x,y,z)=>new THREE.Vector3(x,y,z);
const vertical=vec(0,1,0);
const views={front:vec(0,.24,1).normalize(),elevatedFrontSide:vec(.68,1.05,1).normalize()};
const probeCamera={distanceMetres:2,verticalFovDegrees:38,imageHeight:900};
const probeScale=probeCamera.imageHeight/(2*probeCamera.distanceMetres*Math.tan(THREE.MathUtils.degToRad(probeCamera.verticalFovDegrees/2)));
const epsilon=1e-5;
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const ref=({id,version})=>({id,version});
const round=value=>Number(value.toFixed(7)) || 0;
const tuple=vector=>vector.toArray().map(round);
const near=(actual,expected,label)=>assert(Math.abs(actual-expected)<epsilon,`${label}: ${actual} vs ${expected}`);
const readAsset=url=>fs.readFile(path.join(root,'prototype','public',url.replace(/^\//,'')));
const arrayBuffer=bytes=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
const deviceId=key=>key+'/ground/live/air';
const node=(doc,id)=>doc.nodes.find(entry=>entry.id===id);
const status=(id,patch)=>({type:'set-state',id,state:patch});
const report={status:'running',probeCamera,rooms:[],variants:[],rejections:[]};
let stage='catalog';

async function withAuthoring(document,visit,stored=new Map()) {
  const library=createCompanyAssetLibrary({fetchImpl:async url=>{
    const bytes=await readAsset(url);
    return {ok:true,arrayBuffer:async()=>arrayBuffer(bytes)};
  }});
  const storage={getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,value)};
  let session;
  try {
    session=await createCompanyAuthoring(new THREE.Scene(),document,{catalog,templates,storage,assetLibrary:library,mirrorPreflight:()=>{}});
    return await visit(session);
  } finally {
    session?.dispose();
    library.dispose();
  }
}

function floatGlb(original,scaleY,offsetY) {
  assert.equal(original.readUInt32LE(0),0x46546c67);
  assert.equal(original.readUInt32LE(16),0x4e4f534a);
  const jsonEnd=20+original.readUInt32LE(12);
  const json=JSON.parse(original.subarray(20,jsonEnd).toString('utf8'));
  const roots=json.scenes[json.scene??0].nodes;
  assert.equal(roots.length,1);
  const model=json.nodes[roots[0]];
  assert(!model.matrix,'Expected the source model’s TRS root');
  const [sx,sy,sz]=model.scale??[1,1,1], [x,y,z]=model.translation??[0,0,0];
  model.scale=[sx,sy*scaleY,sz];
  model.translation=[x,y+offsetY,z];

  // Keep the original BIN chunk, including all actual mesh/index buffers.
  const data=Buffer.from(JSON.stringify(json));
  const padding=Buffer.alloc((4-data.length%4)%4,0x20);
  const bin=original.subarray(jsonEnd);
  const header=Buffer.from(original.subarray(0,20));
  header.writeUInt32LE(data.length+padding.length,12);
  header.writeUInt32LE(header.length+data.length+padding.length+bin.length,8);
  return Buffer.concat([header,data,padding,bin]);
}

async function checkFloatingPedestal(resource) {
  const original=await readAsset(resource.asset.url);
  const scaleY=.95, offsetY=.015, floated=floatGlb(original,scaleY,offsetY);
  const loader=new GLTFLoader();
  const read=async bytes=>(await loader.parseAsync(arrayBuffer(bytes),'')).scene;
  const shipped=await read(original), mutated=await read(floated);
  shipped.updateMatrixWorld(true);
  mutated.updateMatrixWorld(true);
  near(mutated.children[0].position.y-shipped.children[0].position.y,offsetY,'readback model-root translation');
  near(mutated.children[0].scale.y/shipped.children[0].scale.y,scaleY,'readback model-root scale');
  const initialBounds=new THREE.Box3().setFromObject(shipped,true);
  const bounds=new THREE.Box3().setFromObject(mutated,true);
  near(initialBounds.min.y,0,'original loaded pedestal floor contact');
  near(bounds.min.y,offsetY,'mutated loaded pedestal floor gap');
  assert(bounds.min.x>=-.20-epsilon && bounds.max.x<=.20+epsilon &&
    bounds.min.z>=-.20-epsilon && bounds.max.z<=.20+epsilon && bounds.max.y<=.80+epsilon,
    'Floating negative must still fit the entire installation envelope');
  const reject=(code,location,message)=>{throw Object.assign(Error(message),{code,path:location});};
  const code='ungrounded-floor-air';
  validateFloorAirGeometry(shipped,resource,reject);
  assert.throws(()=>validateFloorAirGeometry(mutated,resource,reject),{code,path:resource.id+'.mounting'});

  const modified={...resource,asset:{...resource.asset,url:'/qa/floor-air-floating-pedestal.glb',
    bytes:floated.length,sha256:sha256(floated)}};
  const library=createCompanyAssetLibrary({fetchImpl:async url=>{
    if(url===resource.asset.url) return new Response(original);
    assert.equal(url,modified.asset.url);
    return new Response(floated);
  }});
  try {
    await library.preload([resource]);
    await assert.rejects(library.preload([modified]),{code,path:resource.id+'.mounting'});
  } finally {
    library.dispose();
  }
  return {resource:ref(resource),rootMutation:{scaleY,offsetY},originalSha256:resource.asset.sha256,
    modifiedSha256:modified.asset.sha256,originalBottomMetres:round(initialBounds.min.y),
    mutatedBounds:{min:tuple(bounds.min),max:tuple(bounds.max)},originalAccepted:true,
    rejectedBy:['validateFloorAirGeometry','asset-library.preload'],code};
}

function meshFaces(mesh,transform,visit) {
  const {index}=mesh.geometry, position=mesh.geometry.getAttribute('position');
  const count=index?.count??position.count;
  const corners=[vec(),vec(),vec()];
  for(let offset=0;offset<count;offset+=3) {
    for(const [ordinal,corner] of corners.entries()) {
      const vertex=index?index.getX(offset+ordinal):offset+ordinal;
      mesh.getVertexPosition(vertex,corner).applyMatrix4(transform);
    }
    visit(...corners);
  }
}

function meshesOf(device) {
  const meshes=[];
  device.traverseVisible(object=>{if(object.isMesh) meshes.push(object);});
  return meshes;
}

function checkSupport(session,id,device) {
  const parentId=node(session.document,id).parentId;
  const floor=session.scene.root.getObjectByName('Floor:'+parentId);
  assert(floor?.isMesh,'Expected the installed room’s real floor mesh');
  const bounds=new THREE.Box3();
  const worldToDevice=device.matrixWorld.clone().invert();
  let supportArea=0;
  const supportSamples=[];
  for(const mesh of meshesOf(device)) {
    const toLocal=worldToDevice.clone().multiply(mesh.matrixWorld);
    meshFaces(mesh,toLocal,(a,b,c)=>{
      bounds.expandByPoint(a).expandByPoint(b).expandByPoint(c);
      if([a,b,c].every(point=>Math.abs(point.y)<epsilon)) {
        const area=new THREE.Triangle(a,b,c).getArea();
        if(area>1e-8) {
          supportArea+=area;
          supportSamples.push(new THREE.Triangle(a,b,c).getMidpoint(vec()));
        }
      }
    });
  }
  near(bounds.min.y,0,id+' mesh grounded at its own origin');
  assert(supportArea>1e-4,id+' lacks a physical floor-contact patch');
  assert(bounds.min.x>=-.20-epsilon && bounds.max.x<=.20+epsilon &&
    bounds.min.z>=-.20-epsilon && bounds.max.z<=.20+epsilon &&
    bounds.max.y<=.80+epsilon,JSON.stringify({id,min:tuple(bounds.min),max:tuple(bounds.max)}));
  const deviceY=device.getWorldPosition(vec()).y;
  const origin=device.getWorldPosition(vec()).add(vec(0,.025,0));
  const originHit=new THREE.Raycaster(origin,vec(0,-1,0),0,.05).intersectObject(floor,false)[0];
  assert(originHit?.object===floor,id+' origin is over the actual floor');
  near(originHit.point.y,deviceY,id+' mount origin height');
  for(const local of supportSamples) {
    const contact=device.localToWorld(local.clone());
    const start=contact.clone().add(vec(0,.025,0));
    const hit=new THREE.Raycaster(start,vec(0,-1,0),0,.05).intersectObject(floor,false)[0];
    assert(hit?.object===floor,id+' contact patch is over the actual floor');
    near(hit.point.y,contact.y,id+' face-to-floor contact');
  }
  return {min:tuple(bounds.min),max:tuple(bounds.max),contactArea:round(supportArea),
    contactFaces:supportSamples.length,floor:floor.name,originOnFloor:tuple(originHit.point)};
}

function readIndicators(device,resource,{on,speed}) {
  return indicatorNames.map((name,index)=>{
    const mesh=device.getObjectByName(name);
    assert(mesh?.isMesh,device.name+' missing actual mesh '+name);
    assert(mesh.geometry.getAttribute('position').count>=3);
    const material=mesh.material, mapping=resource.display[index===0?'power':'speed'+index];
    assert(material?.emissive?.isColor&&Number.isFinite(material.emissiveIntensity));
    const expected=on&&index<=speed;
    assert.equal(material.color.getHexString(),(expected?mapping.onColor:mapping.offColor).slice(1).toLowerCase(),name);
    assert.equal(material.emissive.getHexString(),expected?mapping.emissive.slice(1).toLowerCase():'000000',name);
    near(material.emissiveIntensity,expected?1:0,name+' emitted intensity');
    if(expected) for(let object=mesh;object;object=object.parent)
      assert(object.visible,`${name} is lit but hidden by ${object.name||object.type}`);
    return {name,color:material.color.getHexString(),emissive:material.emissive.getHexString(),intensity:material.emissiveIntensity};
  });
}

function exposedIndicatorFaces(device) {
  const obstacles=meshesOf(device), rotation=device.getWorldQuaternion(new THREE.Quaternion());
  const visibility={};
  for(const [view,localDirection] of Object.entries(views)) {
    const direction=localDirection.clone().applyQuaternion(rotation);
    const ray=new THREE.Raycaster();
    visibility[view]=indicatorNames.map(name=>{
      const mesh=device.getObjectByName(name);
      let seen=0,area=0;
      meshFaces(mesh,mesh.matrixWorld,(a,b,c)=>{
        const face=new THREE.Triangle(a,b,c);
        const projected=face.getArea()*Math.abs(face.getNormal(vec()).dot(direction));
        if(projected<1e-10) return;
        const midpoint=face.getMidpoint(vec());
        ray.set(midpoint.clone().addScaledVector(direction,3),direction.clone().negate());
        const hit=ray.intersectObjects(obstacles,false)[0];
        if(hit?.object===mesh&&hit.point.distanceTo(midpoint)<epsilon) {
          seen++;
          area+=projected;
        }
      });
      return {name,exposedTriangles:seen,projectedAreaSquareCentimetres:round(area*10000),
        indicativePixelAreaAtTwoMetres:round(area*probeScale**2)};
    });
  }
  return visibility;
}

function checkVisible(visibility,label) {
  for(const [view,indicators] of Object.entries(visibility)) for(const sample of indicators)
    assert(sample.exposedTriangles>0,`${label} ${view}: ${sample.name} has no exposed exterior indicator triangles`);
}

function checkRotor(session,device,resource,tiltDegrees,{on,speed}) {
  const nodeName=resource.visualRotor?.node;
  if(!rotorIds.has(resource.id)) {
    assert(!nodeName&&device.getObjectByName('air-rotor')===undefined,resource.id+' unexpectedly declares a visible rotor');
    return null;
  }
  assert.equal(nodeName,'air-rotor');
  const rotor=device.getObjectByName(nodeName);
  assert(rotor?.isObject3D&&rotor.parent?.isObject3D&&meshesOf(rotor).length);
  function pose(clockSeconds) {
    session.scene.setPresentationInputs({clockSeconds});
    session.scene.root.updateMatrixWorld(true);
    return {position:rotor.getWorldPosition(vec()),rotation:rotor.quaternion.clone(),
      axis:vec(0,0,1).applyQuaternion(rotor.getWorldQuaternion(new THREE.Quaternion()))};
  }
  const first=pose(12), later=pose(12.125), repeat=pose(12);
  near(first.position.distanceTo(later.position),0,resource.id+' rotor centre');
  near(first.axis.distanceTo(later.axis),0,resource.id+' physical rotation axis');
  const parentAxis=vec(0,0,1).applyQuaternion(rotor.parent.getWorldQuaternion(new THREE.Quaternion()));
  near(first.axis.distanceTo(parentAxis),0,resource.id+' rotor parent axis faces +Z');
  const tilt=THREE.MathUtils.degToRad(tiltDegrees);
  const authoredAxis=vec(0,Math.sin(tilt),Math.cos(tilt)).applyQuaternion(device.getWorldQuaternion(new THREE.Quaternion()));
  near(first.axis.distanceTo(authoredAxis),0,resource.id+' rotor matches the author’s configured tilt');
  near(first.rotation.angleTo(repeat.rotation),0,resource.id+' reproducible presentation clock');
  const angle=first.rotation.angleTo(later.rotation);
  near(angle,on?speed*Math.PI/16:0,resource.id+' fixed-clock rotation for its tier');
  return {node:nodeName,centre:tuple(first.position),worldAxis:tuple(first.axis),tiltDegrees,elapsedSeconds:.125,angle:round(angle)};
}

async function reject(session,operation,expected) {
  const before=await session.export(), persisted=session.readSavedText(session.document.id), scene=session.scene.root;
  await assert.rejects(session.apply([operation]),error=>{
    assert.equal(error.code,expected.code,error.message);
    if(expected.path) assert.equal(error.path,expected.path,error.message);
    if(expected.obstacle) assert.equal(error.details?.obstacleId,expected.obstacle,error.message);
    report.rejections.push({operation,code:error.code,path:error.path,details:error.details,savedSha256:sha256(persisted)});
    return true;
  });
  assert.equal(await session.export(),before);
  assert.equal(session.readSavedText(session.document.id),persisted);
  assert.equal(session.scene.root,scene);
}

try {
  const resources=ids.map(id=>catalog.resources.find(resource=>resource.id===id&&resource.version===1));
  assert(resources.every(Boolean),'Register all four real floor-air resources before running this test');
  const recipeBytes=await fs.readFile(authorRecipe);
  const designs=JSON.parse(recipeBytes).designs;
  const tiltById=new Map(designs.map(design=>[design.id,design.tiltDegrees??0]));
  assert(tiltById.get(role+'-circulator')>0);
  report.authorRecipeSha256=sha256(recipeBytes);
  const assetPins=new Map();
  for(const resource of resources) {
    assert.equal(resource.mountRole,role);
    assert.equal(resource.productionBranch,branch);
    assert.equal(resource.category,'dynamic');
    assert.equal(resource.mount,'floor-surface');
    assert.deepEqual(resource.mounting,{origin:'bottom',width:.40,height:.80,depth:.40});
    assert.deepEqual(resource.stateDefaults,{on:true,speed:1});
    assert.deepEqual(resource.stateSchema,{on:{type:'boolean'},speed:{type:'integer',min:1,max:3}});
    assert.deepEqual(resource.footprint,{blocking:true,center:[0,0],halfSize:[.20,.20]});
    assert(compareFacilityFunction(resources[0],resource).compatible,resource.id+' must be a compatible appearance');
    const bytes=await readAsset(resource.asset.url);
    assert.equal(bytes.length,resource.asset.bytes);
    const hash=sha256(bytes);
    assert.equal(hash,resource.asset.sha256);
    assetPins.set(resource.id,hash);
  }
  assert.equal(new Set(assetPins.values()).size,4);
  installNodeImageDecodeShim();
  stage='floating pedestal GLB preflight';
  report.floatingPedestal=await checkFloatingPedestal(resources.find(resource=>resource.id===role+'-pedestal'));
  stage='production batch';
  const sourceBytes=await fs.readFile(fixture);
  const input=JSON.parse(sourceBytes);
  assert.deepEqual(input.items.map(item=>item.key).sort(),[home,rental]);
  const published=path.join(out,'published');
  const batch=await runCompanyBatch(input,{outputDirectory:published});
  report.batch={sourceSha256:sha256(sourceBytes),...batch};
  assert(batch.ok,JSON.stringify(batch));
  const layouts=new Map();
  for(const key of [home,rental]) {
    stage=key+' installed room';
    const bytes=await fs.readFile(path.join(published,key,'save.json'),'utf8');
    const document=await decodeCompanySave(bytes,catalog,templates);
    const id=deviceId(key), installed=node(document,id);
    assert.equal(installed?.transform?.position[1],0);
    const floor=node(document,node(document,installed.parentId).parentId);
    near(floor.transform.yaw,key===home?0:Math.PI/2,key+' floor yaw');
    await withAuthoring(document,session=>{
      session.scene.root.updateMatrixWorld(true);
      const device=session.scene.root.getObjectByName(id);
      const resource=resources.find(resource=>resource.id===installed.resource.id);
      const support=checkSupport(session,id,device);
      const direction=device.getWorldDirection(vec());
      const room=node(document,installed.parentId), yaw=floor.transform.yaw+room.transform.yaw+installed.transform.yaw;
      near(direction.distanceTo(vec(Math.sin(yaw),0,Math.cos(yaw))),0,key+' inherited ground-forward direction');
      const position=[installed,room,floor].reduce((point,{transform})=>
        point.applyAxisAngle(vertical,transform.yaw).add(vec(...transform.position)),vec());
      near(device.getWorldPosition(vec()).distanceTo(position),0,key+' inherited ground position');
      const indicators=readIndicators(device,resource,{...resource.stateDefaults,...installed.state});
      report.rooms.push({key,id,room:installed.parentId,worldPosition:tuple(position),worldForward:tuple(direction),
        saveSha256:sha256(bytes),support,indicators});
    });
    layouts.set(key,document);
  }

  const original=layouts.get(home), id=deviceId(home);
  const stored=new Map();
  let saved;
  await withAuthoring(original,async session=>{
    await session.apply([status(id,{on:true,speed:2})]);
    for(const resource of resources) {
      stage='appearance and indicators '+resource.id;
      const before=node(session.document,id);
      await session.apply([{type:'replace-resource',id,resource:ref(resource)}]);
      assert.deepEqual(node(session.document,id),{...before,resource:ref(resource)});
      let device=session.scene.root.getObjectByName(id);
      const support=checkSupport(session,id,device), initial=readIndicators(device,resource,{on:true,speed:2});
      const evidence={resource:ref(resource),sha256:assetPins.get(resource.id),support,preservedState:initial,states:[]};
      report.variants.push(evidence);
      for(const settings of [{on:true,speed:1},{on:true,speed:2},{on:true,speed:3},{on:false,speed:3}]) {
        await session.apply([status(id,settings)]);
        device=session.scene.root.getObjectByName(id);
        const indicators=readIndicators(device,resource,settings);
        const rotor=checkRotor(session,device,resource,tiltById.get(resource.id),settings);
        evidence.states.push({settings,indicators,rotor});
        if(settings.on&&settings.speed===3) {
          evidence.visibility=exposedIndicatorFaces(device);
          checkVisible(evidence.visibility,resource.id);
        }
      }
      await session.apply([status(id,{on:true})]);
      readIndicators(session.scene.root.getObjectByName(id),resource,{on:true,speed:3});
      assert.equal(node(session.document,id).state.speed,3);
      await session.apply([status(id,{speed:2})]);
    }
    stage='invalid patches and installation preserve the old state';
    await session.apply([status(id,{on:false,speed:3})]);
    await session.save();
    saved=session.readSavedText(home);
    for(const patch of [{on:1},{on:'false'},{speed:0},{speed:4},{speed:1.5},{speed:'2'},{speed:null}])
      await reject(session,status(id,patch),{code:'invalid-device-state'});
    const installed=node(session.document,id);
    await reject(session,{type:'add-facility',id:id+'-overlap',parentId:installed.parentId,resource:installed.resource,
      transform:installed.transform},{code:'overlapping-facilities'});
    await reject(session,{type:'move',id,transform:{...installed.transform,position:[installed.transform.position[0],.12,installed.transform.position[2]]}},
      {code:'unsupported-height',path:id});
    const portal=inspectCompanyPlacement(session.document,catalog,templates).checkedPortals.find(portal=>portal.regionId===installed.parentId);
    assert(portal,'Expected the fixture room’s real doorway');
    const center=new THREE.Vector3().fromArray(portal.center.local), interior=new THREE.Vector3().fromArray(portal.interior.local);
    const inward=interior.clone().sub(center).normalize();
    const side=vec(inward.z,0,-inward.x);
    const obstruction=interior.addScaledVector(side,-.38).toArray();
    await reject(session,{type:'move',id,transform:{position:obstruction,yaw:installed.transform.yaw}},
      {code:'blocked-portal',path:portal.connectionId,obstacle:id});
    assert.equal(await session.export(),saved);
  },stored);
  stage='cold reload';
  await withAuthoring(original,async session=>{
    await session.restore(home);
    const loaded=await decodeCompanySave(saved,catalog,templates);
    assert.deepEqual(session.document,loaded);
    assert.equal(await session.export(),saved);
    assert.deepEqual(node(loaded,id).state,{on:false,speed:3});
    const device=session.scene.root.getObjectByName(id);
    const resource=resources.find(value=>value.id===node(loaded,id).resource.id);
    report.cold={id,savedSha256:sha256(saved),restored:readIndicators(device,resource,{on:false,speed:3})};
    await session.apply([status(id,{on:true})]);
    report.cold.powerRestored=readIndicators(session.scene.root.getObjectByName(id),resource,{on:true,speed:3});
    assert.equal(session.readSavedText(home),saved);
  },stored);
  await fs.writeFile(path.join(out,'cold-save.json'),saved,{flag:'wx'});
  report.status='passed';
} catch(error) {
  report.status='failed';
  report.error={stage,code:error.code??null,path:error.path??null,message:error.message,details:error.details};
  throw error;
} finally {
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
}
console.log(JSON.stringify({status:report.status,rooms:report.rooms.length,variants:report.variants.length,
  rejections:report.rejections.length,report:path.join(out,'report.json')}));
