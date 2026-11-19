// run-fixed-check.cjs EXTRACTED_GAME this.cjs PACKAGE_SHA SIGNED_PAIR NEW_EVIDENCE [--browser-config PATH]
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const {projectOutput, productionRoot} = require('../../../scripts/project-output.cjs');
const {launchQABrowser} = require('../../../scripts/qa-browser-workspace.cjs');
const {browserConfigArgs} = require('../../../scripts/qa-browser-config-args.cjs');
const {observeNetwork,measureAttempts} = require('../../../scripts/qa-cold-assets.cjs');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const greetingSha = 'eec4ef8ab2fb073f7674cc6e839cbad7aea6931e4b19e8e70c0ee46c5fda2d06';

async function actorState() {
  const game = window.__recordConsumer;
  const result = [];
  for (const actor of game.actors.values()) {
    const avatar = actor.avatar, outfit = avatar.getOutfitInfo();
    const items = Object.values(avatar.getEquipmentRecipe(outfit.index));
    result.push({
      id:actor.identity.id, recordSha256:actor.recordSha256, root:avatar.root.uuid,
      attached:avatar.root.parent===game.scene, skeletonHead:avatar.vrm.humanoid.getRawBoneNode('head').uuid,
      bodyType:avatar.profile.bodyType, bodySha256:avatar.profile.sha256,
      bodyUrl:avatar.profile.url, manifestUrl:avatar.config.manifestUrl,
      selected:items.map(i=>({id:i.id,url:new URL(i.url,new URL(avatar.config.manifestUrl,location.href)).pathname,
        sha256:i.sha256,slot:i.slot,compatibleAvatarSha256:i.compatibleAvatarSha256})),
      visible:Object.values(outfit.equipment.items).filter(i=>i.visible).map(i=>i.id).sort(),
      restored:(await actor.capture()).appearanceRecipe,
    });
  }
  return result;
}

// Sample the actual raw wrist on the normal host frame clock. The gesture is
// played through the existing avatar presentation API and removes itself at its end.
async function wave(id) {
  const game = window.__recordConsumer, actor = game.actors.get(id);
  const live = actor.avatar.livePresentation;
  const hand = actor.avatar.vrm.humanoid.getRawBoneNode('leftHand');
  const handPosition = () => hand.getWorldPosition(hand.position.clone()).toArray();
  const before = handPosition(), frame = game.renderer.info.render.frame;
  const started = await live.playGreeting({requestId:'cold-wave-'+id});
  if (!started.started) throw Error(JSON.stringify(started));
  const start = performance.now();
  let peak = 0, samples = 0, maximumWeight = 0;
  for (;;) {
    await new Promise(requestAnimationFrame);
    const now = handPosition(), status = live.getState().greeting;
    peak = Math.max(peak,Math.hypot(...now.map((v,i)=>v-before[i])));
    maximumWeight = Math.max(maximumWeight,status.weight);
    samples++;
    if (status.status === 'completed') return {id,gesture:status,peakWristDisplacementM:peak,
      maximumWeight,samples,drawFrames:game.renderer.info.render.frame-frame,elapsedMs:performance.now()-start};
    if (status.status !== 'playing' || performance.now()-start>20000) throw Error(JSON.stringify(status));
  }
}

async function run(base, manifestSha, pairFile, output,...args) {
  const {remaining, launchOptions} = browserConfigArgs(args);
  const contentMode=remaining.includes('--cdp-content');
  const options=remaining.filter(arg=>arg!=='--cdp-content');
  assert(remaining.length-options.length<=1,'Duplicate --cdp-content');
  const project = await productionRoot(), out = await projectOutput(output, project);
  const {canonicalJson}=await import('../../../prototype/src/character-record.js');
  const signed = JSON.parse(await fs.readFile(pairFile));
  assert.equal(signed.length,2);
  const extra=options.length?require('../../../scripts/qa-published-rule-body.cjs'):null;
  const publication=extra?await extra.publishedInputs(options,signed):null;
  if (!publication) {
    const bodies = signed.map(record=>record.appearanceRecipe.base.sha256);
    assert.deepEqual(bodies.map(x=>x.slice(0,12)).sort(),['0beabf44f27c','c6ce7efc3da1']);
  }
  const origin = new URL(base); assert.equal(origin.hostname,'127.0.0.1');
  const response = await fetch(new URL('runtime-package.json',origin),{redirect:'error'});
  assert.equal(response.status,200);
  const bytes = Buffer.from(await response.arrayBuffer()); assert.equal(sha(bytes),manifestSha);
  const pack = JSON.parse(bytes), files = new Map(pack.files.map(file=>['/'+file.path,file]));
  if(contentMode)assert(publication,'--cdp-content requires --published');
  const contentPins=contentMode?extra.strictContentPins(origin,files,signed,publication,greetingSha):undefined;
  assert.deepEqual(pack.records.map(r=>r.recordSha256),signed.map(r=>r.integrity.recordSha256));
  const report = {runtime:pack.runtime,manifestSha,entry:pack.runtime.entryUrl,coldOpenStatus:'incomplete',
    networkIntegrityStatus:'incomplete',sessions:[]};
  await fs.mkdir(out);
  try {
    for (const phase of ['first','cold']) {
      const browser = await launchQABrowser(out,launchOptions);
      const row = {phase,browser:browser.browser.version(),errors:[],unexpectedRequests:[],responses:[],motions:[],
        coldOpenStatus:'incomplete',measurementStatus:'incomplete',networkIntegrityStatus:'incomplete'};
      if (launchOptions.browserConfig) row.browserLaunch=browser.receipt;
      report.sessions.push(row);
      let network;
      const selectedUrls=[];
      const networkFailures=[], measurementGaps=[];
      try {
        const viewport={width:1280,height:800};
        const context = await browser.browser.newContext({viewport,serviceWorkers:'block',
          ...(phase==='cold'?{recordVideo:{dir:await projectOutput(browser.scratch,project),size:viewport}}:{})});
        const page = await context.newPage();
        network = await observeNetwork(context,page,contentPins);
        page.on('pageerror',err=>row.errors.push(err.message));
        page.on('request',req=>{
          const url = new URL(req.url());
          if (/^https?:$/.test(url.protocol) && (url.origin!==origin.origin ||
              (!files.has(url.pathname) && url.pathname!=='/favicon.ico'))) row.unexpectedRequests.push(url.href);
        });
        network.stage('initial-registration-and-restore');
        await page.goto(new URL(pack.runtime.entryUrl,origin).href);
        await page.waitForFunction(()=>window.__recordConsumer?.ready,null,{timeout:120000});
        assert.equal(await page.evaluate(()=>__recordConsumer.buildInfo.sourceDigest),pack.runtime.sourceDigest);
        assert.deepEqual(await page.evaluate(()=>__recordConsumer.records),signed);
        row.batch = await page.evaluate(()=>__recordConsumer.snapshot().items.map(i=>[i.identityId,i.status]));
        assert.deepEqual(row.batch,signed.map(r=>[r.identity.id,'completed']));
        row.actors = await page.evaluate(actorState);
        if(publication) {
          try { row.publication=await extra.publication(network,origin,files,publication,signed); }
          catch(error) {
            const findings=error.kind==='measurement-unavailable'?measurementGaps:networkFailures;
            findings.push({stage:'publication',url:error.url,requestId:error.requestId,error:error.message,lifecycle:error.lifecycle});
          }
        }
        const urls = new Set(row.publication?.urls);
        for (const actor of row.actors) {
          const record = signed.find(r=>r.identity.id===actor.id);
          assert(actor.attached);
          assert.equal(actor.recordSha256,record.integrity.recordSha256);
          assert.equal(actor.bodyType,record.appearanceRecipe.base.bodyType);
          assert.equal(actor.bodySha256,record.appearanceRecipe.base.sha256);
          // The signed JSON contract serializes IEEE negative zero as zero in
          // inverse bind matrices, as does the game's own record signature.
          assert.equal(canonicalJson(actor.restored),canonicalJson(record.appearanceRecipe));
          assert.deepEqual(actor.visible,actor.selected.map(i=>i.id).sort());
          assert.deepEqual(actor.selected.map(i=>i.slot).sort(),['bottom','shoes','top']);
          assert.equal(files.get(actor.bodyUrl)?.sha256,actor.bodySha256);
          urls.add(actor.bodyUrl).add(actor.manifestUrl);
          for (const item of actor.selected) {
            assert.equal(item.compatibleAvatarSha256,actor.bodySha256);
            assert.equal(files.get(item.url)?.sha256,item.sha256);
            urls.add(item.url);
          }
        }
        assert.equal(new Set(row.actors.map(a=>a.root)).size,2);
        assert.equal(new Set(row.actors.map(a=>a.skeletonHead)).size,2);
        if (phase==='cold') assert(row.actors.every(a=>report.sessions[0].actors.every(old=>
          old.root!==a.root && old.skeletonHead!==a.skeletonHead)));
        await page.locator('#stage canvas').screenshot({path:path.join(out,phase+'-dressed.png')});
        if (phase==='cold' || publication) {
          network.stage('greeting');
          for (const record of signed) {
            const id=record.identity.id;
            const played=page.evaluate(wave,id);
            await Promise.race([
              page.waitForFunction(id=>__recordConsumer.actors.get(id).avatar.livePresentation.getState().greeting.weight>.95,id),
              played.then(()=>{throw Error('Greeting finished before its fully raised pose was observed: '+id);}),
            ]);
            const shot=publication?phase+'-'+id+'-wave.png':id+'-wave.png';
            await page.locator('#stage canvas').screenshot({path:path.join(out,shot)});
            const result=await played;
            assert.equal(result.gesture.sha256,greetingSha);
            assert(result.maximumWeight>.95 && result.drawFrames>=10 && result.peakWristDisplacementM>.08);
            row.motions.push(result);
          }
          const gesture = pack.files.find(f=>f.sha256===greetingSha);
          assert(gesture); urls.add('/'+gesture.path);
        }
        row.signedPairRestoredAndDrawn=true;
        assert.deepEqual(await page.evaluate(()=>__recordConsumer.errors),[]);
        assert.deepEqual(row.errors,[]); assert.deepEqual(row.unexpectedRequests,[]);
        selectedUrls.push(...[...urls].map(url=>new URL(url,origin).href));
        if(contentMode && row.publication)assert.deepEqual(new Set(selectedUrls),new Set(contentPins.keys()),
          'Content pins differ from actual published and selected resources');
        for (const url of urls) {
          const attempts=await network.readAttempts(new URL(url,origin).href);
          const measurement=measureAttempts(url,files.get(url),attempts);
          row.responses.push(measurement.row);
          for (const attempt of measurement.row.attempts.filter(a=>a.kind==='network-or-integrity-failed')) {
            networkFailures.push({url,requestId:attempt.requestId,error:attempt.error});
          }
          if(!attempts.length)networkFailures.push({url,error:measurement.failures[0]});
          for (const {requestId,error} of measurement.unavailable) measurementGaps.push({url,requestId,error});
        }
        assert.deepEqual(await page.evaluate(()=>__recordConsumer.errors),[]);
        assert.deepEqual(row.errors,[]); assert.deepEqual(row.unexpectedRequests,[]);
        if(publication && phase==='first') {
          const survivor=await extra.oldSurvivor(page,publication),prior=row.actors.find(a=>a.id===survivor.id);
          assert.equal(survivor.recordSha256,publication.old.integrity.recordSha256);
          assert.equal(survivor.bodySha256,publication.old.appearanceRecipe.base.sha256);
          assert.equal(canonicalJson(survivor.appearanceRecipe),canonicalJson(publication.old.appearanceRecipe));
          assert.equal(canonicalJson(survivor.liveAccessories),canonicalJson(publication.old.liveAccessories));
          assert.equal(survivor.root,prior.root);assert(survivor.renderedFrames>0);
          row.oldSurvivor={id:survivor.id,root:survivor.root,recordSha256:survivor.recordSha256,
            renderedFrames:survivor.renderedFrames};
          await page.locator('#stage canvas').screenshot({path:path.join(out,'previous-record-alone.png')});
          network.stage('reselect');
          await page.locator('#first').click();
          await page.waitForFunction(()=>__recordConsumer.snapshot()?.phase==='settled' && __recordConsumer.actors.size===2);
          const recovered=await page.evaluate(actorState);
          assert.deepEqual(recovered.map(a=>a.recordSha256),signed.map(r=>r.integrity.recordSha256));
          assert(recovered.every(a=>a.attached && row.actors.every(prior=>prior.root!==a.root)));
          row.reselected=recovered.map(({id,root,recordSha256})=>({id,root,recordSha256}));
          assert.deepEqual(await page.evaluate(()=>__recordConsumer.errors),[]);
          assert.deepEqual(row.errors,[]);assert.deepEqual(row.unexpectedRequests,[]);
        }
        if(contentMode)await network.auditContent();
        const video=page.video();
        await context.close();
        if(video){
          const name=publication?'published-and-previous-1x.webm':'two-rule-bodies-1x.webm';
          await video.saveAs(await projectOutput(path.join(out,name),project));await video.delete();
        }
        row.coldOpenStatus='passed';
      } finally {
        if(network){
          row.networkDiagnostics=network.diagnostics(selectedUrls);
          if(contentMode){
            row.cdpContent=network.contentSummary();
            if(row.cdpContent.status!=='passed')networkFailures.push({stage:'cdp-content',
              failed:row.cdpContent.failed,missingUrls:row.cdpContent.missingUrls,error:'Incomplete or failed same-ID strict evidence'});
          }
          for (const {requestId,url,errorText} of row.networkDiagnostics.failed??[]) {
            if(measurementGaps.some(gap=>gap.requestId===requestId) && !networkFailures.some(failure=>failure.requestId===requestId))
              networkFailures.push({url,requestId,error:'Network.loadingFailed after measurement deadline: '+errorText});
          }
        }
        if(networkFailures.length)row.networkIntegrityFailures=networkFailures;
        if(measurementGaps.length)row.measurementGaps=measurementGaps;
        if(row.coldOpenStatus==='passed' || networkFailures.length || measurementGaps.length){
          row.networkIntegrityStatus=networkFailures.length?'failed':measurementGaps.length?'unverified':'passed';
          row.measurementStatus=networkFailures.length?'failed':measurementGaps.length?'unavailable':'passed';
        }
        await browser.close();
      }
    }
    report.coldOpenStatus='passed';
    if(report.sessions.some(row=>row.networkIntegrityStatus==='failed')){
      report.networkIntegrityStatus='failed';
      report.status='failed';
      report.failure='Cold-open checks passed, but CDP network or integrity checks failed';
      console.error(report.failure);
      process.exitCode=1;
    }else if(report.sessions.some(row=>row.measurementStatus==='unavailable')){
      report.networkIntegrityStatus='unverified';
      report.status='measurement-unavailable';
      report.failure='Cold-open checks passed, but CDP transfer proof is incomplete';
      console.error(report.failure);
      process.exitCode=1;
    }else{report.networkIntegrityStatus='passed';report.status='technical-pass';}
  } catch(error){
    if(report.sessions.some(row=>row.networkIntegrityStatus==='failed'))report.networkIntegrityStatus='failed';
    report.status='failed';report.failure=String(error.stack??error);throw error;
  }
  finally {await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
}
run(...process.argv.slice(2)).catch(error=>{console.error(error);process.exitCode=1;});
