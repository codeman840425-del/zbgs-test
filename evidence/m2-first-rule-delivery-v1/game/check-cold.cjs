// run-fixed-check.cjs EXTRACTED_GAME this.cjs PACKAGE_SHA SIGNED_PAIR NEW_EVIDENCE
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const {projectOutput, productionRoot} = require('../../../scripts/project-output.cjs');
const {launchQABrowser} = require('../../../scripts/qa-browser-workspace.cjs');
const {observeNetwork} = require('../../../scripts/qa-cold-assets.cjs');
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
      attached:avatar.root.parent===game.scene, bodyType:avatar.profile.bodyType, bodySha256:avatar.profile.sha256,
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

async function run(base, manifestSha, pairFile, output) {
  const project = await productionRoot(), out = await projectOutput(output, project);
  const {canonicalJson}=await import('../../../prototype/src/character-record.js');
  const signed = JSON.parse(await fs.readFile(pairFile));
  assert.equal(signed.length,2);
  const bodies = signed.map(record=>record.appearanceRecipe.base.sha256);
  assert.deepEqual(bodies.map(x=>x.slice(0,12)).sort(),['0beabf44f27c','c6ce7efc3da1']);
  const origin = new URL(base); assert.equal(origin.hostname,'127.0.0.1');
  const response = await fetch(new URL('runtime-package.json',origin),{redirect:'error'});
  assert.equal(response.status,200);
  const bytes = Buffer.from(await response.arrayBuffer()); assert.equal(sha(bytes),manifestSha);
  const pack = JSON.parse(bytes), files = new Map(pack.files.map(file=>['/'+file.path,file]));
  assert.deepEqual(pack.records.map(r=>r.recordSha256),signed.map(r=>r.integrity.recordSha256));
  const report = {runtime:pack.runtime,manifestSha,entry:pack.runtime.entryUrl,sessions:[]};
  await fs.mkdir(out);
  try {
    for (const phase of ['first','cold']) {
      const browser = await launchQABrowser(out,{channel:'chrome'});
      const row = {phase,browser:browser.browser.version(),errors:[],unexpectedRequests:[],responses:[],motions:[]};
      report.sessions.push(row);
      try {
        const viewport={width:1280,height:800};
        const context = await browser.browser.newContext({viewport,serviceWorkers:'block',
          ...(phase==='cold'?{recordVideo:{dir:out,size:viewport}}:{})});
        const page = await context.newPage();
        const network = await observeNetwork(context,page);
        page.on('pageerror',err=>row.errors.push(err.message));
        page.on('request',req=>{
          const url = new URL(req.url());
          if (/^https?:$/.test(url.protocol) && (url.origin!==origin.origin ||
              (!files.has(url.pathname) && url.pathname!=='/favicon.ico'))) row.unexpectedRequests.push(url.href);
        });
        await page.goto(new URL(pack.runtime.entryUrl,origin).href);
        await page.waitForFunction(()=>window.__recordConsumer?.ready,null,{timeout:120000});
        assert.equal(await page.evaluate(()=>__recordConsumer.buildInfo.sourceDigest),pack.runtime.sourceDigest);
        assert.deepEqual(await page.evaluate(()=>__recordConsumer.records),signed);
        row.batch = await page.evaluate(()=>__recordConsumer.snapshot().items.map(i=>[i.identityId,i.status]));
        assert.deepEqual(row.batch,signed.map(r=>[r.identity.id,'completed']));
        row.actors = await page.evaluate(actorState);
        const urls = new Set();
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
        if (phase==='cold') assert(row.actors.every(a=>report.sessions[0].actors.every(old=>old.root!==a.root)));
        await page.locator('#stage canvas').screenshot({path:path.join(out,phase+'-dressed.png')});
        if (phase==='cold') {
          for (const record of signed) {
            const id=record.identity.id;
            const played=page.evaluate(wave,id);
            await page.waitForFunction(id=>__recordConsumer.actors.get(id).avatar.livePresentation.getState().greeting.weight>.95,id);
            await page.locator('#stage canvas').screenshot({path:path.join(out,id+'-wave.png')});
            const result=await played;
            assert.equal(result.gesture.sha256,greetingSha);
            assert(result.maximumWeight>.95 && result.drawFrames>=10 && result.peakWristDisplacementM>.08);
            row.motions.push(result);
          }
          const gesture = pack.files.find(f=>f.sha256===greetingSha);
          assert(gesture); urls.add('/'+gesture.path);
        }
        for (const url of urls) {
          const attempts=await network.readAttempts(new URL(url,origin).href);
          assert(attempts.length && attempts.every(a=>!a.error),url+' '+JSON.stringify(attempts.map(a=>a.error)));
          const transfer=attempts.map(a=>({status:a.status,bytes:a.bytes.length,sha256:sha(a.bytes),transferBytes:a.transferBytes}));
          assert(transfer.every(a=>a.sha256===files.get(url).sha256));
          row.responses.push({url,transfer});
        }
        assert.deepEqual(await page.evaluate(()=>__recordConsumer.errors),[]);
        assert.deepEqual(row.errors,[]); assert.deepEqual(row.unexpectedRequests,[]);
        const video=page.video();
        await context.close();
        if(video){await video.saveAs(path.join(out,'two-rule-bodies-1x.webm'));await video.delete();}
      } finally {await browser.close();}
    }
    report.status='technical-pass';
  } catch(error){report.status='failed';report.failure=String(error.stack??error);throw error;}
  finally {await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
}
run(...process.argv.slice(2)).catch(error=>{console.error(error);process.exitCode=1;});
