const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const {observeNetwork} = require('./qa-cold-assets.cjs');
const {productionRoot, projectOutput} = require('./project-output.cjs');

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const library = 'assets/motion/UAL1_Standard.glb';

function animationClips(bytes) {
  assert.equal(bytes.toString('ascii',0,4),'glTF');
  assert.equal(bytes.readUInt32LE(4),2);
  assert.equal(bytes.readUInt32LE(8),bytes.length);
  assert.equal(bytes.toString('ascii',16,20),'JSON');
  const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
  return doc.animations.map(a=>({name:a.name, channels:a.channels.length,
    duration:Math.max(...a.samplers.map(s=>doc.accessors[s.input].max[0]))}));
}

async function serverMotion(url,row) {
  const response=await fetch(url,{redirect:'error'});
  assert.equal(response.status,200);
  const bytes=Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.length,row.bytes);
  assert.equal(sha(bytes),row.sha256);
  return {url:response.url,sha256:row.sha256,bytes:bytes.length,
    ...(row.path.endsWith('.glb')?{clips:animationClips(bytes)}:{schema:JSON.parse(bytes).schema??null})};
}

async function inspectMotions(network, manifest, base, trace) {
  const rows=manifest.files.filter(r=>r.path.startsWith('assets/motion/'));
  assert(rows.some(r=>r.path===library && r.reasons.includes('Startup shared motion library')), 'UAL dependency missing');
  const results=trace.motionResponses=[], issues=trace.motionIssues=[];
  for (const row of rows) {
    const url=new URL('/'+row.path,base).href;
    const attempts=await network.readAttempts(url);
    const asset={path:row.path, reasons:row.reasons, expectedSha256:row.sha256, expectedBytes:row.bytes, attempts:[]};
    results.push(asset);
    if (!attempts.length && row.reasons.some(reason=>reason.startsWith('Startup ')))
      issues.push('Missing startup motion request: '+row.path);
    if (attempts.length || row.reasons.some(reason=>reason.startsWith('Startup '))) {
      // Independent fixture response. It cannot discharge a browser request failure.
      try { asset.independentHttp=await serverMotion(url,row); }
      catch(error) { asset.independentHttpError=String(error); issues.push('Independent HTTP mismatch: '+row.path); }
    }
    for (const {requestId,bytes,error,transferBytes} of attempts) {
      const observed={requestId,transferBytes};
      asset.attempts.push(observed);
      if (error) { observed.error=error; issues.push(row.path+' '+requestId+' '+error); continue; }
      observed.sha256=sha(bytes); observed.bytes=bytes.length;
      if (observed.sha256!==row.sha256 || observed.bytes!==row.bytes) issues.push('Motion content mismatch: '+row.path);
      if (row.path.endsWith('.glb')) observed.clips=animationClips(bytes);
      else JSON.parse(bytes);
    }
  }
  const declared=new Set(rows.map(r=>new URL('/'+r.path,base).href));
  for (const url of trace.requests) if (new URL(url).pathname.startsWith('/assets/motion/') && !declared.has(url))
    issues.push('Undeclared motion request: '+url);
}

// Observe the existing Phaser scene clock. Never tick the avatar from the probe.
async function samplePlayback(page) {
  return page.evaluate(async()=>{
    const api=window.__recordConsumer, start=performance.now(), samples=[];
    function snapshot() {
      return {wallMs:performance.now()-start, actors:[...api.actors.values()].map(actor=>{
        const m=actor.motion.getMetrics();
        const pose=Object.fromEntries(['hips','spine','leftUpperArm','rightUpperArm'].map(name=>{
          const node=actor.avatar.vrm.humanoid.getRawBoneNode(name);
          return [name,[...node.position.toArray(),...node.quaternion.toArray()]];
        }));
        return {id:actor.identity.id,action:m.action,frame:m.frame,actionTime:m.actionTime,frameDt:m.frameDt,
          talkMix:m.talkMix,source:m.motionSource,retarget:m.sourceRetarget,clips:m.sourceClips,pose};
      })};
    }
    samples.push(snapshot());
    while (samples.at(-1).wallMs<1000) {
      await new Promise(resolve=>requestAnimationFrame(resolve));
      if (performance.now()-start-samples.at(-1).wallMs>=100) samples.push(snapshot());
    }
    return samples;
  });
}

function checkPlayback(trace) {
  const assets=trace.motionResponses.find(r=>r.path===library);
  const clips=assets.independentHttp?.clips;
  assert(clips,'Missing verified UAL animation data');
  const idle=clips.find(c=>c.name==='Idle_Loop'), talk=clips.find(c=>c.name==='Idle_Talking_Loop');
  assert(idle?.channels && talk?.channels, 'Missing actual source idle/speaking tracks');
  trace.playbackVerification=[];
  for(const first of trace.playback[0].actors) {
    const samples=trace.playback.map(frame=>frame.actors.find(r=>r.id===first.id)), last=samples.at(-1);
    assert(samples.every(s=>s?.action==='idle' && s.source.includes('Quaternius') && s.retarget && s.clips?.walkTracks>0));
    assert(Math.abs(last.clips.idleDuration-idle.duration)<1e-5 && last.talkMix>0,'Parsed idle/talking playback missing');
    assert(last.frame>first.frame && last.actionTime>first.actionTime, 'Presentation clock did not advance');
    const elapsedSeconds=(trace.playback.at(-1).wallMs-trace.playback[0].wallMs)/1000;
    const actionSeconds=last.actionTime-first.actionTime;
    // RecordScene caps large frame gaps at 50 ms; allow one boundary frame.
    assert(actionSeconds<=elapsedSeconds+.055,'Presentation advanced faster than its wall clock');
    assert(samples.some(s=>Object.keys(first.pose).some(k=>s.pose[k].some((v,i)=>Math.abs(v-first.pose[k][i])>1e-5))),
      'Raw humanoid bones did not advance');
    trace.playbackVerification.push({id:first.id,elapsedSeconds,actionSeconds,
      clock:'natural Phaser update; no synthetic ticks',frames:last.frame-first.frame,
      action:'idle',speakingMix:last.talkMix,idleSourceClip:idle.name,standingTalkSourceClip:talk.name,
      parsedIdleDuration:last.clips.idleDuration,walkTrackCount:last.clips.walkTracks});
  }
}

// Run on the standalone exported game twice. The opposite tier is identified
// from the other signed records, including failed/redirected network attempts.
async function run(base, build, selectedFile, oppositeFile, directory, executable) {
  const out = await projectOutput(directory, await productionRoot());
  const parse = async file => JSON.parse(await fs.readFile(file, 'utf8'));
  const [records, other] = await Promise.all([parse(selectedFile), parse(oppositeFile)]);
  const {canonicalJson} = await import('../prototype/src/character-record.js');
  // This check measures the first visible group before any user selection.
  assert(Array.isArray(records) && records.length >= 1 && records.length <= 2, 'Cold-load check expects one visible group of 1–2 signed records');
  assert.equal(new Set(records.map(r=>r.identity.id)).size, records.length);
  const top = record => {
    const equipment = record.appearanceRecipe.equipment;
    const matches = Object.values(equipment.resources).filter(item => item.slot === 'top');
    assert.equal(matches.length, 1);
    const item = matches[0];
    return {id:item.id, sha256:item.sha256, bytes:item.bytes,
      url:new URL(item.url, new URL(equipment.manifestUrl, base)).href};
  };
  const expected = records.map(top);
  const forbidden = other.map(top).map(item => item.url);
  assert.deepEqual(records.map(r=>r.identity.id), other.map(r=>r.identity.id));
  assert(expected.every(item => !forbidden.includes(item.url)));
  await fs.mkdir(out, {recursive:false});
  const {chromium} = require('../prototype/node_modules/playwright');
  const report = {status:'incomplete',build,requestedExecutable:executable??'channel:chrome',runs:[]};
  let browser;
  try {
    if(executable) assert(path.isAbsolute(executable),'Pass an absolute Chrome executable path');
    const executablePath=executable && await fs.realpath(executable);
    browser=await chromium.launch({...(executablePath?{executablePath}:{channel:'chrome'}),headless:true});
    const browserCdp=await browser.newBrowserCDPSession();
    report.browser=browser.version();
    report.browserIdentity=await browserCdp.send('Browser.getVersion');
    const command=await browserCdp.send('Browser.getBrowserCommandLine');
    report.executable=command.arguments[0];
    if(executablePath) assert.equal(path.normalize(await fs.realpath(report.executable)),path.normalize(executablePath));
    await browserCdp.detach();
    const meta=await fetch(new URL('runtime-package.json',base));
    assert.equal(meta.status,200,'Standalone runtime inventory required');
    const manifestBytes=Buffer.from(await meta.arrayBuffer()), manifest=JSON.parse(manifestBytes);
    assert.equal(manifest.runtime.buildId,build);
    assert.deepEqual(manifest.records.map(r=>r.recordSha256),records.map(r=>r.integrity.recordSha256));
    report.inventorySha256=sha(manifestBytes);
    for (const phase of ['first','reopened']) {
      const context = await browser.newContext({serviceWorkers:'block', viewport:{width:1440,height:900}});
      const requests=[], errors=[], trace={phase,requests,errors,stages:[]};
      let network;
      const stage=name=>{trace.stages.push({name,at:Date.now()}); network?.stage(name);};
      report.runs.push(trace);
      try {
        const page = await context.newPage();
        page.on('request', request => requests.push(request.url()));
        page.on('pageerror', error => errors.push(error.message));
        network = await observeNetwork(context, page);
        stage('navigation');
        await page.goto(new URL('record-consumer.html?records=/records/manifest.json', base).href);
        stage('waiting-for-record-consumer');
        await page.waitForFunction(()=>window.__recordConsumer?.ready, null, {timeout:120000});
        stage('observing-rendered-records');
        const state = await page.evaluate(async()=>{
          const api=window.__recordConsumer, actors=[];
          for (const a of api.actors.values()) {
            const record = await a.capture(), gear = Object.values(a.avatar.getEquipmentRecipe(a.controller.outfit));
            const top = gear.find(item=>item.slot==='top');
            const activeTop=a.avatar.getAssetProfile().meshRoles.top.map(uuid=>{
              const mesh=a.avatar.root.getObjectByProperty('uuid',uuid);
              let shown=true;
              for(let node=mesh;node;node=node.parent) shown=shown && node.visible;
              const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
              return {mesh:mesh.name, shown, textures:materials.map(m=>m.map?.image?.width || 0)};
            });
            actors.push({id:a.identity.id, sha:a.recordSha256, root:a.avatar.root.uuid,
              recipe:record.appearanceRecipe, topId:top?.id, activeTop});
          }
          return {build:api.buildInfo.shortId, failure:api.inputFailure, actors};
        });
        assert.equal(state.build, build);
        assert.equal(state.actors.length, records.length, JSON.stringify(state.failure));
        assert.equal(new Set(state.actors.map(actor=>actor.root)).size, state.actors.length, 'Expected independent avatar instances');
        trace.actors = [];
        for (const [index, record] of records.entries()) {
          const actor=state.actors.find(a=>a.id===record.identity.id), item=expected[index];
          assert(actor, record.identity.id);
          assert.equal(canonicalJson(actor.recipe),canonicalJson(record.appearanceRecipe));
          assert.equal(actor.sha, record.integrity.recordSha256);
          assert.equal(actor.topId, item.id);
          assert(actor.activeTop.length && actor.activeTop.every(mesh=>mesh.shown), 'Selected top visibility');
          const expectedWidth=record.appearanceRecipe.equipment.role==='pants-top-far'?1024:2048;
          assert(actor.activeTop.some(mesh=>mesh.textures.includes(expectedWidth)), 'Rendered base-color texture size');
          const result = await network.read(item.url);
          const digest = createHash('sha256').update(result.bytes).digest('hex');
          assert.equal(digest, item.sha256);
          assert.equal(result.bytes.length, item.bytes);
          trace.actors.push({id:actor.id, root:actor.root, recordSha256:actor.sha, topId:item.id,
            url:new URL(item.url).pathname, sha256:digest, bodyBytes:result.bytes.length,
            transferBytes:result.transferBytes, activeTop:actor.activeTop});
        }
        stage('natural-idle-speaking-playback');
        trace.playback=await samplePlayback(page);
        stage('screenshot');
        await page.screenshot({path:path.join(out,phase+'.png')});
        stage('verify-request-bodies');
        await inspectMotions(network,manifest,base,trace);
        trace.forbiddenRequests=requests.filter(url=>forbidden.includes(url));
        trace.network=network.diagnostics();
        checkPlayback(trace);
        assert.deepEqual(trace.forbiddenRequests, []);
        // Chrome independently probes for a tab icon on the standalone document.
        // Record the 404 while keeping every game and record request strict.
        const tabIcon = new URL('/favicon.ico',base).href;
        trace.browserIcon404 = trace.network.httpErrors.filter(e=>e.url===tabIcon && e.status===404);
        assert.deepEqual(trace.network.httpErrors.filter(e=>e.url!==tabIcon || e.status!==404), []);
        assert.deepEqual(trace.network.failed, []);
        assert.deepEqual(trace.motionIssues, []);
        assert.deepEqual(errors, []);
        assert(requests.every(url => !/^https?:/.test(url) || new URL(url).origin === new URL(base).origin));
      } catch(error) { trace.failure=String(error.stack||error); }
      finally {
        try {
          if (network) {
            trace.network=network.diagnostics();
            if(!trace.motionResponses) {
              try { await inspectMotions(network,manifest,base,trace); }
              catch(error) { trace.motionInspectionError=String(error); }
            }
            if (!trace.failure && trace.network.failed.length) trace.failure='Network failed before context close';
          }
        } finally { await context.close(); }
      }
    }
    assert(!report.runs.some(r=>r.failure),JSON.stringify(report.runs.filter(r=>r.failure).map(r=>({phase:r.phase,failure:r.failure}))));
    assert(report.runs[1].actors.every(a=>report.runs[0].actors.every(b=>a.root!==b.root)));
    report.status='passed';
  } catch(error) { report.failure=String(error.stack||error); throw error; }
  finally {
    try { await browser?.close(); }
    finally { await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)); }
  }
  console.log(JSON.stringify({status:report.status, build, output:out}));
}

if (require.main===module) run(...process.argv.slice(2)).catch(error=>{console.error(error);process.exitCode=1;});
module.exports={animationClips,inspectMotions,checkPlayback};
