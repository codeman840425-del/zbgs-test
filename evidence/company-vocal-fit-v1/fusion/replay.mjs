import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as T from '../../../company-workspace/worktrees/release-check/prototype/node_modules/three/build/three.module.js';
import {deriveCompany} from '../../../company-workspace/worktrees/release-check/prototype/src/company/document.js';
import {decodeCompanySave} from '../../../company-workspace/worktrees/release-check/prototype/src/company/persistence.js';
import {createCompanyScene} from '../../../company-workspace/worktrees/release-check/prototype/src/company/render.js';
import {checkSingingRoom,rayHit} from '../../../company-workspace/worktrees/release-check/scripts/company-platform/check-singing-room.mjs';
import {scanRoomMeshes} from '../../../company-workspace/worktrees/release-check/scripts/company-platform/check-training-clearance.mjs';
import {preflightLibraryAssets} from '../../../company-workspace/worktrees/release-check/scripts/company-platform/preflight-library-assets.mjs';
import {checkManagedOutput} from '../../../scripts/company-platform/package-company.mjs';

const root=path.resolve(import.meta.dirname,'../../..');
const fixed=path.join(root,'company-workspace/worktrees/release-check');
const fixedCommit='ca1b3349a8e534f03522ad058223ab0b2031f9d8';
assert.equal(execFileSync('git',['-C',fixed,'rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),fixedCommit);
const fusion=path.resolve(root,'../gamemake-test/native-studio-round');
const source=path.join(fusion,'independent/performer-anchor-ddcf');
const vec=xyz=>new T.Vector3(...xyz);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sha=async file=>hash(await fs.readFile(file));
const read=async file=>JSON.parse(await fs.readFile(file));
const [reportName='report.json',...extra]=process.argv.slice(2);
assert(!extra.length && /^[a-zA-Z0-9][-a-zA-Z0-9_.]*\.json$/.test(reportName),'Use an optional fresh report JSON basename.');
const output=path.join(root,'output/vocal-fit-v1/fusion-eight',reportName);
await fs.mkdir(path.dirname(output),{recursive:true});
await checkManagedOutput(output,root,{allowDelivery:false});
const dataFile=path.join(source,'mic-axes/data.json');
const posesFile=path.join(source,'build/evidence/same-pose.json');
const webFile=path.join(fusion,'official-pair/performer-anchor-ddcf/results.json');
const priorFile=path.join(root,'company-workspace/worktrees/release-check/assets-source/company-vocal-fit-check-v1/observations.json');
const [data,poses,web,prior]=await Promise.all([dataFile,posesFile,webFile,priorFile].map(read));
assert.equal(await sha(posesFile),data.sourcePoseSha256);
assert.equal(await sha(webFile),data.sourceBrowserSha256);
assert.equal(await sha(path.join(source,'build/received/rooms/facility-package.json')),data.manifest);
assert.equal(web.package.sourceDigest,'ddcf40a56d0ef69662f7d0798ca7e6210bd8cc20f6dc52a2cc034d40b20fe28f');
assert.equal(prior.samples.length,57);
const bodyShort=actor=>actor.includes('female')?'female':'male';
const cases=[...data.cpuDecision.map(row=>{
  const actual=poses.rows.find(item=>item.label==='decision'&&item.room===row.room&&item.actor===row.actor&&item.frame===row.frame);
  assert.equal(actual.point,row.usePointId);
  assert.equal(actual.independent.lipPoints,32);
  assert.deepEqual(actual.independent.mouth,row.mouthWorld);
  return {id:`cpu/${row.room}/${bodyShort(row.actor)}/${row.frame}`,room:row.room,actor:row.actor,mouth:row.mouthWorld,
    eye:actual.independent.eyes,actorYaw:actual.independent.rootYaw,slotYaw:actual.independent.authoredYaw,reference:{...row.baseline,hitWorld:row.hitWorld}};
}),...data.browserDecision.map(row=>{
  const actual=web.cases.find(item=>item.room===row.room)[row.actor==='female'?'femaleRejection':'maleDecision'];
  assert.equal(actual.mouthDistance,row.distance);
  assert.equal(actual.incidenceDegrees,row.incidence);
  assert.equal(actual.facingDegrees,row.facing);
  return {id:`browser/${row.room}/${row.actor}`,room:row.room,actor:`uniform-lite-${row.actor}-v1`,mouth:actual.mouthWorld,
    eye:actual.eyeWorld,actorYaw:actual.yaw,reference:{distance:row.distance,incidence:row.incidence,facing:row.facing,
      hitWorld:actual.pickupWorld,passesFourNumericLimits:actual.withinPickupWindow}};
})];
assert.equal(cases.length,8);
const part=object=>object.userData.name||object.name;
const degrees=(a,b)=>T.MathUtils.radToDeg(a.angleTo(b));
const direction=yaw=>new T.Vector3(Math.sin(yaw),0,Math.cos(yaw));
const roles=['singing-studio','singing-rental'];
const thresholds={distanceMinM:.06,distanceMaxM:.26,incidenceMaxDeg:35,facingMaxDeg:45};
const report={scope:'Static full company scene replay of eight acknowledged signed decision frames. No actor animation, self-occlusion or game-state replay.',
  thresholds,inputs:{fixedCommit,fusionDataSha256:await sha(dataFile),fusionPoseSha256:await sha(posesFile),fusionBrowserSha256:await sha(webFile),
    originalFusionGamePackageManifestSha256:data.manifest,prior57Sha256:await sha(priorFile)},cases,packages:{}};
for(const [name,directory,pin] of [
  ['baseline','company-workspace/deliveries/vocal-use-v1.1','5c676cafa500ac5fc79d2461935fc323844e02fa0a1baa01c8025cd75d3e4012'],
  ['candidate','company-workspace/deliveries/vocal-fit-v1','64802112dd64938d88ef6e8115c90096a90f591833467db55bd837e4ca11eebc'],
]) {
  const packageRoot=path.join(root,directory), assetRoot=path.join(packageRoot,'source'), rooms=[];
  const manifestFile=path.join(packageRoot,'transfer-manifest.json');
  assert.equal(await sha(manifestFile),pin);
  const manifest=await read(manifestFile);
  const files=new Map(manifest.files.map(row=>[row.path,row]));
  async function checkedFile(relative) {
    const filename=path.join(packageRoot,relative), expected=files.get(relative);
    assert(expected,'Missing manifest entry '+relative);
    const bytes=await fs.readFile(filename);
    assert.equal(bytes.length,expected.bytes);
    assert.equal(hash(bytes),expected.sha256);
    return bytes;
  }
  const [catalog,templates]=await Promise.all(['data/library-catalog.json','data/templates.json'].map(async file=>JSON.parse(await checkedFile(file))));
  for(const key of roles) {
    const save=await checkedFile(`data/rooms/${key}/save.json`);
    const document=await decodeCompanySave(save.toString('utf8'),catalog,templates);
    const [rule]=document.singingRooms;
    const measured=await checkSingingRoom(document,rule,{root:assetRoot,catalog,templates});
    const point=measured.usePoint;
    assert.deepEqual(point.facilityTransform,data.rooms[key].worldInstall);
    assert.deepEqual(point.transform,data.rooms[key].point);
    const derived=deriveCompany(document,catalog,templates),room=derived.nodes.get(rule.regionId);
    const facilities=derived.facilities.filter(facility=>facility.floorId===point.floorId);
    const resources=[...facilities,...derived.surfaceFinishes.filter(finish=>finish.floorId===point.floorId)].map(facility=>facility.resource);
    const mic=facilities.find(facility=>facility.id===point.facilityId).resource;
    for(const {asset} of resources.filter(resource=>resource.asset?.url)) {
      const suffix=asset.url.slice(1);
      assert.equal(hash(await checkedFile('viewer/'+suffix)),asset.sha256);
      assert.equal(hash(await checkedFile('source/prototype/public/'+suffix)),asset.sha256);
    }
    if(name==='baseline') assert.equal(mic.asset.sha256,data.pickupGLB);
    const rows=[];
    await preflightLibraryAssets({root:assetRoot,resources,validate:library=>{
      const scene=createCompanyScene(new T.Scene(),document,{catalog,templates,visibleFloorId:point.floorId,assetLibrary:library,mirrorPreflight:()=>{}});
      try {
        const records=[];
        const {worldToRoom}=scanRoomMeshes(scene,room,facilities,[],[],(object,owner,matrix,bounds)=>
          records.push({object,id:owner?.id??object.name,matrix:matrix.clone(),bounds:bounds.clone()}));
        const pickup=scene.resolveUsePoint(point.id).pickupMesh;
        assert(pickup?.isMesh);
        const pickupRecord=records.find(row=>row.object===pickup);
        assert.equal(pickupRecord.id,point.facilityId);
        assert.equal(part(pickup),point.contact.pickupNodeId);
        assert.equal((pickup.geometry.index?.count??pickup.geometry.attributes.position.count)/3,data.pickupTriangles);
        pickup.geometry.computeBoundingBox();
        const center=pickup.geometry.boundingBox.getCenter(new T.Vector3()).applyMatrix4(pickupRecord.matrix);
        const axis=vec(measured.microphone.axis).normalize(), facing=direction(point.transform.yaw).transformDirection(worldToRoom);
        const roomToWorld=worldToRoom.clone().invert();
        const positionInMic=worldToRoom.clone().multiply(scene.root.getObjectByName(point.facilityId).matrixWorld).invert();
        const camera=scene.root.getObjectByName(rule.roles.camera),lens=vec(measured.camera.lens);
        const roomToCamera=worldToRoom.clone().multiply(camera.matrixWorld).invert();
        const lensRecord=records.find(record=>record.id===rule.roles.camera&&part(record.object)===measured.camera.node);
        assert(lensRecord);
        const blockers=records.filter(record=>record!==lensRecord);
        function inspectSight(target) {
          const hit=rayHit(blockers,lens,target),look=target.clone().sub(lens).transformDirection(roomToCamera);
          const horizontalDeg=T.MathUtils.radToDeg(Math.atan2(look.x,look.z)),verticalDeg=T.MathUtils.radToDeg(Math.atan2(look.y,Math.hypot(look.x,look.z)));
          return {clear:!hit,withinFraming:Math.abs(horizontalDeg)<=35&&Math.abs(verticalDeg)<=23,horizontalDeg,verticalDeg,
            firstBlocker:hit?{facility:hit.record.id,mesh:part(hit.record.object),distanceFromLensM:hit.distance}:null};
        }
        for(const row of cases.filter(item=>item.room===key)) {
          if(row.slotYaw!==undefined) assert.equal(row.slotYaw,point.transform.yaw);
          const mouth=vec(row.mouth).applyMatrix4(worldToRoom), eye=vec(row.eye).applyMatrix4(worldToRoom);
          const hit=rayHit(records,mouth,center);
          assert(hit,'No physical contact for '+row.id);
          const contact=hit.point.clone().sub(mouth), distanceM=hit.distance, incidenceDeg=degrees(axis,contact.clone().negate());
          const horizontal=contact.setY(0), facingDeg=degrees(facing,horizontal);
          const physicalActorFacingDeg=degrees(direction(row.actorYaw).transformDirection(worldToRoom),horizontal);
          const pickupFirst=hit.record===pickupRecord;
          const hitWorld=hit.point.clone().applyMatrix4(roomToWorld).toArray();
          const margin={distanceMinM:distanceM-.06,distanceMaxM:.26-distanceM,incidenceDeg:35-incidenceDeg,facingDeg:45-facingDeg};
          const referenceErrors={distanceM:Math.abs(distanceM-row.reference.distance),incidenceDeg:Math.abs(incidenceDeg-row.reference.incidence),
            facingDeg:Math.abs(facingDeg-row.reference.facing),hitM:vec(hitWorld).distanceTo(vec(row.reference.hitWorld))};
          const pickupPassed=pickupFirst&&Object.values(margin).every(value=>value>=0);
          if(name==='baseline') {
            assert(referenceErrors.distanceM<=2e-6&&referenceErrors.hitM<=2e-6&&
              referenceErrors.incidenceDeg<=1e-4&&referenceErrors.facingDeg<=1e-4,JSON.stringify({id:row.id,referenceErrors}));
            assert.equal(pickupPassed,row.reference.passesFourNumericLimits);
            const local=mouth.clone().applyMatrix4(positionInMic);
            const priorClosest=prior.samples.filter(item=>item.room===row.room&&item.actor===row.actor)
              .map(item=>({id:item.id,report:item.report,phase:item.phase,mouthDeltaM:local.distanceTo(vec(item.mouthM)),
                eyeDeltaM:item.eyeM?eye.clone().applyMatrix4(positionInMic).distanceTo(vec(item.eyeM)):null,
                yawDeltaRad:Math.abs(T.MathUtils.euclideanModulo(row.actorYaw-point.facilityTransform.yaw-item.actorYawRad+Math.PI,2*Math.PI)-Math.PI)}))
              .sort((a,b)=>a.mouthDeltaM-b.mouthDeltaM)[0];
            row.overlapWithPrior57={exactAtOneMicrometre:priorClosest.mouthDeltaM<=1e-6,closest:priorClosest};
          }
          rows.push({id:row.id,actor:row.actor,pickupFirst,firstMesh:part(hit.record.object),hitWorld,distanceM,incidenceDeg,facingDeg,physicalActorFacingDeg,margin,pickupPassed,
            ...(name==='baseline'?{referenceErrors}:{}),camera:{mouth:inspectSight(mouth),eye:inspectSight(eye)}});
        }
      } finally {scene.dispose();}
    }});
    rooms.push({id:key,saveSha256:hash(save),modelSha256:mic.asset.sha256,resource:point.resource,lens:measured.camera.lens,rows});
  }
  report.packages[name]={manifestSha256:pin,build:manifest.buildId,rooms};
}
const candidate=report.packages.candidate.rooms.flatMap(room=>room.rows);
report.summary={reproducedOld:8,candidatePickupPassed:candidate.filter(row=>row.pickupPassed).length,
  exactOverlapsWith57:cases.filter(row=>row.overlapWithPrior57.exactAtOneMicrometre).map(row=>row.id),
  minimumMargins:Object.fromEntries(Object.keys(candidate[0].margin).map(field=>{
    const nearest=candidate.reduce((a,b)=>a.margin[field]<=b.margin[field]?a:b);
    return [field,{id:nearest.id,value:nearest.margin[field]}];
  })),cameraFailures:candidate.flatMap(row=>Object.entries(row.camera).filter(([,view])=>!view.clear||!view.withinFraming)
    .map(([reference,view])=>({id:row.id,reference,...view})))};
await fs.writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report.summary,null,2));
if(report.summary.candidatePickupPassed!==8 || report.summary.cameraFailures.length) process.exitCode=1;