// Compare signed outfits on the fixed game's live MToon materials and room camera.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {productionRoot, projectOutput} = require('./project-output.cjs');
const {launchQABrowser} = require('./qa-browser-workspace.cjs');
const {verifyCandidate} = require('./qa-m1-common.cjs');
const {comparePixels, verifyMatchedPose} = require('./qa-source-outfit-release.cjs');

const BODY = {bodyType:'source-female-uniform-texture-v1', sha256:'1049f87a865e523e02b53d9985a37aa5229dd2221b7a9645f2261f16d35c172c'};
// Uint32 indices from the exact VRM, before and after filtering this top's authored 252 faces.
const INDICES = {base:'6b2375d019ac68783bf07f838077c7596471297afd0422ed299f02ca4f002d08',
  dressed:'695aa745815fbdc125ceb33b307111086294fbd1668af8ff8ec71f16a9543c20'};
const VIEWPORT = {width:1440,height:920};
const MASKS = {iris:'d6178bb05f53d5dde9186614c2f4019a535cfb15ceec40a1e8ad46343e2eebfe',
  lips:'b7f1de3847c7bd89b8c50c14f192c77236fd91031b76783583a51a73a91492ed'};

function pairedRecords(records) {
  assert.equal(records.length,2);
  const pair = Object.fromEntries(records.map(r=>[r.appearanceRecipe.appearance.skinTone,r]));
  assert.deepEqual(Object.keys(pair).sort(),['original','warm']);
  assert.notEqual(pair.original.identity.id,pair.warm.identity.id);
  for (const r of records) {
    const {base,appearance,equipment} = r.appearanceRecipe;
    assert.deepEqual(base,BODY);
    assert.equal(appearance.hairStyle,'female-bob-v1');
    assert.equal(appearance.hairColor,'blonde');
    assert.equal(appearance.eyeColor,'brown');
    assert.equal(appearance.lipColor,'coral');
    assert.deepEqual(Object.values(equipment.resources).map(x=>x.slot).sort(),['bottom','shoes','top']);
    assert(['pants','pants-top-far'].includes(equipment.role));
    assert.deepEqual({...appearance,skinTone:'original'},pair.original.appearanceRecipe.appearance);
    for (const key of ['equipment','hairAssetSha256','hairFit','geometry','accessories','surfaceLayers'])
      assert.deepEqual(r.appearanceRecipe[key],pair.original.appearanceRecipe[key],key);
    for (const key of ['equipmentMaterials','liveAccessories','nativeHairCenter'])
      assert.deepEqual(r[key],pair.original[key],key);
  }
  return pair;
}

async function liveState() {
  const a = window.__debug.avatar(), look = a.getOutfitInfo(), appearance = a.appearance.getState();
  const digest = async data => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),
    v=>v.toString(16).padStart(2,'0')).join('');
  const pixels = new Map();
  async function texture(t) {
    if (!t?.image) throw Error('Missing live skin texture');
    if (!pixels.has(t.image)) {
      const {width,height} = t.image, canvas = document.createElement('canvas');
      canvas.width=width; canvas.height=height;
      const ctx = canvas.getContext('2d',{willReadFrequently:true});
      ctx.drawImage(t.image,0,0);
      pixels.set(t.image,{width,height,rgbaSha256:await digest(ctx.getImageData(0,0,width,height).data)});
    }
    return {...pixels.get(t.image),flipY:t.flipY,colorSpace:t.colorSpace};
  }
  const skin = {}, equipment = [], targets = [];
  a.vrm.scene.traverseVisible(mesh=>{
    if (mesh.userData.equipmentId) equipment.push(mesh.userData.equipmentId);
    if (!mesh.isSkinnedMesh) return;
    for (const material of [mesh.material].flat()) {
      const hit = material.name.match(/^F\d+_\d+_\d+_(Face|Body)_\d+_SKIN$/);
      if (hit && material.visible) targets.push({key:hit[1],mesh,material});
    }
  });
  for (const {key,mesh,material} of targets) {
    if (skin[key] || material.isOutline) throw Error('Ambiguous visible skin material: '+key);
    skin[key]={name:material.name,color:material.color.toArray(),shade:material.shadeColorFactor.toArray(),
      map:await texture(material.map),shadeMap:await texture(material.shadeMultiplyTexture),
      indexSha256:await digest(mesh.geometry.index.array),faces:mesh.geometry.index.count/3};
  }
  const fields=['hairStyle','effectiveHairStyle','hairColor','eyebrowColor','eyeColor','lipColor','skinTone','bodyMode','facialMaskIdentity'];
  return {body:a.profile.sha256,index:look.index,coverage:look.equipment.bodyCoverage,
    appearance:Object.fromEntries(fields.map(k=>[k,appearance[k]])),equipment:equipment.sort(),skin};
}

function checkLive(state,record,mode='dressed') {
  const {appearance,equipment} = record.appearanceRecipe;
  assert.equal(state.body,BODY.sha256);
  assert.equal(state.index,equipment.index);
  for (const key of ['hairStyle','hairColor','eyeColor','lipColor','skinTone','eyebrowColor'])
    assert.equal(state.appearance[key],appearance[key]??'original',key);
  assert.equal(state.appearance.effectiveHairStyle,appearance.hairStyle);
  assert.equal(state.appearance.bodyMode,mode);
  assert.deepEqual(state.appearance.facialMaskIdentity,MASKS);
  assert.deepEqual(Object.keys(state.skin).sort(),['Body','Face']);
  for (const part of Object.values(state.skin)) for (const texture of [part.map,part.shadeMap])
    assert.deepEqual([texture.width,texture.height,texture.flipY],[1024,1024,false]);
  const items=Object.values(equipment.resources), top=items.find(i=>i.slot==='top');
  assert.deepEqual(state.equipment,items.filter(i=>mode==='dressed'||i.slot==='shoes').map(i=>i.id).sort());
  const c=state.coverage, dressed=mode==='dressed';
  assert.equal(c.avatarSha256,BODY.sha256);
  assert.equal(c.active,dressed);
  assert.deepEqual(c.activeItems,dressed?[top.id]:[]);
  assert.equal(c.sourceBodyUnchanged,true);
  assert.equal(c.fullFaces,7732);
  assert.equal(c.completeContactFaces,c.fullFaces);
  assert.equal(c.hiddenFaces,dressed?252:0);
  assert.equal(c.renderFaces,c.fullFaces-c.hiddenFaces);
  assert.equal(state.skin.Body.faces,c.renderFaces);
  assert.equal(state.skin.Body.indexSha256,INDICES[mode]);
}

function checkWarm(original,warm) {
  // Three.js decodes the registered sRGB #ddc5b4 before multiplying both MToon factors.
  const scale=[0xdd,0xc5,0xb4].map(n=>((n/255+0.055)/1.055)**2.4);
  for (const key of ['Face','Body']) {
    const source=original.skin[key], actual=warm.skin[key];
    for (const field of ['map','shadeMap','indexSha256','faces']) assert.deepEqual(actual[field],source[field],key+' '+field);
    for (const field of ['color','shade']) {
      assert.equal(source[field].length,3);
      for (const [i,factor] of scale.entries()) {
        assert(source[field][i]>0);
        assert(Math.abs(actual[field][i]-source[field][i]*factor)<1e-6,key+' '+field+' channel '+i);
      }
    }
  }
}

function captureFrame(direction) {
  const d=window.__debug, a=d.avatar();
  d.view('inspect-'+direction+'-front');
  const state=d.advance(0);
  if (!state.paused || state.mode!=='idle') throw Error('Expected a paused, standing room actor');
  const exp=a.vrm.expressionManager;
  for (const e of exp.expressions) exp.setValue(e.expressionName,0);
  a.livePresentation.refreshEyeBlinkCompatibility();
  const camera=d.cameraObject(), renderer=d.renderer, canvas=renderer.domElement;
  renderer.render(d.scene,camera);
  const bones=[];
  a.vrm.scene.traverse(n=>{if(n.isBone) bones.push([n.name,n.matrixWorld.toArray()]);});
  return {png:canvas.toDataURL('image/png'),width:canvas.width,height:canvas.height,mode:'dressed',
    direction,pose:state.mode,sitProgress:state.motion.sitProgress,simulationTime:state.simulationTime,bones,
    camera:{world:camera.matrixWorld.toArray(),projection:camera.projectionMatrix.toArray()}};
}

async function restore(page,record) {
  const result=await page.evaluate(r=>__debug.restoreCharacterRecord(r),record);
  assert.equal(result.applied,true,JSON.stringify(result));
  assert.deepEqual(result.identity,record.identity);
  assert.equal(result.recordSha256,record.integrity.recordSha256);
  const observed=await page.evaluate(liveState);
  checkLive(observed,record);
  return observed;
}

async function run(base,build,recordFile,directory) {
  if (!directory || !/^[a-f0-9]{12}$/.test(build)) throw Error('Expected loopback URL, build, two-record JSON array and new output directory');
  const out=await projectOutput(directory,await productionRoot()), url=new URL(base);
  assert(url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname));
  await fs.mkdir(out);
  const report={schema:'room-record-skin-continuity-v1',build,viewport:VIEWPORT,records:{},frames:{},errors:[],passed:false};
  let session;
  try {
    const pair=pairedRecords(JSON.parse(await fs.readFile(recordFile,'utf8')));
    session=await launchQABrowser(out,{channel:'chrome'});
    report.browser=session.browser.version();
    for (const room of ['workbench','reopenedRoom']) {
      const context=await session.browser.newContext({viewport:VIEWPORT,deviceScaleFactor:1,serviceWorkers:'block'});
      try {
        const page=await context.newPage();
        page.on('pageerror',e=>report.errors.push(e.message));
        url.search=new URLSearchParams({body:BODY.bodyType,view:'inspect-face-front',...(room==='workbench'?{workbench:'appearance'}:{})});
        await page.goto(url.href);
        await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:90000});
        const fixed=await verifyCandidate(page,{build,assetId:BODY.bodyType,sha256:BODY.sha256});
        report[room]={sourceDigest:fixed.runtimeBuild.sourceDigest,primary:fixed.primary,url:url.href};
        if (room==='reopenedRoom') {
          const observed=await restore(page,pair.warm);
          assert.deepEqual(observed,report.records.warm.observed);
          report[room].restoredRecordSha256=pair.warm.integrity.recordSha256;
          continue;
        }
        await page.evaluate(()=>{
          __debug.setPaused(true); __debug.reset(); __debug.setBodyMode('dressed'); __debug.setDynamics(false);
          __debug.command({type:'speaking',value:false}); __debug.advance(0.35);
        });
        const originals={};
        const {PNG}=require('../prototype/node_modules/playwright-core/lib/utilsBundle.js');
        for (const [tone,r] of Object.entries({original:pair.original,warm:pair.warm})) {
          const observed=await restore(page,r);
          report.records[tone]={identity:r.identity,recordSha256:r.integrity.recordSha256,observed};
          if (tone==='warm') checkWarm(report.records.original.observed,observed);
          for (const view of ['face','half']) {
            const {png,...frame}=await page.evaluate(captureFrame,view);
            const bytes=Buffer.from(png.split(',')[1],'base64'), file=tone+'-'+view+'.png';
            await fs.writeFile(path.join(out,file),bytes,{flag:'wx'});
            const pixels=PNG.sync.read(bytes);
            const row=(report.frames[view]??={});
            row[tone]={file,camera:frame.camera,simulationTime:frame.simulationTime};
            if (tone==='original') originals[view]={frame,pixels};
            else {
              row.poseAgreement=verifyMatchedPose(originals[view].frame,frame);
              const {pair:comparison,stats}=comparePixels(originals[view].pixels,pixels,[0,0,frame.width,frame.height],PNG);
              row.comparison={file:'original-left-warm-right-'+view+'.png',stats};
              await fs.writeFile(path.join(out,row.comparison.file),PNG.sync.write(comparison),{flag:'wx'});
            }
          }
        }
        await page.evaluate(()=>__debug.setBodyMode('base'));
        report.base=await page.evaluate(liveState);
        checkLive(report.base,pair.warm,'base');
        for (const part of ['Face','Body']) for (const field of ['map','shadeMap','color','shade'])
          assert.deepEqual(report.base.skin[part][field],report.records.warm.observed.skin[part][field],part+' '+field);
        await page.evaluate(()=>__debug.setBodyMode('dressed'));
        assert.deepEqual(await page.evaluate(liveState),report.records.warm.observed);
        const bad=structuredClone(pair.original);
        bad.integrity.recordSha256='0'.repeat(64);
        report.rejection=await page.evaluate(async r=>{
          try {await __debug.restoreCharacterRecord(r);return null;}
          catch(e){return {code:e.code,message:e.message};}
        },bad);
        assert.equal(report.rejection?.code,'record-hash-mismatch');
        assert.deepEqual(await page.evaluate(liveState),report.records.warm.observed);
        assert.deepEqual(await restore(page,pair.original),report.records.original.observed);
        report.restoredOriginalSha256=pair.original.integrity.recordSha256;
      } finally {await context.close();}
    }
    assert.deepEqual(report.errors,[]);
    report.passed=true;
  } catch(e){report.failure=e.stack;throw e;}
  finally {
    try {await session?.close();}
    finally {await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
  }
}

if (require.main===module) run(...process.argv.slice(2)).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={pairedRecords,checkWarm};
