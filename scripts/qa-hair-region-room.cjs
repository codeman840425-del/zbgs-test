// Exercise the two selected styles through the workbench, on a fixed build.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {projectOutput, productionRoot} = require('./project-output.cjs');
const {verifyCandidate} = require('./qa-m1-common.cjs');
const {launchQABrowser} = require('./qa-browser-workspace.cjs');

const original = 'female-ponytail-v1';
const colorway = 'female-ponytail-mauve-rose-v1';
const body = '027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95';
const sharedGlb = '1b785f9d54107818cee39eda2de7263ad0720ce90968fbaa7cc32c2465e3c385';
const cameras = ['inspect-half-back', 'inspect-half-side', 'room'];

async function readHair(page) {
  return page.evaluate(() => {
    const avatar = __debug.avatar();
    const meshes = [];
    avatar.root.traverseVisible(node => {
      if (!node.isMesh || node.userData.assetRole !== 'hair') return;
      const colors = node.geometry.getAttribute('color');
      let colored = 0;
      if (colors) for (let i = 0; i < colors.count; i++) {
        if ([colors.getX(i), colors.getY(i), colors.getZ(i)].some(v => v !== 1)) colored++;
      }
      const materials = [].concat(node.material);
      meshes.push({name:node.name, vertices:node.geometry.getAttribute('position').count,
        colored, attributes:colors?.count ?? 0,
        mtoonColors:materials.some(m => m.isMToonMaterial && m.vertexColors && !m.ignoreVertexColor)});
    });
    const s = avatar.appearance.getState();
    return {style:s.effectiveHairStyle, global:s.hairColor, glb:s.replacementSHA256, meshes};
  });
}

async function select(page, selector, value) {
  await page.selectOption(selector,value);
  await page.waitForFunction(() => document.querySelector('#appearance-form')?.getAttribute('aria-busy') !== 'true');
}

async function inspect(page, style) {
  await select(page, '#appearance-hair-style', style);
  await page.waitForFunction(want => __debug.avatar().appearance.getState().effectiveHairStyle === want, style);
  const seen = await readHair(page);
  assert.equal(seen.glb, sharedGlb);
  assert.equal(seen.global, 'blonde');
  assert(seen.meshes.some(mesh => mesh.vertices === 609));
  if (style === colorway)
    assert(seen.meshes.some(mesh => mesh.colored === 305 && mesh.attributes === 609 && mesh.mtoonColors));
  else assert(seen.meshes.every(mesh => !mesh.colored));
  return seen;
}

async function task(page, command) {
  const request = await page.evaluate(command);
  const id = request?.task?.requestId;
  assert.ok(id,JSON.stringify(request));
  await page.waitForFunction(id => ['completed','failed','cancelled'].includes(__debug.tasks().get(id)?.state),
    id,{timeout:45000});
  const result = await page.evaluate(id => __debug.tasks().get(id),id);
  assert.equal(result.state,'completed',JSON.stringify(result));
  return {id,state:result.state};
}

async function run() {
  const [base, build, destination] = process.argv.slice(2);
  const out = await projectOutput(destination,await productionRoot());
  await fs.mkdir(out);
  const session = await launchQABrowser(out,{channel:'chrome'});
  const report = {build,body,scope:'One original female, same blonde base and ponytail; development Chrome.',
    looks:{},errors:[],tasks:[]};
  const url = new URL('?body=female&workbench=appearance',base).href;
  try {
    const context = await session.browser.newContext({viewport:{width:1440,height:900},
      recordVideo:{dir:out,size:{width:1440,height:900}}});
    const p = await context.newPage();
    p.on('pageerror',e => report.errors.push(String(e)));
    await p.goto(url);
    await p.waitForFunction(() => window.__debug?.ready,null,{timeout:60000});
    report.identity = await verifyCandidate(p,{build,sha256:body,assetId:'beta-base-female-m1'});
    await select(p,'#appearance-hair-color','blonde');
    await p.evaluate(() => __debug.setPaused(true));
    for (const [label,style] of [['base',original],['region',colorway],['base-restored',original]]) {
      report.looks[label] = await inspect(p,style);
      for (const camera of cameras) {
        await p.evaluate(camera => __debug.camera(camera),camera);
        await p.waitForTimeout(450);
        await p.locator('.viewport').screenshot({path:path.join(out,label+'-'+camera+'.png')});
      }
    }
    assert.deepEqual(report.looks.base,report.looks['base-restored']);
    await inspect(p,colorway);
    const recipe = await p.evaluate(() => __debug.exportAppearanceRecipe());
    await fs.writeFile(path.join(out,'recipe.json'),recipe);
    await p.evaluate(() => {__debug.setPaused(false); __debug.setSpeed(1.05);});
    report.tasks.push(await task(p,() => __debug.walkTo(-1.4,-0.6)));
    await p.evaluate(() => __debug.camera('inspect-half-side'));
    report.tasks.push(await task(p,() => __debug.action('sit')));
    await p.waitForTimeout(800);
    report.tasks.push(await task(p,() => __debug.action('stand')));
    const video = p.video();
    await context.close();
    await video.saveAs(path.join(out,'normal1x.webm'));
    await video.delete();
    const cold = await session.browser.newContext({viewport:{width:1440,height:900}});
    const q = await cold.newPage();
    q.on('pageerror',e => report.errors.push(String(e)));
    await q.goto(url);
    await q.waitForFunction(() => window.__debug?.ready,null,{timeout:60000});
    const prior = await q.evaluate(() => __debug.exportAppearanceRecipe());
    const maskUrl = '**/m2-hair-region-v1/mask.rg8';
    let deniedRequests = 0;
    await q.route(maskUrl,route => {deniedRequests++; return route.fulfill({status:503,body:'QA missing region mask'});});
    const failed = await q.evaluate(async recipe => {
      try {return await __debug.importAppearanceRecipe(recipe);} catch (e) {return {applied:false,reason:String(e)};}
    },recipe);
    assert.equal(failed.applied,false);
    assert(deniedRequests>0,'Missing-mask probe did not reach the asset');
    assert.equal(await q.evaluate(() => __debug.exportAppearanceRecipe()),prior);
    await q.unroute(maskUrl);
    assert((await q.evaluate(recipe => __debug.importAppearanceRecipe(recipe),recipe)).applied);
    assert.equal(await q.evaluate(() => __debug.exportAppearanceRecipe()),recipe);
    report.cold = {failure:failed,deniedRequests,restored:await readHair(q)};
    assert.deepEqual(report.cold.restored,report.looks.region);
    await cold.close();
    assert.deepEqual(report.errors,[]);
    report.status='game-checks-passed';
  } catch (e) {
    report.status='failed';
    report.reason=String(e.stack ?? e);
    throw e;
  } finally {
    await session.close();
    await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  }
}
run().catch(e => {console.error(e);process.exitCode=1;});
