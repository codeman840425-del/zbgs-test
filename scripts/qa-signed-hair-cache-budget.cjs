// node scripts/qa-signed-hair-cache-budget.cjs [run-name]
// Serve only checked package bytes to one headless Chrome via Playwright routing.
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {productionRoot,projectOutput} = require('./project-output.cjs');

async function probe({records,peer,buildId,paletteMaterials}) {
  const d = window.__recordConsumer, renderer = d.renderer, gl = renderer.getContext();
  const images = new WeakMap(), handles = new Map(), observed = new Map();
  let imageCount = 0;
  const frames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  function check(ok, why) { if (!ok) throw Error(why); }
  function texture(t) {
    if (!t) return null;
    const h = renderer.properties.has(t) ? renderer.properties.get(t).__webglTexture : null;
    if (h && !handles.has(h)) handles.set(h,handles.size + 1);
    if (!images.has(t.image)) images.set(t.image,++imageCount);
    if (!observed.has(t.uuid)) {
      const row = {ref:t,disposals:0};
      t.addEventListener('dispose',() => row.disposals++);
      observed.set(t.uuid,row);
    }
    return {texture:t.uuid,source:t.source.uuid,image:images.get(t.image),imageKind:t.image.constructor.name,
      width:t.image.width,height:t.image.height,generateMipmaps:t.generateMipmaps,minFilter:t.minFilter,
      magFilter:t.magFilter,explicitMipLevels:t.mipmaps.length,format:t.format,type:t.type,colorSpace:t.colorSpace,
      webglTexture:h ? handles.get(h) : null,live:h ? gl.isTexture(h) : false};
  }
  function actorState(actor,phase) {
    const appearance = actor.avatar.appearance.getState(), materials = new Map(), textures = {};
    actor.avatar.root.traverse(mesh => {
      if (!mesh.isMesh) return;
      let visible = true;
      for (let n=mesh; n; n=n.parent) if (!n.visible) visible = false;
      for (const m of [].concat(mesh.material)) {
        const replacement = mesh.userData.assetRole === 'hair';
        const baseName=m.name.replace(/ \(Outline\)$/,'');
        const part=replacement || /_HAIR/.test(m.name) ? 'hair' : /_FaceBrow_/.test(m.name) ? 'eyebrow'
          : baseName===paletteMaterials.iris ? 'iris' : baseName===paletteMaterials.lips ? 'lips'
          : /_Body_\d+_SKIN/.test(m.name) ? 'body' : null;
        if (!part) continue;
        if (!materials.has(m.uuid)) {
          const slots = {};
          for (const slot of ['map','shadeMultiplyTexture']) {
            const row = texture(m[slot]);
            slots[slot] = row?.texture ?? null;
            if (row) textures[row.texture] = row;
          }
          materials.set(m.uuid,{material:m.uuid,name:m.name,part,outline:!!m.isOutline,
            color:m.color?.toArray(),shadeColor:m.shadeColorFactor?.toArray(),slots,uses:[]});
        }
        materials.get(m.uuid).uses.push({mesh:mesh.name,meshId:mesh.uuid,visible,
          role:replacement ? 'replacement' : part==='hair' ? 'original-hair' : part});
      }
    });
    return {phase,id:actor.identity.id,recordSha256:actor.recordSha256,root:actor.avatar.root.uuid,
      hairStyle:appearance.hairStyle,hairColor:appearance.hairColor,cacheEntries:appearance.neutralTextureCount,
      skinTone:appearance.skinTone,eyeColor:appearance.eyeColor,lipColor:appearance.lipColor,
      facialCacheEntries:appearance.facialTextureCount,facialMasks:appearance.facialMaskIdentity,
      nativeEyebrowCache:appearance.eyebrowTextureCount,materials:[...materials.values()],textures};
  }
  function stats() {
    return {textures:renderer.info.memory.textures,geometries:renderer.info.memory.geometries};
  }
  function lifecycle(ids) {
    return ids.map(id => {
      const entry = observed.get(id);
      return {texture:id,disposals:entry.disposals,hasRendererProperties:renderer.properties.has(entry.ref)};
    });
  }
  async function select(group) {
    const result = await d.selectGroup(0,group);
    check(result.items.every(r=>r.status==='completed'),JSON.stringify(result.items));
    await frames();
  }
  async function set(actor,edits,phase) {
    const result = await actor.avatar.appearance.set(edits);
    check(result.applied,JSON.stringify(result));
    await frames();
    return actorState(actor,phase);
  }
  const paletteIds = snapshot=>[...new Set(snapshot.materials.filter(m=>m.part!=='body').flatMap(
    m=>Object.values(m.slots).filter(Boolean)))];
  const cacheSize = snapshot=>snapshot.cacheEntries+snapshot.facialCacheEntries;
  function compareColors(colored, restored, again) {
    const cache = new Map(), restoredById = new Map(restored.materials.map(m=>[m.material,m]));
    const againById = new Map(again.materials.map(m=>[m.material,m]));
    for (const mat of colored.materials) {
      if(mat.part==='body')continue;
      for (const [slot,id] of Object.entries(mat.slots)) {
        if (!id) continue;
        const original = restoredById.get(mat.material).slots[slot];
        check(againById.get(mat.material).slots[slot]===id,'Returning to blonde allocated a different texture');
        const base = restored.textures[original], tint = colored.textures[id];
        check(base && original!==id && tint.imageKind==='HTMLCanvasElement' && base.image!==tint.image &&
          base.source!==tint.source && base.width===tint.width && base.height===tint.height,'Bad grayscale texture pair');
        const key=mat.part+'/'+original;
        check(!cache.has(key) || cache.get(key).derived===id,'Same palette input produced two canvases');
        cache.set(key,{part:mat.part,original,derived:id});
      }
    }
    const entries=[...cache.values()], hair=entries.filter(p=>['hair','eyebrow'].includes(p.part));
    check(hair.length===colored.cacheEntries && entries.length-hair.length===colored.facialCacheEntries &&
      new Set(entries.map(p=>p.derived)).size===cache.size && [restored,again].every(a=>cacheSize(a)===cache.size),
      'Unobserved or duplicated palette cache entry');
    check(new Set(entries.map(p=>colored.textures[p.derived].image)).size===cache.size,'Two entries share Canvas');
    return entries;
  }
  const vendor = gl.getExtension('WEBGL_debug_renderer_info');
  const report = {renderer:vendor ? gl.getParameter(vendor.UNMASKED_RENDERER_WEBGL) : null,
    webgl2:gl instanceof WebGL2RenderingContext,build:d.buildInfo.shortId};
  check(report.build===buildId,'Wrong fixed build');
  await frames();
  report.baseline=stats();
  await select(records);
  const female = d.actors.get(records[0].identity.id), male = d.actors.get(records[1].identity.id);
  report.first=actorState(female,'signed-first');
  report.maleControl=actorState(male,'signed-first');
  check(report.first.hairColor==='blonde' && report.first.cacheEntries>0 &&
    report.maleControl.hairColor==='original' && !report.maleControl.cacheEntries,'Unexpected signed looks');
  report.firstMemory=stats();
  report.skinControl=await set(female,{skinTone:'original'},'only-skin-original');
  const skin=report.first.materials.filter(m=>m.part==='body'||m.part==='lips');
  const control=new Map(report.skinControl.materials.map(m=>[m.material,m]));
  check(skin.every(m=>JSON.stringify(m.slots)===JSON.stringify(control.get(m.material).slots)) &&
    ['body','lips'].every(part=>skin.some(m=>m.part===part &&
      JSON.stringify(m.color)!==JSON.stringify(control.get(m.material).color))),
    'Skin-only selector did not preserve textures while changing material factors');
  report.restored=await set(female,{hairColor:'original',eyeColor:'original',lipColor:'original'},'all-colors-original');
  report.retainedAfterRestore=lifecycle(paletteIds(report.first));
  report.again=await set(female,records[0].appearanceRecipe.appearance,'signed-colors-again');
  report.sourceToDerived=compareColors(report.first,report.restored,report.again);
  const derived=report.sourceToDerived.map(r=>r.derived);
  check(lifecycle(derived).every(r=>!r.disposals),'Early disposal of a cached canvas texture');
  const restoredAppearance=(await female.capture()).appearanceRecipe.appearance;
  check(Object.entries(records[0].appearanceRecipe.appearance).every(([k,v])=>restoredAppearance[k]===v),'Restored look capture differs');
  await select([records[0],peer]);
  report.afterReplacingPair=lifecycle(derived);
  check(report.afterReplacingPair.every(r=>r.disposals===1 && !r.hasRendererProperties),'First actor cache not released');
  const a=d.actors.get(records[0].identity.id), b=d.actors.get(peer.identity.id);
  const aa=actorState(a,'two-independent-actors'), bb=actorState(b,'two-independent-actors');
  const aIds=paletteIds(aa), bIds=paletteIds(bb);
  check(aa.root!==bb.root && cacheSize(aa)===cacheSize(bb) && aIds.length===cacheSize(aa) &&
    bIds.length===cacheSize(bb) && aIds.every(id=>!bb.textures[id]),'Color cache crosses actors');
  const aImages=new Set(aIds.map(id=>aa.textures[id].image)), aSources=new Set(aIds.map(id=>aa.textures[id].source));
  check(bIds.every(id=>!aImages.has(bb.textures[id].image) && !aSources.has(bb.textures[id].source)),'Canvas/source shared by two actors');
  report.twins={primary:aa,peer:bb,memory:stats()};
  a.dispose();d.actors.delete(a.identity.id);await frames();
  report.disposePrimary={phase:'primary-disposed-peer-live',primaryId:a.identity.id,primarySha:a.recordSha256,
    peerId:b.identity.id,peerSha:b.recordSha256,primary:lifecycle(aIds),peer:lifecycle(bIds),
    primaryFaceCache:a.avatar.appearance.getState().facialTextureCount,peerFaceCache:b.avatar.appearance.getState().facialTextureCount,
    peerCache:b.avatar.appearance.getState().neutralTextureCount,
    primaryCache:a.avatar.appearance.getState().neutralTextureCount,memory:stats()};
  check(!report.disposePrimary.primaryCache && !report.disposePrimary.primaryFaceCache &&
    report.disposePrimary.peerFaceCache===bb.facialCacheEntries && report.disposePrimary.primary.every(r=>r.disposals===1 && !r.hasRendererProperties) &&
    report.disposePrimary.peer.every(r=>!r.disposals) && report.disposePrimary.peerCache===bb.cacheEntries,'Disposing primary disturbed peer');
  b.dispose();d.actors.delete(b.identity.id);await frames();
  report.disposePeer={phase:'both-disposed',peerId:b.identity.id,peerSha:b.recordSha256,
    peer:lifecycle(bIds),peerCache:b.avatar.appearance.getState().neutralTextureCount,
    peerFaceCache:b.avatar.appearance.getState().facialTextureCount,memory:stats(),
    handles:[...handles].map(([handle,id])=>({id,live:gl.isTexture(handle)}))};
  check(!report.disposePeer.peerCache && !report.disposePeer.peerFaceCache && report.disposePeer.peer.every(r=>r.disposals===1 && !r.hasRendererProperties) &&
    report.disposePeer.handles.every(h=>!h.live) && report.disposePeer.memory.textures===report.baseline.textures &&
    report.disposePeer.memory.geometries===report.baseline.geometries,'Resources remained after both actors disposed');
  return report;
}

async function main() {
  const root=await productionRoot(), run=process.argv[2]??'full-look';
  assert(/^[a-z][a-z0-9-]*$/.test(run) && process.argv.length<=3);
  const out=await projectOutput(path.join(root,'evidence/m2-signed-hair-cache-budget-v1/runtime'),root);
  await fs.mkdir(out,{recursive:true});
  const reportFile=await projectOutput(path.join(out,run+'.json'),root);
  assert(!(await fs.lstat(reportFile).catch(e=>{if(e.code!=='ENOENT')throw e;})),'Report already exists');
  const operator=path.join(root,'experiments/worktrees/uniform-operator-27ebb18f');
  const runtime=path.join(root,'experiments/worktrees/garment-80fb16b7-repeat');
  const pkg=path.join(root,'output/m2-uniform-agent-handoff-v1/game');
  const from = file => import(pathToFileURL(file).href);
  const {verifyHandoff}=await from(path.join(operator,'scripts/runtime-package/verify-character-handoff.mjs'));
  const readback=await verifyHandoff({handoffRoot:root,operatorRoot:operator,runtimeRoot:runtime,
    dist:path.join(runtime,'prototype/dist'),packageRoot:pkg});
  assert.equal(readback.inventorySha256,'4f1fdc5c85dbb428996a0efd6c3f2a9bb7546ebf3fdce560ec2508e245a404cb');
  const {checkedBytes}=await from(path.join(operator,'scripts/runtime-package/files.mjs'));
  const inventory=JSON.parse(await fs.readFile(path.join(pkg,'runtime-package.json')));
  const files=new Map(inventory.files.map(r=>[r.path,r]));
  const records=await Promise.all(inventory.records.map(async r=>JSON.parse(await checkedBytes(pkg,files.get(r.file)))));
  const {createCharacterRecord}=await from(path.join(runtime,'prototype/src/character-record.js'));
  const original=records[0];
  const catalog=JSON.parse(await checkedBytes(pkg,files.get('assets/appearance-color-v3/runtime-manifest.json')));
  const parts=catalog.variants.find(row=>row.avatarSha256===original.appearanceRecipe.base.sha256).parts;
  const paletteMaterials=Object.fromEntries(Object.entries(parts).map(([name,p])=>[name,p.materialName]));
  const peer=await createCharacterRecord({...original,identity:{...original.identity,id:original.identity.id+'-qa-peer'},
    now:original.createdAt},{validateResources:()=>({status:'pending'})});
  assert.deepEqual(original.appearanceRecipe,peer.appearanceRecipe);
  const scratch=await fs.mkdtemp(path.join(out,'.browser-'));
  for(const key of ['TEMP','TMP','TMPDIR'])process.env[key]=scratch;
  const {chromium}=require('../prototype/node_modules/playwright');
  const origin='http://127.0.0.1', errors=[], requested=new Set();
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
    '.png':'image/png','.svg':'image/svg+xml'};
  const report={schema:'signed-hair-cache-lifecycle-v1',readback,peer:{id:peer.identity.id,recordSha256:peer.integrity.recordSha256,
    recipeSha256:peer.integrity.recipeSha256,purpose:'Deterministic second identity for the same signed look. QA only.'},
    runnerSha256:createHash('sha256').update(await fs.readFile(__filename)).digest('hex'),errors,
    limits:['Developer Chrome session; Three texture and WebGL handle identities are observable, allocated VRAM bytes are not.',
      'Observer retains object references for event and handle checks. JavaScript garbage collection is not measured.']};
  let browser;
  try {
    browser=await chromium.launch({channel:'chrome',headless:true});
    report.browser=browser.version();
    const ctx=await browser.newContext({viewport:{width:1200,height:850},serviceWorkers:'block'});
    await ctx.route(/^https?:/,async route=>{
      const u=new URL(route.request().url()), relative=u.pathname.slice(1), row=files.get(relative);
      try{
        assert.equal(u.origin,origin);assert.equal(route.request().method(),'GET');
        if(relative==='favicon.ico')return await route.fulfill({status:204});
        assert(row,'URL absent from fixed inventory: '+relative);
        const body=await checkedBytes(pkg,row);
        requested.add(relative);
        await route.fulfill({status:200,contentType:types[path.extname(relative)]??'application/octet-stream',body});
      }catch(e){errors.push(String(e));await route.abort();}
    });
    const page=await ctx.newPage();
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin+'/record-consumer.html?production=1');
    await page.waitForFunction(()=>window.__recordConsumer?.ready,null,{timeout:90000});
    report.observed=await page.evaluate(probe,{records,peer,buildId:readback.runtime.buildId,paletteMaterials});
    assert.deepEqual(errors,[]);
    report.status='measured';
  }catch(e){report.status='failed';report.failure=String(e.stack??e);throw e;}
  finally{
    await browser?.close();report.requested=[...requested].sort();
    await fs.writeFile(reportFile,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    await fs.rm(await projectOutput(scratch,out),{recursive:true,force:true});
  }
  console.log(JSON.stringify({status:report.status,report:reportFile,cached:report.observed.first.cacheEntries}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
