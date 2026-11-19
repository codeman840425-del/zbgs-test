import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, lstat, mkdir, writeFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import outputs from '../../scripts/project-output.cjs';

const root = await outputs.productionRoot();
const output = await outputs.projectOutput(process.argv[2], root);
assert.equal(path.dirname(output), path.join(root, 'output/m2-station-lower-intake-v1'));
assert.equal(await lstat(output).catch(error => {if (error.code === 'ENOENT') return null; throw error;}), null);
const runtime = path.join(root, 'experiments/worktrees/performer-anchor-545dc941');
const commit = '545dc941498673f008f85748134778fe831f3d35';
const sourceDigest = 'ddcf40a56d0ef69662f7d0798ca7e6210bd8cc20f6dc52a2cc034d40b20fe28f';
const company = path.resolve(root, '../gamemake-company-platform-c1/company-workspace/deliveries');
const prior = 'vocal-use-v1.1', candidate = 'vocal-fit-v1', ancestor = 'vocal-use-v1';
const pins = {
  [candidate]: '64802112dd64938d88ef6e8115c90096a90f591833467db55bd837e4ca11eebc',
  [prior]: '5c676cafa500ac5fc79d2461935fc323844e02fa0a1baa01c8025cd75d3e4012',
  [ancestor]: '2f36e3dc92939fdb93f4c99902196ed6b5e7ec4312cceecb7f48c1237d073c57',
};
const rooms = ['singing-studio','singing-rental'];
const approvedPair = 'output/m2-performer-anchor-game-v1/pair';
const pairPin = '3d3e2b3885003d0585c1b7eb6ea40c7490001a647f227c2dcff9377aa26060b5';
const original = pathToFileURL(path.join(root, 'scripts/qa-company-vocal-active.mjs'));
const qaPin = 'd656137e98b3eabaf56e33ad33aa85986904a25a3317ce39adb99ac568397fdb';
const reader = 'source/scripts/company-platform/package-template/vocal-origin.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const report = {status:'incomplete', commit, sourceDigest, runtimePair:pairPin, cpuHelper:qaPin, company:pins, runs:{}};

async function receipt(delivery, previous) {
  const packageRoot = path.join(company, delivery);
  const manifestBytes = await readFile(path.join(packageRoot, 'transfer-manifest.json'));
  assert.equal(sha(manifestBytes), pins[delivery]);
  const manifest = JSON.parse(manifestBytes);
  for (const name of [reader, 'source/scripts/company-platform/package-template/training-room.mjs']) {
    const entry = manifest.files.find(row => row.path === name);
    const bytes = await readFile(path.join(packageRoot, name));
    assert.equal(bytes.length, entry.bytes);
    assert.equal(sha(bytes), entry.sha256);
  }
  const {readInheritedVocalRoom} = await import(pathToFileURL(path.join(packageRoot, reader)));
  const select = (version, key) => ({packageRoot:path.join(company, version), manifestSha256:pins[version], sourceRoomKey:key});
  const results = [];
  for (const key of rooms) {
    const record = await readInheritedVocalRoom(select(delivery, key), select(previous, key));
    results.push({room:key, reviewedRoom:key, result:{ok:true, ...record}});
  }
  if (delivery === candidate) {
    await assert.rejects(readInheritedVocalRoom(select(candidate, rooms[0]), select(ancestor, rooms[0])),
      {code:'vocal-origin-not-inherited'});
    report.wrongAncestor = {pin:pins[ancestor], rejection:'vocal-origin-not-inherited'};
  }
  return {manifest:pins[delivery], reviewedManifest:pins[previous], rooms:results};
}

async function harness(delivery, previous, authorities) {
  // Reuse the pinned CPU fixture's signed actors, asset checks and independent
  // surface/pose sampler. Its older scenarios expect the original female rejection.
  const bytes = await readFile(original);
  assert.equal(sha(bytes), qaPin);
  const input = bytes.toString();
  const end = input.indexOf('async function scenarios(');
  const declaration = 'const receipt=JSON.parse(await readFile(path.join(root,archived)));';
  assert(end > 0 && input.indexOf(declaration) < end && input.includes(declaration));
  const source = input.slice(0, end).replace(declaration, `const receipt=${JSON.stringify(authorities)};`) +
    '\nexport { inputs, activate, pose, task, lease, tick, contactReadback, proveContact, waitForRelease, actorPose, released, presence };\n' +
    'export const closeHook = () => hook?.deregister();\n';
  const originalArgv = process.argv;
  process.argv = [process.execPath, original.pathname, '--company', path.join(company, delivery),
    '--reviewed', path.join(company, previous), '--runtime', runtime, '--commit', commit];
  const url = original.href + '?' + delivery;
  const wrapper = registerHooks({load(id, ctx, next) {
    return id === url ? {shortCircuit:true, format:'module', source} : next(id, ctx);
  }});
  try {return await import(url);} finally {wrapper.deregister(); process.argv = originalArgv;}
}

async function exercise(delivery, previous, authorities) {
  const {contactReadback, proveContact, waitForRelease, released, actorPose, presence,
    inputs, activate, pose, task, lease, tick, closeHook} = await harness(delivery, previous, authorities);
  const candidateRun = delivery === candidate;
  const result = {rooms:[]};
  report.runs[delivery] = result;
  const errors = [];
  async function drive(ctx, actor, requestId) {
    const start = actor.avatar.root.position.clone();
    let frames = 0;
    for (; task(actor, requestId).state === 'running' && frames < 3600; frames++) {
      tick(ctx);
      if (frames < 32 || frames % 30 === 0) await new Promise(resolve => setImmediate(resolve));
    }
    return {frames, travelledM:start.distanceTo(actor.avatar.root.position), task:task(actor,requestId)};
  }
  try {
    const fixture = await inputs(), {definitions, open, THREE} = fixture;
    for (const definition of definitions) {
      const {key, point, saveSha256} = definition;
      const room = {key, pointId:point.id, resource:point.resource, saveSha256, actors:[]};
      result.rooms.push(room);
      for (const [index, gender] of ['female','male'].entries()) {
        let live;
        const row = {gender};room.actors.push(row);
        try {
          live = await open(definition);
          let actor = [...live.actors.values()][index];
          const approved = candidateRun || index === 1;
          row.actor = presence(actor);
          activate(actor,'arrive',point);
          row.arrival = await drive(live,actor,'arrive');
          row.contact = contactReadback(THREE,live,actor,point);
          assert(row.arrival.travelledM > .1);
          assert.equal(row.arrival.task.state, approved ? 'completed' : 'failed');
          assert.equal(row.contact.controller.lipAnchor.source, 'descriptor');
          proveContact(THREE,row.contact,point,approved);
          const token = lease(live,point).token;
          if (!approved) {
            assert.equal(row.arrival.task.reason,'vocal-performer-outside-pickup-window');
            row.return = waitForRelease(live,actor,point);
            assert.equal(row.return.lease,null);
            row.release = released(live,token);
            continue;
          }
          row.hold = {frames:0,minimumM:Infinity,maximumM:0,violations:[]};
          const frames = candidateRun ? 900 : 120;
          for (let frame = 1; frame <= frames; frame++) {
            tick(live);
            const contact = actor.controller.vocalContact();
            row.hold.frames = frame;
            row.hold.minimumM = Math.min(row.hold.minimumM,contact.mouthDistance);
            row.hold.maximumM = Math.max(row.hold.maximumM,contact.mouthDistance);
            if (!contact.withinPickupWindow || lease(live,point)?.state !== 'occupied') {
              row.hold.violations.push({frame,phase:pose(actor).phase,contact});
              break;
            }
          }
          assert.equal(row.hold.violations.length,0);
          const saved = JSON.parse(JSON.stringify(live.capture()));
          row.saved = actorPose(saved,actor);
          live.close();live = await open(definition);
          const restored = await live.restore(saved);
          actor = [...live.actors.values()][index];
          row.restored = actorPose(restored,actor);
          assert.deepEqual(row.restored,row.saved);
          assert.equal(lease(live,point).ownerId,actor.identity.id);
          activate(actor,'exit',null,'stand');
          row.exit = await drive(live,actor,'exit');
          assert.equal(row.exit.task.state,'completed');
          assert.equal(lease(live,point),null);
        } catch (error) {row.error = error.stack;errors.push(key+'/'+gender+': '+error.message);}
        finally {live?.close();}
      }
    }
    fixture.verifyRuntime();
    assert.equal(errors.length,0,errors.join('\n'));
  } finally {closeHook();}
}

try {
  const build = JSON.parse(await readFile(path.join(runtime, 'prototype/dist/build-info.json')));
  assert.equal(build.sourceDigest,sourceDigest);
  const pair = await readFile(path.join(root,approvedPair,'runtime-package.json'));
  assert.equal(sha(pair),pairPin);
  assert.equal(JSON.parse(pair).runtime.sourceDigest,sourceDigest);
  assert.equal(JSON.parse(pair).runtime.sourceCommit,commit);
  // The two pre-registration CLI refusals are preserved in pre-registration.json.
  // Replay the same contact measurements independently of the current release registry.
  const before = await receipt(prior,ancestor), after = await receipt(candidate,prior);
  report.authority = {before:before.rooms,after:after.rooms};
  for (const [i, old] of before.rooms.entries()) {
    const point = old.result.points[0], next = after.rooms[i].result.points[0];
    for (const field of ['id','kind','facilityId','slotId','roomId','floorId','transform','approachPosition','exitPosition','contact','performerReferences'])
      assert.deepEqual(next[field],point[field],field);
    assert.notDeepEqual(next.resource,point.resource);
  }
  const failures = [];
  for (const [delivery, previous, authorities] of [[prior,ancestor,before],[candidate,prior,after]]) {
    try {await exercise(delivery,previous,authorities);}
    catch (error) {failures.push(`${delivery} ${error.message}`);}
  }
  assert.equal(failures.length,0,failures.join('\n'));
  report.status = 'passed';
} catch (error) {report.status = 'failed';report.error = error.stack;process.exitCode = 1;}
finally {
  await mkdir(path.dirname(output),{recursive:true});
  await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({status:report.status,report:output,error:report.error}));
}
