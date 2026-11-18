// Measure loaded skinned hair in head coordinates on the same fixed-step room route.
// The off pass includes head movement, facial animation and any non-spring skinning.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { chromium } = require('../prototype/node_modules/playwright');

async function replay(page, base, record, build, enabled, film, centerTrial, importFit) {
  const body = record.appearanceRecipe.base;
  const url = new URL(base);
  url.searchParams.set('workbench', 'appearance');
  url.searchParams.set('body', body.bodyType);
  if (importFit) url.searchParams.set('nativeHairCenter','native-hair-upper-chest-v1');
  await page.goto(url.href);
  await page.waitForFunction(() => window.__debug?.ready && __debug.buildInfo.shortId);
  const loaded = await page.evaluate(input => __debug.restoreCharacterRecord(input), record);
  assert.equal(loaded.applied, true, JSON.stringify(loaded));
  return page.evaluate(({body, build, enabled, film, centerTrial, importFit}) => {
    const debug = window.__debug;
    debug.setPaused(true);
    debug.reset();
    debug.setPaused(true);
    debug.setDynamics(enabled);
    debug.view('inspect-half-side');
    const avatar = debug.avatar();
    const imported = avatar.nativeHairCenterFit || null;
    if (imported !== (importFit ? 'native-hair-upper-chest-v1' : null))
      throw Error('Unexpected hair fit after record restore: ' + imported);
    if (avatar.profile.sha256 !== body.sha256 || debug.buildInfo.shortId !== build)
      throw Error('Body or build differs from the requested input');
    const head = avatar.vrm.humanoid.getRawBoneNode('head');
    const springBones = new Set([...avatar.vrm.springBoneManager.joints].map(joint => joint.bone));
    const hairSpringBones = new Set();
    const surfaces = [];
    avatar.vrm.scene.traverseVisible(mesh => {
      if (!mesh.isSkinnedMesh || !/HAIR/i.test(mesh.material.name ?? '')) return;
      const geometry = mesh.geometry;
      const index = geometry.index;
      const count = index ? index.count : geometry.attributes.position.count;
      const ids = new Set();
      const start = geometry.drawRange.start;
      const end = Math.min(count, start + geometry.drawRange.count);
      for (let offset = start; offset < end; offset++) ids.add(index ? index.getX(offset) : offset);
      const inheritedSpring = mesh.skeleton.bones.map(bone => {
        for (let node = bone; node; node = node.parent) if (springBones.has(node)) return true;
        return false;
      });
      if (centerTrial && enabled) {
        for (const id of ids) for (let k=0; k<4; k++) {
          if (!geometry.attributes.skinWeight.getComponent(id,k)) continue;
          let bone = mesh.skeleton.bones[geometry.attributes.skinIndex.getComponent(id,k)];
          while (bone && bone !== head) {
            if (springBones.has(bone)) hairSpringBones.add(bone);
            bone = bone.parent;
          }
        }
      }
      const affected = [...ids].filter(id => {
        for (let k = 0; k < 4; k++)
          if (geometry.attributes.skinWeight.getComponent(id, k) > 0 &&
              inheritedSpring[geometry.attributes.skinIndex.getComponent(id, k)]) return true;
        return false;
      });
      // Stratify within the affected subset so rigid scalp vertices cannot dilute the test.
      const pool = affected.length ? affected : [...ids];
      const n = Math.min(pool.length, 32);
      const probes = Array.from({length:n}, (_, i) => pool[Math.floor(i * pool.length / n)]);
      surfaces.push({mesh, probes, referenced:ids.size, springWeighted:affected.length});
    });
    if (!surfaces.length || surfaces.some(surface => !surface.probes.length))
      throw Error('No referenced vertices for a hair material');
    if (centerTrial && enabled) {
      const upperChest = avatar.vrm.humanoid.getRawBoneNode('upperChest');
      if (!upperChest || !hairSpringBones.size) throw Error('Missing diagnostic hair or upper chest');
      // three-vrm 3.5.5 removes the previous center's shared inverse cache in
      // the setter. Detach the batch first, then bind every original or trial center.
      const centers = [...avatar.vrm.springBoneManager.joints].map(joint =>
        [joint, hairSpringBones.has(joint.bone) ? upperChest : joint.center]);
      for (const [joint] of centers) joint.center = null;
      for (const [joint, center] of centers) joint.center = center;
      avatar.vrm.springBoneManager.reset();
    }
    const rows = [];
    const tasks = [];
    const frames = [];
    const source = debug.renderer.domElement;
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 2 * Math.round(source.height / source.width * canvas.width / 2);
    const ctx = film && canvas.getContext('2d');
    const worldScale = head.getWorldScale(head.position.clone());
    if (Math.max(...worldScale.toArray().map(v => Math.abs(1-v))) > 1e-4)
      throw Error('Head-local measurement requires unit world scale');
    const sample = (kind, step) => {
      const p = head.position.clone();
      const positions = surfaces.map(({mesh, probes}) => probes.map(id => {
        mesh.getVertexPosition(id, p);
        head.worldToLocal(mesh.localToWorld(p));
        return p.toArray().map(v => Math.round(v * 1e6) / 1e6);
      }));
      rows.push({kind, step, positions});
      if (ctx && kind !== 'initial') {
        ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
        ctx.font = '20px sans-serif';
        ctx.fillStyle = '#1b252b';
        ctx.fillRect(0, 0, canvas.width, 34);
        ctx.fillStyle = '#fff';
        ctx.fillText((enabled ? (centerTrial || importFit ? '动态开启 · 胸部参考系试验' : '动态开启') : '动态关闭') + '   ' +
          ({approach:'行走',sit:'接近座椅与坐下',stand:'起身',leave:'离开'})[kind], 14, 24);
        frames.push(canvas.toDataURL('image/jpeg', 0.85).split(',')[1]);
      }
    };
    sample('initial', 0);
    for (const [id, kind, payload] of [
      ['approach', 'walk', {x:-0.5, z:1.8}], ['sit', 'sit', {}],
      ['stand', 'stand', {}], ['leave', 'walk', {x:-1.4, z:1.7}],
    ]) {
      debug.request({requestId:id, kind, payload});
      let state;
      for (let step = 1; step <= 600; step++) {
        debug.advance(1 / 30);
        sample(id, step);
        state = debug.tasks().get(id)?.state;
        if (['completed','cancelled','failed'].includes(state)) break;
      }
      if (state !== 'completed') throw Error(id + ': ' + state);
      tasks.push({id, state});
    }
    return {surfaces:surfaces.map(({mesh, probes, referenced, springWeighted}) =>
      ({material:mesh.material.name, mesh:mesh.name, probes, referenced, springWeighted})), rows, tasks, frames,
      diagnosticCentersChanged:hairSpringBones.size, imported};
  }, {body, build, enabled, film, centerTrial, importFit});
}

async function main() {
  const [base, build, recordFile, out] = process.argv.slice(2);
  assert.ok(out, 'Expected BASE BUILD RECORD NEW_OUTPUT_DIR');
  const record = JSON.parse(await fs.readFile(recordFile, 'utf8'));
  const encoder = process.env.FFMPEG;
  const centerTrial = process.argv[6] === '--test-chest-center';
  const importFit = process.argv[6] === '--import-fit';
  assert.ok(process.argv.length === (centerTrial || importFit ? 7 : 6), 'Unexpected options');
  const encode = (args, input) => {
    const processResult = spawnSync(encoder, ['-v','error','-nostdin',...args], {input});
    if (processResult.error) throw processResult.error;
    assert.equal(processResult.status, 0, processResult.stderr.toString());
  };
  await fs.mkdir(out, {recursive:false});
  const browser = await chromium.launch({channel:'chrome'});
  const errors = [];
  const report = {status:'failed', build, body:record.appearanceRecipe.base,
    recordSha256:record.integrity.recordSha256, input:path.relative(process.cwd(),recordFile), errors};
  try {
    const passes = [];
    for (const enabled of [false, true]) {
      const page = await browser.newPage({viewport:{width:1440,height:1000}});
      page.on('pageerror', error => errors.push(error.message));
      const pass = await replay(page, base, record, build, enabled, Boolean(encoder), centerTrial, importFit);
      if (encoder) {
        encode(['-f','image2pipe','-framerate','30','-c:v','mjpeg','-i','pipe:0',
          '-c:v','libx264','-pix_fmt','yuv420p','-crf','17',path.join(out,enabled?'on.mp4':'off.mp4')],
          Buffer.concat(pass.frames.map(frame => Buffer.from(frame,'base64'))));
      }
      delete pass.frames;
      passes.push(pass);
      await page.close();
    }
    const [off, on] = passes;
    assert.deepEqual(off.surfaces, on.surfaces);
    assert.deepEqual(off.rows.map(({kind,step}) => [kind,step]), on.rows.map(({kind,step}) => [kind,step]));
    report.tasks = on.tasks;
    report.diagnosticCentersChanged = on.diagnosticCentersChanged;
    report.importedFit = on.imported;
    report.framesPerPass = on.rows.length;
    report.simulatedSecondsPerFrame = 1 / 30;
    report.surfaces = on.surfaces.map((surface, s) => {
      const peaksMm = {};
      const peakSample = {};
      for (const [t, frame] of on.rows.entries()) {
        const differences = frame.positions[s].map((v, i) =>
          1000 * Math.hypot(...v.map((n, axis) => n - off.rows[t].positions[s][i][axis])));
        assert.ok(differences.every(Number.isFinite));
        const maximum = Math.max(...differences);
        if (!(frame.kind in peaksMm) || maximum > peaksMm[frame.kind]) {
          peaksMm[frame.kind] = maximum;
          peakSample[frame.kind] = {frame:t, step:frame.step, vertex:surface.probes[differences.indexOf(maximum)]};
        }
      }
      return {...surface, peaksMm, peakSample};
    });
    assert.equal(errors.length, 0);
    if (encoder) {
      encode(['-i',path.join(out,'off.mp4'),'-i',path.join(out,'on.mp4'),'-filter_complex','hstack',
        '-c:v','libx264','-crf','18','-movflags','+faststart',path.join(out,'comparison.mp4')]);
      report.film = 'comparison.mp4';
      await Promise.all(['off.mp4','on.mp4'].map(file => fs.unlink(path.join(out,file))));
    }
    report.status = 'measured';
    report.scope = 'Head-relative CPU skinning samples at matched simulation steps. No collision, visual or device admission.';
  } catch (error) {
    report.failure = String(error.stack || error);
    throw error;
  } finally {
    await browser.close();
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report,null,2)+'\n');
  }
  console.log(JSON.stringify(report.surfaces.map(({mesh,referenced,springWeighted,peaksMm}) =>
    ({mesh,referenced,springWeighted,peaksMm}))));
}
main().catch(err => {console.error(err);process.exitCode = 1;});
