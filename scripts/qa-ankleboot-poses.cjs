// Examine the same signed outfit and game actions as the uninterrupted room film.
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const {productionRoot, projectOutput} = require('./project-output.cjs');
const {launchQABrowser} = require('./qa-browser-workspace.cjs');
const {installAnkleBootProbe, sampleAnkleBootVisibility} = require('./qa-ankleboot-visible.cjs');
const hash = data => createHash('sha256').update(data).digest('hex');

async function run(base, digest, recordPath, casePath, directory) {
  const out = await projectOutput(directory, await productionRoot());
  assert.match(digest, /^[a-f0-9]{64}$/);
  const fit = JSON.parse(await fs.readFile(casePath, 'utf8'));
  const bytes = await fs.readFile(recordPath);
  const record = JSON.parse(bytes.toString('utf8'));
  const {base:body, equipment} = record.appearanceRecipe;
  assert.equal(body.sha256, fit.bodySha256);
  assert.equal(equipment.role, fit.role);
  const shoe = equipment.resources[fit.equipmentRole];
  assert.equal(shoe.id, fit.id);
  assert.equal(shoe.sha256, fit.sha256);
  await fs.mkdir(out, {recursive:false});
  const report = {status:'incomplete', sourceDigest:digest, recordSha256:record.integrity.recordSha256,
    inputFileSha256:hash(bytes), shoe:fit, poses:[], errors:[],
    method:'Paused diagnostic snapshots of the real room simulation advanced at 120 Hz. See the separate 1x movie for continuous motion.'};
  let session;
  try {
    session = await launchQABrowser(out, {channel:'chrome'});
    const page = await session.browser.newPage({viewport:{width:1600,height:1000}});
    page.on('pageerror', err => report.errors.push(String(err)));
    await installAnkleBootProbe(page);
    const url = new URL(base);
    url.searchParams.set('workbench','appearance');
    url.searchParams.set('body',body.bodyType);
    await page.goto(url.href);
    await page.waitForFunction(()=>window.__debug?.ready, null, {timeout:90000});
    const build = await page.evaluate(()=>__debug.buildInfo);
    assert.equal(build.sourceDigest, digest);
    assert.equal(build.development, false);
    report.build = build.shortId;
    const receipt = await page.evaluate(r=>__debug.restoreCharacterRecord(r),record);
    assert.equal(receipt.applied, true);
    assert.equal(receipt.recordSha256, report.recordSha256);
    await page.evaluate(()=>{
      __debug.reset();
      __debug.setSpeed(.85);
      __debug.setPlaybackRate(1);
      __debug.setHelpers(false);
      __debug.camera('room');
    });
    await page.waitForFunction(()=>__debug.snapshot().camera.mode==='room' && __debug.snapshot().simulationTime>.75);
    await page.evaluate(()=>__debug.setPaused(true));
    const request = async(kind, payload={}) => {
      const id = 'cuff-'+kind;
      const response = await page.evaluate(r=>__debug.request(r), {requestId:id,kind,payload});
      assert.equal(response.admission,'accepted',JSON.stringify(response));
      return id;
    };
    async function seek(condition,id) {
      await page.evaluate(({condition,id})=>{
        for(let i=0;i<600;i++) {
          const s=__debug.snapshot(), task=__debug.tasks().get(id);
          if(task && ['cancelled','failed'].includes(task.state))throw Error(JSON.stringify(task));
          if(condition==='complete' && task?.state==='completed')return;
          if(condition==='stride' && s.speed>.6 && s.motion.gait>.65)return;
          if(condition==='half-seat' && s.motion.sitProgress>.4 && s.motion.sitProgress<.6)return;
          __debug.advance(1/30);
        }
        throw Error('Pose unavailable within 20 simulation seconds: '+condition+' / '+id);
      },{condition,id});
    }
    async function capture(pose) {
      const state = await page.evaluate(()=>{
        const s=__debug.snapshot();
        return {time:s.simulationTime,mode:s.mode,phase:s.phase,speed:s.speed,sit:s.motion.sitProgress,
          yaw:s.facing,root:s.position,paused:s.paused,outfit:s.outfit};
      });
      assert.equal(state.paused,true);
      assert.equal(state.outfit,fit.outfitIndex);
      const row={pose,state,views:{}};
      report.poses.push(row);
      for(const cameraView of ['room','feet-close']){
        const result = await page.evaluate(sampleAnkleBootVisibility,
          {cameraView,shoeId:shoe.id,expectedShoeSha256:shoe.sha256});
        const imageFiles = {};
        for(const key of ['normal','mask']){
          const data=Buffer.from(result.images[key],'base64');
          assert.equal(data.subarray(1,4).toString('ascii'),'PNG');
          const file=pose+'-'+cameraView+'-'+key+'.png';
          await fs.writeFile(path.join(out,file),data,{flag:'wx'});
          imageFiles[key]={file,bytes:data.length,sha256:hash(data)};
        }
        delete result.images;
        row.views[cameraView]={...result,imageFiles};
      }
      assert.equal(await page.evaluate(()=>__debug.snapshot().simulationTime),state.time);
    }
    await capture('standing');
    const walk=await request('walk',{x:-.5,z:1.8});
    await seek('stride',walk);
    await capture('walk');
    await page.evaluate(()=>__debug.advance(.30));
    await capture('walk-later');
    await seek('complete',walk);
    const seat=await request('sit',{usePointId:'room-chair-1'});
    await seek('half-seat',seat);
    await capture('sitting-down');
    await seek('complete',seat);
    await page.evaluate(()=>__debug.advance(.5));
    await capture('seated');
    const rise=await request('stand');
    await seek('half-seat',rise);
    await capture('rising');
    await seek('complete',rise);
    assert.deepEqual(report.errors,[]);
    report.status='sampled';
  } catch(error) {
    report.failure=String(error.stack || error);
    throw error;
  } finally {
    try { await session?.close(); }
    finally { await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'}); }
  }
}

run(...process.argv.slice(2)).catch(error=>{console.error(error);process.exitCode=1;});
