import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {checkManagedOutput} from './package-company.mjs';
import {fileURLToPath} from 'node:url';
import * as T from '../../prototype/node_modules/three/build/three.module.js';
import catalog from '../../prototype/src/company/library-catalog.json' with {type:'json'};
import templates from '../../prototype/src/company/templates-extended.json' with {type:'json'};
import {deriveCompany,prepareCompanyChange} from '../../prototype/src/company/document.js';
import {compareFacilityFunction} from '../../prototype/src/company/appearance-contract.js';
import {decodeCompanySave,encodeCompanySave} from '../../prototype/src/company/persistence.js';
import {createCompanyScene} from '../../prototype/src/company/render.js';
import {runCompanyBatch} from './batch.mjs';
import {checkSingingRooms} from './check-singing-room.mjs';
import {preflightLibraryAssets} from './preflight-library-assets.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const branch='floor-vocal-microphone', fixture=path.join(root,'scripts/company-platform/batch-inputs/vocal-use-rooms.json');
const baselineId='floor-vocal-mic-boom';
const standardIds=[baselineId,'floor-vocal-mic-disc','floor-vocal-mic-suspension','floor-vocal-mic-broadcast'];
const rooms=['singing-studio','singing-rental'];
const caseFiles=['input.json','layout.json','save.json','report.json'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const write=(file,value)=>fs.writeFile(file,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const resourceRef=({id,version})=>({id,version});
const ruleOf=document=>document.singingRooms[0];
const nodeOf=(document,id)=>{
  const node=document.nodes.find(item=>item.id===id);
  assert(node,`Missing ${id}`);
  return node;
};
const micOf=document=>nodeOf(document,ruleOf(document).roles.mic);
const replace=(document,resource)=>({type:'replace-resource',id:micOf(document).id,resource:resourceRef(resource)});
const batchFor=items=>({schema:'company-batch',version:1,items});
const near=(actual,expected)=>assert(Math.abs(actual-expected)<1e-6,`${actual} != ${expected}`);
const sameVector=(actual,expected)=>{
  assert.equal(actual.length,expected.length);
  actual.forEach((value,i)=>near(value,expected[i]));
};
const turn=([x,y,z],{position:[px,py,pz],yaw})=>[
  px+Math.cos(yaw)*x+Math.sin(yaw)*z,py+y,pz-Math.sin(yaw)*x+Math.cos(yaw)*z,
];

export async function observeVocalMic(document,{catalog:libraryCatalog=catalog,templates:roomTemplates=templates,assetRoot=root}={}) {
  const options={catalog:libraryCatalog,templates:roomTemplates,root:assetRoot};
  const [measurement]=await checkSingingRooms(document,options);
  assert.equal(measurement.ok,true);
  assert.equal(measurement.supports.mic.feet.length,3);
  assert.equal(Object.keys(measurement.microphone.joins).length,4);
  assert(measurement.microphone.distanceMetres>=.06 && measurement.microphone.distanceMetres<=.26);
  assert(measurement.microphone.incidenceDegrees<=35 && measurement.microphone.facingDegrees<=45);
  assert.deepEqual(measurement.score.map(page=>page.page),['left','right']);
  for(const page of measurement.score) assert(page.visibility.samples>=35 && page.visibility.reliefSamples>0,page.page);
  assert.deepEqual(measurement.camera.rays.map(ray=>ray.reference),['mouth','eye']);
  const rule=ruleOf(document), mic=micOf(document), slotId=mic.id+'#vocal', spec=rule.performer;
  const slot=measurement.usePoint;
  assert.deepEqual([slot.id,slot.kind,slot.slotId,slot.facilityId,slot.roomId,slot.companyId,slot.revision],
    [slotId,'standing-vocal','vocal',mic.id,rule.regionId,document.id,document.revision]);
  assert.deepEqual(slot.clearance,{width:.50,depth:.50,height:1.90});
  assert.deepEqual(slot.local,{coordinateSpace:'facility',position:spec.position,yaw:spec.yaw,approach:spec.approach,exit:spec.exit});
  assert.deepEqual(slot.performerReferences,{coordinateSpace:'use-point',mouth:spec.mouth,eye:spec.eye});
  for(const [route,target] of [[measurement.access,spec.position],[measurement.approach,spec.approach],[measurement.exit,spec.exit]]) {
    assert.equal(route.portalId,rule.portalId);
    const [x,,z]=turn(target,mic.transform);
    sameVector(route.inside.at(-1),[x,z]);
  }

  const derived=deriveCompany(document,libraryCatalog,roomTemplates), floorId=measurement.floorId;
  const resources=[...derived.facilities,...derived.surfaceFinishes].filter(item=>item.floorId===floorId).map(item=>item.resource);
  const realResource=derived.facilities.find(item=>item.id===mic.id).resource;
  let geometry;
  await preflightLibraryAssets({root:assetRoot,resources,validate:library=>{
    const scene=createCompanyScene(new T.Scene(),document,{catalog:libraryCatalog,templates:roomTemplates,visibleFloorId:floorId,
      assetLibrary:library,mirrorPreflight:()=>{}});
    try {
      scene.root.updateMatrixWorld(true);
      const actual=scene.resolveUsePoint(slotId);
      assert.deepEqual(scene.describeUsePoint(slotId),slot);
      assert.equal(actual.pickupMesh?.isMesh,true);
      assert.deepEqual([actual.pickupMesh.name,measurement.microphone.node,slot.contact.pickupNodeId],
        Array(3).fill(realResource.microphone.pickupNode));
      const [floor,room]=[floorId,rule.regionId].map(id=>nodeOf(document,id));
      const roomToWorld=point=>turn(turn(point,room.transform),floor.transform);
      const micToWorld=point=>roomToWorld(turn(point,mic.transform));
      sameVector(actual.anchor.getWorldPosition(new T.Vector3()).toArray(),micToWorld(spec.position));
      sameVector(slot.approachPosition,micToWorld(spec.approach));
      sameVector(slot.exitPosition,micToWorld(spec.exit));
      const mouth=new T.Vector3().fromArray(micToWorld(turn(spec.mouth,spec)));
      const surface=new T.Vector3().fromArray(roomToWorld(measurement.microphone.surface));
      const direction=surface.clone().sub(mouth).normalize();
      const [hit]=new T.Raycaster(mouth,direction,0,.30).intersectObject(actual.pickupMesh,false);
      assert.equal(hit?.object,actual.pickupMesh);
      sameVector(hit.point.toArray(),surface.toArray());
      near(hit.distance,measurement.microphone.distanceMetres);
      const group=scene.root.getObjectByName(mic.id), inverse=group.matrixWorld.clone().invert();
      const position=new T.Vector3(), shape=[], dimensions=new T.Box3();
      let triangles=0;
      group.traverse(node=>{
        if(!node.isMesh) return;
        const array=node.geometry.getAttribute('position'), index=node.geometry.index, count=index?.count??array.count;
        const local=inverse.clone().multiply(node.matrixWorld), positions=[];
        for(let i=0;i<count;i++) {
          position.fromBufferAttribute(array,index?index.getX(i):i).applyMatrix4(local);
          dimensions.expandByPoint(position);
          positions.push(...position.toArray().map(value=>Math.round(value*1e6)));
        }
        shape.push(positions);
        triangles+=count/3;
      });
      assert(triangles>0);
      geometry={positionsSha256:sha(JSON.stringify(shape)),triangles,sizeMetres:dimensions.getSize(new T.Vector3()).toArray(),
        node:actual.pickupMesh.name,worldHit:hit.point.toArray()};
    } finally {scene.dispose();}
  }});
  const assetFile=path.join(assetRoot,'prototype','public',realResource.asset.url.slice(1));
  const assetSha256=sha(await fs.readFile(assetFile));
  assert.equal(assetSha256,realResource.asset.sha256);
  return {measurement,geometry,assetSha256,resource:resourceRef(realResource)};
}

async function casePins(directory) {
  const folders=await fs.readdir(directory), hashes={};
  for(const name of folders) for(const file of caseFiles) {
    const relative=name+'/'+file;
    hashes[relative]=sha(await fs.readFile(path.join(directory,relative)));
  }
  return hashes;
}

function stableSlot(slot) {
  const {revision,resource,...immutable}=slot;
  return immutable;
}

async function runMatrix(out,baselineOnly,report) {
  const [original,...looks]=(baselineOnly?[baselineId]:standardIds).map(id=>{
    const matches=catalog.resources.filter(resource=>resource.id===id && resource.version===1);
    assert.equal(matches.length,1,'Expected exactly one registered '+id+'@1.');
    assert.equal(matches[0].productionBranch,branch,id);
    return matches[0];
  });
  const authored=await json(fixture);
  assert.deepEqual(authored.items.map(item=>item.key),rooms);
  const oldBatch=path.join(out,'original');
  const first=await runCompanyBatch(authored,{outputDirectory:oldBatch});
  assert(first.ok,JSON.stringify(first));
  const originalPins=await casePins(oldBatch), bases=new Map();
  const readCase=async (folder,key)=>{
    const directory=path.join(folder,key), filename=path.join(directory,'save.json');
    const text=await fs.readFile(filename,'utf8');
    const doc=await decodeCompanySave(text,catalog,templates);
    assert.deepEqual(doc,await json(path.join(directory,'layout.json')));
    const direct=await observeVocalMic(doc);
    const produced=await json(path.join(directory,'report.json'));
    assert.deepEqual(produced.checks.singingRooms,[direct.measurement]);
    return {doc,direct,saveSha256:sha(text)};
  };
  for(const key of rooms) {
    const baseline=await readCase(oldBatch,key);
    assert.deepEqual(baseline.direct.resource,resourceRef(original));
    bases.set(key,baseline);
    report.cases.push({room:key,resource:baseline.direct.resource,saveSha256:baseline.saveSha256,...baseline.direct});
  }

  for(const resource of looks) {
    assert(compareFacilityFunction(original,resource).compatible,resource.id);
    assert.equal(resource.microphone.pickupNode,original.microphone.pickupNode);
    const items=[...bases].map(([key,base])=>({key,document:base.doc,operations:[replace(base.doc,resource)]}));
    const candidate=path.join(out,resource.id);
    const done=await runCompanyBatch(batchFor(items),{outputDirectory:candidate});
    assert(done.ok,JSON.stringify(done));
    for(const [key,base] of bases) {
      const reopened=await readCase(candidate,key), expected=structuredClone(base.doc);
      expected.revision++;
      micOf(expected).resource=resourceRef(resource);
      assert.deepEqual(reopened.doc,expected,key);
      assert.deepEqual(stableSlot(reopened.direct.measurement.usePoint),stableSlot(base.direct.measurement.usePoint));
      assert.deepEqual(reopened.direct.measurement.score,base.direct.measurement.score,'Both authored score pages must still be visible.');
      assert.deepEqual(reopened.direct.measurement.camera,base.direct.measurement.camera,'The accepted camera framing must remain physically visible.');
      report.cases.push({room:key,saveSha256:reopened.saveSha256,...reopened.direct});
      if(resource!==looks.at(-1)) continue;
      const restored=prepareCompanyChange(reopened.doc,[replace(reopened.doc,original)],{catalog,templates}).document;
      const restoreFile=path.join(out,key+'-restored.save.json');
      await fs.writeFile(restoreFile,await encodeCompanySave(restored,catalog,templates),{flag:'wx'});
      const cold=await decodeCompanySave(await fs.readFile(restoreFile,'utf8'),catalog,templates), measured=await observeVocalMic(cold);
      assert.equal(cold.revision,base.doc.revision+2);
      assert.deepEqual({...cold,revision:base.doc.revision},base.doc);
      assert.deepEqual({...measured,measurement:{...measured.measurement,usePoint:{...measured.measurement.usePoint,revision:base.doc.revision}}},base.direct);
      report.restored.push({room:key,resource:measured.resource,revision:cold.revision,geometry:measured.geometry});
    }
  }
  const identities=new Map();
  for(const entry of report.cases) {
    const proof=[entry.geometry.positionsSha256,entry.assetSha256];
    if(identities.has(entry.resource.id)) assert.deepEqual(identities.get(entry.resource.id),proof);
    else identities.set(entry.resource.id,proof);
  }
  assert.equal(new Set([...identities.values()].map(([hash])=>hash)).size,identities.size,'The actual mesh shapes must differ.');
  assert.equal(new Set([...identities.values()].map(([,hash])=>hash)).size,identities.size);

  const base=bases.get(rooms[0]).doc, wrongOwner=structuredClone(base), tooLow=structuredClone(base);
  ruleOf(wrongOwner).roles.mic=ruleOf(base).roles.score;
  // A legal slot declaration below the microphone still needs to meet the actual pickup ray and working distance.
  ruleOf(tooLow).performer.mouth[1]=1.28;
  const wrongKind=replace(base,{id:'floor-score-stand-tripod',version:1});
  for(const [label,document,operations,code,location] of [
    ['score-stand-cannot-own-vocal-slot',wrongOwner,[],'vocal-use-owner-mismatch',ruleOf(wrongOwner).roles.mic],
    ['mouth-cannot-reach-actual-pickup',tooLow,[],'singing-mic-position',micOf(base).id],
    ['incompatible-appearance',base,[wrongKind],'incompatible-replacement',micOf(base).id+'.resource.'],
  ]) {
    const input=batchFor([{key:base.id,document,operations}]);
    await write(path.join(out,label+'.batch.json'),input);
    const failed=await runCompanyBatch(input,{outputDirectory:oldBatch,only:base.id});
    const [problem]=failed.results;
    assert.equal(failed.ok,false);
    assert.equal(problem.code,code,JSON.stringify(problem));
    if(location.endsWith('.')) assert(problem.path.startsWith(location),problem.path);
    else assert.equal(problem.path,location);
    report.rejections.push({label,...problem});
    assert.deepEqual(await casePins(oldBatch),originalPins,'Rejected input changed an existing published room.');
  }
  const replay=await runCompanyBatch(authored,{outputDirectory:oldBatch});
  assert.deepEqual(replay.results.map(item=>item.status),['idempotent','idempotent']);
  assert.deepEqual(await casePins(oldBatch),originalPins);
  report.originalFilesPreserved=Object.keys(originalPins).length;
  report.status=baselineOnly?'baseline-passed':'passed';
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [argument,mode,...extra]=process.argv.slice(2);
  assert(argument && !extra.length && (!mode || mode==='--baseline'),'Usage: node test-vocal-mic-looks.mjs FRESH_OUT [--baseline]');
  const output=path.resolve(argument), parent=path.dirname(output);
  assert(output!==parent && path.relative(parent,await fs.realpath(parent))==='','Use an existing real output parent.');
  await checkManagedOutput(output, root, {allowDelivery:false});
  await fs.mkdir(output);
  const report={status:'running',cases:[],restored:[],rejections:[]};
  try {
    await runMatrix(output,mode==='--baseline',report);
    console.log(JSON.stringify({status:report.status,report:path.join(output,'report.json')},null,2));
  } catch(error) {
    report.status='failed';
    report.error={message:error.message,stack:error.stack};
    console.error(error);
    process.exitCode=1;
  } finally {
    await write(path.join(output,'report.json'),report);
  }
}
