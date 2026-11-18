// run-fixed-check.cjs DIST scripts/qa-native-skin-tone-room.cjs BUILD_ID NEW_FOLDER GREEN_RECORD...
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const {chromium} = require('../prototype/node_modules/playwright');
const {recordSpeech} = require('./qa-native-surface-room.cjs');
const {collectNativeSurfaceRuntimeMaterials} = require('./native-surface-runtime-materials.cjs');

const tone = 'native-warm-v1';
const restore = (page, record) => page.evaluate(r => __debug.restoreCharacterRecord(r), record);
const capture = (page, previous) => page.evaluate(r => __debug.captureCharacterRecord({previous:r,expectedRevision:r.revision}), previous);

async function state(page, mode) {
  await page.evaluate(m => __debug.setBodyMode(m), mode);
  const value = await page.evaluate(collectNativeSurfaceRuntimeMaterials, {sampleBodyAlpha:true});
  assert.equal(value.bodyMode, mode);
  const maps = {};
  for (const m of value.materials.filter(m => !m.outline)) {
    maps[m.role + '/' + m.name] = [m.maps.map, m.maps.shadeMultiplyTexture];
  }
  assert.ok(value.coverage.alphaPixels.alphaSha256);
  return {maps,alpha:value.coverage.alphaPixels.alphaSha256,visible:value.coverage.visibleEquipment,
    allocation:value.textureEstimate,renderer:value.rendererReadback};
}

function compareModes(before, after) {
  assert.deepEqual(Object.keys(after.maps).sort(),Object.keys(before.maps).sort());
  assert.equal(before.alpha,after.alpha);
  assert.deepEqual(before.visible,after.visible);
  const changedRoles = new Set();
  for (const [key, original] of Object.entries(before.maps)) {
    const role = key.split('/')[0];
    if (['body','faceSkin','eyeline'].includes(role)) {
      for (const [slot, uuid] of original.entries()) {
        assert.ok(uuid && after.maps[key][slot] && uuid !== after.maps[key][slot],key);
      }
      changedRoles.add(role);
    } else assert.deepEqual(after.maps[key],original,key);
  }
  assert.deepEqual([...changedRoles].sort(),['body','eyeline','faceSkin']);
  for (const role of ['iris','eyeWhite','mouth']) assert(Object.keys(after.maps).some(k=>k.startsWith(role+'/')),role);
}

async function run(base, build, out, records) {
  assert.ok(records.length);
  const {canonicalJson} = await import('../prototype/src/character-record.js');
  const report={build,cases:[],errors:[]};
  await fs.mkdir(out);
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    report.browser=browser.version();
    for (const file of records) {
      const previous=JSON.parse(await fs.readFile(file,'utf8'));
      const body=previous.appearanceRecipe.base.bodyType;
      const folder=path.join(out,body);
      await fs.mkdir(folder);
      const url=new URL(base);
      url.search=new URLSearchParams({workbench:'appearance',body,view:'inspect-half-front'});
      const open=async()=>{
        const page=await browser.newPage({viewport:{width:1440,height:960}});
        page.on('pageerror',e=>report.errors.push(e.message));
        await page.goto(url.href);
        await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:90000});
        assert.equal(await page.evaluate(()=>__debug.buildInfo.shortId),build);
        return page;
      };
      let page=await open();
      const row={body,input:file,states:{}};
      report.cases.push(row);
      try {
        assert.equal((await restore(page,previous)).applied,true);
        await page.evaluate(()=>__debug.camera('inspect-half-front'));
        await page.waitForTimeout(650);
        await page.evaluate(()=>__debug.setPaused(true));
        const snap=async(name)=>page.locator('#stage canvas').first().screenshot({path:path.join(folder,name+'.png')});
        row.states.originalBase=await state(page,'base');
        row.states.originalDressed=await state(page,'dressed');
        await snap('original-dressed');
        await page.locator('#appearance-skin-tone').selectOption(tone);
        await page.waitForFunction(t=>__debug.avatar().appearance.getState().skinTone===t,tone);
        row.states.warmDressed=await state(page,'dressed');
        await snap('warm-dressed');
        row.states.warmBase=await state(page,'base');
        compareModes(row.states.originalBase,row.states.warmBase);
        compareModes(row.states.originalDressed,row.states.warmDressed);
        assert.notEqual(row.states.warmBase.alpha,row.states.warmDressed.alpha);
        const redressed=await state(page,'dressed');
        assert.deepEqual(redressed.maps,row.states.warmDressed.maps);
        const warm=await capture(page,previous);
        assert.equal(warm.identity.id,previous.identity.id);
        assert.equal(warm.appearanceRecipe.appearance.eyeColor,previous.appearanceRecipe.appearance.eyeColor);
        assert.equal(warm.appearanceRecipe.appearance.skinTone,tone);
        assert.match(warm.appearanceRecipe.skinToneManifestSha256,/^[a-f0-9]{64}$/);
        await fs.writeFile(path.join(folder,'warm.json'),JSON.stringify(warm,null,2));
        await page.locator('#appearance-skin-tone').selectOption('original');
        await page.waitForFunction(()=>__debug.avatar().appearance.getState().skinTone==='original');
        assert.deepEqual((await state(page,'dressed')).maps,row.states.originalDressed.maps);
        await page.close();
        page=await open();
        assert.equal((await restore(page,previous)).applied,true);
        const owner=await page.evaluate(()=>__debug.avatar().root.uuid);
        const block=url=>url.pathname.includes('/native-skin-tone-package-v1/') && url.pathname.endsWith('.png');
        let rejectedPng=0;
        await page.route(block,route=>{rejectedPng++;return route.fulfill({status:503});});
        const failed=await restore(page,warm).catch(e=>({applied:false,reason:e.message}));
        assert.equal(failed.applied,false);assert.ok(rejectedPng);
        assert.equal(await page.evaluate(()=>__debug.avatar().root.uuid),owner);
        assert.equal(canonicalJson((await capture(page,previous)).appearanceRecipe),canonicalJson(previous.appearanceRecipe));
        await page.unroute(block);
        assert.equal((await restore(page,warm)).applied,true);
        const restored=await capture(page,warm);
        for (const k of ['appearanceRecipe','nativeHairCenter','liveAccessories','equipmentMaterials','resourceIdentities'])
          assert.equal(canonicalJson(restored[k]),canonicalJson(warm[k]),k);
        await recordSpeech(page,path.join(folder,'warm-speech-1x.webm'));
        Object.assign(row,{rejectedPng,failed,restoredSha256:warm.integrity.recordSha256});
      } finally {await page.close();}
    }
    assert.deepEqual(report.errors,[]);
    report.status='technical-pass';
  } catch(error){report.failure=String(error.stack||error);throw error;}
  finally{await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
}

const [base,build,out,...records]=process.argv.slice(2);
run(base,build,out,records).catch(error=>{console.error(error);process.exitCode=1;});
