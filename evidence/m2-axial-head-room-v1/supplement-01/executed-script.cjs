// Supplemental actual-room checks. Run only in root's reserved browser window.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {chromium} = require('../prototype/node_modules/playwright');
const {verifyCandidate} = require('./qa-m1-common.cjs');
const [specPath, outputPath] = process.argv.slice(2);
if (!specPath || !outputPath) throw Error('Usage: node scripts/qa-m2-axial-head-room-supplement.cjs exact-spec.json fresh-output-directory');
const root = path.resolve(__dirname, '..');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const ready = p => p.waitForFunction(() => window.__debug?.ready &&
  document.querySelector('#appearance-fields')?.disabled === false &&
  !__debug.avatar().appearance.getState().loading && !__debug.avatar().appearance.getState().facialPaletteLoading,
null, {timeout:60000});
const expectations = {
  male: {manifest:'/assets/m1b/equipment.json', forearm:'/assets/forearm-collision-v2/male.json',
    forearmSha256:'f6ec1714c80e492bc129078e179d12c48a4f7e072e5d0249d52b4943b75fbf15'},
  'male-long-lean-axial-head-v1': {manifest:'/assets/m2-axial-head-equipment-v1/equipment.json',
    forearm:'/assets/m2-axial-head-equipment-v1/forearm/profile.json',
    forearmSha256:'1f53f907b5c5904d9f45b3201858b509a2e9deaf401df19624ada5c3f0b312eb'},
};

async function inspectEquipment(p, cfg, index) {
  const expected = expectations[cfg.body];
  const manifestBytes = await fs.readFile(path.join(root, 'prototype/public', expected.manifest));
  const manifest = JSON.parse(manifestBytes);
  const result = await p.evaluate(async ({expected,index}) => {
    const a = __debug.avatar(), info = a.getOutfitInfo();
    const recipe = JSON.parse(__debug.exportAppearanceRecipe());
    const read = async url => {
      const response = await fetch(url, {cache:'no-store'});
      if (!response.ok) throw Error('HTTP '+response.status+' '+url);
      const bytes = await response.arrayBuffer();
      const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
      return {url:new URL(url,location.href).href,sha256,bytes:bytes.byteLength,buffer:bytes};
    };
    const m = await read(expected.manifest), doc = JSON.parse(new TextDecoder().decode(m.buffer));
    delete m.buffer;
    const resources = {};
    for (const role of ['top','pants','shorts','shoes']) {
      const entry = doc.items.find(e=>e.id===a.config.ids[role]);
      if (!entry) throw Error('Missing exact equipment role '+role);
      const asset = await read(new URL(entry.url,new URL(expected.manifest,location.href)).href);
      delete asset.buffer; resources[role] = {entry,asset};
    }
    const loadedContainers = [];
    a.vrm.scene.traverse(node=>{
      if (!node.userData.equipmentId) return;
      const meshes=[];node.traverse(mesh=>{if(mesh.isMesh)meshes.push({uuid:mesh.uuid,visible:mesh.visible,
        vertices:mesh.geometry.getAttribute('position').count,skinned:mesh.isSkinnedMesh===true});});
      loadedContainers.push({id:node.userData.equipmentId,visible:node.visible,meshes});
    });
    const forearm = await read(expected.forearm);
    const forearmDocument = JSON.parse(new TextDecoder().decode(forearm.buffer));delete forearm.buffer;
    return {index,info,recipe,resources,manifest:m,forearm,
      configuredManifest:a.config.manifestUrl,configuredForearm:a.config.forearmCollision,
      loadedForearm:a.profile.motion.forearmCollision,forearmDocument,loadedContainers};
  }, {expected,index});
  assert.equal(result.configuredManifest, expected.manifest);
  assert.equal(result.manifest.sha256, digest(manifestBytes));
  assert.equal(result.info.index,index);assert.equal(result.info.equipment.outfit,index);
  assert.equal(result.recipe.equipment.index,index);
  assert.equal(result.info.equipment.avatarSha256,cfg.sha256);
  assert.deepEqual(result.configuredForearm,{url:expected.forearm,sha256:expected.forearmSha256});
  assert.equal(result.forearm.sha256,expected.forearmSha256);
  assert.equal(result.forearmDocument.bodySHA256,cfg.sha256);
  assert.deepEqual(result.loadedForearm,result.forearmDocument);
  for (const role of ['top','pants','shorts','shoes']) {
    const {entry,asset} = result.resources[role];
    assert.deepEqual(entry,manifest.items.find(e=>e.id===entry.id));
    assert.equal(entry.compatibleAvatarSha256,cfg.sha256);
    assert.equal(asset.sha256,entry.sha256);assert.equal(asset.bytes,entry.bytes);
    const selected = role==='top'||role==='shoes'||role===(index===0?'pants':'shorts');
    const item = result.info.equipment.items[role];
    assert.equal(item.id,entry.id);assert.equal(item.visible===true,selected);
    if (selected) {
      assert.deepEqual(result.recipe.equipment.resources[role],entry);
      assert(item.primitives>0&&item.verticesAcrossPrimitives>0,'Selected equipment must be actually loaded');
      const containers=result.loadedContainers.filter(c=>c.id===entry.id);
      assert.equal(containers.length,1);assert.equal(containers[0].visible,true);
      assert.equal(containers[0].meshes.length,item.primitives);
      assert(containers[0].meshes.every(m=>m.visible&&m.skinned&&m.vertices>0));
    }
    else assert.equal(result.recipe.equipment.resources[role],undefined);
  }
  return result;
}

async function startRecording(p, file) {
  let writes = Promise.resolve();
  await fs.writeFile(file,Buffer.alloc(0));
  await p.exposeFunction('__appendAxialVideo', base64 => {
    writes = writes.then(()=>fs.appendFile(file,Buffer.from(base64,'base64')));
    return writes;
  });
  const info = await p.evaluate(async () => {
    const d=__debug;d.setPlaybackRate(1);d.setPaused(false);
    const canvas=d.renderer.domElement, stream=canvas.captureStream(60);
    const mimeType=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(x=>MediaRecorder.isTypeSupported(x));
    if(!mimeType)throw Error('No supported WebM recorder');
    const recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:8000000});
    const q=window.__axialSupplement={run:true,phase:'starting',rows:[],last:null,recorder,stream,writeChain:Promise.resolve(),recorderErrors:[]};
    recorder.ondataavailable = event => {
      if(!event.data.size)return;
      q.writeChain=q.writeChain.then(async()=>{
        const bytes=new Uint8Array(await event.data.arrayBuffer());let binary='';
        for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
        await window.__appendAxialVideo(btoa(binary));
      });
    };
    recorder.onerror=e=>q.recorderErrors.push(String(e.error||e));
    await new Promise((resolve,reject)=>{recorder.onstart=resolve;recorder.onerror=e=>{q.recorderErrors.push(String(e.error||e));reject(Error('Recorder start failed'));};recorder.start(1000);});
    q.start={wall:performance.now(),sim:d.snapshot().simulationTime};
    function frame(t){if(!q.run)return;const s=d.snapshot(),e=d.avatar().vrm.expressionManager;
      q.rows.push({t,dt:q.last===null?null:t-q.last,sim:s.simulationTime,phase:q.phase,mode:s.mode,
        outfit:s.outfit,paused:s.paused,rate:s.playbackRate,visible:document.visibilityState,focused:document.hasFocus(),
        expression:Object.fromEntries(['happy','blink','aa','ih','ou','ee','oh'].map(k=>[k,e.getValue(k)]))});
      q.last=t;requestAnimationFrame(frame);}requestAnimationFrame(frame);
    const gl=d.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
    return {mimeType,width:canvas.width,height:canvas.height,requestedCaptureFPS:60,videoBitsPerSecond:8000000,start:q.start,
      environment:{userAgent:navigator.userAgent,devicePixelRatio,viewport:{width:innerWidth,height:innerHeight},
        webgl:{vendor:gl.getParameter(gl.VENDOR),renderer:gl.getParameter(gl.RENDERER),
          unmaskedVendor:ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):null,
          unmaskedRenderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null},
        rendererInfo:{memory:{...d.renderer.info.memory},render:{...d.renderer.info.render},programs:d.renderer.info.programs?.length??null}},
      performanceScope:'High-spec development-machine short recording; ordinary-computer performance unmeasured.'};
  });
  return {info,flush:()=>writes};
}

async function stopRecording(p) {
  return p.evaluate(async()=>{
    const q=window.__axialSupplement;
    q.end={wall:performance.now(),sim:__debug.snapshot().simulationTime};q.run=false;
    await new Promise(resolve=>{q.recorder.onstop=resolve;q.recorder.stop();});
    await q.writeChain;q.stream.getTracks().forEach(t=>t.stop());
    return {start:q.start,end:q.end,rows:q.rows,recorderErrors:q.recorderErrors,
      rendererInfoAtEnd:{memory:{...__debug.renderer.info.memory},render:{...__debug.renderer.info.render},programs:__debug.renderer.info.programs?.length??null}};
  });
}

(async()=>{
  const spec=JSON.parse(await fs.readFile(specPath,'utf8'));
  assert.equal(spec.schema,'axial-head-fixed-room-check-v1');assert.match(spec.build,/^[a-f0-9]{12}$/);
  assert.deepEqual(spec.cases.map(c=>c.body),['male','male-long-lean-axial-head-v1']);
  const out=path.resolve(outputPath);await fs.mkdir(out,{recursive:false});
  await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
  await fs.copyFile(specPath,path.join(out,'executed-spec.json'));
  const report={schema:'axial-head-room-supplement-result-v1',build:spec.build,status:'running',cases:[],visualReview:'pending',
    scope:'Actual canvas normal-speed segments, exact gear/forearm and non-default persistent restore. Development-machine recording; target-device performance unmeasured.'};
  const save=()=>fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
  let browser;
  try {
    browser=await chromium.launch({channel:'chrome',headless:false});
    for(const cfg of spec.cases){
      const dir=path.join(out,cfg.body);await fs.mkdir(dir);
      const r={body:cfg.body,errors:[],tasks:[],phases:[],equipment:[]};report.cases.push(r);
      const context=await browser.newContext({viewport:{width:1600,height:1000}});
      let p=await context.newPage(), recording=null, recordingStopped=false;
      const listen=page=>page.on('pageerror',e=>r.errors.push(String(e)));listen(p);
      const url=new URL('?workbench=appearance&body='+encodeURIComponent(cfg.body),spec.url).href;
      const phase=async name=>{
        const event=await p.evaluate(name=>{__axialSupplement.phase=name;return{name,wall:performance.now(),sim:__debug.snapshot().simulationTime};},name);
        r.phases.push(event);
      };
      const task=async(id,kind,payload={})=>{
        const admission=await p.evaluate(req=>__debug.request(req),{requestId:id,kind,payload});
        assert.equal(admission.admission,'accepted');
        await p.waitForFunction(id=>['completed','cancelled','failed'].includes(__debug.tasks().get(id)?.state),id,{timeout:45000});
        const result=await p.evaluate(id=>__debug.tasks().get(id),id);r.tasks.push(result);assert.equal(result.state,'completed',id);
      };
      const outfit=async index=>{
        const result=await p.evaluate(index=>__debug.command({type:'outfit',value:index}),index);
        assert.equal(result.applied,true,result.reason);await ready(p);
        await p.waitForFunction(index=>__debug.avatar().getOutfitInfo().index===index,index);
        r.equipment.push(await inspectEquipment(p,cfg,index));
      };
      try {
        await p.goto(url);await ready(p);r.identity=await verifyCandidate(p,{...cfg,build:spec.build});
        await p.locator('[data-workbench-tab=actions]').click();
        await p.locator('[data-expression=neutral]').click();
        await p.locator('[data-inspect-framing=face]').click();await p.locator('[data-inspect-direction=front]').click();
        await outfit(0);
        recording=await startRecording(p,path.join(dir,'normal-speed-canvas.webm'));r.recording=recording.info;
        await phase('neutral-front');await p.waitForTimeout(3700);await p.screenshot({path:path.join(dir,'neutral-front.png')});
        await p.locator('[data-expression=happy]').click();await p.locator('#speaking-button').click();
        await p.getByRole('button',{name:'看向镜头',exact:true}).click();
        await phase('happy-speaking');await p.waitForTimeout(11200);await p.screenshot({path:path.join(dir,'happy-speaking.png')});
        await p.locator('[data-inspect-direction=side]').click();await phase('speaking-side');await p.waitForTimeout(2000);
        await p.screenshot({path:path.join(dir,'speaking-side.png')});
        await p.locator('#speaking-button').click();await p.locator('[data-expression=neutral]').click();
        await p.evaluate(()=>__debug.command({type:'gaze',target:null}));await p.locator('[data-camera=room]').click();
        await p.evaluate(()=>__debug.command({type:'speed',value:.85}));
        await phase('pants-room');await task('supp-pants-walk','walk',{x:-.5,z:1.8});
        await task('supp-pants-sit','sit');await p.waitForTimeout(1200);await p.screenshot({path:path.join(dir,'pants-seated.png')});
        await task('supp-pants-stand','stand');
        await phase('shorts-room');await outfit(2);await task('supp-shorts-walk','walk',{x:.5,z:1.8});
        await task('supp-shorts-sit','sit');await p.waitForTimeout(1200);await p.screenshot({path:path.join(dir,'shorts-seated.png')});
        await task('supp-shorts-stand','stand');await phase('outfit-toggle');await outfit(0);await p.waitForTimeout(600);await outfit(2);await p.waitForTimeout(600);
        const trace=await stopRecording(p);recordingStopped=true;await recording.flush();
        await fs.writeFile(path.join(dir,'normal-speed-trace.json'),JSON.stringify(trace));
        assert.equal(trace.recorderErrors.length,0);assert(trace.rows.length>0);
        assert(trace.rows.every(x=>!x.paused&&x.rate===1&&x.visible==='visible'&&x.focused));
        const speaking=trace.rows.filter(x=>x.phase==='happy-speaking');
        let peaks=0,above=false;
        for(const row of speaking){const next=row.expression.blink>.9;if(next&&!above)peaks++;above=next;}
        r.speaking={sampledBlinkPeakCount:peaks,threePeaksObserved:peaks>=3,
          vowelMaximums:Object.fromEntries(['aa','ih','ou','ee','oh'].map(k=>[k,Math.max(0,...speaking.map(x=>x.expression[k]||0))]))};
        for(const value of Object.values(r.speaking.vowelMaximums))assert(value>.4);
        r.clock={wallSeconds:(trace.end.wall-trace.start.wall)/1000,simulationSeconds:trace.end.sim-trace.start.sim,
          ratio:(trace.end.sim-trace.start.sim)/((trace.end.wall-trace.start.wall)/1000),claim:'Observed development-machine clocks; no target-device performance acceptance.'};
        const bytes=await fs.readFile(path.join(dir,'normal-speed-canvas.webm'));assert(bytes.length>0);
        r.video={path:'normal-speed-canvas.webm',sha256:digest(bytes),bytes:bytes.length,scope:'Continuous canvas capture only; excludes paused diagnostics and page reopen.'};

        await p.locator('[data-workbench-tab=appearance]').click();
        await p.locator('#appearance-hair-color').selectOption('brown');await ready(p);
        await p.waitForFunction(()=>__debug.avatar().appearance.getState().hairColor==='brown');
        await p.locator('#appearance-skin-tone').selectOption('warm');await ready(p);
        await p.waitForFunction(()=>__debug.avatar().appearance.getState().skinTone==='warm');
        r.savedRecipe=await p.evaluate(()=>JSON.parse(__debug.exportAppearanceRecipe()));
        assert.equal(r.savedRecipe.equipment.index,2);assert.equal(r.savedRecipe.appearance.hairColor,'brown');assert.equal(r.savedRecipe.appearance.skinTone,'warm');
        await p.locator('#appearance-save').click();
        r.storedRecipe=await p.evaluate(body=>JSON.parse(localStorage.getItem('zbgs:appearance-draft:v1:'+body)),cfg.body);
        assert.deepEqual(r.storedRecipe,r.savedRecipe);
        await p.close();p=await context.newPage();listen(p);await p.goto(url);await ready(p);
        await p.waitForFunction(expected=>{try{return JSON.stringify(JSON.parse(__debug.exportAppearanceRecipe()))===JSON.stringify(expected);}catch{return false;}},r.savedRecipe,{timeout:60000});
        r.restoredRecipe=await p.evaluate(()=>JSON.parse(__debug.exportAppearanceRecipe()));assert.deepEqual(r.restoredRecipe,r.savedRecipe);
        r.equipment.push(await inspectEquipment(p,cfg,2));
        r.badSha=await p.evaluate(async()=>{
          const before=JSON.parse(__debug.exportAppearanceRecipe()),bad=structuredClone(before);bad.equipment.resources.top.sha256='0'.repeat(64);
          let result=null,error=null;try{result=await __debug.importAppearanceRecipe(JSON.stringify(bad));}catch(e){error=String(e.message||e);}
          return{before,after:JSON.parse(__debug.exportAppearanceRecipe()),result,error};
        });
        assert(r.badSha.error,'Bad equipment SHA must reject');assert.deepEqual(r.badSha.after,r.badSha.before);
        r.finalIdentity=await verifyCandidate(p,{...cfg,build:spec.build});assert.equal(r.errors.length,0);r.technicalPassed=true;
      } catch(error) {
        r.failure=String(error);await p.screenshot({path:path.join(dir,'failure.png')}).catch(()=>{});throw error;
      } finally {
        if(recording&&!recordingStopped&&!p.isClosed()){
          try{const partial=await stopRecording(p);await recording.flush();await fs.writeFile(path.join(dir,'partial-trace.json'),JSON.stringify(partial));}
          catch(error){r.recordingCleanupFailure=String(error);}
        }
        await context.close();await save();
      }
    }
    report.status='recorded-technical-checks-passed-visual-review-pending';
  } catch(error) {report.status='failure-preserved';report.failure=String(error);process.exitCode=1;}
  finally {if(browser)await browser.close();await save();console.log(JSON.stringify({output:out,status:report.status}));}
})();
