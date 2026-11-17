// Real workbench candidate check for the separately staged native Rokoko clip.
// The script only records when explicitly run with a fixed dist and output path.
const { chromium } = require('../prototype/node_modules/playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

const [directory, output] = process.argv.slice(2);
if (!directory || !output) throw Error('Usage: node scripts/qa-native-30s-workbench.cjs <fixed-dist> <new-output>');
const folder = path.resolve(directory), out = path.resolve(output);
const danceId = 'native-rokoko-5359146-30s-v2';
const subjects = {
  'native-female-843ac-v1': '843acca5003bab1e72d5a276b7218b5d8c7261dfc3c762247774941350c590ef',
  'native-female-face-v1': 'cc0843b8781e5897fdfce144d7d2d872f33f455b568a9d62165ad9b3a0ac00ce',
  'native-female-waist-v1': 'cf1574b243b3eb1d5803928598f62809c30938bde67154d3956d346f39fa1ed5',
  'native-male-7586-v1': '7586d3bc0921f88e86b38f7cf2f6651e4be76c47bbe0dfad45020f9001806d81',
};
const radiusM = 2.0465379295679766;
const stagedManifestSha256 = '600f7ab75fce550f71d9be5f9240e83f6b58945d67804555feddfe1acf2d67da';
const stagedMotionSha256 = {
  'native-female-843ac-v1': '49a14e5af28a16efdb948170e4cfaaf389724db43b8ceeb1f68d761b93c2e71e',
  'native-female-face-v1': 'c9742cc27094aebef5597848d5ccf7bf5bda6d50198db30abe4ba695da0fb200',
  'native-female-waist-v1': 'a2a47895bc5b603eb85c332cb95336e393350419ca18b5ae1fb37530a7a2aab4',
  'native-male-7586-v1': '870db931721d91f5b3ab200162ef03810960e6fbe28db2f62a1942f27a1f05c0',
};
const bodyIds = Object.keys(subjects);
const sha = b => require('node:crypto').createHash('sha256').update(b).digest('hex');

async function main() {
  await fs.mkdir(out, { recursive: false });
  await fs.copyFile(__filename, path.join(out, 'executed-script.cjs'));
  const identity = JSON.parse(await fs.readFile(path.join(folder, 'build-info.json'), 'utf8'));
  const report = { schema: 'native-native-30s-workbench-qa-v1', status: 'incomplete', runtimeAccepted: false, build: identity.shortId, folder, danceId, declaredRadiusM: radiusM, bodies: [], errors: [], scope: 'Fixed workbench, four exact native targets, actual one-shot 30s candidate plus exit; no visual or naturalness acceptance.' };
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.vrm': 'model/gltf-binary', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2' };
  let server, browser;
  try {
    server = require('node:http').createServer(async (req, res) => {
      try {
        const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        const file = path.resolve(folder, '.' + (name === '/' ? '/index.html' : name));
        if (!file.startsWith(folder + path.sep)) return res.writeHead(403).end();
        res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(await fs.readFile(file));
      } catch { res.writeHead(404).end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    report.browser = browser.version();
    for (const body of bodyIds) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      const row = { body, avatarSha256: subjects[body], errors: [], samples: [], events: [] };
      page.on('pageerror', e => row.errors.push(String(e)));
      page.on('console', m => { if (m.type() === 'error') row.errors.push(m.text()); });
      try {
        await page.goto(`http://127.0.0.1:${server.address().port}/?workbench=appearance&body=${body}&view=room`);
        await page.waitForFunction(() => window.__debug?.ready, null, { timeout: 60000 });
        const loaded = await page.evaluate(async () => { const bytes = new Uint8Array(await (await fetch('/assets/motion/m1c/dance-imports.json')).arrayBuffer()); const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join(''); return { body: __debug.avatar().profile.sha256, build: __debug.buildInfo.shortId, manifestSha256: hash, entry: __debug.motion().getDances().find(x => x.id === 'native-rokoko-5359146-30s-v2') }; });
        assert.equal(loaded.body, subjects[body]);
        assert.equal(loaded.build, identity.shortId);
        assert.equal(loaded.manifestSha256, stagedManifestSha256);
        assert(loaded.entry, 'native dance entry is unavailable for this exact target');
        assert.equal(loaded.entry.playback, 'once-then-idle');
        assert.equal(loaded.entry.duration, 30);
        assert(loaded.entry.radius >= radiusM - 1e-12, 'candidate radius is smaller than staged declaration');
        row.loaded = { body: loaded.body, build: loaded.build, entry: loaded.entry };
        await page.evaluate(() => { __debug.setPaused(true); __debug.camera('room'); __debug.setDynamics(true); __debug.setCorrections('full'); });
        await page.screenshot({ path: path.join(out, `${body}-before.png`) });
        await page.evaluate(() => __debug.setPaused(false));
        // Proposed point accounts for walls, couch and chair. Actual task
        // admission below remains authoritative; this does not bypass it.
        const walk = await page.evaluate(() => __debug.request({ requestId: 'native-30s-room-placement', kind: 'walk', payload: { x: -1.8, z: 1.0 } }));
        row.events.push({ kind: 'walk-request', result: walk });
        await page.waitForFunction(() => ['completed', 'failed', 'cancelled'].includes(__debug.tasks().get('native-30s-room-placement')?.state), null, { timeout: 30000 });
        row.walk = await page.evaluate(() => __debug.tasks().get('native-30s-room-placement'));
        assert.equal(row.walk.state, 'completed', `safe-radius walk failed: ${JSON.stringify(row.walk)}`);
        await page.locator('[data-workbench-tab="actions"]').click();
        await page.locator('select[aria-label="舞蹈样件"]').selectOption(danceId);
        const selected = await page.evaluate(() => __debug.motion().getDance());
        assert.equal(selected.id, danceId);
        assert.equal(selected.sha256, stagedMotionSha256[body]);
        assert(selected.radius >= radiusM - 1e-12, 'selected candidate radius is smaller than staged declaration');
        row.stagedIdentity = { manifestSha256: loaded.manifestSha256, motionSha256: selected.sha256, radiusTargetM: selected.radius };
        await page.evaluate(() => {
          const q = { chunks: [], samples: [], start: performance.now(), previous: null, lastSample: -Infinity };
          q.stream = __debug.renderer.domElement.captureStream(30);
          q.recorder = new MediaRecorder(q.stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 5000000 });
          q.recorder.ondataavailable = e => { if (e.data.size) q.chunks.push(e.data); };
          q.tick = now => {
            if (q.recorder.state === 'recording' && now - q.lastSample >= 100) {
              q.lastSample = now;
              const a = __debug.avatar(), s = __debug.snapshot();
              const V = a.root.position.constructor, joints = {};
              for (const n of ['hips', 'head', 'leftFoot', 'rightFoot']) joints[n] = a.vrm.humanoid.getRawBoneNode(n)?.getWorldPosition(new V()).toArray();
              q.samples.push({ wallMs: now - q.start, frameMs: q.previous == null ? null : now - q.previous, mode: s.mode, danceTime: s.motion.dance?.time ?? null, hips: joints.hips, leftFoot: joints.leftFoot, rightFoot: joints.rightFoot });
            }
            q.previous = now; q.raf = requestAnimationFrame(q.tick);
          };
          q.recorder.start(250); q.raf = requestAnimationFrame(q.tick); window.__native30sCapture = q;
        });
        await page.locator('[data-action="dance"]').click();
        await page.waitForFunction(() => __debug.snapshot().mode === 'dance' && __debug.snapshot().motion.danceMix > .95, null, { timeout: 15000 });
        row.accepted = await page.evaluate(() => __debug.tasks().active());
        assert.equal(row.accepted?.kind,'dance');assert.equal(row.accepted?.state,'running');
        await page.waitForTimeout(31500);
        await page.waitForFunction(() => __debug.snapshot().mode !== 'dance' && __debug.snapshot().motion.danceMix < .01, null, { timeout: 12000 });
        await page.screenshot({ path: path.join(out, `${body}-after-idle.png`) });
        const captured = await page.evaluate(async () => { const q = window.__native30sCapture; const stopped = new Promise(resolve => { q.recorder.addEventListener('stop', resolve, { once: true }); }); if (q.recorder.state !== 'inactive') q.recorder.stop(); await stopped; q.stream.getTracks().forEach(t => t.stop()); cancelAnimationFrame(q.raf); const b = new Uint8Array(await new Blob(q.chunks, { type: 'video/webm' }).arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode(...b.subarray(i, i + 32768)); return { video: btoa(s), samples: q.samples }; });
        const videoPath = path.join(out, `${body}-native-rokoko-30s-1x.webm`); await fs.writeFile(videoPath, Buffer.from(captured.video, 'base64')); delete captured.video; row.capture = { file: path.basename(videoPath), samples: captured.samples.length, elapsedSeconds: captured.samples.at(-1)?.wallMs / 1000, rate: 1 }; row.samples = captured.samples; row.final = await page.evaluate(() => __debug.snapshot()); assert.equal(row.final.mode, 'idle');
        row.finalTask=await page.evaluate(id=>__debug.tasks().get(id),row.accepted.requestId);
        assert.equal(row.finalTask.state,'completed',row.finalTask.reason);
        assert(row.samples.some(x=>x.danceTime>29.8),'Full action tail not observed');
        assert.equal(row.errors.length,0,row.errors.join('\n'));
        row.status='technical-playback-pass-visual-pending';
        if (row.samples.length < 200) throw Error(`sparse capture: ${row.samples.length} samples`);
      } catch (error) {
        row.status = 'failed'; row.error = String(error.stack || error);
        try {
          await page.screenshot({ path: path.join(out, `${body}-failure.png`) });
          const partial = await page.evaluate(async () => { const q = window.__native30sCapture; if (!q?.chunks?.length) return null; if (q.recorder.state !== 'inactive') { const stopped = new Promise(resolve => q.recorder.addEventListener('stop', resolve, { once: true })); q.recorder.stop(); await stopped; } q.stream.getTracks().forEach(t => t.stop()); cancelAnimationFrame(q.raf); const b = new Uint8Array(await new Blob(q.chunks, { type: 'video/webm' }).arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode(...b.subarray(i, i + 32768)); return btoa(s); });
          if (partial) await fs.writeFile(path.join(out, `${body}-failure-partial-1x.webm`), Buffer.from(partial, 'base64'));
        } catch (captureError) { row.captureError = String(captureError); }
      }
      finally { await page.close(); }
      report.bodies.push(row);
      if (row.status === 'failed') throw Error(`${body}: ${row.error}`);
    }
    report.status = 'technical-30s-candidate-playback-passed-visual-review-pending';
  } catch (error) { report.status = 'failed'; report.error = String(error.stack || error); process.exitCode = 1; }
  finally { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ status: report.status, build: report.build, out })); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
