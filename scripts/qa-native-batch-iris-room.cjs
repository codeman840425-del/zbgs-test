// A/B on the same record, pose, lights and camera, plus a cold failed-asset restore.
const path = require('node:path');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const {chromium} = require('../prototype/node_modules/playwright');
const {recordSpeech} = require('./qa-native-surface-room.cjs');

async function main() {
  const [base, build, out, ...files] = process.argv.slice(2);
  const {canonicalJson} = await import('../prototype/src/character-record.js');
  assert.ok(files.length);
  await fs.mkdir(out);
  const report = {build,cases:[],errors:[]};
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    for (const file of files) {
      const old = JSON.parse(await fs.readFile(file,'utf8'));
      const body = old.appearanceRecipe.base.bodyType;
      const url = new URL(base);
      url.searchParams.set('workbench','appearance');
      url.searchParams.set('body',body);
      url.searchParams.set('view','inspect-face-front');
      const folder = path.join(out,body);
      await fs.mkdir(folder);
      async function open() {
        const page = await browser.newPage({viewport:{width:1440,height:960}});
        page.on('pageerror',reason => report.errors.push(reason.message));
        await page.goto(url.href);
        await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:90000});
        assert.equal(await page.evaluate(()=>__debug.buildInfo.shortId),build);
        return page;
      }
      const restore = (page,record) => page.evaluate(r=>__debug.restoreCharacterRecord(r),record);
      const capture = (page,record) => page.evaluate(previous => __debug.captureCharacterRecord({
        previous,expectedRevision:previous.revision}),record);
      const eyes = page => page.evaluate(()=> {
        const mats = new Set();
        __debug.avatar().root.traverse(node => {
          if (node.isMesh) for(const m of [].concat(node.material)) if(/EyeIris/.test(m.name)&&!m.isOutline)mats.add(m);
        });
        return [...mats].map(m => ({name:m.name,map:m.map?.uuid,shade:m.shadeMultiplyTexture?.uuid}));
      });
      let page = await open();
      try {
        assert.equal((await restore(page,old)).applied,true);
        const read = await capture(page,old);
        assert.equal(canonicalJson(read.appearanceRecipe),canonicalJson(old.appearanceRecipe));
        await page.waitForFunction(()=>__debug.avatar().vrm.expressionManager.getValue('blink') < .01);
        await page.evaluate(()=>__debug.setPaused(true));
        const canvas = page.locator('#stage canvas').first();
        const original = await eyes(page);
        assert.ok(original.length && original.every(m=>m.map && m.shade));
        const eyeCenters = await page.evaluate(()=>['leftEye','rightEye'].map(name=>{
          const eye=__debug.avatar().vrm.humanoid.getRawBoneNode(name);
          const point=eye.getWorldPosition(eye.position.clone()).project(__debug.cameraObject());
          return {name,x:(1+point.x)/2,y:(1-point.y)/2};
        }));
        await canvas.screenshot({path:path.join(folder,'original.png')});
        await page.locator('#appearance-eye-color').selectOption('green');
        await page.waitForFunction(()=>__debug.avatar().appearance.getState().eyeColor==='green');
        const greenMaps = await eyes(page);
        assert.equal(greenMaps.length,original.length);
        greenMaps.forEach((m,i)=>{assert.notEqual(m.map,original[i].map);assert.notEqual(m.shade,original[i].shade);});
        await canvas.screenshot({path:path.join(folder,'green.png')});
        const green = await capture(page,old);
        assert.equal(green.identity.id,old.identity.id);
        assert.deepEqual(green.nativeHairCenter,old.nativeHairCenter);
        await fs.writeFile(path.join(folder,'green.json'),JSON.stringify(green,null,2));
        await page.close();
        page=await open();
        assert.equal((await restore(page,old)).applied,true);
        const current=await page.evaluate(()=>__debug.avatar().root.uuid);
        const filter='**/native-iris-palette-v1/iris-green.png';
        let hits=0;
        await page.route(filter,route=>{hits++;return route.fulfill({status:503,body:'fixture unavailable'});});
        const rejected=await restore(page,green).catch(e=>({applied:false,reason:e.message}));
        assert.equal(rejected.applied,false,JSON.stringify(rejected));
        assert.ok(hits);
        assert.equal(await page.evaluate(()=>__debug.avatar().root.uuid),current);
        const preserved = await capture(page,old);
        assert.equal(canonicalJson(preserved.appearanceRecipe),canonicalJson(old.appearanceRecipe));
        await page.unroute(filter);
        assert.equal((await restore(page,green)).applied,true);
        const recovered=await capture(page,green);
        for (const key of ['appearanceRecipe','nativeHairCenter','resourceIdentities','liveAccessories','equipmentMaterials'])
          assert.equal(canonicalJson(recovered[key]),canonicalJson(green[key]),key);
        await recordSpeech(page,path.join(folder,'green-speech-1x.webm'));
        report.cases.push({body,originalRecord:old.integrity.recordSha256,greenRecord:green.integrity.recordSha256,
          before:original,after:greenMaps,eyeCenters,rejected,missingRequests:hits,restored:true});
      } finally { await page.close(); }
    }
    assert.deepEqual(report.errors,[]);
    report.status='passed';
  } catch(error) {report.status='failed';report.reason=String(error.stack||error);throw error;}
  finally {await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
