// Read the two shoe/leg surfaces from the room renderer with one fixed inspection camera.
const {chromium} = require('../prototype/node_modules/playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const [base, recordFile, out] = process.argv.slice(2);

(async () => {
  const record = JSON.parse(await fs.readFile(recordFile, 'utf8'));
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    await fs.mkdir(out);
    const page = await browser.newPage({viewport:{width:1440,height:1000}});
    await page.goto(base+'?body=native-male-7586-v1&workbench=appearance&view=inspect-full-side');
    await page.waitForFunction(() => window.__debug?.ready);
    assert.ok((await page.evaluate(r => __debug.restoreCharacterRecord(r), record)).applied);
    await page.evaluate(() => __debug.setPaused(true));
    const report = {build:await page.evaluate(() => __debug.buildInfo.shortId), looks:[]};
    for (const [index, name] of [[1,'socks'],[0,'original']]) {
      await page.evaluate(i => __debug.setOutfit(i), index);
      await page.waitForFunction(visible =>
        __debug.avatar().getOutfitInfo().equipment.items.socks.visible === visible, index === 1);
      const sample = await page.evaluate(() => {
        const {renderer,scene} = __debug;
        const actor = __debug.avatar();
        const camera = __debug.cameraObject().clone();
        const ankle = actor.vrm.humanoid.getRawBoneNode('leftFoot');
        const center = ankle.getWorldPosition(camera.position.clone());
        center.y += 0.075;
        const direction = actor.root.position.clone().set(1,0.12,0.15).applyAxisAngle(
          camera.up,actor.root.rotation.y);
        camera.position.copy(center).addScaledVector(direction,0.72);
        camera.lookAt(center);camera.updateMatrixWorld(true);
        renderer.render(scene,camera);
        return {frame:renderer.domElement.toDataURL('image/png'),body:actor.profile.sha256,
                center:center.toArray(),camera:camera.position.toArray()};
      });
      const {frame,...geometry} = sample;
      await fs.writeFile(path.join(out,name+'.png'), Buffer.from(frame.split(',')[1],'base64'));
      report.looks.push({name,...geometry});
    }
    assert.deepEqual(report.looks[0].camera,report.looks[1].camera);
    assert.deepEqual(report.looks[0].center,report.looks[1].center);
    await fs.writeFile(path.join(out,'inspection.json'),JSON.stringify(report,null,2)+'\n');
  } finally {
    await browser.close();
  }
})().catch(e => {console.error(e);process.exitCode=1;});
