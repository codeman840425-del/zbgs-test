// Verify lazy, isolated descriptor loading through the ordinary packaged room.
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const {projectOutput, productionRoot} = require('./project-output.cjs');
const {launchQABrowser} = require('./qa-browser-workspace.cjs');

const MALE = '2e66ee6c88524bca3f61b834672e89d3146f9f41859811d2159a01c0edf10617';
const FEMALE = '1049f87a865e523e02b53d9985a37aa5229dd2221b7a9645f2261f16d35c172c';
const PAIR = 'd38cd555d8b125c606ef28775b08fa96b2834c40c082e7ee06478dc4035f6989';
const COMPANY = '5c676cafa500ac5fc79d2461935fc323844e02fa0a1baa01c8025cd75d3e4012';
const ANCHOR_DIR = '/assets/performer-lip-anchors-v1/';
const STATES = ['completed', 'failed', 'cancelled'];
const TIMEOUT = 45000;
const VIEWPORT = {width:1440,height:900};
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

async function issue(page, actor, kind) {
  const selector = kind === 'stand' ? '#facility-stand' : '#facility-sit';
  await page.locator('#facility-actor').selectOption(actor);
  const before = await page.evaluate(id => __recordConsumer.actors.get(id).controller.behaviorTasks.history().length, actor);
  await page.locator(selector).click();
  const task = await page.evaluate(({actor,before}) => {
    const tasks = __recordConsumer.actors.get(actor).controller.behaviorTasks;
    const result = tasks.history().slice(before).find(event => ['accepted','rejected','queued'].includes(event.type));
    return result ? tasks.get(result.task.requestId) : null;
  }, {actor,before});
  assert(task, 'The room control issued no task');
  assert.equal(task.kind, kind);
  assert.equal(task.admission, 'accepted', JSON.stringify(task));
  return task;
}

async function terminal(page, request, state, reason = null) {
  const handle = await page.waitForFunction(({actor,id,states}) => {
    const task = __recordConsumer.actors.get(actor).controller.behaviorTasks.get(id);
    return states.includes(task?.state) ? task : null;
  }, {actor:request.ownerId,id:request.requestId,states:STATES}, {timeout:TIMEOUT});
  const task = await handle.jsonValue();
  await handle.dispose();
  assert.equal(task.state, state, JSON.stringify(task));
  assert.equal(task.reason, reason, JSON.stringify(task));
  return task;
}

async function roomState(page, point) {
  return page.evaluate(point => {
    const consumer = __recordConsumer;
    const actors = Object.fromEntries([...consumer.actors].map(([id,actor]) => {
      const {avatar,controller} = actor, {speaking,action,gaze,accessories} = avatar.livePresentation.getState();
      const root = avatar.root, visibleMeshes = [], mouthMeshes = [];
      root.traverseVisible(mesh => {
        if (!mesh.isSkinnedMesh) return;
        visibleMeshes.push(mesh.uuid);
        const materials = [mesh.material].flat().map(material => material?.name);
        if (materials.some(name => name?.includes('FaceMouth')))
          mouthMeshes.push({uuid:mesh.uuid,geometry:mesh.geometry.uuid,materials,positions:mesh.geometry.attributes.position.count});
      });
      let pose;
      try { pose = controller.captureFacilityPose().phase; }
      catch(error) {
        if(error.message!=='facility-pose-in-transition')throw error;
        pose = 'transition';
      }
      return [id,{record:actor.recordSha256,revision:actor.revision,body:avatar.getAssetProfile().sha256,
        root:root.uuid,vrm:avatar.vrm.scene.uuid,mounted:consumer.scene.getObjectById(root.id)===root,
        position:root.position.toArray(),yaw:root.rotation.y,visibleMeshes:visibleMeshes.sort(),mouthMeshes,
        pose,speaking,action,gaze,accessories}];
    }));
    return {actors,lease:consumer.seatLeases.forSeat(point),renderCalls:consumer.renderer.info.render.calls,
      status:document.querySelector('#room-status').textContent};
  }, point);
}

function bodyIdentity(actor) {
  const {record,revision,body,root,vrm,mounted,visibleMeshes,mouthMeshes} = actor;
  return {record,revision,body,root,vrm,mounted,visibleMeshes,mouthMeshes};
}

async function savedState(page) {
  return page.evaluate(() => {
    const keys = Object.keys(localStorage).filter(key => key.startsWith('facility-room-state:'));
    if (keys.length !== 1) throw Error('Expected the room control to write one signed save');
    return {key:keys[0],bytes:localStorage.getItem(keys[0]),pose:__recordConsumer.captureFacilityState()};
  });
}

function anchorRequests(row, href, count) {
  assert.deepEqual(row.network.map(entry => [entry.url,entry.method]), Array.from({length:count},() => [href,'GET']),
    'The room must load the exact selected-body URL only');
}

async function checkVocalGeometry(page, male, point, descriptor, publishedSha) {
  const detail = await page.evaluate(({male,point,descriptor}) => {
    const consumer = __recordConsumer, actor = consumer.actors.get(male), {avatar,controller} = actor;
    const {Vector3,Box3,Raycaster} = consumer.three;
    avatar.root.updateWorldMatrix(true,true);
    const candidates = [];
    avatar.vrm.scene.traverseVisible(mesh => {
      if (mesh.isSkinnedMesh && [mesh.material].flat().some(material =>
        material?.name===descriptor.faceMouth.material)) candidates.push(mesh);
    });
    if (candidates.length !== 1) throw Error('Expected one visible signed FaceMouth primitive');
    const mouth = candidates[0], p = new Vector3(), centroid = new Vector3();
    const referenced = new Set(mouth.geometry.index.array);
    for (const i of descriptor.rimVertexIds) {
      if (!referenced.has(i)) throw Error('Descriptor rim includes an unreferenced vertex');
      centroid.add(mouth.getVertexPosition(i,p).applyMatrix4(mouth.matrixWorld));
    }
    centroid.divideScalar(descriptor.rimVertexIds.length);
    const humanoid = avatar.vrm.humanoid;
    const eye = humanoid.getRawBoneNode('leftEye').getWorldPosition(new Vector3())
      .lerp(humanoid.getRawBoneNode('rightEye').getWorldPosition(new Vector3()),.5);
    const live = facilityRoom.session.scene.resolveUsePoint(point), pickup = live.pickupMesh;
    pickup.updateWorldMatrix(true,false);
    const center = pickup.localToWorld(new Box3().setFromBufferAttribute(pickup.geometry.attributes.position).getCenter(new Vector3()));
    const hit = new Raycaster(centroid,center.sub(centroid).normalize()).intersectObject(pickup,false)[0];
    if (!hit) throw Error('The posed mouth ray missed the installed grille');
    return {contact:controller.vocalContact(),mouth:{uuid:mouth.uuid,geometry:mouth.geometry.uuid,
      rimVertices:descriptor.rimVertexIds.length,centroid:centroid.toArray()},eye:eye.toArray(),
      pickup:{name:pickup.name,uuid:pickup.uuid,hit:hit.point.toArray(),distance:hit.distance}};
  }, {male,point,descriptor});
  const contact = detail.contact;
  assert.deepEqual(contact.lipAnchor,{source:'descriptor',method:'posed-rim-vertices',descriptorSha256:publishedSha});
  const compare = (a,b) => assert(Math.hypot(...a.map((n,i)=>n-b[i]))<1e-6,JSON.stringify({a,b}));
  assert.equal(contact.usePointId,point);
  assert.equal(contact.pickupNodeId,detail.pickup.name);
  compare(contact.mouthWorld,detail.mouth.centroid);
  compare(contact.eyeWorld,detail.eye);
  compare(contact.pickupWorld,detail.pickup.hit);
  assert(Math.abs(contact.mouthDistance-detail.pickup.distance)<1e-6);
  assert.equal(contact.withinPickupWindow,true);
  assert(detail.pickup.distance>=.06 && detail.pickup.distance<=.26);
  assert(contact.incidenceDegrees<=35 && contact.facingDegrees<=45);
  return detail;
}

async function withRoom(browser, settings, entry, row, intercept, check, beforeClose = () => {}) {
  const context = await browser.newContext({viewport:VIEWPORT,deviceScaleFactor:1,serviceWorkers:'block'});
  try {
    const page = await context.newPage();
    row.network = [];
    row.pageErrors = [];
    page.on('pageerror', error => row.pageErrors.push(error.message));
    page.on('request', request => {
      if (new URL(request.url()).pathname.startsWith(ANCHOR_DIR))
        row.network.push({url:request.url(),method:request.method()});
    });
    await context.route(settings.maleHref, intercept);
    const url = new URL('/facility-room.html',settings.origin);
    url.searchParams.set('room',entry.key);
    await page.goto(url.href);
    const ready = page.locator('#room-status');
    await page.waitForFunction(() => ['ready','error'].includes(document.querySelector('#room-status')?.dataset.state),
      null,{timeout:90000});
    assert.equal(await ready.getAttribute('data-state'),'ready',await ready.textContent());
    assert.equal(await page.locator('#facility-seat').inputValue(),entry.primaryUsePointId);
    assert.match(await page.locator('#facility-sit').textContent(),/站唱/);
    const runtime = await page.evaluate(() => ({build:__recordConsumer.buildInfo.shortId,room:facilityRoom.roomKey,
      errors:__recordConsumer.errors}));
    assert.deepEqual(runtime,{build:settings.build,room:entry.key,errors:[]});
    await page.waitForFunction(() => __recordConsumer.renderer.info.render.calls>0,null,{timeout:TIMEOUT});
    row.initial = await roomState(page,entry.primaryUsePointId);
    assert.equal(row.initial.lease,null);
    assert.deepEqual(Object.keys(row.initial.actors).sort(),Object.keys(settings.records).sort());
    for (const [id,actor] of Object.entries(row.initial.actors)) {
      assert.equal(actor.record,settings.records[id].record);
      assert.equal(actor.body,settings.records[id].body);
      assert(actor.mounted && actor.mouthMeshes.length===1 && actor.visibleMeshes.length>0);
      assert.equal(actor.pose,'idle');
      assert.equal(actor.speaking,false);
    }
    anchorRequests(row,settings.maleHref,0);
    try { await check(page); }
    catch(error) {
      row.atFailure = await roomState(page,entry.primaryUsePointId).catch(()=>null);
      await page.screenshot({path:path.join(settings.out,entry.key+'-'+row.name+'-failed.png')}).catch(()=>{});
      throw error;
    }
    assert.deepEqual(row.pageErrors,[]);
  } finally {
    beforeClose();
    await context.close();
  }
}

async function replay(browser,settings,entry,row) {
  const {male,peer,maleHref,maleAsset,out} = settings, point = entry.primaryUsePointId;
  let intercepted = 0;
  const injectFirst = route => ++intercepted === 1
    ? route.fulfill({status:404,contentType:'text/plain',body:'QA: selected lip descriptor unavailable'})
    : route.continue();

  await withRoom(browser,settings,entry,row,injectFirst,async page => {
    await page.locator('#facility-save').click();
    row.saved = await savedState(page);
    assert.deepEqual(JSON.parse(row.saved.bytes),row.saved.pose);
    anchorRequests(row,maleHref,0);

    const failureResponse = page.waitForResponse(response => response.url()===maleHref,{timeout:TIMEOUT});
    failureResponse.catch(()=>{});
    row.first = await issue(page,male,'standing-vocal');
    row.missingStatus = (await failureResponse).status();
    assert.equal(row.missingStatus,404);
    row.rejection = await terminal(page,row.first,'failed','vocal-lip-anchor-unavailable');
    await page.waitForFunction(() => /失败/.test(document.querySelector('#room-status').textContent),null,{timeout:TIMEOUT});
    row.afterFailure = await roomState(page,point);
    assert.equal(row.afterFailure.lease,null);
    assert.deepEqual(row.afterFailure.actors,row.initial.actors);
    assert.equal(await page.evaluate(id=>__recordConsumer.actors.get(id).controller.vocalContact(),male),null);
    assert.deepEqual(await savedState(page),row.saved);
    anchorRequests(row,maleHref,1);
    await page.screenshot({path:path.join(out,entry.key+'-descriptor-404.png')});

    const successResponse = page.waitForResponse(response => response.url()===maleHref,{timeout:TIMEOUT});
    successResponse.catch(()=>{});
    row.retry = await issue(page,male,'standing-vocal');
    assert.notEqual(row.retry.requestId,row.first.requestId);
    const response = await successResponse;
    row.retryHttpStatus = response.status();
    assert.equal(row.retryHttpStatus,200);
    const bytes = await response.body();
    assert.equal(bytes.length,maleAsset.bytes);
    row.descriptorSha256 = digest(bytes);
    assert.equal(row.descriptorSha256,maleAsset.sha256);
    const descriptor = JSON.parse(bytes);
    assert.equal(descriptor.schema,'character-lip-anchor-v1');
    assert.equal(descriptor.bodySha256,MALE);
    assert.equal(new Set(descriptor.rimVertexIds).size,32);
    row.completed = await terminal(page,row.retry,'completed');
    row.occupied = await roomState(page,point);
    assert.equal(row.occupied.lease?.ownerId,male);
    assert.equal(row.occupied.lease?.state,'occupied');
    assert.equal(row.occupied.actors[male].pose,'vocal');
    assert.equal(row.occupied.actors[male].speaking,true);
    assert.deepEqual(bodyIdentity(row.occupied.actors[male]),bodyIdentity(row.initial.actors[male]));
    assert.deepEqual(row.occupied.actors[peer],row.initial.actors[peer]);
    const movement = (a,b) => Math.hypot(...a.position.map((v,i)=>v-b.position[i]));
    assert(movement(row.occupied.actors[male],row.initial.actors[male])>.10);
    row.geometry = await checkVocalGeometry(page,male,point,descriptor,maleAsset.sha256);
    assert.equal(row.geometry.mouth.uuid,row.initial.actors[male].mouthMeshes[0].uuid);
    anchorRequests(row,maleHref,2);
    await page.screenshot({path:path.join(out,entry.key+'-retry-occupied.png')});

    row.departure = await terminal(page,await issue(page,male,'stand'),'completed');
    row.afterLeave = await roomState(page,point);
    assert.equal(row.afterLeave.lease,null);
    assert.equal(row.afterLeave.actors[male].pose,'idle');
    assert.equal(row.afterLeave.actors[male].speaking,false);
    assert(movement(row.afterLeave.actors[male],row.occupied.actors[male])>.10);
    assert.deepEqual(row.afterLeave.actors[peer],row.initial.actors[peer]);
    row.leaseHistory = await page.evaluate(id => __recordConsumer.seatLeases.history().filter(event=>event.lease.seatId===id),point);
    for (const [task,types] of [[row.first,['reserved','released']],[row.retry,['reserved','occupied','exiting','released']]]) {
      const events = row.leaseHistory.filter(event=>event.lease.requestId===task.requestId);
      assert.deepEqual(events.map(event=>event.type),types);
      assert.equal(events.at(-1).lease.releaseReason,task===row.first?'vocal-lip-anchor-unavailable':'physically-exited');
    }
    await page.locator('#facility-restore').click();
    await page.waitForFunction(() => /已恢复/.test(document.querySelector('#room-status').textContent),null,{timeout:TIMEOUT});
    row.restored = await savedState(page);
    assert.deepEqual(row.restored,row.saved);
    row.afterRestore = await roomState(page,point);
    for (const [id,actor] of Object.entries(row.afterRestore.actors)) {
      assert.equal(actor.record,row.initial.actors[id].record);
      assert.equal(actor.body,row.initial.actors[id].body);
      assert.equal(actor.revision,row.initial.actors[id].revision);
      assert.notEqual(actor.root,row.initial.actors[id].root,'Restoration must mount the saved signed instance again');
      assert.equal(actor.pose,'idle');
      assert(actor.mounted && actor.mouthMeshes.length===1);
    }
    assert.equal(row.afterRestore.lease,null);
    anchorRequests(row,maleHref,2);
  });
}

async function pending(browser,settings,entry,row,destroy) {
  const {male,peer,maleHref} = settings, point = entry.primaryUsePointId;
  const release = Promise.withResolvers(), settled = Promise.withResolvers();
  const hold = async route => {
    await release.promise;
    try {
      await route.continue();
      const response = await route.request().response();
      if (response) await response.finished();
      settled.resolve({status:response?.status()??null,failure:route.request().failure()?.errorText??null});
    } catch(error) { settled.resolve({failure:String(error.message)}); }
  };
  await withRoom(browser,settings,entry,row,hold,async page => {
      const waiting = page.waitForRequest(request => request.url()===maleHref,{timeout:TIMEOUT});
      waiting.catch(()=>{});
      row.task = await issue(page,male,'standing-vocal');
      await waiting;
      anchorRequests(row,maleHref,1);
      row.held = await roomState(page,point);
      assert.equal(row.task.state,'running');
      assert.equal(row.held.lease?.state,'reserved');
      assert.equal(row.held.lease?.ownerId,male);
      assert.equal(row.held.actors[male].pose,'transition');
      assert.deepEqual(row.held.actors[male].position,row.initial.actors[male].position);
      if (destroy) {
        // The packaged consumer exposes removal to its host. No mesh or lease
        // is removed directly by the probe.
        row.removal = await page.evaluate(({male,requestId}) => {
          const consumer = __recordConsumer, actor = consumer.actors.get(male);
          const removed = consumer.removeActor(male);
          return {removed,detached:actor.avatar.root.parent===null,task:actor.controller.behaviorTasks.get(requestId)};
        },{male,requestId:row.task.requestId});
        assert.equal(row.removal.removed,true);
        assert.equal(row.removal.detached,true);
        assert.equal(row.removal.task.state,'cancelled');
        assert.equal(row.removal.task.reason,'owner-destroyed');
      } else {
        row.stop = await terminal(page,await issue(page,male,'stand'),'completed');
        row.cancelled = await terminal(page,row.task,'cancelled','superseded');
      }
      row.afterAction = await roomState(page,point);
      assert.equal(row.afterAction.lease,null);
      assert.deepEqual(row.afterAction.actors[peer],row.initial.actors[peer]);
      if (destroy) assert(!Object.hasOwn(row.afterAction.actors,male));
      else assert.deepEqual(row.afterAction.actors[male],row.initial.actors[male]);
      release.resolve();
      row.lateResponse = await Promise.race([
        settled.promise,
        page.waitForEvent('close',{timeout:TIMEOUT}).then(()=>{throw Error('Room closed during held-response check');}),
      ]);
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      row.afterResponse = await roomState(page,point);
      assert.equal(row.afterResponse.lease,null);
      assert.deepEqual(row.afterResponse.actors,row.afterAction.actors);
      row.leaseHistory = await page.evaluate(token=>__recordConsumer.seatLeases.history().filter(event=>event.lease.token===token),
        row.held.lease.token);
      assert.deepEqual(row.leaseHistory.map(event=>event.type),['reserved','released']);
      assert.equal(row.leaseHistory.at(-1).lease.releaseReason,destroy?'owner-destroyed':'superseded');
      anchorRequests(row,maleHref,1);
  },release.resolve);
}

async function run(base,build,recordsFile,destination,expectedPackageSha) {
  const out = await projectOutput(destination,await productionRoot());
  assert.match(build,/^[0-9a-f]{12}$/,'Expected the 12-digit fixed game build');
  assert.match(expectedPackageSha,/^[0-9a-f]{64}$/,'Expected the combined package SHA-256');
  const origin = new URL(base);
  assert(origin.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(origin.hostname));
  const recordBytes = await fs.readFile(recordsFile);
  assert.equal(digest(recordBytes),PAIR,'Use the two unchanged signed 1K uniform records');
  const signed = JSON.parse(recordBytes);
  assert.deepEqual(signed.map(record=>record.appearanceRecipe.base.sha256).sort(),[FEMALE,MALE].sort());
  const byBody = sha => signed.find(record=>record.appearanceRecipe.base.sha256===sha).identity.id;
  const records = Object.fromEntries(signed.map(record=>[record.identity.id,
    {record:record.integrity.recordSha256,body:record.appearanceRecipe.base.sha256}]));
  const response = await fetch(new URL('/facility-package.json',origin),{redirect:'error'});
  assert(response.ok);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(digest(bytes),expectedPackageSha,'Combined package identity mismatch');
  const published = JSON.parse(bytes);
  assert.equal(published.gameRuntime.buildId,build);
  assert.equal(published.roomManifestSha256,COMPANY);
  assert.deepEqual(published.rooms.map(room=>room.key).sort(),['singing-rental','singing-studio']);
  const malePath = ANCHOR_DIR+MALE+'.json';
  const maleAsset = published.files.find(file=>'/'+file.path===malePath);
  assert.match(maleAsset?.sha256??'',/^[0-9a-f]{64}$/,'Combined package must pin the selected lip descriptor');
  await fs.mkdir(path.dirname(out),{recursive:true});
  await fs.mkdir(out);
  const settings = {out,build,origin,records,male:byBody(MALE),peer:byBody(FEMALE),
    maleHref:new URL(malePath,origin).href,maleAsset};
  const report = {status:'incomplete',build,sourceDigest:published.gameRuntime.sourceDigest,
    packageSha256:expectedPackageSha,roomManifestSha256:COMPANY,recordsSha256:PAIR,records,viewport:VIEWPORT,
    selectedLipAnchor:maleAsset,rooms:[],pending:[]};
  let session;
  try {
    session = await launchQABrowser(out,{channel:'chrome'});
    report.browser = session.browser.version();
    const failures = [];
    for (const entry of published.rooms) {
      const row = {name:'retry',room:entry.key,point:entry.primaryUsePointId};
      report.rooms.push(row);
      try { await replay(session.browser,settings,entry,row); }
      catch(error) { row.failure=String(error.stack??error);failures.push(entry.key); }
    }
    for (const destroy of [false,true]) {
      const room = published.rooms.find(entry=>entry.key==='singing-studio');
      const row = {name:destroy?'pending-destroy':'pending-cancel',room:room.key};
      report.pending.push(row);
      try { await pending(session.browser,settings,room,row,destroy); }
      catch(error) { row.failure=String(error.stack??error);failures.push(row.name); }
    }
    assert.deepEqual(failures,[],failures.join(', '));
    report.status='passed';report.exitCode=0;
  } catch(error) {
    report.status='failed';report.exitCode=1;
    report.failure=String(error.stack??error);
    throw error;
  } finally {
    try { await session?.close(); }
    finally { await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'}); }
  }
}

module.exports = {run};
if(require.main===module)run(...process.argv.slice(2)).catch(error=>{console.error(error);process.exitCode=1;});
