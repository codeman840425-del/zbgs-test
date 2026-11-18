const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const {productionRoot, projectOutput} = require('./project-output.cjs');
const {verifyCandidate} = require('./qa-m1-common.cjs');
const {comparePixels, verifyMatchedPose} = require('./qa-source-outfit-release.cjs');

const CASES = {
  male:{bodyType:'source-male-ab9a-release-v1', assetId:'source-male-ab9a-release-v1',
    sha256:'cf1118a2a8d8fca8ccc094e51d051f660ec12ffdbdda4c8ecaad407b55cef9d4',
    farSha:'eef03164931297e1ae0b4bddfadde40e4458a317a6490e889867cf6ea3759a1d', farIndex:1},
  female:{bodyType:'female', assetId:'beta-base-female-m1',
    sha256:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95',
    farSha:'030a58142ce8fe29cd5bfcbe6a133fc0bb9675384e27e6e4ff0b04a5bbe3caa8', farIndex:5},
};
const VIEWPORT = {width:1600, height:1000};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

function readConfiguredLooks() {
  const d = window.__debug, a = d.avatar(), config = a.config;
  const initial = a.getOutfitInfo().index;
  const near = config.outfits.find(outfit => outfit.index === initial);
  const far = config.outfits.find(outfit => outfit.role === 'pants-top-far' && outfit.equipmentRoles?.includes('topFar'));
  if (!near || !far || near.index === far.index) throw Error('Missing distinct original and topFar outfits');
  function describe(outfit, topRole) {
    const entries = a.getEquipmentRecipe(outfit.index);
    const bottomRole = outfit.bottomRole ?? outfit.role;
    const top = entries[topRole];
    if (!top || top.slot !== 'top' || entries[bottomRole]?.slot !== 'bottom' || entries.shoes?.slot !== 'shoes')
      throw Error('Configured outfit is missing its selected top, pants or shoes');
    const {id, sha256, bytes, compatibleAvatarSha256, url} = top;
    return {index:outfit.index, role:outfit.role, bottomRole, topRole, top:{id, sha256, bytes, compatibleAvatarSha256,
      url:new URL(url, new URL(config.manifestUrl, location.href)).href},
      other:Object.values(entries).filter(entry => entry.id !== id).map(({id, sha256, slot})=>({id, sha256, slot}))};
  }
  const appearance = a.appearance.getState();
  const colors = Object.fromEntries(['hairStyle','hairColor','eyebrowColor','skinTone','eyeColor','lipColor']
    .map(key => [key,appearance[key] ?? null]));
  const gl = d.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
  return {bodyType:a.profile.bodyType, near:describe(near,'top'), far:describe(far,'topFar'),colors,
    environment:{userAgent:navigator.userAgent, pixelRatio:window.devicePixelRatio, webgl:gl.getParameter(gl.VERSION),
      gpu:ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null}};
}

function liveOutfit() {
  const d = window.__debug, a = d.avatar(), state = d.snapshot(), look = a.getOutfitInfo();
  if (state.outfit !== look.index || look.equipment.debugBody) throw Error('The actual dressed outfit is unsettled');
  const entries = Object.values(a.getEquipmentRecipe(look.index));
  const tops = entries.filter(entry => entry.slot === 'top');
  if (tops.length !== 1 || !tops[0].requiresRawSkeleton || !tops[0].bindings?.length) throw Error('Top has no exact raw binding contract');
  const [top] = tops;
  const ids = new Set(), usedBindings = new Set(), maps = new Map();
  let meshes = 0, vertices = 0, inverseBindMax = 0;
  a.vrm.scene.traverseVisible(node => {
    if (node.userData.equipmentId) {
      if (ids.has(node.userData.equipmentId)) throw Error('Duplicate visible equipment container');
      ids.add(node.userData.equipmentId);
    }
    if (!node.isSkinnedMesh || node.parent?.userData.equipmentId !== top.id) return;
    meshes++;
    vertices += node.geometry.attributes.position.count;
    for (const material of [node.material].flat()) {
      const image = material.map?.image;
      if (image && Number.isFinite(image.width) && Number.isFinite(image.height)) maps.set(material.name,[image.width,image.height]);
    }
    for (const [index, bone] of node.skeleton.bones.entries()) {
      const names = [bone.name, bone.userData?.name];
      const bindings = top.bindings.filter(binding => names.includes(binding.targetRawBone));
      if (bindings.length !== 1) throw Error('Live top bone does not map to one declared raw binding');
      const [binding] = bindings;
      const matrix = node.skeleton.boneInverses[index].elements;
      if (binding.inverseBindMatrix.length !== 16 || !binding.inverseBindMatrix.every(Number.isFinite) ||
          matrix.length !== 16 || !matrix.every(Number.isFinite)) throw Error('Invalid live inverse bind matrix');
      inverseBindMax = Math.max(inverseBindMax, ...matrix.map((value, i) => Math.abs(value - binding.inverseBindMatrix[i])));
      let owner = bone.parent;
      while (owner && owner !== a.vrm.scene && !owner.userData.equipmentId) owner = owner.parent;
      if (owner !== a.vrm.scene) throw Error('Top mounted a private armature');
      usedBindings.add(binding.targetRawBone);
    }
  });
  if (!meshes || inverseBindMax > 1e-5 || usedBindings.size !== top.bindings.length ||
      ids.size !== entries.length || entries.some(entry => !ids.has(entry.id))) throw Error('Visible outfit or live bindings differ');
  return {bodyType:a.profile.bodyType, bodySha256:a.profile.sha256, actorUuid:a.root.uuid,
    index:look.index, role:look.equipment.selection.role, revision:state.outfitRevision,
    top:{id:top.id, sha256:top.sha256, meshes, vertices, bindingCount:usedBindings.size, inverseBindMax, baseMaps:[...maps]},
    equipment:[...ids].sort(), coverage:look.equipment.bodyCoverage};
}

function setPose(pose) {
  const d = window.__debug;
  if (pose === 'standing') {
    d.setPaused(true);
    d.reset();
    d.setBodyMode('dressed');
    d.setDynamics(false);
    d.command({type:'speaking', value:false});
    const state = d.advance(0.35);
    if (state.mode !== 'idle' || state.motion.sitProgress !== 0) throw Error('Standing pose did not settle');
    return {steps:1, simulationTime:state.simulationTime};
  }
  const requestId = 'qa-garment-basecolor-seat';
  const request = d.request({requestId, kind:'sit', payload:{usePointId:'room-chair-1'}});
  if (request.admission !== 'accepted') throw Error('Demo chair rejected the deterministic sit request');
  for (let steps = 1; steps <= 64; steps++) {
    const state = d.advance(0.25), task = d.tasks().get(requestId);
    if (['failed','cancelled'].includes(task?.state)) throw Error('Sit request failed: ' + JSON.stringify(task));
    if (task?.state === 'completed' && state.mode === 'sit' && state.motion.sitProgress === 1) {
      const settled = d.advance(0.15);
      return {steps, simulationTime:settled.simulationTime};
    }
  }
  throw Error('Sit pose did not settle within 16 simulation seconds');
}

function captureFrame({view, topId}) {
  const d = window.__debug, a = d.avatar(), renderer = d.renderer;
  if (view === 'front') d.view('inspect-half-front');
  else d.camera('room');
  const state = d.advance(0);
  if (!state.paused) throw Error('Comparison pose is not paused');
  const camera = d.cameraObject().clone();
  if (view === 'room') {
    // Use the actual room preset's fixed endpoints without its wall-clock tween.
    camera.position.set(5.8,4.5,7.8);
    camera.lookAt(0,0.65,0);
  }
  camera.updateMatrixWorld(true);
  const expressions = a.vrm.expressionManager;
  for (const expression of expressions.expressions) expressions.setValue(expression.expressionName,0);
  a.livePresentation.refreshEyeBlinkCompatibility();
  renderer.render(d.scene,camera);
  const canvas = renderer.domElement, width = canvas.width, height = canvas.height;
  const bones = [], point = camera.position.clone();
  a.vrm.scene.traverse(node=>{if (node.isBone) bones.push([node.name,node.matrixWorld.toArray()]);});
  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity, projectedVertices=0;
  a.vrm.scene.traverseVisible(mesh => {
    if (!mesh.isSkinnedMesh || mesh.parent?.userData.equipmentId !== topId) return;
    const geometry = mesh.geometry;
    const indices = geometry.index ? new Set(geometry.index.array) : geometry.attributes.position.count;
    function project(index) {
      mesh.getVertexPosition(index,point).applyMatrix4(mesh.matrixWorld).project(camera);
      const x=(1+point.x)*width/2, y=(1-point.y)*height/2;
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(point.z)) throw Error('Non-finite actual top vertex');
      if (point.z < -1 || point.z > 1) return;
      projectedVertices++;
      minX=Math.min(minX,x); minY=Math.min(minY,y); maxX=Math.max(maxX,x); maxY=Math.max(maxY,y);
    }
    if (typeof indices === 'number') for (let i=0;i<indices;i++) project(i);
    else for (const index of indices) project(index);
  });
  const roi = [Math.max(0,Math.floor(minX)-2),Math.max(0,Math.floor(minY)-2),
    Math.min(width,Math.ceil(maxX)+2),Math.min(height,Math.ceil(maxY)+2)];
  if (!projectedVertices || roi[2]<=roi[0] || roi[3]<=roi[1]) throw Error('Top is outside the capture view');
  return {png:canvas.toDataURL('image/png'),width,height,mode:'dressed',direction:view,pose:state.mode,
    simulationTime:state.simulationTime,sitProgress:state.motion.sitProgress,bones,
    camera:{world:camera.matrixWorld.toArray(),projection:camera.projectionMatrix.toArray()},roi,projectedVertices};
}

function checkLook(observed, configured, spec, originalCoverage) {
  assert.equal(observed.bodyType,spec.bodyType);
  assert.equal(observed.bodySha256,spec.sha256);
  assert.equal(observed.index,configured.index);
  assert.equal(observed.role,configured.role);
  assert.equal(observed.top.id,configured.top.id);
  assert.equal(observed.top.sha256,configured.top.sha256);
  const size=configured.topRole==='topFar' ? 1024 : 2048;
  assert.ok(observed.top.baseMaps.some(([,dims])=>dims[0]===size&&dims[1]===size), `Missing live ${size}² top map`);
  if (spec.bodyType !== 'female') return;
  const coverage=observed.coverage;
  assert.ok(coverage?.active && coverage.hiddenFaces>0 && coverage.sourceBodyUnchanged,'Missing female body coverage');
  assert.equal(coverage.avatarSha256,spec.sha256);
  assert.deepEqual(coverage.activeItems,[configured.top.id]);
  assert.equal(coverage.completeContactFaces,coverage.fullFaces);
  assert.equal(coverage.renderFaces+coverage.hiddenFaces,coverage.fullFaces);
  if (originalCoverage) for (const key of ['hiddenFaces','fullFaces','renderFaces','completeContactFaces'])
    assert.equal(coverage[key],originalCoverage[key],`Female mask ${key}`);
}

async function openRoom(browser, base, build, spec) {
  const context=await browser.newContext({viewport:VIEWPORT,deviceScaleFactor:1,serviceWorkers:'block'});
  try {
    const page=await context.newPage(), network=[], errors=[];
    page.on('response',r=>network.push({url:r.url(),status:r.status()}));
    page.on('pageerror',e=>errors.push(e.message));
    const url=new URL(base);
    url.searchParams.set('body',spec.bodyType);
    url.searchParams.set('workbench','appearance');
    url.searchParams.set('view','inspect-half-front');
    await page.goto(url.href);
    await page.waitForFunction(build=>window.__debug?.ready&&window.__debug.buildInfo?.shortId===build,build,{timeout:90000});
    const identity=await verifyCandidate(page,{build,assetId:spec.assetId,sha256:spec.sha256});
    const looks=await page.evaluate(readConfiguredLooks);
    assert.equal(looks.bodyType,spec.bodyType);
    assert.ok(Object.values(looks.colors).every(value=>value==='original'||value===null),'Room did not load original colors');
    assert.equal(looks.far.index,spec.farIndex);
    assert.equal(looks.far.top.sha256,spec.farSha);
    assert.equal(looks.far.bottomRole,looks.near.bottomRole);
    assert.deepEqual(looks.far.other,looks.near.other,'Only the top may differ');
    for (const look of [looks.near,looks.far]) assert.equal(look.top.compatibleAvatarSha256,spec.sha256);
    assert.notEqual(looks.near.top.url,looks.far.top.url);
    return {context,page,network,errors,looks,identity:{build:identity.runtimeBuild.shortId,
      sourceDigest:identity.runtimeBuild.sourceDigest,body:identity.primary}};
  } catch(error) {await context.close();throw error;}
}

const saveRecord = (page, identity) => page.evaluate(identity=>__debug.captureCharacterRecord({identity}),identity);
const selectOutfit = (page,index) => page.evaluate(index=>__debug.setOutfit(index),index);

function checkRecord(record, look, spec) {
  const {appearanceRecipe:recipe,integrity} = record;
  assert.match(integrity.recordSha256,/^[a-f0-9]{64}$/);
  assert.deepEqual(recipe.base,{bodyType:spec.bodyType,sha256:spec.sha256});
  assert.equal(recipe.equipment.index,look.index);
  assert.equal(recipe.equipment.role,look.role);
  assert.equal(recipe.equipment.resources[look.topRole].id,look.top.id);
  assert.equal(recipe.equipment.resources[look.topRole].sha256,look.top.sha256);
}

async function inspect(browser,{base,build,out,PNG},label,row) {
  const spec=CASES[label], room=await openRoom(browser,base,build,spec);
  const {page,looks}=room;
  Object.assign(row,{identity:room.identity,looks,network:room.network,errors:room.errors,poses:{}});
  const identity={id:`qa-garment-${label}`,gender:label,name:`QA ${label}`};
  let farRecord, nearRecord;
  try {
    for (const pose of ['standing','seated']) {
      const result=row.poses[pose]={pose:await page.evaluate(setPose,pose),stages:{},comparisons:{}};
      let baseline;
      for (const [stage,look] of [['near',looks.near],['far',looks.far],['near-restored',looks.near]]) {
        if (stage!=='near') {
          const reply=await selectOutfit(page,look.index);
          assert.equal(reply.applied,true,JSON.stringify(reply));
        }
        const observed=await page.evaluate(liveOutfit);
        if (baseline) assert.equal(observed.actorUuid,baseline.actorUuid,'Outfit change replaced the actor');
        checkLook(observed,look,spec,baseline?.coverage);
        baseline ??= observed;
        const record=await saveRecord(page,identity);
        checkRecord(record,look,spec);
        if (pose==='standing'&&stage==='near') nearRecord=record;
        if (pose==='standing'&&stage==='far') farRecord=record;
        result.stages[stage]={observed,recordSha256:record.integrity.recordSha256,frames:{}};
        // Settle both camera/shadow passes with this exact equipped state before
        // reading either image. Keep the simulation clock fixed throughout.
        for (const view of ['front','room']) await page.evaluate(captureFrame,{view,topId:look.top.id});
        for (const view of ['front','room']) {
          const frame=await page.evaluate(captureFrame,{view,topId:look.top.id});
          assert.equal(frame.simulationTime,result.pose.simulationTime);
          assert.ok(frame.png.startsWith('data:image/png;base64,'));
          const bytes=Buffer.from(frame.png.slice('data:image/png;base64,'.length),'base64');
          const file=`${label}-${pose}-${view}-${stage}.png`;
          await fs.writeFile(path.join(out,file),bytes,{flag:'wx'});
          delete frame.png;
          result.stages[stage].frames[view]={...frame,file,sha256:sha(bytes)};
        }
      }
      for (const view of ['front','room']) {
        const [near,far,restored]=['near','far','near-restored'].map(stage=>result.stages[stage].frames[view]);
        const poseAgreement=verifyMatchedPose(near,far), restorePoseAgreement=verifyMatchedPose(near,restored);
        assert.deepEqual(near.roi,far.roi,'Projected top ROI changed');
        assert.deepEqual(near.roi,restored.roi,'Projected restored top ROI changed');
        const [a,b,c]=await Promise.all([near,far,restored].map(async f=>PNG.sync.read(await fs.readFile(path.join(out,f.file)))));
        const comparison=comparePixels(a,b,near.roi,PNG), restoration=comparePixels(a,c,near.roi,PNG);
        const file=`${label}-${pose}-${view}-near-left-far-right.png`;
        await fs.writeFile(path.join(out,file),PNG.sync.write(comparison.pair),{flag:'wx'});
        result.comparisons[view]={file,poseAgreement,restorePoseAgreement,textureChange:comparison.stats,restoration:restoration.stats};
        assert.equal(restoration.stats.changedPixels,0,'Restored near top pixels differ at matched pose');
      }
    }
    for (const look of [looks.near,looks.far]) assert.ok(room.network.some(r=>r.url===look.top.url&&r.status===200),`No real 200 for ${look.top.id}`);
    assert.deepEqual(room.errors,[]);
    await fs.writeFile(path.join(out,`${label}-far-record.json`),JSON.stringify(farRecord)+'\n',{flag:'wx'});
  } finally {await room.context.close();}

  const fresh=await openRoom(browser,base,build,spec);
  try {
    row.coldRecordRestore={network:fresh.network,errors:fresh.errors};
    const apply = record=>fresh.page.evaluate(record=>__debug.restoreCharacterRecord(record),record);
    for (const [key,look,record] of [['far',fresh.looks.far,farRecord],['near',fresh.looks.near,nearRecord]]) {
      const result=await apply(record);
      assert.equal(result.applied,true,JSON.stringify(result));
      assert.equal(result.recordSha256,record.integrity.recordSha256);
      const actual=await fresh.page.evaluate(liveOutfit);
      const recaptured=await saveRecord(fresh.page,identity);
      checkLook(actual,look,spec,row.poses.standing.stages.near.observed.coverage);
      for (const field of ['appearanceRecipe','equipmentMaterials','resourceIdentities']) assert.deepEqual(recaptured[field],record[field]);
      row.coldRecordRestore[key]={recordSha256:result.recordSha256,actual};
    }
    assert.ok(fresh.network.some(r=>r.url===fresh.looks.far.top.url&&r.status===200),'Fresh restore did not request the actual far top');
    assert.deepEqual(fresh.errors,[]);
  } finally {await fresh.context.close();}
}

async function failureCase(browser,{base,build},label,row) {
  const room=await openRoom(browser,base,build,CASES[label]);
  const {page,looks}=room;
  try {
    await page.evaluate(setPose,'standing');
    const before=await page.evaluate(liveOutfit);
    const recipe=await page.evaluate(()=>__debug.exportAppearanceRecipe());
    assert.ok(!room.network.some(r=>r.url===looks.far.top.url),'Failure URL was loaded before injection');
    let hits=0;
    await page.route(looks.far.top.url,route=>{hits++;return route.fulfill({status:503,body:'intentional QA failure'});},{times:1});
    const reply=await selectOutfit(page,looks.far.index);
    const after=await page.evaluate(liveOutfit);
    const afterRecipe=await page.evaluate(()=>__debug.exportAppearanceRecipe());
    Object.assign(row,{url:looks.far.top.url,hits,reply,before,after,errors:room.errors,network:room.network});
    assert.equal(hits,1);
    assert.equal(reply.applied,false);
    assert.match(reply.reason,/HTTP 503/);
    assert.deepEqual(after,before,'Failed switch changed equipped state, binding or coverage');
    assert.equal(afterRecipe,recipe);
    assert.deepEqual(room.errors,[]);
  } finally {await room.context.close();}
}

async function main() {
  const [base,build,directory,caseOption]=process.argv.slice(2);
  if (!directory||process.argv.length>6||!/^[a-f0-9]{12}$/.test(build))
    throw Error('Usage: run-fixed-check.cjs FIXED_DIST scripts/qa-garment-basecolor-room.cjs BUILD_ID NEW_PROJECT_DIR [--cases=male,female]');
  const address=new URL(base);
  assert.ok(address.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(address.hostname),'Use the fixed-build loopback harness');
  const cases=caseOption ? caseOption.match(/^--cases=(male|female)(?:,(male|female))?$/)?.slice(1).filter(Boolean) : Object.keys(CASES);
  assert.ok(cases?.length&&new Set(cases).size===cases.length,'Use --cases=male,female, --cases=male or --cases=female');
  const out=await projectOutput(directory,await productionRoot());
  await fs.mkdir(out);
  await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
  const report={schema:'garment-basecolor-release-room-v1',build,viewport:VIEWPORT,status:'incomplete',cases:{},
    scope:['Paused actual standing and seated workbench scenes, one primary actor per context, original colors and neutral expression.',
      'Near and far are two distinct real GLBs. HTTP interception is isolated to the explicit 503 test.',
      'ROI bounds use actual top vertices and may include neighboring pixels. Numerical comparison is not visual approval or ordinary-PC performance.']};
  let browser;
  try {
    const {chromium}=require('../prototype/node_modules/playwright');
    const {PNG}=require('../prototype/node_modules/playwright-core/lib/utilsBundle.js');
    browser=await chromium.launch({channel:'chrome',headless:true});
    report.browser=browser.version();
    for (const label of cases) await inspect(browser,{base,build,out,PNG},label,report.cases[label]={});
    const failureLabel=cases.includes('female')?'female':cases[0];
    await failureCase(browser,{base,build},failureLabel,report.expectedHttp503={case:failureLabel});
    report.status='technical-comparison-captured-visual-review-pending';
  } catch(error) {report.failure=error.stack;process.exitCode=1;}
  finally {
    if (browser) await browser.close();
    const receipt=path.join(out,'report.json');
    await fs.writeFile(receipt,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify({status:report.status,build,cases,receipt,failure:report.failure}));
  }
}

main().catch(error=>{console.error(error);process.exitCode=1;});
