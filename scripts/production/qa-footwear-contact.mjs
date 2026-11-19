// CPU reproducer. Synthetic footwear is served from memory only.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
import {FOUNDATION_PROFILES,foundationProfile} from '../../prototype/src/foundation-profiles.js';
import {outfitSelection} from '../../prototype/src/outfit-selection.js';
import {createMotion} from '../../prototype/src/motion.js';

registerHooks({load(url,ctx,next){return next(url,url.endsWith('.json')?{...ctx,importAttributes:{type:'json'}}:ctx);}});
const {loadGeometryAvatar,THREE}=await import('../headless-avatar-node.mjs');
const {loadFoundationAvatar}=await import('../../prototype/src/foundation-avatar.js');
const {applyAppearanceRecipe,captureAppearanceRecipe}=await import('../../prototype/src/appearance-recipe.js');
const publicDir=new URL('../../prototype/public/',import.meta.url);
const bytes=url=>readFile(new URL('.'+url,publicDir));
const hash=data=>createHash('sha256').update(data).digest('hex');
const bodyType='source-male-ab9a-release-v1', depthM=.02;
const after=process.argv.includes('--after');

async function releasedLooks(){
  let outfits=0;
  const multipleShoes=[];
  for(const body of Object.keys(FOUNDATION_PROFILES)){
    const config=foundationProfile(body);
    const catalogs=[config.manifestUrl,...(config.additionalEquipmentManifests??[]).map(row=>row.url)];
    const entries=(await Promise.all(catalogs.map(async url=>JSON.parse(await bytes(url)).items))).flat();
    const choices=new Set();
    for(const look of config.outfits){
      const ids=outfitSelection(config,look.index).ids;
      const shoes=entries.filter(e=>ids.includes(e.id)&&e.slot==='shoes');
      assert.equal(shoes.length,1,body+' '+look.role);
      choices.add(shoes[0].id);outfits++;
    }
    if(choices.size>1)multipleShoes.push(body);
  }
  return {bodies:Object.keys(FOUNDATION_PROFILES).length,outfits,multipleShoes};
}

// Extend only the bottom 25 mm of this CC0 GLB's POSITIONs; retain the top,
// weights, bone order, bind matrices and all other buffers. No file is exported.
function syntheticSole(original){
  const jsonBytes=original.readUInt32LE(12);
  const doc=JSON.parse(original.subarray(20,20+jsonBytes));
  const binary=Buffer.from(original.subarray(28+jsonBytes));
  const [{primitives:[primitive]}]=doc.meshes;
  const pos=doc.accessors[primitive.attributes.POSITION],view=doc.bufferViews[pos.bufferView];
  assert.equal(pos.componentType,5126);assert.equal(pos.type,'VEC3');assert.equal(view.buffer,0);
  for(let i=0;i<pos.count;i++){
    const offset=(view.byteOffset??0)+(pos.byteOffset??0)+i*(view.byteStride??12)+4;
    const y=binary.readFloatLE(offset);
    binary.writeFloatLE(y-depthM*Math.max(0,1-(y-pos.min[1])/.025),offset);
  }
  pos.min[1]=Math.fround(pos.min[1]-depthM);
  const raw=Buffer.from(JSON.stringify(doc)), padded=Buffer.alloc(Math.ceil(raw.length/4)*4,0x20);
  raw.copy(padded);
  const header=Buffer.from(original.subarray(0,20));
  header.writeUInt32LE(28+padded.length+binary.length,8);
  header.writeUInt32LE(padded.length,12);
  return Buffer.concat([header,padded,original.subarray(20+jsonBytes,28+jsonBytes),binary]);
}

const released=await releasedLooks();
const config=foundationProfile(bodyType), originalProfile=FOUNDATION_PROFILES[bodyType];
const base=JSON.parse(await bytes(config.manifestUrl)).items.find(e=>e.id===config.ids.shoes);
const source=await bytes(base.url);
assert.equal(hash(source),'9c69190ffd2efc29f8e9b4d04cccef631b78c1fa744689fa57af1f416e70e756');
const generated=syntheticSole(source);
const altered={...base,id:'cpu-only-thick-sole',fitId:'cpu-only-thick-sole-fit',url:'/assets/cpu-only/sole.glb',
  bytes:generated.length,sha256:hash(generated)};
const catalogUrl='/assets/cpu-only/equipment.json';
const catalog=Buffer.from(JSON.stringify({schema:'zbgs-equipment-v1',items:[altered]}));
FOUNDATION_PROFILES[bodyType]={...originalProfile,ids:{...config.ids,probeShoe:altered.id},
  additionalEquipmentManifests:[...config.additionalEquipmentManifests,{url:catalogUrl,sha256:hash(catalog)}],
  extraOutfits:[...config.extraOutfits,{index:2,role:'pants-probe-shoe',bottomRole:'pants',equipmentRoles:['top','probeShoe','pants']}]};
const fetchLocal=globalThis.fetch;
let rejectLoad=true;
globalThis.fetch=(input,...options)=>{
  const url=input instanceof Request?input.url:String(input);
  if(url.endsWith(catalogUrl))return Promise.resolve(new Response(catalog));
  if(url.endsWith(altered.url))return Promise.resolve(rejectLoad?new Response('injected failure',{status:503}):new Response(generated));
  return fetchLocal(input,...options);
};
const vector=new THREE.Vector3();
let avatar,motion;
try{
  const loaded=await loadGeometryAvatar(bodyType);avatar=loaded.avatar;
  avatar.setDebugBody(false);
  const preparations=[];
  const motionProfile=Object.create(avatar.profile.motion);
  if(after)motionProfile.subscribeFootwear=prepare=>avatar.profile.motion.subscribeFootwear(item=>{
    const start=performance.now();
    const update=prepare(item);
    preparations.push({id:item.id,ms:performance.now()-start});
    return update;
  });
  motion=createMotion(avatar.vrm,avatar.root,loaded.motions,motionProfile);
  const observations=[];
  function idleTicks(count){
    for(let frame=0;frame<count;frame++){
      motion.update(1/60,{action:'idle',moving:false,speed:0});
      avatar.update(1/60,{action:'idle'});
    }
  }
  function sample(stage,visibleId,calibratedId){
    avatar.root.updateWorldMatrix(true,true);
    const meshes=new Map();
    avatar.root.traverse(mesh=>{
      if(!mesh.isSkinnedMesh||![mesh.material].flat().some(m=>/Shoes/i.test(m.name)))return;
      let visible=true,id=null;
      for(let p=mesh;p;p=p.parent){visible&&=p.visible;id??=p.userData.equipmentId;}
      if(id)meshes.set(mesh.uuid,{mesh,id,visible});
    });
    const drawn=[...meshes.values()].filter(m=>m.visible);
    assert.equal(drawn.length,1);assert.equal(drawn[0].id,visibleId);
    const feet={};
    for(const {side,selection} of motion.getFootLockCalibration()){
      const mesh=drawn[0].mesh;
      const indices=new Set(mesh.geometry.index.array);
      const {skinIndex,skinWeight}=mesh.geometry.attributes;
      const sideMark=side==='left'?'L':'R';
      let visibleMinY=Infinity;
      for(const i of indices){
        const sides=new Set();
        for(let j=0;j<4;j++)if(skinWeight.getComponent(i,j)>0){
          const rawName=mesh.skeleton.bones[skinIndex.getComponent(i,j)].name;
          const match=/^J_Bip_([LR])_(?:LowerLeg|Foot|ToeBase)$/.exec(rawName);
          assert.ok(match,rawName);sides.add(match[1]);
        }
        assert.equal(sides.size,1);if(!sides.has(sideMark))continue;
        visibleMinY=Math.min(visibleMinY,mesh.getVertexPosition(i,vector).applyMatrix4(mesh.matrixWorld).y);
      }
      assert.ok(Number.isFinite(visibleMinY));
      const patches={};
      for(const [kind,points] of Object.entries(selection.patches)){
        const owner=meshes.get(points[0].mesh);
        assert.ok(points.every(p=>p.mesh===owner.mesh.uuid));assert.equal(owner.id,calibratedId);
        const minY=Math.min(...points.map(p=>owner.mesh.getVertexPosition(p.vertex,vector).applyMatrix4(owner.mesh.matrixWorld).y));
        patches[kind]={meshId:owner.id,visible:owner.visible,vertices:points.length,minWorldYM:minY};
      }
      assert.ok(patches.heel&&patches.toe);
      feet[side]={visibleMinWorldYM:visibleMinY,patches};
    }
    const {sourceGroundLift,sourceJogGroundLift}=motion.getMetrics();
    observations.push({stage,visibleId,feet,walkGroundLiftM:sourceGroundLift,jogGroundLiftM:sourceJogGroundLift});return feet;
  }
  idleTicks(6);
  const flat=sample('initial',base.id,base.id);
  const flatSelections=motion.getFootLockCalibration().map(foot=>foot.selection);
  const same=await avatar.prepareOutfit(1);same.commit();same.dispose();
  const flatSelectionsReused=motion.getFootLockCalibration().every((foot,i)=>foot.selection===flatSelections[i]);
  assert.ok(flatSelectionsReused);
  sample('top change, same shoes',base.id,base.id);
  await assert.rejects(()=>avatar.prepareOutfit(2),/HTTP 503/);
  sample('failed shoe load',base.id,base.id);rejectLoad=false;
  const cancelled=await avatar.prepareOutfit(2);
  const newer=await avatar.prepareOutfit(1);
  assert.throws(()=>cancelled.commit(),/no longer current/);cancelled.dispose();newer.commit();newer.dispose();
  sample('superseded shoe request',base.id,base.id);
  const update=await avatar.prepareOutfit(2);
  sample('prepared before commit',base.id,base.id);
  update.commit();
  const changed=sample('shoe commit',altered.id,after?altered.id:base.id);
  for(const side of ['left','right']){
    const difference=flat[side].visibleMinWorldYM-changed[side].visibleMinWorldYM;
    assert.ok(Math.abs(difference-(after?0:depthM))<.001,`${side} sole at current pose moved ${difference} m`);
  }
  idleTicks(6);
  sample('six motion ticks after swap',altered.id,after?altered.id:base.id);
  update.rollback();update.dispose();
  sample('rollback after shoe commit',base.id,base.id);
  const controller={actor:avatar,outfit:1,async prepareOutfit(index){
    const prepared=await avatar.prepareOutfit(index);
    return {...prepared,commit(){
      prepared.commit();
      sample('shoe commit before injected whole-look failure',altered.id,after?altered.id:base.id);
      throw Error('injected failure after outfit commit');
    }};
  }};
  const target=captureAppearanceRecipe(controller);
  target.equipment={index:2,role:'pants-probe-shoe',manifestUrl:config.manifestUrl,resources:avatar.getEquipmentRecipe(2)};
  await assert.rejects(()=>applyAppearanceRecipe(controller,target),/先前外观已恢复.*injected failure after outfit commit/);
  sample('whole-look rollback after injected failure',base.id,base.id);
  const continuity={};
  if(after){
    avatar.root.position.set(1.3,0,-1.8);avatar.root.rotation.y=.32;
    const step=1.05/60;
    let before,supportIndex;
    for(let i=0;i<180;i++){
      avatar.root.translateZ(step);
      motion.update(1/60,{action:'walk',speed:1.05,moving:true,distanceDelta:step});
      avatar.update(1/60,{action:'walk'});
      before=motion.getMetrics();
      supportIndex=before.feet.findIndex(f=>f.contact&&f.contactPoint!=='ankle');
      if(i>=60&&supportIndex>=0)break;
    }
    assert.ok(supportIndex>=0);
    const set=await avatar.prepareOutfit(2);set.commit();set.dispose();
    const switched=motion.getMetrics(),anchored=switched.feet[supportIndex],prior=before.feet[supportIndex];
    for(const key of ['action','actionTime','phase','distance','jogPhase','seatHeight','rootWorld'])assert.deepEqual(switched[key],before[key],key);
    assert.equal(anchored.contact,true);
    const horizontal=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
    continuity.walk={side:prior.side,phase:before.phase,actionTime:before.actionTime,world:before.rootWorld,
      before:prior.contactPoint,after:anchored.contactPoint,anchorDeltaXZ:horizontal(prior.supportAnchor,anchored.supportAnchor),
      supportDeltaXZ:horizontal(prior.supportActual,anchored.supportActual)};
    assert.ok(continuity.walk.anchorDeltaXZ<.003,JSON.stringify(continuity.walk));
    sample('moving support after switch',altered.id,altered.id);
    motion.setFacilitySeatHeight(.475);
    for(let i=0;i<180;i++){motion.update(1/60,{action:'sit',moving:false,speed:0});avatar.update(1/60,{action:'sit'});}
    const seated=motion.getMetrics(),thick=sample('sitting on facility, second shoe',altered.id,altered.id);
    const remove=await avatar.prepareOutfit(0);remove.commit();remove.dispose();
    const restored=motion.getMetrics(),thin=sample('sitting on facility, original shoe',base.id,base.id);
    for(const key of ['actionTime','sitProgress','seatHeight','distance','phase','rootWorld'])assert.deepEqual(seated[key],restored[key]);
    assert.equal(restored.sitProgress,1);
    continuity.seated={seatHeight:seated.seatHeight,hipDeltaY:restored.hipWorld[1]-seated.hipWorld[1],
      solesM:Object.fromEntries(['left','right'].map(side=>[side,[thick[side].visibleMinWorldYM,thin[side].visibleMinWorldYM]]))};
    assert.ok(Math.abs(continuity.seated.hipDeltaY)<.001,JSON.stringify(continuity.seated));
    for(const [a,b] of Object.values(continuity.seated.solesM))assert.ok(Math.abs(a-b)<.003);
  }
  // Positive control with a new actor in its reference pose. Equip the second
  // mesh before motion initialization, as opposed to replacing a live mixer.
  motion.dispose();motion=null;avatar.dispose();avatar=null;
  const control=await loadGeometryAvatar(bodyType);avatar=control.avatar;
  avatar.setDebugBody(false);
  const first=await avatar.prepareOutfit(2);first.commit();first.dispose();
  motion=createMotion(avatar.vrm,avatar.root,control.motions,avatar.profile.motion);
  idleTicks(12);
  sample('control: second shoe visible before motion creation',altered.id,altered.id);
  if(after){
    const reference=motion.getMetrics();
    const warm=observations.find(row=>row.stage==='six motion ticks after swap');
    assert.ok(Math.abs(reference.sourceGroundLift-warm.walkGroundLiftM)<1e-7);
    assert.ok(Math.abs(reference.sourceJogGroundLift-warm.jogGroundLiftM)<1e-7);
    // First-time preparation from a posed, rotated and translated actor must
    // agree with calibration from the neutral pose, including the dance clip.
    motion.dispose();motion=null;avatar.dispose();avatar=null;
    const posed=await loadGeometryAvatar(bodyType);avatar=posed.avatar;
    avatar.setDebugBody(false);
    motion=createMotion(avatar.vrm,avatar.root,posed.motions,avatar.profile.motion);
    avatar.root.position.set(-2,.12,2.7);avatar.root.rotation.y=-.48;
    for(let i=0;i<180;i++){motion.update(1/60,{action:'sit',moving:false,speed:0});avatar.update(1/60,{action:'sit'});}
    const prior=motion.getMetrics(),fresh=await avatar.prepareOutfit(2);
    assert.equal(motion.getMetrics().actionTime,prior.actionTime);
    fresh.commit();fresh.dispose();
    const calibrated=motion.getMetrics();
    continuity.firstFitWhileSeated={walkDifferenceM:calibrated.sourceGroundLift-reference.sourceGroundLift,
      jogDifferenceM:calibrated.sourceJogGroundLift-reference.sourceJogGroundLift,
      danceDifferenceM:calibrated.dance.groundLift-reference.dance.groundLift};
    for(const delta of Object.values(continuity.firstFitWhileSeated))assert.ok(Math.abs(delta)<1e-7);
    assert.equal(calibrated.actionTime,prior.actionTime);assert.deepEqual(calibrated.rootWorld,prior.rootWorld);
    const feet=sample('first-time preparation from seated actor away from origin',altered.id,altered.id);
    for(const foot of Object.values(feet))assert.ok(Math.abs(foot.visibleMinWorldYM-avatar.root.position.y)<.004);
  }
  // The normal record consumer cold-loads the selected outfit directly. Keep
  // this result separate from the positive control above, which loaded flat first.
  let directCold;
  try{
    const cold=await loadFoundationAvatar({scene:new THREE.Scene(),renderer:{},bodyType,initialOutfit:2});
    try {directCold={status:'loaded'};}finally {cold.dispose();}
  }catch(error){directCold={status:'rejected',message:error.message,at:error.stack?.split('\n')[1]?.trim()};}
  if(after)assert.equal(directCold.status,'loaded',directCold.message);
  const sources={};
  for(const file of ['prototype/src/motion.js',...(after?['prototype/src/footwear-contact.js']:[]),'prototype/src/m1-equipment.js','prototype/src/foundation-avatar.js','scripts/headless-avatar-node.mjs']){
    sources[file]=hash(await readFile(new URL('../../'+file,import.meta.url)));
  }
  console.log(JSON.stringify({schema:'cpu-footwear-contact-diagnostic-v1',bodyType,avatarSha256:config.sha256,
    released,sourceShoeSha256:base.sha256,syntheticShoeSha256:altered.sha256,depthM,sources,flatSelectionsReused,observations,directCold,...(after?{preparations,continuity}:{}),
    scope:'Production avatar/outfit/motion, one in-memory synthetic extension. No footwear product or visual/device admission.'},null,2));
}finally{
  try{motion?.dispose();}finally{avatar?.dispose();globalThis.fetch=fetchLocal;FOUNDATION_PROFILES[bodyType]=originalProfile;}
}
