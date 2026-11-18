// Run with run-fixed-check.cjs, a CLI-produced fitted record and its legacy body fixture.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require('../prototype/node_modules/playwright');

async function main() {
  const [base, fittedFile, legacyFile, folder] = process.argv.slice(2);
  const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
  const fitted = await read(fittedFile);
  const legacy = await read(legacyFile);
  const bodyType = fitted.appearanceRecipe.base.bodyType;
  assert.equal(legacy.appearanceRecipe.base.bodyType, bodyType);
  assert.equal(legacy.nativeHairCenter, undefined);
  assert.ok(fitted.nativeHairCenter?.fitSha256);
  const {canonicalJson, sha256Hex} = await import('../prototype/src/character-record.js');
  await fs.mkdir(folder);
  const browser = await chromium.launch({channel:'chrome', headless:true});
  const errors = [];
  const report = {status:'incomplete', checks:[], errors};
  let page;
  async function open() {
    page = await browser.newPage({viewport:{width:1280,height:800}});
    page.on('pageerror', e => errors.push(e.message));
    const url = new URL(base);
    url.searchParams.set('workbench', 'appearance');
    url.searchParams.set('body', bodyType);
    await page.goto(url.href);
    await page.waitForFunction(() => window.__debug?.ready, null, {timeout:100000});
    report.build = await page.evaluate(() => __debug.buildInfo.shortId);
  }
  const state = () => page.evaluate(() => {
    const a = __debug.avatar();
    return {actor:a.root.uuid, activeFit:a.nativeHairCenterFit ?? null, pin:a.nativeHairCenter ?? null};
  });
  const restore = record => page.evaluate(record => __debug.restoreCharacterRecord(record), record);
  try {
    await open();
    assert.equal((await state()).activeFit,null);
    assert.equal((await restore(fitted)).applied,true);
    const live = await state();
    assert.deepEqual(live.pin,fitted.nativeHairCenter);
    assert.equal(live.activeFit,live.pin.id);
    const saved = await page.evaluate(identity => __debug.captureCharacterRecord({identity}), fitted.identity);
    assert.deepEqual(saved.nativeHairCenter,live.pin);
    await fs.writeFile(path.join(folder,'captured.json'),JSON.stringify(saved,null,2));
    assert.equal((await restore(saved)).applied,true);
    assert.deepEqual(await state(),live);
    report.checks.push('same body switched from source dynamics to saved fit; repeat retained actor');
    const wrong = structuredClone(saved);
    wrong.nativeHairCenter.fitSha256 = '0'.repeat(64);
    for (const row of wrong.resourceIdentities) {
      if (row.sha256 === live.pin.fitSha256) row.sha256 = wrong.nativeHairCenter.fitSha256;
    }
    delete wrong.integrity.recordSha256;
    wrong.integrity.recordSha256 = await sha256Hex(canonicalJson(wrong));
    const rejected = await restore(wrong).catch(error => ({applied:false,reason:error.message}));
    assert.equal(rejected.applied,false);
    assert.deepEqual(await state(),live);
    report.rejected = rejected;
    report.checks.push('unknown fit hash in rehashed record retained live actor and fit');
    await page.close();
    await open();
    assert.equal((await restore(saved)).applied,true);
    assert.deepEqual((await state()).pin,live.pin);
    report.checks.push('fresh page restored fitted record without a preview switch');
    const beforeLegacy = await state();
    assert.equal((await restore(legacy)).applied,true);
    const afterLegacy = await state();
    assert.equal(afterLegacy.pin,null);
    assert.equal(afterLegacy.activeFit,null);
    assert.notEqual(afterLegacy.actor,beforeLegacy.actor);
    report.checks.push('restoring original record removed fitted dynamics on same body');
    assert.deepEqual(errors,[]);
    report.status = 'passed';
  } catch (error) {
    report.failure = String(error.stack || error);
    throw error;
  } finally {
    await browser.close();
    await fs.writeFile(path.join(folder,'report.json'),JSON.stringify(report,null,2));
  }
}
main().catch(error => { console.error(error); process.exitCode=1; });
