// Run with run-fixed-check.cjs against the private registered runtime.
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require('../prototype/node_modules/playwright');
const {batchCreates} = require('./character-production-cli.cjs');
const {produceBatch, verifyCreatedRecord} = require('./character-production-browser.cjs');
const {productionRoot, projectOutput} = require('./project-output.cjs');

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const readJson = async file => JSON.parse(await fs.readFile(file));
const writeJson = (file, value) => fs.writeFile(file, JSON.stringify(value, null, 2) + '\n', {flag:'wx'});

async function consume(page, records) {
  return page.evaluate(async records => {
    const c = window.__recordConsumer;
    const batch = await c.selectGroup(0, records);
    const frame = c.renderer.info.render.frame;
    await new Promise(resolve => setTimeout(resolve, 550));
    const actors = [];
    for (const record of records) {
      const a = c.actors.get(record.identity.id);
      if (!a || a.avatar.root.parent !== c.scene) throw Error('Registered actor unavailable');
      const outfit = a.avatar.getOutfitInfo();
      actors.push({id:a.identity.id, revision:a.revision, recordSha256:a.recordSha256,
        root:a.avatar.root.uuid, vrm:a.avatar.vrm.scene.uuid, bodySha256:a.avatar.profile.sha256,
        coverage:outfit.equipment.bodyTextureCoverage,
        visibleEquipment:Object.values(outfit.equipment.items).filter(item=>item.visible).map(item=>item.id).sort(),
        captured:await a.capture()});
    }
    return JSON.parse(JSON.stringify({batch, actors, count:c.actors.size,
      advancingFrames:c.renderer.info.render.frame-frame, errors:c.errors}));
  }, records);
}

async function recordDressedIdle(page, out) {
  await page.locator('#stage canvas').screenshot({path:path.join(out,'dressed-first.png')});
  const movie = await page.evaluate(async () => {
    const canvas = window.__recordConsumer.renderer.domElement;
    const stream = canvas.captureStream(30);
    try {
      const mimeType = 'video/webm;codecs=vp9';
      const recorder = new MediaRecorder(stream,{mimeType,videoBitsPerSecond:5000000});
      const chunks = [];
      const stopped = new Promise((resolve,reject)=>{
        recorder.addEventListener('stop',resolve,{once:true});
        recorder.addEventListener('error',event=>reject(event.error),{once:true});
      });
      recorder.addEventListener('dataavailable',event=>{if (event.data.size) chunks.push(event.data);});
      recorder.start();
      const start = performance.now();
      setTimeout(()=>{if (recorder.state==='recording') recorder.stop();},5000);
      await stopped;
      const elapsedMs = performance.now()-start;
      const data = await new Promise((resolve,reject)=>{
        const reader = new FileReader();
        reader.onload = ()=>resolve(reader.result.split(',')[1]);
        reader.onerror = ()=>reject(reader.error);
        reader.readAsDataURL(new Blob(chunks,{type:mimeType}));
      });
      return {elapsedMs,width:canvas.width,height:canvas.height,data};
    } finally {
      stream.getTracks().forEach(track=>track.stop());
    }
  });
  const bytes = Buffer.from(movie.data,'base64');
  assert.ok(bytes.length && movie.elapsedMs>=4000 && movie.elapsedMs<=6000);
  const file = 'dressed-idle-capture.webm';
  await fs.writeFile(path.join(out,file),bytes,{flag:'wx'});
  return {file,still:'dressed-first.png',action:'idle',width:movie.width,height:movie.height,
    captureElapsedMs:movie.elapsedMs,sha256:sha(bytes)};
}

async function main() {
  const [base, workArg, run, executablePath, replay] = process.argv.slice(2);
  const origin = new URL(base);
  assert.equal(origin.protocol, 'http:');
  assert.equal(origin.hostname, '127.0.0.1');
  assert.match(run ?? '', /^[a-z][a-z0-9-]{0,39}$/);
  assert.ok(workArg && executablePath, 'Expected private inputs and Chromium executable');
  const root = await productionRoot();
  const work = await projectOutput(workArg, root);
  const relative = path.relative(path.join(root,'output'), work);
  assert.ok(relative && !path.isAbsolute(relative) && relative.split(path.sep)[0] !== '..');
  const out = await projectOutput(path.join(work,run), root);
  assert.equal(path.relative(path.join(work,run),out), '');
  const receipt = await readJson(path.join(work,'build-receipt.json'));
  const input = await fs.readFile(path.join(work,'create.batch.json'));
  const jobs = await batchCreates(JSON.parse(input));
  const {parseRuntimeCharacterRecord} = await import('../prototype/src/character-runtime-record.js');
  const pins = new Map(receipt.registeredBodies.map(pin=>[pin.bodyType,pin]));
  assert.equal(jobs.length, 2);
  assert.equal(pins.size, 2);
  assert.ok(jobs.every(job=>pins.has(job.bodyType)));
  let file = path.join(out,'records.json');
  let saved;
  if (replay !== undefined) {
    assert.match(replay,/^[a-z][a-z0-9-]{0,39}$/);
    const prior = await projectOutput(path.join(work,replay),root);
    assert.equal(path.relative(path.join(work,replay),prior),'');
    saved = await readJson(path.join(prior,'report.json'));
    assert.equal(saved.status,'technical-pass');
    assert.equal(saved.sourceDigest,receipt.sourceDigest);
    assert.equal(saved.requestSha256,sha(input));
    file = path.join(prior,'records.json');
    assert.equal(sha(await fs.readFile(file)),saved.recordFileSha256);
  }
  await fs.mkdir(out);
  Object.assign(process.env, {TEMP:out,TMP:out,TMPDIR:out});
  const report = {status:'incomplete', baseCommit:receipt.baseCommit, privateSourceCommit:receipt.privateSourceCommit,
    sourceDigest:receipt.sourceDigest, requestSha256:sha(input), sessions:[]};
  if (saved) Object.assign(report,{replaySource:replay,recordFileSha256:saved.recordFileSha256});
  let records, firstIds;
  try {
    for (const phase of saved ? ['cold-replay'] : ['create-and-load','cold-reopen']) {
      const folder = path.join(out,phase);
      await fs.mkdir(folder);
      const browser = await chromium.launch({headless:true,executablePath,timeout:12000,artifactsDir:folder,
        env:{...process.env,TEMP:folder,TMP:folder,TMPDIR:folder,USERPROFILE:folder,LOCALAPPDATA:folder,
          APPDATA:folder,XDG_CACHE_HOME:folder,CUDA_CACHE_PATH:folder,__GL_SHADER_DISK_CACHE_PATH:folder,
          CHROME_LOG_FILE:path.join(folder,'chromium.log')},
        args:['--disk-cache-dir='+path.join(folder,'disk-cache'),'--crash-dumps-dir='+folder]});
      const session = {phase,browser:browser.version(),resources:[]};
      report.sessions.push(session);
      try {
        const page = await browser.newPage({viewport:{width:1320,height:920},acceptDownloads:false});
        const errors = [];
        page.on('pageerror',error=>errors.push(error.message));
        page.on('response',response=>{
          const url = new URL(response.url());
          if (url.origin !== origin.origin) return;
          if ([...pins.keys()].some(body=>url.pathname.startsWith('/assets/'+body+'/')))
            session.resources.push({path:url.pathname,status:response.status()});
        });
        await page.goto(new URL('/record-consumer.html?production=1',origin).href);
        await page.waitForFunction(()=>window.__recordConsumer?.ready, null, {timeout:60000});
        assert.equal(await page.evaluate(()=>window.__recordConsumer.buildInfo.sourceDigest),receipt.sourceDigest);
        if (phase === 'create-and-load') {
          records = await produceBatch(jobs, [], '', async job=>{
            const result = await page.evaluate(job=>window.__recordConsumer.production(job),job);
            assert.ok(result.ok,JSON.stringify(result));
            verifyCreatedRecord(job,result.record);
            parseRuntimeCharacterRecord(JSON.stringify(result.record));
            return result;
          });
          await writeJson(file,records);
          report.recordFileSha256 = sha(await fs.readFile(file));
        }
        // Both sessions consume the persisted JSON representation of signed records.
        const stored = await fs.readFile(file);
        assert.equal(sha(stored),report.recordFileSha256);
        records = JSON.parse(stored);
        const state = await consume(page, records);
        assert.equal(state.count,2);
        assert.ok(state.advancingFrames>0);
        assert.deepEqual([...state.errors,...errors,...state.batch.cleanupErrors],[]);
        assert.deepEqual(state.batch.items.map(x=>[x.status,x.recordSha256]),records.map(x=>['completed',x.integrity.recordSha256]));
        assert.equal(new Set(state.actors.map(actor=>actor.root)).size,2);
        assert.equal(new Set(state.actors.map(actor=>actor.vrm)).size,2);
        const ids = state.actors.map(actor=>[actor.root,actor.vrm]);
        if (firstIds) assert.ok(ids.flat().every(id=>!firstIds.flat().includes(id)));
        firstIds = ids;
        session.advancingFrames = state.advancingFrames;
        session.records = state.actors.map((actor,index)=>{
          const record=records[index], bodyType=jobs[index].bodyType, pin=pins.get(bodyType);
          assert.deepEqual([actor.id,actor.revision,actor.recordSha256],[record.identity.id,record.revision,record.integrity.recordSha256]);
          assert.equal(actor.bodySha256,pin.sha256);
          assert.equal(record.appearanceRecipe.base.sha256,pin.sha256);
          for (const field of ['identity','appearanceRecipe','resourceIdentities','liveAccessories','equipmentMaterials'])
            assert.deepEqual(actor.captured[field],record[field],field);
          const gear = Object.values(record.appearanceRecipe.equipment.resources);
          assert.equal(gear.length,3);
          assert.deepEqual(actor.visibleEquipment,gear.map(item=>item.id).sort());
          for (const item of gear) assert.equal(item.sha256,pin.files[item.id+'.glb']);
          assert.equal(actor.coverage.covered,true);
          assert.equal(actor.coverage.maskedPngSha256,pin.maskedPngSha256);
          for (const name of Object.keys(pin.files)) {
            const rows = session.resources.filter(row=>row.path===`/assets/${bodyType}/${name}`);
            assert.ok(rows.length && rows.every(row=>row.status===200),`Missing HTTP 200 for ${bodyType}/${name}`);
          }
          return {id:actor.id,revision:actor.revision,recordSha256:actor.recordSha256,bodyType,bodySha256:actor.bodySha256,
            coverageSha256:pin.coverageSha256,maskSha256:actor.coverage.maskedPngSha256,
            equipment:gear.map(({id,slot,sha256})=>({id,slot,sha256})),lookReadbackEqual:true};
        });
        if (saved) {
          assert.deepEqual(session.records,saved.sessions.at(-1).records);
          report.preview = await recordDressedIdle(page,out);
          assert.deepEqual(errors,[]);
        }
      } finally {
        await browser.close();
        session.closed = true;
      }
    }
    report.status = 'technical-pass';
  } catch (error) {
    report.failure = String(error.stack ?? error);
    throw error;
  } finally {
    await writeJson(path.join(out,'report.json'),report);
  }
}

main().catch(error=>{console.error(error);process.exitCode=1;});
