// Fixed diagnostic playback of signed 1K characters wearing candidate glasses.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {productionRoot, projectOutput}=require('../../scripts/project-output.cjs');
const {launchQABrowser}=require('../../scripts/qa-browser-workspace.cjs');
const {loadCases,restoreSigned,verifiedGeometry,liveMeshes,checkGeometry}=require('../../scripts/qa-native-glasses-candidate-chain.cjs');

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const camera={fov:38,offset:[-.92,.37,2.72],targetHeight:.93};

async function prepare(page,base,spec,build) {
  const url=new URL(base);
  url.searchParams.set('workbench','appearance');
  url.searchParams.set('glassesFit','candidate');
  url.searchParams.set('body',spec.bodyType);
  await page.goto(url.href);
  await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});
  const restored=await restoreSigned(page,spec.record,build);
  const {asset,fit}=await page.evaluate(async body=>{
    const [assets,registry]=await Promise.all(['/assets/m1c/accessories.json','/assets/native-glasses-candidate-v2/manifest.json']
      .map(url=>fetch(url,{cache:'no-store'}).then(response=>response.json())));
    if(registry.status!=='candidate-only')throw Error('Expected candidate-only glasses registry');
    return {asset:assets.items.find(row=>row.id==='studio-glasses-v1'),fit:registry.profiles.find(row=>row.bodyType===body)};
  },spec.bodyType);
  const geometry=await verifiedGeometry(base,spec,asset,fit);
  const applied=await page.evaluate(()=>__debug.avatar().livePresentation.setAccessory('glasses',true));
  assert.equal(applied.applied,true,JSON.stringify(applied));
  assert.equal(applied.identity.bodySHA256,spec.bodySHA256);
  assert.equal(applied.identity.accessorySHA256,asset.sha256);
  assert.equal(applied.identity.fit.sha256,spec.fitSHA256);
  assert.equal(applied.identity.fit.id,geometry.profileId);
  assert.equal(applied.identity.fit.status,'fitted-candidate');
  assert.equal(applied.identity.fit.verified,false);
  assert.equal(applied.identity.fit.sourceGeometryUnmodified,true);
  return {restored,geometry,identity:applied.identity};
}

async function start(page,camera) {
  return page.evaluate(async setup=>{
    const d=__debug, actor=d.avatar(), renderer=d.renderer, view=d.cameraObject();
    const accessory=d.scene.getObjectByName('LiveAccessory:glasses');
    if(!accessory)throw Error('Missing attached glasses');
    d.setHelpers(false); d.view('inspect-face-front'); d.setPlaybackRate(1); d.setPaused(false);
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const stream=renderer.domElement.captureStream(30), chunks=[];
    const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8'].find(type=>MediaRecorder.isTypeSupported(type));
    if(!mime)throw Error('No WebM MediaRecorder encoder');
    const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:7000000});
    recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
    const done=new Promise(resolve=>recorder.onstop=resolve);
    const render=renderer.render, originalFov=view.fov;
    const V=actor.root.position.constructor, up=new V(0,1,0), offset=new V(...setup.offset);
    offset.applyAxisAngle(up,d.snapshot().chair.yaw);
    const restoreFov=()=>{view.fov=originalFov;view.updateProjectionMatrix();};
    const film=window.__uniformGlassesFilm={recorder,done,stream,chunks,frames:[],phase:'face-front',running:true,start:performance.now(),
      setPhase(name){
        this.phase=name;
        if(name==='whole-body')d.camera('room');
        else {restoreFov();d.view('inspect-'+name);}
      },
      restore(){renderer.render=render;restoreFov();}};
    renderer.render=function(scene,camera) {
      if(film.phase==='whole-body' && scene===d.scene && camera===view) {
        const point=actor.root.position;
        camera.position.copy(point).add(offset).add(new V(0,setup.targetHeight,0));
        camera.lookAt(new V(point.x,point.y+setup.targetHeight,point.z));
        if(camera.fov!==setup.fov){camera.fov=setup.fov;camera.updateProjectionMatrix();}
      }
      return render.call(this,scene,camera);
    };
    let last=-Infinity;
    const take=time=>{
      if(time-last>=66) {
        const s=d.snapshot(), slot=actor.livePresentation.getState().accessories.glasses;
        film.frames.push({wallMs:time-film.start,sim:s.simulationTime,camera:film.phase,mode:s.mode,speed:s.speed,
          position:s.position,outfit:s.outfit,sitProgress:s.motion.sitProgress,seatPelvisClearance:s.motion.seatPelvisClearance,
          playbackRate:s.playbackRate,paused:s.paused,suspended:!!s.backgroundSuspended,
          sameActor:d.avatar()===actor,sameGlasses:d.scene.getObjectByName('LiveAccessory:glasses')===accessory,
          loaded:slot.loaded,fitSHA256:slot.identity?.fit?.sha256});
        last=time;
      }
      if(film.running)film.timer=requestAnimationFrame(take);
    };
    recorder.start(250);film.timer=requestAnimationFrame(take);
    return {mime,canvas:[renderer.domElement.width,renderer.domElement.height]};
  },camera);
}

async function stop(page) {
  return page.evaluate(async()=>{
    const film=window.__uniformGlassesFilm;
    if(!film?.running)return null;
    film.running=false;cancelAnimationFrame(film.timer);film.restore();
    film.recorder.stop();await film.done;film.stream.getTracks().forEach(track=>track.stop());
    const bytes=new Uint8Array(await new Blob(film.chunks,{type:film.recorder.mimeType}).arrayBuffer());
    let text='';
    for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));
    return {video:btoa(text),mime:film.recorder.mimeType,frames:film.frames};
  });
}

async function phase(page,name) {
  await page.evaluate(name=>__uniformGlassesFilm.setPhase(name),name);
}

async function run(base,output,casesFile) {
  if(!base||!output||!casesFile)throw Error('Expected BASE OUTPUT CASES_JSON');
  const out=await projectOutput(output,await productionRoot());
  const input=await loadCases(casesFile);
  assert.equal(input.fixed.sourceDigest,'4540a27be60ecf5a74302b4610652c3ac1b9b03e1755ea31b478d24e05f1a003');
  await fs.mkdir(out,{recursive:false});
  const report={schema:'uniform-1k-glasses-motion-v1',status:'candidate-only',
    build:input.fixed,caseFile:input.caseFile,signedRecords:input.signedRecords,
    sourceCommit:'925cc0823b5803e9adc2b9fdce91eb0f098d0ed6',
    script:{file:path.basename(__filename),sha256:sha(await fs.readFile(__filename))},
    camera,limits:['Original hair. Signed records were restored with glasses off; diagnostic glasses were applied afterwards.',
      'Dynamic video observes placement and visibility. It includes no swept skin, ear or hair contact calculation.'],cases:[]};
  let session;
  try {
    session=await launchQABrowser(out,{channel:'chrome'});
    report.browser=session.browser.version();
    for(const spec of input.cases) {
      const row={bodyType:spec.bodyType,bodySHA256:spec.bodySHA256,errors:[],tasks:[]};
      report.cases.push(row);
      const page=await session.browser.newPage({viewport:{width:1600,height:1000}});
      page.on('pageerror',error=>row.errors.push(String(error)));
      try {
        const prepared=await prepare(page,base,spec,input.fixed);
        row.signedRestore=prepared.restored;row.glasses=prepared.identity;
        row.geometryBefore=checkGeometry(prepared.geometry,await page.evaluate(liveMeshes));
        row.recording=await start(page,camera);
        await page.waitForTimeout(900);
        await phase(page,'face-side');
        await page.waitForTimeout(900);
        await phase(page,'whole-body');
        async function task(id,kind,payload={}) {
          await page.evaluate(request=>__debug.request(request),{requestId:id,kind,payload});
          await page.waitForFunction(id=>['completed','failed','cancelled'].includes(__debug.tasks().get(id)?.state),id,{timeout:45000});
          const result=await page.evaluate(id=>__debug.tasks().get(id),id);
          row.tasks.push(result);
          assert.equal(result.state,'completed',JSON.stringify(result));
        }
        await task('motion-walk','walk',{x:-.5,z:1.8});
        await task('motion-sit','sit');await page.waitForTimeout(1300);
        await task('motion-stand','stand');await page.waitForTimeout(850);
        await phase(page,'face-front');await page.waitForTimeout(1000);
        row.geometryAfter=checkGeometry(prepared.geometry,await page.evaluate(liveMeshes));
      } catch(error) {row.failure=String(error.stack||error);}
      finally {
        try {
          const capture=await stop(page);
          if(capture) {
            const video=Buffer.from(capture.video,'base64'), file=spec.bodyType+'-1x.webm';
            await fs.writeFile(path.join(out,file),video,{flag:'wx'});
            row.film={file,bytes:video.length,sha256:sha(video),mime:capture.mime};
            row.frames=capture.frames;
            const first=row.frames[0],last=row.frames.at(-1);
            const wall=(last.wallMs-first.wallMs)/1000, simulation=last.sim-first.sim;
            row.clock={wallSeconds:wall,simulationSeconds:simulation,simulationPerWallSecond:simulation/wall};
            assert(row.frames.every(frame=>frame.playbackRate===1&&!frame.paused&&!frame.suspended&&frame.sameActor&&frame.sameGlasses&&
              frame.loaded&&frame.fitSHA256===spec.fitSHA256&&frame.outfit===spec.record.appearanceRecipe.equipment.index));
            assert(row.frames.some(frame=>frame.speed>.15),'No sampled walk');
            assert(row.frames.some(frame=>frame.mode==='sit'&&frame.sitProgress>.995),'No sampled stable seat');
            assert(last.mode==='idle'&&last.sitProgress<.005,'No sampled stand completion');
            assert(row.clock.simulationPerWallSecond>=.90&&row.clock.simulationPerWallSecond<=1.06,'Simulation diverged from real-time playback');
          }
        } catch(error) {row.failure??=String(error.stack||error);}
        finally {await page.close();}
      }
      if(row.errors.length||row.failure||!row.film) report.status='incomplete';
    }
  } finally {
    try {await session?.close();}
    finally {await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
  }
  if(report.status==='incomplete')process.exitCode=1;
  console.log(JSON.stringify({status:report.status,cases:report.cases.map(({bodyType,film,clock,failure,errors})=>({bodyType,film,clock,failure,errors}))}));
}

run(...process.argv.slice(2)).catch(error=>{console.error(error.stack||error);process.exitCode=1;});
