// node scripts/run-fixed-check.cjs DIST scripts/qa-native-surface-room.cjs BUILD_FILE NEW_FOLDER RECORD...
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('../prototype/node_modules/playwright');
const { collectNativeSurfaceRuntimeMaterials } = require('./native-surface-runtime-materials.cjs');

async function rendered(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function recordSpeech(page, file) {
  const bytes = await page.evaluate(async () => {
    const stream = __debug.renderer.domElement.captureStream(30);
    const recorder = new MediaRecorder(stream, {mimeType:'video/webm;codecs=vp9', videoBitsPerSecond:4500000});
    const chunks = [];
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise(resolve => recorder.onstop = resolve);
    const delay = ms => new Promise(resolve => setTimeout(resolve,ms));
    try {
      __debug.setPlaybackRate(1);
      __debug.setPaused(false);
      __debug.camera('inspect-face-front');
      recorder.start();
      await delay(450);
      __debug.command({type:'speaking',value:true});
      await delay(3200);
      __debug.command({type:'speaking',value:false});
      __debug.command({type:'expression',name:'happy'});
      await delay(1100);
      __debug.command({type:'expression',name:'neutral'});
      __debug.camera('inspect-half-back');
      await delay(1300);
      recorder.stop();
      await done;
      const blob = new Blob(chunks,{type:'video/webm'});
      return await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(blob);
      });
    } finally { stream.getTracks().forEach(track => track.stop()); }
  });
  await fs.writeFile(file,Buffer.from(bytes,'base64'));
}

async function collect(page, base, out, sourceRecord, build) {
  const record = JSON.parse(await fs.readFile(sourceRecord,'utf8'));
  const {bodyType,sha256:bodySha256} = record.appearanceRecipe.base;
  const url = new URL(base);
  url.searchParams.set('workbench','appearance');
  url.searchParams.set('body',bodyType);
  await page.goto(url.href);
  await page.waitForFunction(() => window.__debug?.ready,null,{timeout:90000});
  assert.equal(await page.evaluate(() => __debug.buildInfo.sourceDigest),build.sourceDigest);
  const loaded = await page.evaluate(r => __debug.restoreCharacterRecord(r),record);
  assert.equal(loaded.applied,true,JSON.stringify(loaded));
  assert.equal(loaded.recordSha256,record.integrity.recordSha256);
  const row = {sourceRecord,bodyType,bodySha256,recordSha256:record.integrity.recordSha256,
    restoredSha256:loaded.recordSha256,states:{},views:{},video:bodyType+'/speech-1x.webm'};
  await fs.mkdir(path.join(out,bodyType));
  const shot = async name => {
    const file = bodyType+'/'+name+'.png';
    await rendered(page);
    await page.locator('#stage canvas').first().screenshot({path:path.join(out,file)});
    row.views[name] = file;
  };
  for (const [state,mode] of [['dressed','dressed'],['base','base'],['redressed','dressed']]) {
    await page.evaluate(mode => __debug.setBodyMode(mode),mode);
    await rendered(page);
    row.states[state] = await page.evaluate(collectNativeSurfaceRuntimeMaterials,{sampleBodyAlpha:true});
  }
  await page.evaluate(() => __debug.camera('room'));
  await page.waitForTimeout(550);
  await shot('room');
  await page.evaluate(() => __debug.camera('inspect-face-front'));
  await page.waitForTimeout(250);
  await page.evaluate(() => { __debug.command({type:'expression',name:'aa'}); });
  await page.waitForFunction(() => __debug.avatar().vrm.expressionManager.getValue('aa') > .6);
  await shot('mouth');
  await page.evaluate(() => __debug.command({type:'expression',name:'neutral'}));
  await page.waitForFunction(() => __debug.avatar().vrm.expressionManager.getValue('aa') < .01 &&
    __debug.avatar().vrm.expressionManager.getValue('blink') < .02);
  await page.evaluate(() => __debug.setPaused(true));
  await shot('neutral');
  // Single variable test at the same paused pose. Restore scene lights before the real-time film.
  row.lighting = await page.evaluate(() => {
    const lights = __debug.scene.children.filter(o => o.isLight);
    const saved = lights.map(l => ({uuid:l.uuid,type:l.type,intensity:l.intensity}));
    for (const light of lights) light.intensity *= .5;
    return saved;
  });
  await shot('half-light-diagnostic');
  await page.evaluate(saved => {
    for (const {uuid,intensity} of saved) __debug.scene.getObjectByProperty('uuid',uuid).intensity=intensity;
  },row.lighting);
  await shot('restored-light');
  await page.evaluate(() => __debug.camera('inspect-half-back'));
  await shot('back');
  await recordSpeech(page,path.join(out,row.video));
  return row;
}
async function main() {
  const [base, buildFile, out, ...records] = process.argv.slice(2);
  assert.ok(records.length && out);
  const {shortId,sourceDigest} = JSON.parse(await fs.readFile(buildFile,'utf8'));
  const report = {schema:'native-surface-room-capture-v1',build:{shortId,sourceDigest},cases:[],errors:[]};
  await fs.mkdir(out);
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    report.browser=browser.version();
    for (const record of records) {
      const page = await browser.newPage({viewport:{width:1440,height:960}});
      page.on('pageerror',e => report.errors.push(e.message));
      try { report.cases.push(await collect(page,base,out,record,report.build)); }
      finally { await page.close(); }
    }
    assert.deepEqual(report.errors,[]);
  } catch (error) { report.failure=String(error.stack||error); throw error; }
  finally {
    await browser.close();
    await fs.writeFile(path.join(out,'capture.json'),JSON.stringify(report,null,2));
  }
}
module.exports = {recordSpeech};
if (require.main === module) main().catch(error => {console.error(error);process.exitCode=1;});
