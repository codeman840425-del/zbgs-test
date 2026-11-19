// Candidate-only glasses lifecycle chain. It never writes a formal admission report.
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {pathToFileURL} = require('node:url');
const {productionRoot, projectOutput} = require('./project-output.cjs');
const {launchQABrowser} = require('./qa-browser-workspace.cjs');

const defaultCases = [
  ['native-contour-roundness-a-v1', '825a82c944636971304ce50b7526b1410ea6f1c6b58bd36f166515295696a547'],
  ['native-contour-cheek-b-v1', '9592933507b3290100d82ac315e5ddac7b6e284f372a1368de9f424643846ddb'],
];
const SHA = /^[a-f0-9]{64}$/;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const isSha = value => typeof value==='string' && SHA.test(value);
const exactKeys = (object, ...keys) => object && typeof object==='object' && !Array.isArray(object) &&
  Object.keys(object).length === keys.length && keys.every(key => Object.hasOwn(object,key));

async function loadCases(file) {
  if (!file) return {cases:defaultCases.map(([bodyType,bodySHA256])=>({bodyType,bodySHA256}))};
  const casePath = await fs.realpath(file);
  const body = await fs.readFile(casePath);
  const config = JSON.parse(body);
  assert(exactKeys(config,'schema','buildId','sourceDigest','signedRecords','cases') &&
    config.schema === 'native-glasses-candidate-cases-v1' && isSha(config.sourceDigest) &&
    config.buildId === config.sourceDigest.slice(0,12), 'Invalid fixed build or cases schema');
  const records = config.signedRecords;
  assert(exactKeys(records,'path','sha256') && typeof records.path==='string' && records.path && isSha(records.sha256),
    'Expected an exact signed records path and SHA-256');
  assert(Array.isArray(config.cases) && config.cases.length > 0, 'Expected nonempty glasses cases');
  const seen = new Set();
  for (const entry of config.cases) {
    assert(exactKeys(entry,'bodyType','bodySHA256','recordSha256','fitSHA256') && typeof entry.bodyType==='string' &&
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.bodyType) && entry.bodyType.length <= 96 &&
      [entry.bodySHA256,entry.recordSha256,entry.fitSHA256].every(isSha), 'Invalid glasses case identity');
    assert(!seen.has(entry.bodyType), 'Duplicate glasses body type');
    seen.add(entry.bodyType);
  }
  const recordPath = await fs.realpath(path.resolve(path.dirname(casePath), records.path));
  const bytes = await fs.readFile(recordPath);
  assert.equal(sha(bytes), records.sha256, 'Signed records file SHA-256 mismatch');
  const signed = JSON.parse(bytes);
  assert(Array.isArray(signed), 'Expected a signed records array');
  const cases = config.cases.map(entry=>{
    const matches = signed.filter(record=>record?.integrity?.recordSha256 === entry.recordSha256);
    assert.equal(matches.length,1, 'Expected exactly one signed record for ' + entry.bodyType);
    const [record] = matches;
    assert.equal(record.appearanceRecipe?.base?.bodyType,entry.bodyType);
    assert.equal(record.appearanceRecipe.base.sha256,entry.bodySHA256);
    assert.equal(record.appearanceRecipe.appearance.hairStyle,'original');
    assert.deepEqual(record.liveAccessories?.selections?.glasses,{enabled:false,identity:null});
    return {...entry,record};
  });
  return {cases, fixed:{buildId:config.buildId,sourceDigest:config.sourceDigest},
    caseFile:{path:casePath,sha256:sha(body)}, signedRecords:{path:recordPath,sha256:records.sha256}};
}

async function sourceMeshPositions(bytes) {
  const modulePath = require.resolve('../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
  const {GLTFLoader} = await import(pathToFileURL(modulePath).href);
  const {scene} = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),'');
  const meshes = {};
  scene.traverse(mesh=>{
    if (!mesh.isMesh) return;
    const positions = mesh.geometry.attributes.position;
    assert(positions.array instanceof Float32Array && positions.itemSize===3 && !positions.isInterleavedBufferAttribute);
    assert(!Object.hasOwn(meshes,mesh.name), 'Ambiguous source mesh ' + mesh.name);
    meshes[mesh.name] = positions.array.slice();
  });
  return meshes;
}

function expectedTempleGeometry(profile, source) {
  assert.deepEqual(profile.controls.map(row=>row.mesh).sort(),['Temple-1','Temple1']);
  const meshes = {...source};
  const temples = [];
  for (const control of profile.controls) {
    const original = source[control.mesh];
    assert.equal(original.length,36*3);
    assert.equal(control.vertices,36);
    assert.equal(sha(Buffer.from(original.buffer,original.byteOffset,original.byteLength)), control.positionSHA256);
    assert.equal(control.rings.length,4);
    const changed = original.slice();
    const posed = new Set();
    for (const ring of control.rings) {
      assert.equal(ring.indices.length,9);
      for (const index of ring.indices) {
        assert(Number.isInteger(index) && index>=0 && index<36 && !posed.has(index), 'Invalid or repeated temple vertex');
        posed.add(index);
        const delta = Array.from(original.subarray(index*3,index*3+3), (value,i)=>value-ring.sourceCenter[i]);
        for (let axis=0;axis<3;axis++) {
          const value = delta.reduce((sum,offset,column)=>sum+offset*ring.rotationRowMajor[axis*3+column],ring.targetCenter[axis]);
          assert(Number.isFinite(value), 'Nonfinite temple transform');
          changed[index*3+axis] = value;
        }
      }
    }
    assert.equal(posed.size,36);
    assert(changed.some((value,i)=>value!==original[i]), 'Temple profile leaves all positions untouched');
    meshes[control.mesh] = changed;
    temples.push({mesh:control.mesh,sourcePositionSHA256:control.positionSHA256,vertices:posed.size,
      rings:control.rings.map(ring=>ring.indices),earCrestAccessoryLocal:control.earCrestAccessoryLocal??null});
  }
  return {meshes,temples};
}

function checkGeometry(expected, actual) {
  assert.deepEqual(Object.keys(actual).sort(),Object.keys(expected.meshes).sort());
  const errors = {};
  for (const [name,positions] of Object.entries(expected.meshes)) {
    const loaded = actual[name];
    assert.equal(loaded.length,positions.length);
    const maxError = positions.reduce((max,value,i)=>Math.max(max,Math.abs(value-loaded[i])),0);
    const temple = expected.temples.find(row=>row.mesh===name);
    assert(maxError <= (temple ? 1e-7 : 0), 'Loaded vertices differ from the expected positions: ' + name);
    errors[name] = maxError;
  }
  return {temples:expected.temples,maximumPositionErrorM:errors};
}

async function verifiedGeometry(base, caseSpec, asset, entry) {
  const origin = new URL(base).origin;
  async function bytes(pin) {
    const url = new URL(pin.url,base);
    assert.equal(url.origin,origin);
    assert(url.pathname.startsWith('/assets/') && !url.search && !url.hash, 'Expected a fixed asset URL');
    const response = await fetch(url,{redirect:'error'});
    assert(response.ok, 'Fixed asset request failed: ' + url.pathname);
    const body = Buffer.from(await response.arrayBuffer());
    assert.equal(body.byteLength,pin.bytes);
    assert.equal(sha(body),pin.sha256);
    return body;
  }
  assert.equal(entry.sha256,caseSpec.fitSHA256);
  const [fit, glb] = await Promise.all([bytes(entry),bytes(asset)]);
  const profile = JSON.parse(fit);
  assert.equal(profile.schema,'m1.glasses-temple-fit.1');
  assert.equal(profile.bodySHA256,caseSpec.bodySHA256);
  assert.equal(profile.accessorySHA256,asset.sha256);
  return {profileId:profile.id,...expectedTempleGeometry(profile,await sourceMeshPositions(glb))};
}

async function restoreSigned(page, record, build) {
  await page.waitForFunction(() => __debug.buildInfo?.shortId, null, {timeout: 30000});
  const state = await page.evaluate(async input=>{
    const restored = await __debug.restoreCharacterRecord(input);
    const avatar = __debug.avatar();
    return {restored,build:__debug.buildInfo,body:avatar.profile.sha256,
      outfit:avatar.getOutfitInfo().index,hair:avatar.appearance.getState().effectiveHairStyle,
      glasses:avatar.livePresentation.getState().accessories.glasses};
  },record);
  assert.equal(state.build.shortId,build.buildId);
  assert.equal(state.build.sourceDigest,build.sourceDigest);
  assert.equal(state.build.development,false);
  assert.equal(state.restored.applied,true,JSON.stringify(state.restored));
  assert.deepEqual(state.restored.identity,record.identity);
  assert.equal(state.restored.revision,record.revision);
  assert.equal(state.restored.recordSha256,record.integrity.recordSha256);
  assert.equal(state.body,record.appearanceRecipe.base.sha256);
  assert.equal(state.outfit,record.appearanceRecipe.equipment.index);
  assert.equal(state.hair,'original');
  assert.equal(state.glasses.loaded,false);
  return {identity:state.restored.identity,revision:state.restored.revision,
    recordSha256:state.restored.recordSha256,hair:state.hair,outfit:state.outfit};
}

function liveMeshes() {
  const props = [];
  __debug.scene.traverse(object=>{if(object.name==='LiveAccessory:glasses') props.push(object);});
  if (props.length!==1) throw Error('Expected exactly one mounted pair of glasses');
  const meshes = {};
  props[0].traverse(mesh=>{
    if (!mesh.isMesh) return;
    if (Object.hasOwn(meshes,mesh.name)) throw Error('Ambiguous live mesh '+mesh.name);
    meshes[mesh.name] = [...mesh.geometry.attributes.position.array];
  });
  return meshes;
}

async function closeups(page, out, body, phase, geometry) {
  const result = await page.evaluate(({phase,temples})=>{
    const d=__debug, avatar=d.avatar(), renderer=d.renderer, canvas=renderer.domElement;
    const glasses=d.scene.getObjectByName('LiveAccessory:glasses');
    if (!glasses) throw Error('No live glasses for close-ups');
    const hair = [];
    avatar.vrm.scene.traverseVisible(mesh=>{
      if (mesh.isMesh && [mesh.material].flat().every(material=>/_HAIR/.test(material.name))) hair.push(mesh);
    });
    const readCanvas = document.createElement('canvas');
    readCanvas.width=canvas.width;
    readCanvas.height=canvas.height;
    const context=readCanvas.getContext('2d',{willReadFrequently:true});
    const Vector=avatar.root.position.constructor;
    const camera=d.cameraObject();
    const captures=[];
    function observeEarRegion(mesh, rings) {
      const points=rings.slice(2).flatMap(indices=>indices.map(index=>{
        const v=new Vector().fromBufferAttribute(mesh.geometry.attributes.position,index);
        v.applyMatrix4(mesh.matrixWorld).project(camera);
        return [(v.x+1)*canvas.width/2,(1-v.y)*canvas.height/2];
      }));
      const bounds=axis=>[Math.floor(Math.min(...points.map(p=>p[axis])))-2,
        Math.ceil(Math.max(...points.map(p=>p[axis])))+2];
      const [x0,x1]=bounds(0), [y0,y1]=bounds(1);
      const x=Math.max(0,x0), y=Math.max(0,y0), width=Math.min(canvas.width,x1)-x, height=Math.min(canvas.height,y1)-y;
      if (width<=0 || height<=0) return {status:'ear-side rings outside frame'};
      const pixels=()=>{
        renderer.render(d.scene,camera);
        context.clearRect(0,0,canvas.width,canvas.height);
        context.drawImage(canvas,0,0);
        return context.getImageData(x,y,width,height).data;
      };
      const countDifference=()=>{
        const visible=pixels();
        const original=mesh.visible;
        try {
          mesh.visible=false;
          const hidden=pixels();
          let count=0;
          for(let i=0;i<visible.length;i+=4) {
            if (Math.abs(hidden[i]-visible[i])>2 || Math.abs(hidden[i+1]-visible[i+1])>2 ||
                Math.abs(hidden[i+2]-visible[i+2])>2) count++;
          }
          return count;
        } finally {mesh.visible=original;}
      };
      const withOriginalHair=countDifference();
      let withHairHidden=null;
      if (!withOriginalHair && hair.length) {
        try { for(const m of hair)m.visible=false; withHairHidden=countDifference(); }
        finally { for(const m of hair)m.visible=true; }
      }
      const status=withOriginalHair?'temple affects rendered ear-side region':withHairHidden?
        'original hair hides temple contribution in this view':'no temple pixel change in sampled ear-side region';
      return {status,screenBounds:[x,y,width,height],withOriginalHair,withHairHidden};
    }
    for (const direction of ['front','side']) {
      d.view('inspect-face-'+direction);
      const {mode,paused,motion,simulationTime}=d.advance(0);
      if(!paused || !motion.transitionComplete || (phase==='sit' ? mode!=='sit'||motion.sitProgress<=.995 :
        mode!=='idle'||motion.sitProgress>=.005)) throw Error('Close-up pose is not settled: '+phase);
      const png=canvas.toDataURL('image/png').split(',')[1];
      const observations=direction==='side' ? temples.map(temple=>{
        const mesh=glasses.getObjectByName(temple.mesh);
        if (!mesh) throw Error('Missing temple '+temple.mesh);
        const ring=temple.rings[2];
        const ringCenter=ring.reduce((sum,index)=>sum.add(new Vector().fromBufferAttribute(mesh.geometry.attributes.position,index)),new Vector())
          .divideScalar(ring.length).applyMatrix4(mesh.matrixWorld);
        const authoredEar=temple.earCrestAccessoryLocal ? glasses.localToWorld(new Vector().fromArray(temple.earCrestAccessoryLocal)) : null;
        return {mesh:temple.mesh,earSideRingCenterWorld:ringCenter.toArray(),authoredEarCrestWorld:authoredEar?.toArray()??null,
          ringCenterToAuthoredEarCrestM:authoredEar?ringCenter.distanceTo(authoredEar):null,
          visibility:observeEarRegion(mesh,temple.rings)};
      }) : undefined;
      renderer.render(d.scene,camera);
      captures.push({direction,png,simulationTime,mode,sitProgress:motion.sitProgress,
        cameraWorld:camera.matrixWorld.toArray(),projection:camera.projectionMatrix.toArray(),observations});
    }
    return captures;
  },{phase,temples:geometry.temples});
  assert.equal(result[0].simulationTime,result[1].simulationTime,'Close-up cameras used different poses');
  for (const sample of result) {
    const {png,direction} = sample;
    const file = `${body}-${phase}-${direction}.png`;
    await fs.writeFile(path.join(out,file),Buffer.from(png,'base64'),{flag:'wx'});
    delete sample.png;
    sample.file=file;
  }
  return result;
}

async function run(base, outputDir, caseFile) {
  if (!base || !outputDir) throw Error('usage: node qa-native-glasses-candidate-chain.cjs BASE OUTPUT_DIR [CASES_JSON]');
  const out = await projectOutput(outputDir, await productionRoot());
  const input = await loadCases(caseFile);
  await fs.mkdir(out, {recursive: false});
  const session = await launchQABrowser(out,{channel:'chrome'});
  const {browser} = session;
  const report = {
    schema: 'native-glasses-candidate-lifecycle-v1',
    status: 'candidate-only',
    scope: 'Exact-body glasses candidate identity, normal-speed room chain, reload, unload preservation and transaction rollback',
    cases: [],
    errors: [],
    limits: ['No human visual admission', 'No ordinary-PC performance admission', 'No formal runtime registry write', 'Candidate fit remains verified=false'],
  };
  if (input.fixed) {
    report.inputs = {build:input.fixed,cases:input.caseFile,signedRecords:input.signedRecords};
    report.limits.push('Side-view pixel differences observe rendered temple contribution. The authoring ear crest is a reference point; physical contact and visual acceptance remain separately reviewed.');
  }
  try {
    for (const caseSpec of input.cases) {
      const {bodyType:body,bodySHA256,record} = caseSpec;
      const context = await browser.newContext({
        viewport: {width: 1440, height: 1000},
        ...(!record ? {recordVideo:{dir:out,size:{width:1440,height:1000}}} : {}),
      });
      let page;
      const row = {bodyType: body, bodySHA256, accessorySHA256: null, fitSHA256: null,
        errors: [], snapshots: [], closeReopen: false, lifecycle: {}};
      try {
        page = await context.newPage();
        page.on('pageerror', error => { row.errors.push(String(error)); report.errors.push(`${body}: ${error}`); });
        page.on('console', message => {
          if (message.type() === 'error') { row.errors.push(message.text()); report.errors.push(`${body}: ${message.text()}`); }
        });
        const url = new URL(base);
        url.searchParams.set('workbench','appearance');
        url.searchParams.set('glassesFit','candidate');
        url.searchParams.set('body',body);
        await page.goto(url.href);
        await page.waitForFunction(() => window.__debug?.ready, null, {timeout: 60000});
        if (record) row.signedInput = await restoreSigned(page,record,input.fixed);
        const expected = await page.evaluate(async bodyType => {
          const [accessories, candidates] = await Promise.all([
            fetch('/assets/m1c/accessories.json', {cache: 'no-store'}).then(response => response.json()),
            fetch('/assets/native-glasses-candidate-v2/manifest.json', {cache: 'no-store'}).then(response => response.json()),
          ]);
          const accessory = accessories.items.find(item => item.id === 'studio-glasses-v1');
          const fit = candidates.profiles.find(item => item.bodyType === bodyType);
          return {accessorySHA256: accessory?.sha256, fitSHA256: fit?.sha256, candidateStatus: candidates.status, accessory, fit};
        }, body);
        assert.match(expected.accessorySHA256 || '', /^[a-f0-9]{64}$/);
        assert.match(expected.fitSHA256 || '', /^[a-f0-9]{64}$/);
        assert.equal(expected.candidateStatus, 'candidate-only');
        row.accessorySHA256 = expected.accessorySHA256;
        row.fitSHA256 = expected.fitSHA256;
        const geometry = record ? await verifiedGeometry(base,caseSpec,expected.accessory,expected.fit) : null;
        const apply = await page.evaluate(async () => {
          const result = await __debug.avatar().livePresentation.setAccessory('glasses', true);
          return {result, state: __debug.avatar().livePresentation.getState(), build: __debug.buildInfo};
        });
        assert.equal(apply.result.applied, true, JSON.stringify(apply.result));
        assert.equal(apply.state.accessories.glasses.loaded, true);
        assert.equal(apply.state.bodyType, body);
        assert.equal(apply.state.avatarSha256, bodySHA256);
        assert.equal(apply.result.identity.bodySHA256, bodySHA256);
        assert.equal(apply.result.identity.accessorySHA256, expected.accessorySHA256);
        assert.equal(apply.result.identity.fit.bodySHA256, bodySHA256);
        assert.equal(apply.result.identity.fit.accessorySHA256, expected.accessorySHA256);
        assert.equal(apply.result.identity.fit.sha256, expected.fitSHA256);
        assert.equal(apply.result.identity.fit.status, 'fitted-candidate');
        assert.equal(apply.result.identity.fit.verified, false);
        assert.equal(apply.result.identity.fit.sourceGeometryUnmodified, true);
        if (geometry) assert.equal(apply.result.identity.fit.id,geometry.profileId);
        const assertAttached = sample => {
          assert.equal(sample.accessories.glasses.loaded, true);
          assert.equal(sample.accessories.glasses.status, 'on');
          assert.equal(sample.accessories.glasses.sha256, expected.accessorySHA256);
          assert.equal(sample.accessories.glasses.identity.bodySHA256, bodySHA256);
          assert.equal(sample.accessories.glasses.identity.accessorySHA256, expected.accessorySHA256);
          assert.equal(sample.accessories.glasses.identity.fit.sha256, expected.fitSHA256);
          assert.equal(sample.accessories.glasses.identity.fit.verified, false);
        };
        row.build = apply.build;
        row.fit = apply.result.identity?.fit;
        row.snapshots.push({name: 'glasses-on', state: apply.state});
        if (geometry) {
          row.geometry = {standing:checkGeometry(geometry,await page.evaluate(liveMeshes))};
          row.closeups = {stand:await closeups(page,out,body,'stand',geometry)};
        }
        await page.evaluate(() => { __debug.camera('room'); __debug.setPlaybackRate(1); __debug.setPaused(false); });
        await page.evaluate(() => __debug.walkTo(-0.5, 1.8));
        await page.waitForTimeout(2600);
        const capture = () => page.evaluate(() => ({
          snapshot: __debug.snapshot(),
          accessories: __debug.avatar().livePresentation.getState().accessories,
        }));
        const walking = await capture();
        assertAttached(walking);
        row.snapshots.push({name: 'walking', state: walking});
        row.lifecycle.walkingAttached = true;
        await page.evaluate(() => __debug.action('sit'));
        await page.waitForFunction(() => __debug.snapshot().mode === 'sit' && __debug.snapshot().motion.sitProgress > .99, null, {timeout: 30000});
        if (geometry) {
          await page.waitForFunction(() => __debug.snapshot().motion.transitionComplete, null, {timeout: 10000});
          row.geometry.seated = checkGeometry(geometry,await page.evaluate(liveMeshes));
          row.closeups.sit = await closeups(page,out,body,'sit',geometry);
        }
        const seated = await capture();
        assertAttached(seated);
        row.snapshots.push({name: 'seated', state: seated});
        row.lifecycle.seatedAttached = true;
        if (geometry) await page.evaluate(() => { __debug.camera('room'); __debug.setPaused(false); });
        await page.evaluate(() => __debug.action('stand'));
        await page.waitForFunction(() => __debug.snapshot().motion.sitProgress < .01 && __debug.snapshot().motion.transitionComplete, null, {timeout: 20000});
        const standingAgain = await capture();
        assertAttached(standingAgain);
        row.snapshots.push({name: 'standing-again', state: standingAgain});
        row.lifecycle.standingAgainAttached = true;
        const video = page.video();
        await page.close();
        if (video) await video.saveAs(path.join(out, `${body}-normal1x.webm`));

        page = await context.newPage();
        page.on('pageerror', error => { row.errors.push(String(error)); report.errors.push(`${body} reload: ${error}`); });
        await page.goto(url.href);
        await page.waitForFunction(() => window.__debug?.ready, null, {timeout: 60000});
        if (record) row.reopenedSignedInput = await restoreSigned(page,record,input.fixed);
        const reload = await page.evaluate(async () => {
          const result = await __debug.avatar().livePresentation.setAccessory('glasses', true);
          return {result, state: __debug.avatar().livePresentation.getState()};
        });
        assert.equal(reload.result.applied, true, JSON.stringify(reload.result));
        assert.equal(reload.state.accessories.glasses.loaded, true);
        assert.equal(reload.state.bodyType, body);
        assert.equal(reload.state.avatarSha256, bodySHA256);
        assert.equal(reload.result.identity.bodySHA256, bodySHA256);
        assert.equal(reload.result.identity.accessorySHA256, expected.accessorySHA256);
        assert.equal(reload.result.identity.fit.sha256, expected.fitSHA256);
        assert.equal(reload.result.identity.fit.verified, false);
        if (geometry) row.geometry.reopened = checkGeometry(geometry,await page.evaluate(liveMeshes));
        row.closeReopen = true;
        row.lifecycle.reloadedAttached = true;
        row.reload = {fit: reload.result.identity?.fit, state: reload.state};

        // A canceled unload must leave the currently committed accessory intact.
        const canceledUnload = await page.evaluate(async () => {
          const presentation = __debug.avatar().livePresentation;
          const before = presentation.getState().accessories.glasses;
          const update = await presentation.prepareAccessory('glasses', false);
          update.release();
          return {before, after: presentation.getState().accessories.glasses};
        });
        assert.equal(canceledUnload.before.loaded, true);
        assert.equal(canceledUnload.after.loaded, true);
        assert.deepEqual(canceledUnload.after.identity, canceledUnload.before.identity);
        row.lifecycle.canceledUnloadPreservesPrevious = true;

        // A committed unload can still be rolled back before finalization.
        const unloadRollback = await page.evaluate(async () => {
          const presentation = __debug.avatar().livePresentation;
          const before = presentation.getState().accessories.glasses;
          const update = await presentation.prepareAccessory('glasses', false);
          const committed = update.commit();
          const during = presentation.getState().accessories.glasses;
          update.rollback();
          return {before, committed, during, after: presentation.getState().accessories.glasses};
        });
        assert.equal(unloadRollback.committed.applied, true);
        assert.equal(unloadRollback.during.loaded, false);
        assert.equal(unloadRollback.after.loaded, true);
        assert.deepEqual(unloadRollback.after.identity, unloadRollback.before.identity);
        row.lifecycle.committedUnloadRollbackPreservesPrevious = true;

        // An identity error during commit must not clear or replace the old prop.
        const errorRollback = await page.evaluate(async () => {
          const presentation = __debug.avatar().livePresentation;
          const before = presentation.getState().accessories.glasses;
          const update = await presentation.prepareAccessory('glasses', true);
          update.identity = {...update.identity, bodySHA256: '0'.repeat(64)};
          let error = null;
          try { update.commit(); } catch (caught) { error = String(caught.message || caught); }
          const after = presentation.getState().accessories.glasses;
          update.release();
          return {before, after, error};
        });
        assert.match(errorRollback.error || '', /body\/resource identity mismatch/);
        assert.equal(errorRollback.after.loaded, true);
        assert.deepEqual(errorRollback.after.identity, errorRollback.before.identity);
        row.lifecycle.identityErrorRollbackPreservesPrevious = true;

        const removed = await page.evaluate(async () => {
          const result = await __debug.avatar().livePresentation.setAccessory('glasses', false);
          return {result, state: __debug.avatar().livePresentation.getState(),
            mounted:Boolean(__debug.scene.getObjectByName('LiveAccessory:glasses'))};
        });
        assert.equal(removed.result.applied, true);
        assert.equal(removed.state.accessories.glasses.loaded, false);
        if (geometry) assert.equal(removed.mounted,false);
        row.lifecycle.unloaded = true;
        const restored = await page.evaluate(async () => {
          const result = await __debug.avatar().livePresentation.setAccessory('glasses', true);
          return {result, state: __debug.avatar().livePresentation.getState()};
        });
        assert.equal(restored.result.applied, true);
        assert.equal(restored.result.identity.fit.sha256, expected.fitSHA256);
        assert.equal(restored.state.accessories.glasses.loaded, true);
        if (geometry) {
          assert.deepEqual(restored.result.identity,apply.result.identity);
          row.geometry.reinstalled = checkGeometry(geometry,await page.evaluate(liveMeshes));
        }
        row.lifecycle.restoredAfterUnload = true;
      } catch (error) {
        row.status = 'failed';
        row.failure = String(error.stack || error);
        report.status = 'failed';
        process.exitCode = 1;
      } finally {
        await page?.close().catch(() => {});
        await context.close();
      }
      report.cases.push(row);
    }
  } finally {
    try { await session.close(); }
    finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2),{flag:'wx'}); }
  }
  if (report.errors.length || report.status === 'failed') process.exitCode = 1;
  console.log(JSON.stringify({status: report.status, cases: report.cases.length, errors: report.errors.length, out}));
}

if (require.main===module) {
  run(...process.argv.slice(2)).catch(error => { console.error(error.stack || error); process.exitCode = 1; });
}
module.exports = {run, loadCases, sourceMeshPositions, expectedTempleGeometry, checkGeometry, restoreSigned, verifiedGeometry, liveMeshes};
