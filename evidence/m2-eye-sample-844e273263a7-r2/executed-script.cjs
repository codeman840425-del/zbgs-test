// Bounded eye endpoint QA. PREPARATION ONLY until an explicitly frozen build is supplied.
// Static expression diagnostics are separate from actual live 1x playback.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { chromium } = require('../prototype/node_modules/playwright');
const { verifyCandidate } = require('./qa-m1-common.cjs');
const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const BUILD = arg('build') || process.env.QA_BUILD;
if (!/^[a-f0-9]{12}$/.test(BUILD || '')) throw Error('Explicit --build=<fixed ID> or QA_BUILD required');
const BASE = arg('url') || process.env.QA_URL || 'http://127.0.0.1:4277/';
const OUT = path.resolve(arg('out') || process.env.QA_OUT || `evidence/m2-eye-sample-${BUILD}`);
const SOURCE = path.resolve(arg('source-root') || 'assets-source/face-eye-sample-v1');
const EYE = 'aperture-width101-v1', BROW = 'height1-spacing1-v1', NOSE = 'tip-forward05-v1';
const IDS = {
  female: ['beta-base-female-m1', '027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'],
  male: ['beta-base-male-m1b', '62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff'],
};
const report = { build: BUILD, url: BASE, started: new Date().toISOString(), checks: [], identities: [], errors: [], sources: {}, shots: [], movies: [],
  limits: ['Only original female/male and one +1% endpoint.', 'Paused direct expressionManager/applier diagnostics are not product UI blink/gaze playback.', 'Zero eyelid gap or sampled iris occlusion is not a visual pass.', 'Source normal CPU agreement does not establish authored-lighting continuity: inspect half/full and unilateral blink.', 'Same-context page reopen is local draft persistence, not a server.', 'Recorded frame times are not target-PC performance; 2fps review is not continuous human acceptance.'] };
const save = () => fs.writeFile(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
async function check(name, fn) {
  try { const result = await fn(); report.checks.push({ name, passed: true, result }); console.log('PASS', name); await save(); return result; }
  catch (e) { report.checks.push({ name, passed: false, error: String(e), stack: e.stack }); await save(); throw e; }
}
async function ready(p) { await p.waitForFunction(() => window.__debug?.ready && !document.querySelector('#appearance-fields').disabled && !document.querySelector('#appearance-identity-fields').disabled, null, { timeout: 60000 }); }
const tab = (p, name) => p.locator(`[data-workbench-tab=${name}]`).click();
async function select(p, id, value) { await p.locator(id).selectOption(value); await ready(p); }
async function state(p) { return p.evaluate(() => { const a = __debug.avatar(); return { body: a.profile.bodyType, sha: a.profile.sha256, outfit: __debug.snapshot().outfit, appearance: a.appearance.getState(), geometry: a.facialGeometry.getState(), live: a.livePresentation.getState() }; }); }
const selection = s => ({ body: s.body, sha: s.sha, outfit: s.outfit, appearance: Object.fromEntries(['hairStyle','hairColor','skinTone','eyeColor','lipColor'].map(k => [k,s.appearance[k]])), ...Object.fromEntries(['mouthWidth','browSample','noseSample','eyeSample'].map(k => [k,s.geometry[k]])) });
async function geometry(p, values, peer = false) {
  const result = await p.evaluate(({values, peer}) => (peer ? __debug.comparison() : __debug).command({type:'faceGeometry',...values}), {values,peer});
  assert.equal(result.applied, true, JSON.stringify(result)); await ready(p); return result;
}
async function eye(p, value) {
  await tab(p, 'appearance'); await p.locator('#appearance-geometry').evaluate(n => n.open = true);
  await select(p, '#eye-sample', value); assert.equal((await state(p)).geometry.eyeSample, value);
}
const neutralGeometry = { mouthWidth:0, browSample:'none', noseSample:'none', eyeSample:'none' };

async function source(body) {
  const recipeBytes = await fs.readFile(path.join(SOURCE,`${body}-eye.recipe.json`)), recipe = JSON.parse(recipeBytes);
  assert.equal(recipe.baseAvatarSha256, IDS[body][1]); assert.equal(recipe.sampleId, EYE);
  const folder = path.join(SOURCE,'generated',`${body}-eye-${EYE}`);
  const expressionBytes = await fs.readFile(path.join(folder,'expression-map.json')), expressions = JSON.parse(expressionBytes);
  const endpoint = await fs.readFile(path.join(folder,'avatar.vrm'));
  const digest = b => crypto.createHash('sha256').update(b).digest('hex');
  assert.equal(digest(endpoint), recipe.finalEndpointSha256, 'Independent exported endpoint hash mismatch');
  await fs.mkdir(path.join(OUT,'source-inputs'),{recursive:true});
  await fs.writeFile(path.join(OUT,'source-inputs',`${body}-eye.recipe.json`),recipeBytes);
  await fs.writeFile(path.join(OUT,'source-inputs',`${body}-expression-map.json`),expressionBytes);
  const info = {recipePath:path.join(SOURCE,`${body}-eye.recipe.json`),recipeSHA256:digest(recipeBytes),endpointSHA256:digest(endpoint),expressionMapSHA256:digest(expressionBytes),sourceSpace:recipe.sourceSpace,normalRule:recipe.normalRule,primitiveIdentities:recipe.primitiveIdentities,expressionNames:recipe.expressionNames,vrm0ExpressionGroups:expressions.blendShapeMaster.blendShapeGroups};
  report.sources[body] = info; return recipe;
}

// Browser-only helper uses actual loaded attributes/bones, not a duplicated deformation formula.
async function installHarness(p, recipe, peer = false) {
  return p.evaluate(({recipe,peer}) => {
    const d=__debug, a=peer?d.comparison().avatar:d.avatar(), em=a.vrm.expressionManager;
    const names=['blink','blinkLeft','blinkRight'];
    for(const name of names) if(!em.getExpression(name))throw Error('Missing real expression '+name);
    const mats=new Set(recipe.primitiveIdentities.map(p=>p.materialName));
    const materialNames=n=>(Array.isArray(n.material)?n.material:[n.material]).map(m=>m.name.replace(/ \(Outline\)$/, ''));
    const materialName=n=>materialNames(n)[0];
    const faces=[]; a.vrm.scene.traverse(n=>{if(n.isMesh && materialNames(n).some(x=>mats.has(x))){if(!materialNames(n).every(x=>x===materialName(n)))throw Error('Mixed source primitives');faces.push(n);}});
    if(new Set(faces.map(materialName)).size!==recipe.primitiveIdentities.length)throw Error('Face primitive mapping incomplete');
    const pack=at=>at?Array.from({length:at.count*at.itemSize},(_,i)=>at.getComponent(Math.floor(i/at.itemSize),i%at.itemSize)):null;
    const sampleIds=[...new Set([...recipe.skinWhitePairs.flat(),...recipe.selectedVertices.filter((_,i)=>i%40===0)])];
    async function hash(at,ids=null){if(!at)return null;const data=ids?ids.flatMap(i=>Array.from({length:at.itemSize},(_,j)=>at.getComponent(i,j))):pack(at);return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Float32Array(data))),x=>x.toString(16).padStart(2,'0')).join('');}
    async function hashes(){return Promise.all(faces.map(async n=>({name:n.name,material:materialName(n),uuid:n.geometry.uuid,
      position:await hash(n.geometry.attributes.position),normal:await hash(n.geometry.attributes.normal),uv:await hash(n.geometry.attributes.uv),index:await hash(n.geometry.index),skinIndex:await hash(n.geometry.attributes.skinIndex),skinWeight:await hash(n.geometry.attributes.skinWeight),
      protectedPosition:await hash(n.geometry.attributes.position,recipe.protectedVertices),
      protectedMorphPosition:await Promise.all(n.geometry.morphAttributes.position.map(at=>hash(at,recipe.protectedVertices))),
      morphPosition:await Promise.all(n.geometry.morphAttributes.position.map(at=>hash(at))),morphNormal:await Promise.all((n.geometry.morphAttributes.normal||[]).map(at=>hash(at))),
      binding:{bindMatrix:n.bindMatrix?.toArray(),bindMatrixInverse:n.bindMatrixInverse?.toArray(),bones:n.skeleton?.bones.map(b=>b.name),inverseBind:n.skeleton?.boneInverses.map(m=>m.toArray())}})));}
    function pose(){a.root.updateMatrixWorld(true);const bones=[];a.vrm.scene.traverse(n=>{if(n.isBone)bones.push({name:n.name,matrix:n.matrixWorld.toArray()});});const eyeBones={};for(const name of ['leftEye','rightEye']){const b=a.vrm.humanoid.getRawBoneNode(name),norm=a.vrm.humanoid.getNormalizedBoneNode(name);eyeBones[name]={localQuaternion:b.quaternion.toArray(),worldMatrix:b.matrixWorld.toArray(),normalizedQuaternion:norm.quaternion.toArray()};}
      const vertex=faces[0].position.clone();return{simulationTime:d.snapshot().simulationTime,bones,eyeBones,expressions:Object.fromEntries(em.expressions.map(e=>[e.expressionName,em.getValue(e.expressionName)])),
        influences:faces.map(n=>({material:materialName(n),values:n.morphTargetInfluences.slice()})),
        actualSkinSamples:sampleIds.map(i=>({index:i,world:faces[0].getVertexPosition(i,vertex).applyMatrix4(faces[0].matrixWorld).toArray()}))};}
    const maps=Object.fromEntries(['rangeMapHorizontalInner','rangeMapHorizontalOuter','rangeMapVerticalUp','rangeMapVerticalDown'].map(k=>{const m=a.vrm.lookAt.applier[k];if(!m||!Number.isFinite(m.inputMaxValue)||!Number.isFinite(m.outputScale))throw Error('Unsupported actual gaze range '+k);return[k,{inputMaxValue:m.inputMaxValue,outputScale:m.outputScale}];}));
    function diagnose(def){for(const e of em.expressions)em.setValue(e.expressionName,0);if(def.blink)em.setValue(def.channel||'blink',def.blink);em.update();a.vrm.lookAt.applier.applyYawPitch(def.yaw||0,def.pitch||0);a.root.updateMatrixWorld(true);return pose();}
    const savedExpressions=Object.fromEntries(em.expressions.map(e=>[e.expressionName,em.getValue(e.expressionName)]));
    function restore(){for(const [k,v]of Object.entries(savedExpressions))em.setValue(k,v);em.update();a.vrm.lookAt.reset();a.vrm.humanoid.update();a.root.updateMatrixWorld(true);}
    window[peer?'__eyePeerHarness':'__eyeHarness']={hashes,pose,diagnose,restore,faces,maps};
    return{expressionNames:em.expressions.map(e=>e.expressionName),maps,primitives:faces.map(n=>({name:n.name,material:materialName(n),morphTargets:n.morphTargetDictionary})),sampleIndices:sampleIds};
  },{recipe,peer});
}
const hashes=(p,peer=false)=>p.evaluate(peer=>window[peer?'__eyePeerHarness':'__eyeHarness'].hashes(),peer);
const bytes=rows=>rows.map(({uuid,...x})=>x);
const poseComparable=p=>({simulationTime:p.simulationTime,bones:p.bones,eyeBones:p.eyeBones,expressions:p.expressions,influences:p.influences});
async function shot(p, file, direction) {
  const result=await p.evaluate(direction=>{
    const d=__debug,a=d.avatar(),cam=d.cameraObject(),pos=cam.position.clone(),q=cam.quaternion.clone();
    const target=a.vrm.humanoid.getRawBoneNode('head').getWorldPosition(pos.clone());target.y+=.04;
    const theta={front:0,side:Math.PI/2,diagonal45:Math.PI/4}[direction];
    const offset=pos.clone().set(Math.sin(theta)*.78,0,Math.cos(theta)*.78).applyAxisAngle(pos.clone().set(0,1,0),a.root.rotation.y);
    try{cam.position.copy(target).add(offset);cam.lookAt(target);cam.updateMatrixWorld(true);d.renderer.render(d.scene,cam);return{png:d.renderer.domElement.toDataURL('image/png'),camera:{position:cam.position.toArray(),quaternion:cam.quaternion.toArray(),target:target.toArray(),fov:cam.fov},pose:__eyeHarness.pose()};}
    finally{cam.position.copy(pos);cam.quaternion.copy(q);cam.updateMatrixWorld(true);d.renderer.render(d.scene,cam);}
  },direction);
  await fs.writeFile(path.join(OUT,file),Buffer.from(result.png.split(',')[1],'base64'));delete result.png;
  report.shots.push({file,direction,...result});return result;
}

async function staticDiagnostics(p,body,recipe){
  await geometry(p,neutralGeometry);await select(p,'#appearance-hair-style','none');
  await p.evaluate(()=>{__debug.command({type:'speaking',value:false});__debug.command({type:'expression',name:'neutral'});__debug.command({type:'gaze',target:null});__debug.setPaused(false);});
  await p.waitForTimeout(250);await p.evaluate(()=>__debug.setPaused(true));
  const mapping=await installHarness(p,recipe),base=await hashes(p);
  const defs=[{id:'open',blink:0},{id:'both-half',blink:.5},{id:'both-closed',blink:1},...['Left','Right'].flatMap(side=>[{id:side.toLowerCase()+'-half',channel:'blink'+side,blink:.5},{id:side.toLowerCase()+'-closed',channel:'blink'+side,blink:1}])];
  const yaw=Math.max(mapping.maps.rangeMapHorizontalInner.inputMaxValue,mapping.maps.rangeMapHorizontalOuter.inputMaxValue);
  for(const [id,y,pitch]of [['left',-yaw,0],['right',yaw,0],['up',0,mapping.maps.rangeMapVerticalUp.inputMaxValue],['down',0,-mapping.maps.rangeMapVerticalDown.inputMaxValue]])for(const blink of [0,1])defs.push({id:`gaze-${id}-${blink?'closed':'open'}`,yaw:y,pitch,blink});
  const pairs=[],beforeById=new Map();let candidate;
  try{
    for(const value of ['none',EYE]){
      await eye(p,value);const before=await hashes(p);if(value===EYE){assert.equal((await state(p)).geometry.eyeRecipeSha256,report.sources[body].recipeSHA256);candidate=before;for(let i=0;i<base.length;i++){for(const k of ['uv','index','skinIndex','skinWeight','protectedPosition','protectedMorphPosition','binding'])assert.deepEqual(candidate[i][k],base[i][k],`${body} protected ${k} ${i}`);}assert.notDeepEqual(bytes(candidate),bytes(base));}
      for(const def of defs){
        const actual=await p.evaluate(def=>__eyeHarness.diagnose(def),def);
        if(value==='none')beforeById.set(def.id,actual);else assert.deepEqual(poseComparable(actual),poseComparable(beforeById.get(def.id)),def.id+' actual same pose/clock/expressions');
        const views=['front',...(['open','both-closed'].includes(def.id)?['side','diagonal45']:[])],shots=[];
        for(const direction of views){const file=`${body}-${value}-${def.id}-${direction}.png`,s=await shot(p,file,direction);shots.push({file,camera:s.camera});if(value===EYE){const old=report.shots.find(x=>x.file===`${body}-none-${def.id}-${direction}.png`);assert.deepEqual(s.camera,old.camera);}}
        pairs.push({value,def,actual,shots});
      }
      assert.deepEqual(await hashes(p),before,'Expression application must not overwrite edited attributes');
    }
    await eye(p,'none');assert.deepEqual(await hashes(p),base,'Original attributes and geometry UUID restored');
    return{mapping,base,candidate,pairs,scope:'15 finite states per endpoint; diagnostics only, sampled skin positions are not all-face collision/occlusion proof.'};
  }finally{await p.evaluate(()=>{__eyeHarness.restore();__debug.setPaused(false);});}
}

async function composition(p,body,recipe){
  await geometry(p,neutralGeometry);await installHarness(p,recipe);const original=await hashes(p);
  const full={mouthWidth:.04,browSample:BROW,noseSample:NOSE,eyeSample:EYE},checks=[];
  for(const mouth of [-.04,.04]){await geometry(p,{...full,mouthWidth:mouth});const s=await state(p);for(const [key,value]of Object.entries({...full,mouthWidth:mouth}))assert.equal(s.geometry[key],value);}
  for(const key of Object.keys(full)){
    const desired={...full,[key]:neutralGeometry[key]};await geometry(p,full);await geometry(p,{[key]:neutralGeometry[key]});const resetBytes=bytes(await hashes(p));
    await geometry(p,neutralGeometry);await geometry(p,desired);assert.deepEqual(bytes(await hashes(p)),resetBytes,`${key} reset must preserve other domains`);checks.push({key,state:await state(p),hashes:resetBytes});
  }
  await geometry(p,neutralGeometry);assert.deepEqual(await hashes(p),original);return{original,checks,final:await state(p)};
}

async function draft(p,context,body,open){
  await geometry(p,{mouthWidth:body==='female'?.04:-.04,browSample:BROW,noseSample:NOSE,eyeSample:EYE});await tab(p,'appearance');
  await p.locator('#appearance-save').click();const key='zbgs:appearance-draft:v1:'+body;
  const record=await p.evaluate(k=>JSON.parse(localStorage.getItem(k)),key),before=selection(await state(p));
  assert.equal(record.schema,'workbench-appearance-recipe-v4');assert.equal(record.geometry.eyeSample,EYE);assert.match(record.geometry.eyeRecipeSha256,/^[a-f0-9]{64}$/);
  await p.close();p=await open(context,body);const recipe=await fs.readFile(path.join(SOURCE,`${body}-eye.recipe.json`),'utf8');await installHarness(p,JSON.parse(recipe));assert.deepEqual(selection(await state(p)),before);
  const original=await hashes(p),migrations=[];
  async function restoreRecord(value){await p.evaluate(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key,value});await tab(p,'appearance');await p.locator('#appearance-restore').click();await ready(p);}
  const bad=structuredClone(record);bad.geometry.eyeRecipeSha256='0'.repeat(64);await restoreRecord(bad);assert.equal(await p.locator('#appearance-status').getAttribute('data-error'),'true');assert.deepEqual(selection(await state(p)),before);assert.deepEqual(await hashes(p),original);
  for(const version of [3,2,1]){
    const old=structuredClone(record);old.schema=`workbench-appearance-recipe-v${version}`;old.rulesVersion=`workbench-appearance-rules-v${version}`;delete old.geometry.eyeSample;delete old.geometry.eyeRecipeSha256;
    if(version<3){delete old.geometry.noseSample;delete old.geometry.noseRecipeSha256;}if(version<2){delete old.geometry.browSample;delete old.geometry.browRecipeSha256;}
    await restoreRecord(old);assert.deepEqual(selection(await state(p)),{...before,eyeSample:'none',noseSample:version<3?'none':NOSE,browSample:version<2?'none':BROW});
    const clean=selection(await state(p)),cleanBytes=await hashes(p),smuggled=structuredClone(old);smuggled.geometry.eyeSample=EYE;smuggled.geometry.eyeRecipeSha256=record.geometry.eyeRecipeSha256;
    await restoreRecord(smuggled);assert.equal(await p.locator('#appearance-status').getAttribute('data-error'),'true');assert.deepEqual(selection(await state(p)),clean);assert.deepEqual(await hashes(p),cleanBytes);migrations.push({version,old,result:clean,foreignEyeRejected:true});
  }
  await restoreRecord(record);assert.deepEqual(selection(await state(p)),before);return{page:p,result:{record,before,migrations,final:await state(p)}};
}

async function traceStart(p){await p.evaluate(()=>{const q=window.__eyeTrace={start:performance.now(),last:null,run:true,rows:[]};function tick(t){if(!q.run)return;const d=__debug,a=d.avatar(),s=d.snapshot();q.rows.push({t:(t-q.start)/1000,dt:q.last===null?null:(t-q.last)/1000,sim:s.simulationTime,mode:s.mode,geometry:a.facialGeometry.getState(),live:a.livePresentation.getState(),expressions:Object.fromEntries(['aa','happy','blink','blinkLeft','blinkRight'].map(k=>[k,a.vrm.expressionManager.getValue(k)])),eyes:Object.fromEntries(['leftEye','rightEye'].map(k=>[k,a.vrm.humanoid.getRawBoneNode(k).quaternion.toArray()]))});q.last=t;requestAnimationFrame(tick);}requestAnimationFrame(tick);});}
function summary(trace){const rows=trace.rows.filter(r=>r.t>=0),dt=rows.slice(1).map(r=>r.dt).filter(Number.isFinite),a=rows[0],b=rows.at(-1);return{rows:rows.length,negativeInitialSamples:trace.rows.filter(r=>r.t<0).length,rawFirst:trace.rows[0],rawLast:trace.rows.at(-1),wall:b.t-a.t,sim:b.sim-a.sim,ratio:(b.sim-a.sim)/(b.t-a.t),maxFrameMs:Math.max(...dt)*1000,over33ms:dt.filter(x=>x>.033333).length,over50ms:dt.filter(x=>x>.05).length};}
async function liveMovie(browser,body,open){
  const c=await browser.newContext({viewport:{width:1600,height:1000},recordVideo:{dir:path.join(OUT,'raw-video'),size:{width:1600,height:1000}}});let p;
  try{p=await open(c,body);await select(p,'#appearance-hair-style','none');await p.locator('[data-inspect-framing=face]').click();await traceStart(p);
    for(const value of ['none',EYE]){
      await eye(p,value);await tab(p,'actions');await p.locator('[data-expression=neutral]').click();await p.waitForTimeout(350);
      await p.locator('[data-expression=happy]').click();await p.locator('#speaking-button').click();await p.getByRole('button',{name:'看向镜头',exact:true}).click();await p.waitForTimeout(3800);
      for(const sign of [-1,1]){await p.evaluate(sign=>{const d=__debug,a=d.avatar(),h=a.vrm.humanoid.getRawBoneNode('head'),v=h.position.clone();h.getWorldPosition(v);const offset=v.clone().set(sign*.6,0,1).applyAxisAngle(v.clone().set(0,1,0),a.root.rotation.y);d.command({type:'gaze',target:v.add(offset).toArray()});},sign);await p.waitForTimeout(550);}
      await p.locator('[data-inspect-direction=side]').click();await p.waitForTimeout(600);await p.locator('[data-inspect-direction=front]').click();await p.locator('#speaking-button').click();await p.locator('[data-expression=neutral]').click();
    }
    await p.evaluate(()=>__debug.command({type:'gaze',target:null}));await eye(p,'none');await p.waitForTimeout(300);
    const trace=await p.evaluate(()=>{__eyeTrace.run=false;return __eyeTrace;}),s=summary(trace),peaks=Object.fromEntries(['none',EYE].map(value=>[value,Math.max(0,...trace.rows.filter(r=>r.t>=0&&r.geometry.eyeSample===value).map(r=>r.expressions.blink||0))]));
    const traceFile=`${body}-eye-1x-trace.json`,video=p.video();await fs.writeFile(path.join(OUT,traceFile),JSON.stringify(trace));await c.close();await video.saveAs(path.join(OUT,`${body}-eye-1x.webm`));report.movies.push({file:`${body}-eye-1x.webm`,trace:traceFile,summary:s,actualBlinkPeaks:peaks});
    for(const peak of Object.values(peaks))assert(peak>.9,'Actual near-closed live automatic blink missing');return{summary:s,peaks};
  }finally{await c.close();}
}

(async()=>{
  try{await fs.mkdir(OUT,{recursive:false});}catch(e){if(e.code==='EEXIST')throw Error('Refuse overwrite of existing eye evidence directory');throw e;}
  await fs.copyFile(__filename,path.join(OUT,'executed-script.cjs'));await save();
  const recipes={};for(const body of ['female','male'])recipes[body]=await source(body);await save();
  const browser=await chromium.launch({channel:'chrome',headless:true});
  async function open(c,body){const p=await c.newPage();p.on('pageerror',e=>report.errors.push({body,error:String(e)}));await p.goto(BASE+'?workbench=appearance&body='+body);await ready(p);report.identities.push(await verifyCandidate(p,{build:BUILD,assetId:IDS[body][0],sha256:IDS[body][1]}));return p;}
  try{
    const store=await browser.newContext({viewport:{width:1600,height:1000}}),saved={};
    for(const body of ['female','male']){let p=await open(store,body);
      await check(body+' paused actual expressions/gaze, same-pose normal material and attribute retention',()=>staticDiagnostics(p,body,recipes[body]));
      await check(body+' four-domain composition, independent resets and exact original recovery',()=>composition(p,body,recipes[body]));
      const d=await check(body+' v4 reopen, legacy v1-3, bad eye hash and future fields',async()=>{const r=await draft(p,store,body,open);p=r.page;return r.result;});saved[body]=d.record;await p.close();
    }
    const p=await open(store,'female');await check('per-body draft and actual same-source peer eye isolation',async()=>{const token=await p.evaluate(()=>window.__eyeDocument=crypto.randomUUID()),rows=[];
      for(const body of ['male','female']){await p.locator(`[data-appearance-group=${body}]`).click();await ready(p);assert.equal(await p.evaluate(()=>__eyeDocument),token);await installHarness(p,recipes[body]);assert.equal((await state(p)).geometry.eyeSample,EYE);assert.deepEqual(await p.evaluate(k=>JSON.parse(localStorage.getItem(k)),'zbgs:appearance-draft:v1:'+body),saved[body]);
        const primary=await hashes(p);await p.evaluate(body=>__debug.loadComparison(body),body);
        const peerState=await p.evaluate(()=>__debug.comparison().avatar.facialGeometry.getState());assert.equal(peerState.eyeSample,'none');
        await installHarness(p,recipes[body],true);const before=await hashes(p,true);
        await geometry(p,{eyeSample:EYE},true);assert.equal(await p.evaluate(()=>__debug.comparison().avatar.facialGeometry.getState().eyeSample),EYE);const edited=await hashes(p,true);assert.notDeepEqual(bytes(edited),bytes(before));assert.deepEqual(await hashes(p),primary);
        await geometry(p,{eyeSample:'none'},true);assert.equal(await p.evaluate(()=>__debug.comparison().avatar.facialGeometry.getState().eyeSample),'none');assert.deepEqual(await hashes(p,true),before);assert.deepEqual(await hashes(p),primary);rows.push({body,primary,peerBefore:peerState,peerOriginal:before,peerEdited:edited});await p.evaluate(()=>__debug.removeComparison());}
      return rows;
    });await store.close();
    for(const body of ['female','male'])await check(body+' actual live automatic blink/speech/gaze normal1x original/new',()=>liveMovie(browser,body,open));
    assert.equal(report.errors.length,0,'Page errors captured');report.status='technical-passed-visual-review-pending';
  }catch(e){report.status='failures-preserved';report.fatal=String(e);console.error(e);process.exitCode=1;}
  finally{await browser.close();report.finished=new Date().toISOString();await save();console.log('BROWSER CLOSED',OUT);}
})().catch(e=>{console.error(e);process.exitCode=1;});
