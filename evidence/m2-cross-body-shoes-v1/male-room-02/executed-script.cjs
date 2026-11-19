// Run through run-fixed-check.cjs on a fixed room build with the original signed flat outfit.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {productionRoot, projectOutput} = require('./project-output.cjs');
const {launchQABrowser} = require('./qa-browser-workspace.cjs');

const maleBody = {type:'source-male-cc0-texture-release-v1',sha256:'2e66ee6c88524bca3f61b834672e89d3146f9f41859811d2159a01c0edf10617'};
const maleShoes = {
  1:{role:'pants-top-far',equipmentRole:'shoes',id:'cc0-texture-release-flat-shoes-v1'},
  2:{role:'pants-top-far-platform',equipmentRole:'platformShoes',id:'cc0-texture-release-platform-shoes-v1'},
};
const defaultCase = {schema:'footwear-room-case-v1',bodySha256:maleBody.sha256,label:'platform',outfitIndex:2,
  ...maleShoes[2],sha256:'8b23ba4f3add78322c1b3246b3ac80387d8eb2f2dd8e300b6443a33b0ed619c7'};
const config = {sampleIntervalMs:80, closeCamera:{offset:[1.42,.65,1.15],targetHeight:.44,fov:33},
  floorY:0, severeDepthM:.025, severeDurationS:.30, maxSampleGapS:.25};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const terminal = ['completed','cancelled','failed'];
const sameCamera=(a,b)=>a.fov===b.fov&&['position','rotation'].every(key=>a[key].every((v,i)=>Math.abs(v-b[key][i])<1e-6));
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));

function shoeSlot(resources) {
  const entries=Object.entries(resources??{}).filter(([,resource])=>resource?.slot==='shoes');
  assert.equal(entries.length,1,'Expected one selected equipment resource in the shoes slot');
  return entries[0];
}

function signedFlat(bytes,pair=defaultCase) {
  const input = JSON.parse(bytes), values = Array.isArray(input) ? input : [input];
  const knownMale=pair.bodySha256===maleBody.sha256;
  const bodyType=pair.bodyType??(knownMale?maleBody.type:undefined);
  const referenceIndex=pair.referenceIndex??(knownMale?1:undefined);
  const matches = values.filter(record => {
    const recipe=record?.appearanceRecipe, index=recipe?.equipment?.index;
    return recipe?.base?.sha256===pair.bodySha256 && (!bodyType||recipe.base.bodyType===bodyType) &&
      Number.isSafeInteger(index) && index>=0 && index!==pair.outfitIndex &&
      (referenceIndex===undefined||index===referenceIndex);
  });
  assert.equal(matches.length,1,'Expected exactly one original signed flat record for the selected body and reference outfit');
  const [record] = matches;
  const {base,equipment}=record.appearanceRecipe, [equipmentRole,shoe]=shoeSlot(equipment.resources);
  assert.match(base.bodyType,/^[a-z][a-z0-9-]*$/);
  assert.match(equipment.role,/^[A-Za-z][A-Za-z0-9-]*$/);
  assert.match(shoe.sha256,/^[a-f0-9]{64}$/);
  assert.equal(shoe.compatibleAvatarSha256,base.sha256);
  assert.notEqual(shoe.id,pair.id,'Reference and comparison must use different shoes');
  assert.notEqual(shoe.sha256,pair.sha256,'Reference and comparison must have different shoe bytes');
  if(knownMale && referenceIndex===1)
    assert.deepEqual({id:shoe.id,equipmentRole,role:equipment.role},maleShoes[1]);
  assert.match(record.integrity.recordSha256,/^[a-f0-9]{64}$/);
  return record;
}

function installProbe(settings) {
  const d = window.__debug, cam = d.cameraObject(), renderer = d.renderer;
  const shoeIds = new Set(Object.values(settings.shoes).map(row=>row.id));
  const refsByMesh = new WeakMap(), vector = d.avatar().root.position.clone();
  const point = (mesh,index) => mesh.getVertexPosition(index,vector).applyMatrix4(mesh.matrixWorld);
  let film = null;

  function refs(mesh) {
    const geometry = mesh.geometry, saved=refsByMesh.get(mesh);
    if (saved?.geometry===geometry) return saved;
    const {position,skinIndex,skinWeight}=geometry.attributes;
    const {index,drawRange}=geometry, end=Math.min(index?.count??position.count,drawRange.start+drawRange.count);
    const indices=new Set();
    for(let i=drawRange.start;i<end;i++) indices.add(index?index.getX(i):i);
    const side={left:[],right:[]}, byVertex=new Map();
    const boneSide=mesh.skeleton.bones.map(bone=>{
      const match=/^J_Bip_([LR])_(?:LowerLeg|Foot|ToeBase)$/.exec(bone.name);
      return match?.[1]==='L'?'left':match?.[1]==='R'?'right':null;
    });
    let ambiguous=0;
    for(const i of indices){
      const weights={left:0,right:0};
      for(let k=0;k<4;k++){
        const which=boneSide[skinIndex.getComponent(i,k)];
        if(which)weights[which]+=skinWeight.getComponent(i,k);
      }
      const which=weights.left>.999?'left':weights.right>.999?'right':null;
      if(which){side[which].push(i);byVertex.set(i,which);}else ambiguous++;
    }
    const row={geometry,side,byVertex,ambiguous};refsByMesh.set(mesh,row);return row;
  }

  function sample(label, wallMs=null) {
    const s=d.snapshot(),m=s.motion,actor=d.avatar(),rig=d.motion();
    const meshes=new Map(), visible=[];
    actor.root.updateWorldMatrix(true,true);
    actor.root.traverse(mesh=>{
      if(!mesh.isSkinnedMesh)return;
      let id=null,shown=true;
      for(let node=mesh;node;node=node.parent){shown&&=node.visible;id??=node.userData.equipmentId;}
      if(!shoeIds.has(id))return;
      shown&&=[mesh.material].flat().some(material=>material?.visible!==false);
      const row={mesh,id,shown};meshes.set(mesh.uuid,row);
      if(shown)visible.push({id,mesh:mesh.uuid,geometry:mesh.geometry.uuid,name:mesh.name,unclassified:refs(mesh).ambiguous});
    });
    const feet=Object.fromEntries(rig.getFootLockCalibration().map(({side,selection})=>{
      let sole=null,vertexCount=0;
      for(const {mesh,id,shown} of meshes.values()){
        if(!shown)continue;
        const group=refs(mesh).side[side];vertexCount+=group.length;
        for(const vertex of group){
          const p=point(mesh,vertex);
          if(!sole||p.y<sole.world[1])sole={id,mesh:mesh.uuid,vertex,world:p.toArray(),groundDeltaM:p.y-settings.floorY};
        }
      }
      const patches=Object.fromEntries(Object.entries(selection?.patches??{}).map(([kind,points])=>{
        const owners=new Map();let minimum=null,maximum=null,matched=0;
        for(const p of points){
          const owner=meshes.get(p.mesh);
          if(!owners.has(p.mesh))owners.set(p.mesh,{mesh:p.mesh,id:owner?.id??null,visible:owner?.shown??false});
          if(owner&&refs(owner.mesh).byVertex.get(p.vertex)===side){
            const y=point(owner.mesh,p.vertex).y;
            minimum=minimum===null?y:Math.min(minimum,y);
            maximum=maximum===null?y:Math.max(maximum,y);matched++;
          }
        }
        return [kind,{count:points.length,correctSide:matched,minWorldY:minimum,maxWorldY:maximum,owners:[...owners.values()]}];
      }));
      const foot=m.feet.find(row=>row.side===side);
      return [side,{sole,vertexCount,patches,calibrationVertices:selection?.selectedVertexCount??null,
        ankle:foot.actual,support:foot.supportActual,anchor:foot.supportAnchor,contact:foot.contact,
        slip:foot.slip,landmark:foot.landmarkMethod}];
    }));
    const chair=d.scene.getObjectByName('RepresentativeChair'), seat=chair?.children[0];
    if(!seat?.geometry)throw Error('Missing room seat mesh');
    seat.geometry.computeBoundingBox();
    const seatTop=seat.localToWorld(vector.set(0,seat.geometry.boundingBox.max.y,0)).y;
    const current=actor.profile.motion.getFootwear();
    return {label,wallMs,simulationTime:s.simulationTime,playbackRate:s.playbackRate,paused:s.paused,suspended:!!s.backgroundSuspended,
      actor:actor.root.uuid,bodyType:actor.profile.bodyType,bodySHA256:actor.profile.sha256,outfit:s.outfit,avatarOutfit:actor.getOutfitInfo().index,
      footwear:current&&{id:current.id,sha256:current.entry.sha256,fitId:current.entry.fitId,meshes:current.meshes.map(mesh=>mesh.uuid)},
      root:m.rootWorld,hip:m.hipWorld,speed:s.speed,mode:s.mode,pending:s.pending?.name??null,target:s.target,
      seat:{topY:seatTop,root:s.chair.position,yaw:s.chair.yaw,approach:s.chair.approach,pelvisClearance:m.seatPelvisClearance,progress:m.sitProgress},
      motion:{gait:m.gait,stopTime:m.stopTime,action:m.action,walkGroundLift:m.sourceGroundLift,
        jogGroundLift:m.sourceJogGroundLift,danceId:m.dance.id,danceTime:m.dance.time,danceMix:m.danceMix},
      camera:{position:cam.position.toArray(),rotation:cam.quaternion.toArray(),fov:cam.fov},visible,feet};
  }

  function start(framing) {
    const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8'].find(type=>MediaRecorder.isTypeSupported(type));
    if(!mime)throw Error('No supported WebM encoder');
    const stream=renderer.domElement.captureStream(30),chunks=[],samples=[],faults=[];
    const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:5500000});
    const done=new Promise(resolve=>recorder.onstop=resolve);
    recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
    recorder.onerror=event=>faults.push(event.error?.message??'MediaRecorder failed');
    const render=renderer.render,originalFov=cam.fov;
    if(framing==='feet')renderer.render=function(scene,camera){
      if(scene===d.scene&&camera===cam){
        const p=d.avatar().root.position,[dx,y,dz]=settings.closeCamera.offset;
        cam.position.set(p.x+dx,y,p.z+dz);
        cam.lookAt(p.x,settings.closeCamera.targetHeight,p.z);
        if(cam.fov!==settings.closeCamera.fov){cam.fov=settings.closeCamera.fov;cam.updateProjectionMatrix();}
      }
      return render.call(this,scene,camera);
    };
    const start=performance.now();let last=-Infinity;
    film={recorder,done,stream,chunks,samples,faults,label:'opening',start,frame:null,
      restore(){renderer.render=render;cam.fov=originalFov;cam.updateProjectionMatrix();}};
    function take(t){
      if(t-last>=settings.sampleIntervalMs){
        try{samples.push(sample(film.label,t-start));}
        catch(error){faults.push(String(error));return;}
        last=t;
      }
      film.frame=requestAnimationFrame(take);
    }
    recorder.start(500);film.frame=requestAnimationFrame(take);
    return {framing,mime,width:renderer.domElement.width,height:renderer.domElement.height};
  }

  async function stop() {
    if(!film)return null;
    const {recorder,done,stream,chunks,samples,faults,frame,restore}=film;
    cancelAnimationFrame(frame);restore();
    try{
      if(recorder.state!=='inactive')recorder.stop();
      await done;
      const blob=new Blob(chunks,{type:recorder.mimeType});
      const data=await new Promise((resolve,reject)=>{
        const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);
      });
      return {data:data.split(',')[1],samples,faults};
    }finally{stream.getTracks().forEach(track=>track.stop());film=null;}
  }
  window.__footwearQA={sample,start,stop,mark:label=>{film.label=label;}};
}

function recordLook(record) {
  return {appearance:record.appearanceRecipe,live:record.liveAccessories,materials:record.equipmentMaterials,
    nativeHairCenter:record.nativeHairCenter,resources:record.resourceIdentities};
}

function soleFaults(row, checkedShoes) {
  const selected=checkedShoes[row.outfit], expected=selected?.id, faults=[];
  if(!expected||!row.visible.length||row.visible.some(mesh=>mesh.id!==expected||mesh.unclassified))
    faults.push({reason:'wrong/missing visible shoe or vertex ownership'});
  const actual=row.footwear;
  if(!actual||actual.id!==expected||(selected?.sha256&&actual.sha256!==selected.sha256)||
     (selected?.fitId&&actual.fitId!==selected.fitId)||
     JSON.stringify([...actual.meshes].sort())!==JSON.stringify(row.visible.map(mesh=>mesh.mesh).sort()))
    faults.push({reason:'visible meshes differ from the current exact footwear'});
  for(const side of ['left','right']){
    const foot=row.feet[side];
    if(!foot?.sole||!Number.isFinite(foot.sole.groundDeltaM)||foot.sole.id!==expected||!foot.vertexCount)
      faults.push({side,reason:'missing actual sole'});
    for(const patch of ['heel','toe']){
      const p=foot?.patches[patch];
      if(!p?.count||p.correctSide!==p.count||!Number.isFinite(p.minWorldY)||!Number.isFinite(p.maxWorldY)||
         p.minWorldY>p.maxWorldY||p.owners.some(owner=>!owner.visible||owner.id!==expected))
        faults.push({side,patch,reason:'calibration did not use this visible shoe'});
    }
  }
  return faults;
}

function traceChecks(samples, {allowSwitch=false, checkedShoes=maleShoes, body=maleBody}={}) {
  assert(samples.length>20,'Too few physical samples');
  const first=samples[0],last=samples.at(-1),wall=(last.wallMs-first.wallMs)/1000;
  const ratio=(last.simulationTime-first.simulationTime)/wall;
  assert(ratio>=.90&&ratio<=1.03,'Game motion clock diverged from actual playback');
  const faults=[],contact={};
  for(const [index,row] of samples.entries()){
    if(row.paused||row.suspended||row.playbackRate!==1||row.actor!==first.actor||row.bodyType!==body.type||row.bodySHA256!==body.sha256||
       row.avatarOutfit!==row.outfit||(!allowSwitch&&row.outfit!==first.outfit))faults.push({index,reason:'runtime identity or clock'});
    faults.push(...soleFaults(row,checkedShoes).map(fault=>({index,...fault})));
    for(const side of ['left','right']){
      const foot=row.feet[side];
      const val=foot?.sole?.groundDeltaM,key=row.label+'/'+side;
      if(!Number.isFinite(val))continue;
      const slot=contact[key]??={minM:val,maxM:val,severeSpanS:0,started:null,last:null};
      slot.minM=Math.min(slot.minM,val);slot.maxM=Math.max(slot.maxM,val);
      const time=row.simulationTime;
      if(val < -config.severeDepthM){
        if(slot.started===null||time-slot.last>config.maxSampleGapS)slot.started=time;
        slot.severeSpanS=Math.max(slot.severeSpanS,time-slot.started);
      }else slot.started=null;
      slot.last=time;
    }
  }
  for(const [phase,entry] of Object.entries(contact)){
    delete entry.started;delete entry.last;
    if(entry.severeSpanS>=config.severeDurationS)faults.push({phase,reason:'sustained sole below structural floor',...entry});
  }
  return {wallSeconds:wall,simulationPerWallSecond:ratio,phases:contact,faults,
    openingCamera:first.camera,fixedCamera:samples.every(row=>sameCamera(row.camera,first.camera))};
}

function footwearCase(value) {
  assert.equal(value.schema,'footwear-room-case-v1');
  assert.match(value.bodySha256,/^[a-f0-9]{64}$/);
  if(value.bodyType!==undefined)assert.match(value.bodyType,/^[a-z][a-z0-9-]*$/);
  assert(Number.isSafeInteger(value.outfitIndex) && value.outfitIndex>=0,'Expected a configured comparison outfit index');
  if(value.referenceIndex!==undefined)
    assert(Number.isSafeInteger(value.referenceIndex) && value.referenceIndex>=0 && value.referenceIndex!==value.outfitIndex,
      'Expected a distinct signed reference outfit index');
  assert.match(value.label,/^[a-z][a-z0-9-]{0,40}$/);
  assert.notEqual(value.label,'flat','The comparison name must differ from the reference');
  for(const key of ['role','equipmentRole','id'])assert.match(value[key],/^[A-Za-z][A-Za-z0-9-]{0,100}$/);
  assert.match(value.sha256,/^[0-9a-f]{64}$/);
  if(value.pairedPants){
    for(const item of ['reference','candidate']){
      assert.match(value.pairedPants[item].id,/^[a-z][a-z0-9-]{0,100}$/);
      assert.match(value.pairedPants[item].sha256,/^[0-9a-f]{64}$/);
    }
    assert.notEqual(value.pairedPants.reference.id,value.pairedPants.candidate.id);
    assert.notEqual(value.pairedPants.reference.sha256,value.pairedPants.candidate.sha256);
  }
  return value;
}

async function run(base, sourceDigest, input, output, caseFile) {
  assert(base&&input&&output&&/^[a-f0-9]{64}$/.test(sourceDigest??''),'Expected BASE SOURCE_DIGEST SIGNED_FLAT_RECORD OUTPUT [CASE_JSON]');
  const root=await productionRoot(),out=await projectOutput(output,root);
  const caseBytes=caseFile?await fs.readFile(caseFile):null;
  const pair=footwearCase(caseBytes?JSON.parse(caseBytes):defaultCase);
  const bytes=await fs.readFile(input),record=signedFlat(bytes,pair);
  const body={type:record.appearanceRecipe.base.bodyType,sha256:record.appearanceRecipe.base.sha256};
  const flat=record.appearanceRecipe.equipment, indexFlat=flat.index;
  const [flatSlot,flatShoe]=shoeSlot(flat.resources);
  const {outfitIndex:index2,label}=pair;
  const checkedShoes={
    [indexFlat]:{role:flat.role,equipmentRole:flatSlot,id:flatShoe.id,sha256:flatShoe.sha256,fitId:flatShoe.fitId},
    [index2]:{role:pair.role,equipmentRole:pair.equipmentRole,id:pair.id,sha256:pair.sha256},
  };
  const settings={...config,shoes:checkedShoes};
  const {canonicalJson}=await import('../prototype/src/character-record.js');
  const url=new URL(base);url.searchParams.set('workbench','appearance');url.searchParams.set('body',body.type);
  const report={schema:'footwear-room-qa-v1',expectedSourceDigest:sourceDigest,body,settings,comparison:pair,status:'incomplete',
    comparisonSource:caseBytes?{path:path.resolve(caseFile),sha256:sha(caseBytes)}:'historical-male-platform',
    sourceRecord:{path:path.resolve(input),fileSHA256:sha(bytes),id:record.identity.id,revision:record.revision,
      recordSHA256:record.integrity.recordSha256,outfitIndex:indexFlat,shoeId:flatShoe.id,shoeSha256:flatShoe.sha256},
    conditions:['Indexed posed skin vertices in the visible registered shoe, independently separated by foot weights.',
      'Room structural floor y=0 m. Rug covering is not the measurement plane. Sampled minima are not swept surface contact.',
      'A continuous sample span of at least 0.30 s below -25 mm on one side triggers review. Gaps over 0.25 s break the span.',
      'Original clock, authored technical once-dance, shared room camera, and a separate camera-only tracking clip for the seated swap.'],
    errors:[],tasks:[],films:{},events:[]};
  await fs.mkdir(path.dirname(out),{recursive:true});
  await fs.mkdir(out,{recursive:false});
  await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
  let session,page;
  async function open(){
    const page=await session.browser.newPage({viewport:{width:1600,height:1000}});
    page.on('pageerror',error=>report.errors.push(String(error)));
    await page.goto(url.href);
    await page.waitForFunction(()=>window.__debug?.ready&&__debug.buildInfo?.sourceDigest,null,{timeout:90000});
    const build=await page.evaluate(()=>__debug.buildInfo);
    assert.equal(build.sourceDigest,sourceDigest);assert.equal(build.shortId,sourceDigest.slice(0,12));assert.equal(build.development,false);
    return {page,build};
  }
  const snap=label=>page.evaluate(label=>__footwearQA.sample(label),label);
  const mark=label=>page.evaluate(label=>__footwearQA.mark(label),label);
  const wait=ms=>page.waitForTimeout(ms);
  const phase=async(label,ms)=>{await mark(label);await wait(ms);};
  const take=async label=>{
    const canvas=await page.evaluateHandle(()=>__debug.renderer.domElement),file=label+'.png';
    try{
      const buffer=await canvas.asElement().screenshot();
      await fs.writeFile(path.join(out,file),buffer,{flag:'wx'});return {file,sha256:sha(buffer)};
    }finally{await canvas.dispose();}
  };
  const behavior=async(prefix,label,kind,payload={})=>{
    await mark(label);
    const requestId=prefix+'-'+kind;
    const accepted=await page.evaluate(req=>__debug.request(req),{requestId,kind,payload});
    assert.equal(accepted.admission,'accepted',JSON.stringify(accepted));
    await page.waitForFunction(({requestId,terminal})=>terminal.includes(__debug.tasks().get(requestId)?.state),{requestId,terminal},{timeout:45000});
    const result=await page.evaluate(id=>__debug.tasks().get(id),requestId);
    report.tasks.push(result);assert.equal(result.state,'completed',JSON.stringify(result));
  };
  const setup=async()=>{
    await page.evaluate(()=>{__debug.reset();__debug.setSpeed(.85);__debug.setHelpers(false);__debug.setPlaybackRate(1);
      __debug.setPaused(false);__debug.camera('room');});
    await page.waitForFunction(()=>{const s=__debug.snapshot();return s.camera.mode==='room'&&s.simulationTime>=.7;});
  };
  const fit=async(index,label)=>{
    const previous=await snap(label+'-before');
    const result=await page.evaluate(index=>__debug.setOutfit(index),index);
    const immediate=await snap(label+'-committed');
    await wait(420);
    const after=await snap(label+'-settled');
    const faults=[...soleFaults(immediate,checkedShoes).map(fault=>({instant:'commit',...fault})),...soleFaults(after,checkedShoes)];
    report.events.push({label,result,previous,immediate,after,faults});
    assert.equal(result.applied,true,JSON.stringify(result));
    assert.equal(after.outfit,index);assert.equal(after.actor,previous.actor);
    assert(after.visible.every(mesh=>!previous.visible.some(old=>old.mesh===mesh.mesh)),'Different shoes reused the same visible mesh');
    assert(Math.hypot(...after.root.map((v,i)=>v-previous.root[i]))<.012,'Shoe switch moved the actor root');
    return {previous,after};
  };
  const film=async(name,framing,sequence)=>{
    const entry=report.films[name]=await page.evaluate(framing=>__footwearQA.start(framing),framing);
    try{await sequence();}
    finally{
      const result=await page.evaluate(()=>__footwearQA.stop());
      const video=Buffer.from(result.data,'base64'),file=name+'-1x.webm',sampleFile=name+'-samples.json';
      await fs.writeFile(path.join(out,file),video,{flag:'wx'});
      await fs.writeFile(path.join(out,sampleFile),JSON.stringify(result.samples,null,2)+'\n',{flag:'wx'});
      Object.assign(entry,{file,sha256:sha(video),bytes:video.length,sampleFile,samples:result.samples.length,captureFaults:result.faults});
      assert(video.length>1000&&result.faults.length===0,JSON.stringify(result.faults));
      entry.checks=traceChecks(result.samples,{allowSwitch:framing==='feet',checkedShoes,body});
      if(framing==='room'){
        const standing=result.samples.filter(row=>row.label==='standing');
        const walk=result.samples.filter(row=>row.label==='walk');
        const leave=result.samples.filter(row=>row.label==='leave');
        assert(standing.some(row=>row.speed<.01&&row.motion.gait<.01),'No standing start');
        assert(walk.some(row=>row.speed>.3)&&distance(standing.at(-1).root,walk.at(-1).root)>.15,'No meaningful room walk');
        assert(result.samples.some(row=>row.label==='walk-stop'&&row.speed<.01&&row.motion.gait<.01),'Room walk did not stop');
        assert(result.samples.some(row=>row.label==='seat-approach'&&row.speed>.3),'No meaningful seat approach');
        assert(result.samples.some(row=>row.label==='seated'&&row.seat.progress>.995),'No stable seated sample');
        assert(result.samples.some(row=>row.label==='rise'&&row.seat.progress>.01&&row.seat.progress<.99),'No sit-to-stand samples');
        assert(leave.some(row=>row.speed>.3)&&distance(leave[0].root,leave.at(-1).root)>.15,'No physical exit from the chair');
        assert(result.samples.some(row=>row.label==='dance'&&row.motion.danceId==='dance-technical-once-v1'&&row.motion.danceTime>6.5),'Dance did not reach the end of its authored clip');
      }
    }
  };
  const room=async name=>film(name,'room',async()=>{
    await phase('standing',650);
    await behavior(name,'walk','walk',{x:-.5,z:1.8});
    await phase('walk-stop',700);
    await behavior(name,'seat-approach','sit',{usePointId:'room-chair-1'});
    await phase('seated',850);
    await behavior(name,'rise','stand');
    await phase('risen',600);
    await behavior(name+'-leave','leave','walk',{x:-.5,z:1.8});
    await behavior(name,'dance','dance',{danceId:'dance-technical-once-v1'});
    await phase('dance-stop',550);
  });
  const restore=async (target,label)=>{
    const result=await page.evaluate(value=>__debug.restoreCharacterRecord(value),target);
    assert.equal(result.applied,true,JSON.stringify(result));
    assert.deepEqual(result.identity,target.identity);assert.equal(result.recordSha256,target.integrity.recordSha256);
    assert.equal(result.revision,target.revision);
    const actual=await page.evaluate(value=>__debug.captureCharacterRecord({identity:value}),target.identity);
    assert.equal(canonicalJson(recordLook(actual)),canonicalJson(recordLook(target)),'Restored look differs from the signed JSON');
    const state=await snap(label);report.events.push({label,result,state,faults:soleFaults(state,checkedShoes)});
    assert.equal(state.outfit,target.appearanceRecipe.equipment.index);
    assert.equal(state.bodyType,target.appearanceRecipe.base.bodyType);
    assert.equal(state.bodySHA256,target.appearanceRecipe.base.sha256);
    return state;
  };

  try{
    session=await launchQABrowser(out,{channel:'chrome'});report.browser=session.browser.version();
    ({page,build:report.build}=await open());await page.evaluate(installProbe,settings);
    const available=await page.evaluate(indices=>{
      const avatar=__debug.avatar();
      return {type:avatar.profile.bodyType,sha256:avatar.profile.sha256,outfits:Object.fromEntries(indices.map(index=>{
        const selection=avatar.config.outfits.find(look=>look.index===index);
        if(!selection)throw Error('Missing fixed outfit '+index);
        return [index,{role:selection.role,resources:avatar.getEquipmentRecipe(index)}];
      }))};
    },[indexFlat,index2]);
    assert.deepEqual({type:available.type,sha256:available.sha256},body);
    const looks=Object.fromEntries(Object.entries(available.outfits).map(([index,look])=>[index,look.resources]));
    assert.equal(canonicalJson(looks[indexFlat]),canonicalJson(flat.resources),'Fixed reference resources differ from the original signature');
    for(const index of [indexFlat,index2]){
      const selected=checkedShoes[index],[equipmentRole,entry]=shoeSlot(looks[index]);
      assert.equal(available.outfits[index].role,selected.role);
      assert.equal(equipmentRole,selected.equipmentRole);
      assert.equal(entry.id,selected.id);
      assert.equal(entry.sha256,selected.sha256);
      assert.equal(entry.compatibleAvatarSha256,body.sha256);
      selected.fitId=entry.fitId;
      const asset=new URL(entry.url,url);
      assert.equal(asset.origin,url.origin);assert(asset.pathname.startsWith('/assets/')&&!asset.search&&!asset.hash);
      const response=await fetch(asset,{redirect:'error'});assert(response.ok,'Missing declared shoe '+entry.id);
      const binary=Buffer.from(await response.arrayBuffer());assert.equal(binary.length,entry.bytes);assert.equal(sha(binary),entry.sha256);
    }
    const constantEquipment = look=>Object.values(look).filter(entry=>
      entry.slot!=='shoes' && !(pair.pairedPants && entry.slot==='bottom'));
    assert.equal(canonicalJson(constantEquipment(looks[indexFlat])),canonicalJson(constantEquipment(looks[index2])));
    if (pair.pairedPants) {
      for (const [index, expected] of [[indexFlat,pair.pairedPants.reference],[index2,pair.pairedPants.candidate]]) {
        const bottoms=Object.values(looks[index]).filter(item=>item.slot==='bottom');
        assert.equal(bottoms.length,1);
        assert.equal(bottoms[0].sha256,expected.sha256);
        assert.equal(bottoms[0].id,expected.id);
        const u=new URL(bottoms[0].url,url);
        assert(u.origin===url.origin && u.pathname.startsWith('/assets/') && !u.search && !u.hash);
        const response=await fetch(u,{redirect:'error'});
        assert(response.ok);
        const data=Buffer.from(await response.arrayBuffer());
        assert.equal(data.length,bottoms[0].bytes);
        assert.equal(sha(data),expected.sha256);
      }
    }
    report.looks=looks;
    const original=await restore(record,'input-flat-restore');await setup();await room('room-flat');
    await setup();await fit(index2,'standing-flat-to-'+label);
    const candidate=await page.evaluate(previous=>__debug.captureCharacterRecord({previous,expectedRevision:previous.revision}),record);
    assert.deepEqual(candidate.identity,record.identity);assert.equal(candidate.revision,record.revision+1);
    assert.equal(candidate.appearanceRecipe.equipment.index,index2);assert.equal(candidate.appearanceRecipe.equipment.role,pair.role);
    assert.equal(canonicalJson(candidate.appearanceRecipe.equipment.resources),canonicalJson(looks[index2]));
    await fs.writeFile(path.join(out,'observed-'+label+'-record.json'),JSON.stringify(candidate,null,2)+'\n',{flag:'wx'});
    report[label+'DiagnosticRecord']=candidate.integrity.recordSha256;
    await room('room-'+label);
    await setup();
    await film('feet-swap','feet',async()=>{
      await phase(label+'-standing',550);report[label+'Standing']=await take(label+'-standing');
      await behavior('feet','seat-approach','sit',{usePointId:'room-chair-1'});
      await phase(label+'-seated',700);report[label+'Seated']=await take(label+'-seated');
      await mark('seated-swap');
      const swap=await fit(indexFlat,'seated-'+label+'-to-flat');
      for(const row of [swap.previous,swap.after]){
        assert.equal(row.mode,'sit');assert(row.seat.progress>.995);
      }
      assert.deepEqual(swap.previous.seat.root,swap.after.seat.root);
      await phase('flat-seated',850);report.flatSeated=await take('flat-seated');
      await behavior('feet','rise','stand');
      await phase('flat-standing',650);report.flatStanding=await take('flat-standing');
    });
    await page.close();
    ({page}=await open());await page.evaluate(installProbe,settings);
    const fresh=await restore(candidate,'fresh-'+label+'-restore');
    const restored=await restore(record,'fresh-flat-restore');
    assert.notEqual(fresh.actor,original.actor,'Expected a fresh room actor before restoring signed outfits');
    assert.equal(restored.actor,fresh.actor,'Old signed record replaced the fresh same-body actor');
    assert.deepEqual(report.errors,[]);
    const referenceChecks=report.films['room-flat'].checks,other=report.films['room-'+label].checks;
    assert(referenceChecks.fixedCamera&&other.fixedCamera,'Room camera changed during comparison');
    assert(sameCamera(referenceChecks.openingCamera,other.openingCamera),'Room comparison camera differs between registered looks');
    const faults=[...Object.values(report.films).flatMap(entry=>entry.checks.faults),...report.events.flatMap(event=>event.faults??[])];
    assert(faults.length===0,'Footwear runtime checks failed. Inspect recorded film checks, samples and poses.');
    report.status='technical-pass-visual-pending';
  }catch(error){report.failure=String(error.stack||error);process.exitCode=1;}
  finally{
    try{await session?.close();}
    finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
  }
  console.log(JSON.stringify({status:report.status,build:report.build?.shortId,failure:report.failure,films:Object.keys(report.films)}));
}

if(require.main===module)run(...process.argv.slice(2)).catch(error=>{console.error(error);process.exitCode=1;});
module.exports={footwearCase,signedFlat,traceChecks};
