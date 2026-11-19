// Check the actual WebGL handle while two existing game actors are removed in either order.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {launchQABrowser} = require('./qa-browser-workspace.cjs');
const {projectOutput, productionRoot} = require('./project-output.cjs');
const {PNG} = require('../prototype/node_modules/playwright-core/lib/utilsBundle.js');
const [base, recordsPath, build, mode, output, expectedFaceSize] = process.argv.slice(2);

async function main() {
  assert.ok(['separate', 'shared'].includes(mode));
  const out = await projectOutput(output, await productionRoot());
  const records = JSON.parse(await fs.readFile(recordsPath, 'utf8'));
  assert.equal(records.length, 2);
  const {resolveGarmentMaterials} = await import('../prototype/src/garment-material-record.js');
  const materials = records.map(r => resolveGarmentMaterials({profile:r.appearanceRecipe.base},
    r.appearanceRecipe, r.equipmentMaterials).record);
  await fs.mkdir(out, {recursive:false});
  const report = {build, mode, cases:[], errors:[]};
  const session = await launchQABrowser(out,{channel:'chrome'});
  const browser = session.browser;
  report.browser = browser.version();
  try {
    for (const remove of [0, 1]) {
      const page = await browser.newPage({viewport:{width:1440,height:1000}});
      page.on('pageerror', e => report.errors.push(e.message));
      if (expectedFaceSize) await page.addInitScript(() => {
        const sizes = window.__qaAllocated2D = new WeakMap();
        const proto = WebGL2RenderingContext.prototype, allocate = proto.texStorage2D;
        proto.texStorage2D = function(target, levels, format, width, height) {
          const result = allocate.call(this,target,levels,format,width,height);
          if (target === this.TEXTURE_2D) {
            const handle = this.getParameter(this.TEXTURE_BINDING_2D);
            if (handle) sizes.set(handle,{levels,format,width,height});
          }
          return result;
        };
      });
      await page.goto(base + 'record-consumer.html?production=1');
      await page.waitForFunction(() => window.__recordConsumer?.ready);
      const sample = await page.evaluate(async ({records, materials, build, remove, expectedFaceSize}) => {
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
        const bitmaps = textures.map(t => t.image);
        const bitmapSizes = () => bitmaps.map(img => [img.width, img.height]);
        const bitmapLoaded = bitmapSizes();
        function release(actor) {
          if (typeof d.removeActor === 'function') {
            if (d.removeActor(actor.identity.id) !== true || d.removeActor(actor.identity.id) !== false)
              throw Error('Public actor removal did not settle exactly once');
          } else {
            // Older archived builds predate the public room removal operation.
            d.actors.delete(actor.identity.id);
            actor.dispose();
          }
        }
        const handles = textures.map(t => renderer.properties.get(t).__webglTexture);
        if (!handles.every(h => h && gl.isTexture(h))) throw Error('Body normals were not drawn');
        const storage = [], portraits = [], faceHandles = [];
        if (expectedFaceSize) {
          for (const [i,actor] of actors.entries()) {
            const faces = new Set();
            actor.avatar.root.traverseVisible(o => {
              if (o.isMesh) for(const mat of [].concat(o.material))
                if (/_Face_\d+_SKIN/.test(mat.name) && mat.normalMap) faces.add(mat.normalMap);
            });
            if (faces.size !== 1) throw Error('Expected one active face normal texture');
            const face = [...faces][0], faceHandle = renderer.properties.get(face).__webglTexture;
            if (!faceHandle || !gl.isTexture(faceHandle)) throw Error('Face normal was not drawn');
            faceHandles.push(faceHandle);
            storage.push({face:window.__qaAllocated2D.get(faceHandle), body:window.__qaAllocated2D.get(handles[i])});
            const close = camera.clone();
            const head = actor.avatar.vrm.humanoid.getRawBoneNode('head').getWorldPosition(close.position.clone());
            head.y += 0.065;
            close.position.copy(head); close.position.z += 0.54;
            close.lookAt(head);close.updateMatrixWorld(true);
            render(d.scene,close);
            portraits.push(renderer.domElement.toDataURL('image/png'));
          }
        }
        const survivor = actors[1-remove], departed = actors[remove];
        departed.avatar.root.visible = false;
        const before = draw();
        release(departed);
        const bitmapAfterFirst = bitmapSizes();
        const after = draw(), survivingHandle = renderer.properties.get(textures[1-remove]).__webglTexture;
        const survived = survivingHandle === handles[1-remove] && gl.isTexture(survivingHandle);
        const removedStillLive = gl.isTexture(handles[remove]);
        const keptAppearance = await survivor.capture();
        const record = records[1-remove];
        const restored = ['appearanceRecipe','liveAccessories','nativeHairCenter']
          .every(k => JSON.stringify(keptAppearance[k]) === JSON.stringify(record[k])) &&
          JSON.stringify(keptAppearance.equipmentMaterials) === JSON.stringify(materials[1-remove]);
        release(survivor);
        await tick();
        return {pair,before,after,portraits,storage,publicRemoval:typeof d.removeActor==='function',
          sameBitmap:bitmaps[0]===bitmaps[1],bitmapLoaded,bitmapAfterFirst,bitmapAfterLast:bitmapSizes(),sameFaceHandle:expectedFaceSize ? faceHandles[0]===faceHandles[1] : null,removed:departed.identity.id,baseline,loaded,
          sameTexture:textures[0]===textures[1],sameHandle:handles[0]===handles[1],survived,removedStillLive,
          restored,finalReleased:handles.every(h=>!gl.isTexture(h)),released:renderer.info.memory.textures};
      }, {records, materials, build, remove, expectedFaceSize});
      for (const [i,png] of sample.portraits.entries()) {
        await fs.writeFile(path.join(out,remove+'-face-'+i+'.png'),Buffer.from(png.split(',')[1],'base64'));
      }
      delete sample.portraits;
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
      if (expectedFaceSize) for (const {face,body} of sample.storage) {
        assert.deepEqual([face.width,face.height,face.levels], [Number(expectedFaceSize),Number(expectedFaceSize),1]);
        assert.deepEqual([body.width,body.height,body.levels], [2048,2048,1]);
        assert.equal(face.format, 0x8058, 'Expected RGBA8 storage for the face normal');
        assert.equal(body.format, 0x8058, 'Expected RGBA8 storage for the body normal');
      }
      if (mode==='shared') {
        assert.equal(sample.sameBitmap,true);
        assert.deepEqual(sample.bitmapLoaded,[[2048,2048],[2048,2048]]);
        assert.deepEqual(sample.bitmapAfterFirst,sample.bitmapLoaded);
        assert.deepEqual(sample.bitmapAfterLast,[[0,0],[0,0]]);
      }
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
    await session.close();
    await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
  }
}
main().catch(error=>{ console.error(error);process.exitCode=1; });
