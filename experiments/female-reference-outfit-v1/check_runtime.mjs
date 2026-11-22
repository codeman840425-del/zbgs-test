import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from '../../prototype/node_modules/playwright/index.mjs';

const base = process.argv[2];
const out = path.resolve(process.env.REFERENCE_OUTFIT_OUTPUT || '../evidence/female-reference-outfit-v1/runtime-check');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const report = { base, checks: [], errors: [], screenshots: [] };
page.on('pageerror', error => report.errors.push(String(error)));
try {
  await page.goto(base + '?body=female&workbench=appearance');
  await page.waitForFunction(() => window.__debug?.ready && !document.querySelector('#appearance-fields')?.disabled, null, { timeout: 60000 });
  const before = await page.evaluate(() => ({ build: __debug.buildInfo, outfit: __debug.snapshot().outfit, state: __debug.avatar().getEquipmentRecipe(0) }));
  await page.screenshot({ path: path.join(out, 'before.png') });
  const result = await page.evaluate(async () => {
    const response = await __debug.command({ type: 'outfit', value: 8, requestId: 'female-reference-outfit-check' });
    await new Promise(resolve => setTimeout(resolve, 1600));
    const avatar = __debug.avatar();
    const info = avatar.vrm.scene ? avatar.vrm.scene : null;
    const entries = avatar.getEquipmentRecipe(8);
    const materialStates = {};
    for (const role of ['referenceInner', 'referenceOuter', 'referencePants', 'referenceShoes']) {
      const id = entries[role].id;
      materialStates[role] = avatar.getMaterialRecipeState(id);
    }
    return { response, snapshot: __debug.snapshot(), entries, materialStates };
  });
  await page.screenshot({ path: path.join(out, 'reference-outfit.png') });
  await page.evaluate(() => __debug.view('front'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, 'reference-outfit-front.png') });
  await page.evaluate(() => __debug.view('side'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, 'reference-outfit-side.png') });
  console.log(JSON.stringify({ response: result.response, outfit: result.snapshot.outfit, materialStates: result.materialStates }, null, 2));
  assert.equal(result.snapshot.outfit, 8);
  for (const role of ['referenceInner', 'referenceOuter', 'referencePants', 'referenceShoes']) {
    assert.equal(result.materialStates[role].active.recipeId, result.entries[role].materialRecipes[0].id);
  }
  report.checks.push({ name: 'reference outfit loads as one four-slot composition and applies pinned recipes', passed: true, result });
  const restore = await page.evaluate(() => __debug.command({ type: 'outfit', value: 0, requestId: 'female-reference-outfit-restore' }));
  await page.waitForFunction(() => __debug.snapshot().outfit === 0, null, { timeout: 10000 });
  report.checks.push({ name: 'return to original outfit restores slot selection', passed: true, result: restore });
  report.screenshots.push('before.png', 'reference-outfit.png', 'reference-outfit-front.png', 'reference-outfit-side.png');
  report.build = before.build;
} finally {
  await context.close();
  await browser.close();
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ build: report.build, checks: report.checks.map(check => check.name), errors: report.errors, screenshots: report.screenshots }, null, 2));
