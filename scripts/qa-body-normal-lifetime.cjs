// Check the actual WebGL handle while two existing game actors are removed in either order.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require('../prototype/node_modules/playwright');
const {PNG} = require('../prototype/node_modules/playwright-core/lib/utilsBundle.js');
const [base, recordsPath, build, mode, out] = process.argv.slice(2);

async function main() {
  assert.ok(['separate', 'shared'].includes(mode));
  const records = JSON.parse(await fs.readFile(recordsPath, 'utf8'));
  assert.equal(records.length, 2);
  await fs.mkdir(out, {recursive:false});
  const report = {build, mode, cases:[], errors:[]};
  const browser = await chromium.launch({channel:'chrome', headless:true});
  try {
    for (const remove of [0, 1]) {
      const page = await browser.newPage({viewport:{width:1440,height:1000}});
      page.on('pageerror', e => report.errors.push(e.message));
      await page.goto(base + 'record-consumer.html?production=1');
      await page.waitForFunction(() => window.__recordConsumer?.ready);
      const sample = await page.evaluate(async ({records, build, remove}) => {
        const d = window.__recordConsumer, renderer = d.renderer, gl = renderer.getContext();
        if (d.buildInfo.shortId !== build) throw Error('Wrong fixed build');
        const tick = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await tick();
        const baseline = renderer.info.memory.textures;
        // Hold the same pose regardless of which actor finishes its asynchronous load first.
        const set = d.actors.set, advance = new Map();
        d.actors.set = function(key, actor) {
          advance.set(key, actor.update.bind(actor));
          actor.update = () => {};
          return set.call(this, key, actor);
        };
        let camera;
        const render = renderer.render.bind(renderer);
        renderer.render = (scene, cam) => { if (scene === d.scene) camera = cam; return render(scene, cam); };
        const result = await d.selectGroup(0, records);
        if (!result.items.every(item => item.status === 'completed')) throw Error(JSON.stringify(result));
        await tick();
        const actors = records.map(record => d.actors.get(record.identity.id));
        for (let frame = 0; frame < 30; frame++) {
          for (const actor of actors) advance.get(actor.identity.id)(1 / 60, {action:'idle',speaking:true});
        }
        function draw() { render(d.scene, camera); return renderer.domElement.toDataURL('image/png'); }
        const pair = draw(), loaded = renderer.info.memory.textures;
        const textures = actors.map(actor => {
          const found = new Set();
          actor.avatar.root.traverseVisible(obj => {
            if (obj.isMesh) for (const mat of [].concat(obj.material))
              if (/_Body_\d+_SKIN/.test(mat.name) && mat.normalMap) found.add(mat.normalMap);
          });
          if (found.size !== 1) throw Error('Expected a single visible BodySkin normal per actor');
          return [...found][0];
        });
        const handles = textures.map(t => renderer.properties.get(t).__webglTexture);
        if (!handles.every(h => h && gl.isTexture(h))) throw Error('Body normals were not drawn');
        const survivor = actors[1-remove], departed = actors[remove];
        departed.avatar.root.visible = false;
        const before = draw();
        d.actors.delete(departed.identity.id); departed.dispose();
        const after = draw(), survivingHandle = renderer.properties.get(textures[1-remove]).__webglTexture;
        const survived = survivingHandle === handles[1-remove] && gl.isTexture(survivingHandle);
        const removedStillLive = gl.isTexture(handles[remove]);
        const keptAppearance = await survivor.capture();
        const record = records[1-remove];
        const restored = ['appearanceRecipe','liveAccessories','equipmentMaterials','nativeHairCenter']
          .every(k => JSON.stringify(keptAppearance[k]) === JSON.stringify(record[k]));
        d.actors.delete(survivor.identity.id); survivor.dispose();
        await tick();
        return {pair,before,after,removed:departed.identity.id,baseline,loaded,
          sameTexture:textures[0]===textures[1],sameHandle:handles[0]===handles[1],survived,removedStillLive,
          restored,finalReleased:handles.every(h=>!gl.isTexture(h)),released:renderer.info.memory.textures};
      }, {records, build, remove});
      for (const key of ['pair','before','after']) {
        const bytes = Buffer.from(sample[key].split(',')[1], 'base64');
        await fs.writeFile(path.join(out, remove + '-' + key + '.png'), bytes);
        delete sample[key];
      }
      const pixels = async label => PNG.sync.read(await fs.readFile(path.join(out, remove + '-' + label + '.png'))).data;
      const before = await pixels('before'), after = await pixels('after');
      let changedPixels = 0, peak = 0;
      for (let i=0;i<before.length;i+=4) {
        const delta=Math.max(...[0,1,2,3].map(ch=>Math.abs(before[i+ch]-after[i+ch])));
        if (delta) {changedPixels++;peak=Math.max(peak,delta);}
      }
      Object.assign(sample, {changedPixels, peak});
      report.cases.push(sample);
      assert.equal(sample.sameTexture,false);
      assert.equal(sample.sameHandle,mode==='shared');
      assert.equal(sample.removedStillLive,mode==='shared');
      assert.ok(sample.survived && sample.restored && sample.finalReleased);
      assert.equal(sample.released,sample.baseline);
      assert.equal(changedPixels,0,'Survivor image changed after the other actor was removed');
      await page.close();
    }
    assert.deepEqual(report.errors,[]);
  } finally {
    await browser.close();
    await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
  }
}
main().catch(error=>{ console.error(error);process.exitCode=1; });
