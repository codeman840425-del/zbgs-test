// Read-only posed garment dump for a fixed candidate. Run by the release owner.
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(path.join(process.cwd(), 'prototype/node_modules/playwright'));
const { verifyCandidate } = require(path.join(process.cwd(), 'scripts/qa-m1-common.cjs'));
const [url, build, destination, indexFile, mode = 'idle'] = process.argv.slice(2);

(async () => {
  assert(url && /^[a-f0-9]{12}$/.test(build) && destination && indexFile);
  assert(['idle', 'run-body'].includes(mode), 'Unknown pose diagnostic mode');
  const out = path.resolve(destination);
  await fs.mkdir(out, {recursive: false});
  const index = JSON.parse(await fs.readFile(indexFile, 'utf8'));
  const cases = [{id: 'female', profile: {id: 'beta-base-female-m1', sha256: '027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'}},
    ...['female-round-full-v2', 'female-soft-wide-v2'].map(id => index.presets.find(p => p.id === id))];
  assert(cases.every(Boolean));
  await fs.copyFile(__filename, path.join(out, 'executed-script.cjs'));
  const report = {build, mode, status: 'incomplete', scope: 'Read-only actual posed triangles, material/texture and skin state. No layer hiding or correction.', cases: []};
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  try {
    for (const spec of cases) {
      const context = await browser.newContext({viewport: {width: 1440, height: 900}});
      const page = await context.newPage();
      const row = {id: spec.id, errors: []};
      report.cases.push(row);
      page.on('pageerror', error => row.errors.push(String(error)));
      await page.goto(url + '?workbench=appearance&body=' + spec.id);
      await page.waitForFunction(() => window.__debug?.ready && document.querySelector('#appearance-form')?.getAttribute('aria-busy') === 'false', null, {timeout: 60000});
      row.identity = await verifyCandidate(page, {build, assetId: spec.profile.id, sha256: spec.profile.sha256});
      if (mode === 'run-body') {
        await page.evaluate(() => {__debug.reset(); __debug.setPlaybackRate(1); __debug.setPaused(false); __debug.camera('inspect-half-front'); __debug.setSpeed(1.05); __debug.request({requestId:'pose-approach',kind:'walk',payload:{x:-1.4,z:-.6}});});
        await page.waitForFunction(() => ['completed','failed','cancelled'].includes(__debug.tasks().get('pose-approach')?.state),null,{timeout:45000});
        assert.equal(await page.evaluate(() => __debug.tasks().get('pose-approach').state),'completed');
        await page.evaluate(() => {__debug.setSpeed(2.2); __debug.request({requestId:'pose-run',kind:'walk',payload:{x:1.2,z:1.6}});});
        await page.waitForTimeout(1400);
      }
      await page.evaluate(() => {__debug.setPaused(true); __debug.camera('inspect-half-front');});
      await page.waitForTimeout(150);
      const dump = await page.evaluate(async mode => {
        const d = window.__debug, actor = d.avatar(), camera = d.cameraObject();
        const hash = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
        const values = attribute => Array.from({length: attribute.count}, (_, i) => Array.from({length: attribute.itemSize}, (_, j) => attribute.getComponent(i, j)));
        const materials = async material => {
          const value = {name: material.name, type: material.type, side: material.side, visible: material.visible,
            transparent: material.transparent, opacity: material.opacity, alphaTest: material.alphaTest,
            depthWrite: material.depthWrite, depthTest: material.depthTest, color: material.color?.toArray(), map: null};
          const texture = material.map;
          if (texture) {
            texture.updateMatrix();
            const image = texture.image, canvas = document.createElement('canvas');
            canvas.width = image.width; canvas.height = image.height;
            const ctx = canvas.getContext('2d', {willReadFrequently: true});
            ctx.drawImage(image, 0, 0);
            const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            const alpha = new Uint8Array(canvas.width * canvas.height);
            let minimum = 255, maximum = 0;
            for (let i = 0; i < alpha.length; i++) {alpha[i] = pixels[i * 4 + 3]; minimum = Math.min(minimum, alpha[i]); maximum = Math.max(maximum, alpha[i]);}
            value.map = {flipY: texture.flipY, width: canvas.width, height: canvas.height, matrix: texture.matrix.toArray(),
              alphaSha256: await hash(alpha), alphaRange: [minimum, maximum], minFilter: texture.minFilter, magFilter: texture.magFilter,
              source: image.currentSrc || image.src || null};
          }
          return value;
        };
        actor.root.updateMatrixWorld(true);
        const meshes = [];
        for (const role of (mode === 'run-body' ? ['body', 'top', 'pants'] : ['top', 'pants'])) {
          for (const uuid of actor.profile.meshRoles[role] || []) {
            const mesh = actor.root.getObjectByProperty('uuid', uuid);
            if (!mesh) throw Error('Missing mesh role ' + role);
            mesh.skeleton?.update();
            const geometry = mesh.geometry, point = mesh.position.clone();
            const world = [];
            for (let i = 0; i < geometry.getAttribute('position').count; i++) {
              mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld); world.push(point.toArray());
            }
            const rawIndex = geometry.index ? Array.from(geometry.index.array) : Array.from({length: world.length}, (_, i) => i);
            const ancestors = []; for (let n = mesh; n; n = n.parent) ancestors.push({name: n.name, visible: n.visible});
            meshes.push({role, name: mesh.name, visible: mesh.visible, ancestors, positions: values(geometry.getAttribute('position')),
              worldPositions: world, uv: geometry.getAttribute('uv') ? values(geometry.getAttribute('uv')) : null,
              indices: rawIndex, canonicalU32IndexSha256: await hash(new Uint32Array(rawIndex)), drawRange: {start: geometry.drawRange.start, count: Number.isFinite(geometry.drawRange.count) ? geometry.drawRange.count : 'Infinity'},
              groups: geometry.groups, matrixWorld: mesh.matrixWorld.toArray(), bindMatrix: mesh.bindMatrix?.toArray(), bindMatrixInverse: mesh.bindMatrixInverse?.toArray(),
              joints: values(geometry.getAttribute('skinIndex')), weights: values(geometry.getAttribute('skinWeight')),
              bones: mesh.skeleton.bones.map((bone, i) => ({name: bone.name, matrixWorld: bone.matrixWorld.toArray(), inverseBind: mesh.skeleton.boneInverses[i].toArray()})),
              morphInfluences: mesh.morphTargetInfluences, materials: await Promise.all((Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(materials))});
          }
        }
        return {schema: 'vest-posed-readback-v1', mode, snapshot:d.snapshot(), bodyType: actor.profile.bodyType, bodySha256: actor.profile.sha256,
          rootMatrixWorld: actor.root.matrixWorld.toArray(), camera: {position: camera.position.toArray(), matrixWorldInverse: camera.matrixWorldInverse.toArray(), projectionMatrix: camera.projectionMatrix.toArray()},
          equipment: actor.getOutfitInfo?.() || null, meshes,
          limits: ['Actual paused pose after ready. Pose phases are recorded, not forced equal. Original raw-bone palettes permit an explicitly virtual common-pose comparison offline. CPU getVertexPosition includes live skin and morph state.']};
      }, mode);
      assert(dump.meshes.some(m => m.role === 'pants' && m.ancestors.every(n => n.visible)));
      const filename = spec.id + '.json';
      await fs.writeFile(path.join(out, filename), JSON.stringify(dump));
      await page.locator('#stage').screenshot({path: path.join(out, spec.id + '.png')});
      row.data = filename;
      assert.deepEqual(row.errors, []);
      await context.close();
    }
    report.status = 'captured-readback-not-visual-acceptance';
  } catch (error) {report.error = String(error.stack || error); process.exitCode = 1;}
  finally {await browser.close(); await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({status: report.status, error: report.error}));}
})();
