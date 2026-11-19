const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const {launchQABrowser} = require('../../../scripts/qa-browser-workspace.cjs');
const {productionRoot, projectOutput} = require('../../../scripts/project-output.cjs');

// Run with scripts/run-fixed-check.cjs. Only the ordinary room buttons issue actions.
async function run(base, packageSha, pairFile, destination) {
  const out = await projectOutput(destination, await productionRoot());
  const pair = JSON.parse(await fs.readFile(pairFile, 'utf8'));
  const bytes = Buffer.from(await (await fetch(new URL('facility-package.json', base))).arrayBuffer());
  assert.equal(createHash('sha256').update(bytes).digest('hex'), packageSha);
  const manifest = JSON.parse(bytes);
  const room = manifest.rooms.find(r => r.key === 'plant-home');
  const report = {passed:false, packageSha, game:manifest.gameInventorySha256,
    roomSha:manifest.roomManifestSha256, build:manifest.gameRuntime, room, records:[], observations:[], errors:[]};
  await fs.mkdir(out);
  let browser, context, video;
  try {
    browser = await launchQABrowser(out, {channel:'chrome'});
    const size = {width:1280, height:840};
    context = await browser.browser.newContext({viewport:size, serviceWorkers:'block', recordVideo:{dir:out, size}});
    const page = await context.newPage();
    video = page.video();
    page.on('pageerror', e => report.errors.push(e.message));
    await page.goto(new URL('facility-room.html?room=plant-home', base).href);
    await page.waitForFunction(() => ['ready','error'].includes(document.querySelector('#room-status')?.dataset.state), null, {timeout:90000});
    const status = page.locator('#room-status');
    assert.equal(await status.getAttribute('data-state'), 'ready', await status.innerText());
    assert.equal(await page.locator('#facility-seat').inputValue(), room.seatId);
    assert.deepEqual(await page.evaluate(() => __recordConsumer.records), pair);
    report.records = await page.evaluate(() => [...__recordConsumer.actors.values()].map(a => ({
      id:a.identity.id, sha:a.recordSha256, root:a.avatar.root.uuid, body:a.avatar.profile.id
    })));
    assert.deepEqual(report.records.map(a => [a.id,a.sha]), pair.map(r => [r.identity.id,r.integrity.recordSha256]));
    assert.equal(new Set(report.records.map(a => a.root)).size, 2);
    report.camera = await page.evaluate(id => {
      const {camera} = __recordConsumer, {session, orbit} = facilityRoom;
      const seat = session.scene.describeUsePoint(id);
      const [x,y,z] = seat.transform.position;
      camera.position.set(x+3.3,y+1.05,z+.20);
      orbit.target.set(x,y+.76,z-.13);
      orbit.update();
      return {position:camera.position.toArray(), target:orbit.target.toArray(), seat};
    }, room.seatId);

    for (const [index, {id}] of report.records.entries()) {
      await page.locator('#facility-actor').selectOption(id);
      const trace = await page.evaluateHandle(id => {
        const actor = __recordConsumer.actors.get(id), start = performance.now();
        let frame;
        const rows = [];
        function sample(now) {
          const m = actor.motion.getMetrics();
          rows.push({t:(now-start)/1000, root:actor.avatar.root.position.toArray(), hip:m.hipWorld,
            sit:m.sitProgress, moving:m.moving, gait:m.gait, locomotion:m.locomotion});
          frame = requestAnimationFrame(sample);
        }
        frame = requestAnimationFrame(sample);
        return {stop() { cancelAnimationFrame(frame); return rows; }};
      }, id);
      try {
        for (const [control,label] of [['sit','入座'],['stand','起身']]) {
          await page.locator('#facility-'+control).click();
          await page.waitForFunction(label => {
            const text = document.querySelector('#room-status').textContent;
            return text.startsWith(label+' · ') && /完成|拒绝|失败|取消/.test(text);
          }, label, {timeout:65000});
          const terminal = await page.evaluate(({id,seatId}) => {
            const a = __recordConsumer.actors.get(id);
            return {id, status:document.querySelector('#room-status').textContent,
              task:a.controller.behaviorTasks.history().at(-1).task,
              root:a.avatar.root.position.toArray(), hip:a.motion.getMetrics().hipWorld,
              sit:a.motion.getMetrics().sitProgress, lease:__recordConsumer.seatLeases.forSeat(seatId)};
          }, {id,seatId:room.seatId});
          report.observations.push(terminal);
          assert.equal(terminal.status, label+' · 完成', JSON.stringify(terminal.task));
          assert.equal(terminal.task.state, 'completed');
          assert.equal(terminal.task.kind, control);
          if (control === 'sit') {
            assert.equal(terminal.sit, 1);
            assert.equal(terminal.lease.ownerId, id);
            assert.equal(terminal.task.result.usePointId, room.seatId);
            assert.equal(terminal.task.result.surface.length, 3);
            await page.screenshot({path:path.join(out, 'seated-'+(index+1)+'.png')});
            await page.waitForTimeout(600);
          } else {
            assert.equal(terminal.sit, 0);
            assert.equal(terminal.lease, null);
          }
        }
      } finally {
        const rows = await trace.evaluate(s => s.stop());
        await fs.writeFile(path.join(out,'motion-'+(index+1)+'.json'), JSON.stringify({id,rows})+'\n', {flag:'wx'});
        await trace.dispose();
      }
      const {rows} = JSON.parse(await fs.readFile(path.join(out,'motion-'+(index+1)+'.json')));
      const seatedAt = rows.findIndex(s => s.sit === 1);
      const approach = rows.slice(0,seatedAt);
      const walkingFrames = approach.filter(s => s.moving && s.locomotion === 'walk' && s.gait > 0).length;
      const distance = Math.hypot(...[0,2].map(i => rows[seatedAt].root[i] - rows[0].root[i]));
      const exit = Math.hypot(...[0,2].map(i => rows.at(-1).root[i] - rows[seatedAt].root[i]));
      Object.assign(report.records[index], {walkingFrames, approachMetres:distance, exitMetres:exit, frames:rows.length});
      assert(walkingFrames > 2 && distance > .18 && exit > .18);
      assert(approach.some(s => s.sit > 0 && s.sit < 1));
      assert(rows.slice(seatedAt).some(s => s.sit > 0 && s.sit < 1));
    }
    assert.deepEqual(report.errors, []);
    report.passed = true;
  } catch (error) {
    report.failure = error.stack;
    throw error;
  } finally {
    try {
      await context?.close();
      if (video) await fs.rename(await video.path(), path.join(out,'room-1x.webm'));
    } finally {
      try { await browser?.close(); }
      finally { await fs.writeFile(path.join(out,'report.json'), JSON.stringify(report,null,2)+'\n', {flag:'wx'}); }
    }
  }
}
run(...process.argv.slice(2)).catch(error => {console.error(error);process.exitCode=1;});
