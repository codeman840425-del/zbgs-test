// node scripts/qa-signed-hair-cache-budget.cjs [run-name]
// Serve only checked package bytes to one headless Chrome via Playwright routing.
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {productionRoot,projectOutput} = require('./project-output.cjs');

async function probe({records,peer,buildId}) {
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
  function actorState(actor) {
    const appearance = actor.avatar.appearance.getState(), materials = new Map(), textures = {};
    actor.avatar.root.traverse(mesh => {
      if (!mesh.isMesh) return;
      let visible = true;
      for (let n=mesh; n; n=n.parent) if (!n.visible) visible = false;
      for (const m of [].concat(mesh.material)) {
        const replacement = mesh.userData.assetRole === 'hair';
        if (!replacement && !/_HAIR|_FaceBrow_/.test(m.name)) continue;
        if (!materials.has(m.uuid)) {
          const slots = {};
          for (const slot of ['map','shadeMultiplyTexture']) {
            const row = texture(m[slot]);
            slots[slot] = row?.texture ?? null;
            if (row) textures[row.texture] = row;
          }
          materials.set(m.uuid,{material:m.uuid,name:m.name,outline:!!m.isOutline,slots,uses:[]});
        }
        materials.get(m.uuid).uses.push({mesh:mesh.name,meshId:mesh.uuid,visible,
          role:replacement ? 'replacement' : /_FaceBrow_/.test(m.name) ? 'eyebrow' : 'original-hair'});
      }
    });
    return {id:actor.identity.id,recordSha256:actor.recordSha256,root:actor.avatar.root.uuid,
      hairStyle:appearance.hairStyle,hairColor:appearance.hairColor,cacheEntries:appearance.neutralTextureCount,
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
  async function set(actor,color) {
    const result = await actor.avatar.appearance.set({hairColor:color});
    check(result.applied,JSON.stringify(result));
    await frames();
    return actorState(actor);
  }
  function compareColors(colored, restored, again) {
    const cache = new Map(), restoredById = new Map(restored.materials.map(m=>[m.material,m]));
    const againById = new Map(again.materials.map(m=>[m.material,m]));
    for (const mat of colored.materials) {
      for (const [slot,id] of Object.entries(mat.slots)) {
        if (!id) continue;
        const original = restoredById.get(mat.material).slots[slot];
        check(againById.get(mat.material).slots[slot]===id,'Returning to blonde allocated a different texture');
        const base = restored.textures[original], tint = colored.textures[id];
        check(base && original!==id && tint.imageKind==='HTMLCanvasElement' && base.image!==tint.image &&
          base.source!==tint.source && base.width===tint.width && base.height===tint.height,'Bad grayscale texture pair');
        check(!cache.has(original) || cache.get(original)===id,'Same input Texture produced two canvases');
        cache.set(original,id);
      }
    }
    check(cache.size===colored.cacheEntries && new Set(cache.values()).size===cache.size &&
      [restored,again].every(a=>a.cacheEntries===cache.size),'Unobserved or duplicated grayscale cache entry');
    check(new Set([...cache.values()].map(id=>colored.textures[id].image)).size===cache.size,'Two entries share Canvas');
    return [...cache].map(([original,derived])=>({original,derived}));
  }
  const vendor = gl.getExtension('WEBGL_debug_renderer_info');
  const report = {renderer:vendor ? gl.getParameter(vendor.UNMASKED_RENDERER_WEBGL) : null,
    webgl2:gl instanceof WebGL2RenderingContext,build:d.buildInfo.shortId};
  check(report.build===buildId,'Wrong fixed build');
  await frames();
  report.baseline=stats();
  await select(records);
  const female = d.actors.get(records[0].identity.id), male = d.actors.get(records[1].identity.id);
  report.first=actorState(female);
  report.maleControl=actorState(male);
  check(report.first.hairColor==='blonde' && report.first.cacheEntries>0 &&
    report.maleControl.hairColor==='original' && !report.maleControl.cacheEntries,'Unexpected signed looks');
  report.firstMemory=stats();
  report.restored=await set(female,'original');
  report.retainedAfterRestore=lifecycle(Object.keys(report.first.textures));
  report.again=await set(female,'blonde');
  report.sourceToDerived=compareColors(report.first,report.restored,report.again);
  const derived=report.sourceToDerived.map(r=>r.derived);
  check(lifecycle(derived).every(r=>!r.disposals),'Early disposal of a cached canvas texture');
  check((await female.capture()).appearanceRecipe.appearance.hairColor==='blonde','Restored look capture differs');
  await select([records[0],peer]);
  report.afterReplacingPair=lifecycle(derived);
  check(report.afterReplacingPair.every(r=>r.disposals===1 && !r.hasRendererProperties),'First actor cache not released');
  const a=d.actors.get(records[0].identity.id), b=d.actors.get(peer.identity.id);
  const aa=actorState(a), bb=actorState(b);
  const aIds=Object.keys(aa.textures), bIds=Object.keys(bb.textures);
  check(aa.root!==bb.root && aa.cacheEntries===bb.cacheEntries && aIds.length===aa.cacheEntries &&
    bIds.length===bb.cacheEntries && aIds.every(id=>!bb.textures[id]),'Color cache crosses actors');
  const aImages=new Set(Object.values(aa.textures).map(t=>t.image));
  const aSources=new Set(Object.values(aa.textures).map(t=>t.source));
  check(Object.values(bb.textures).every(t=>!aImages.has(t.image) && !aSources.has(t.source)),'Canvas/source shared by two actors');
  report.twins={primary:aa,peer:bb,memory:stats()};
  a.dispose();d.actors.delete(a.identity.id);await frames();
  report.disposePrimary={primary:lifecycle(aIds),peer:lifecycle(bIds),peerCache:b.avatar.appearance.getState().neutralTextureCount,
    primaryCache:a.avatar.appearance.getState().neutralTextureCount,memory:stats()};
  check(!report.disposePrimary.primaryCache && report.disposePrimary.primary.every(r=>r.disposals===1 && !r.hasRendererProperties) &&
    report.disposePrimary.peer.every(r=>!r.disposals) && report.disposePrimary.peerCache===bb.cacheEntries,'Disposing primary disturbed peer');
  b.dispose();d.actors.delete(b.identity.id);await frames();
  report.disposePeer={peer:lifecycle(bIds),peerCache:b.avatar.appearance.getState().neutralTextureCount,memory:stats(),
    handles:[...handles].map(([handle,id])=>({id,live:gl.isTexture(handle)}))};
  check(!report.disposePeer.peerCache && report.disposePeer.peer.every(r=>r.disposals===1 && !r.hasRendererProperties) &&
    report.disposePeer.handles.every(h=>!h.live) && report.disposePeer.memory.textures===report.baseline.textures &&
    report.disposePeer.memory.geometries===report.baseline.geometries,'Resources remained after both actors disposed');
  return report;
}

async function main() {
  const root=await productionRoot(), run=process.argv[2]??'report';
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
    report.observed=await page.evaluate(probe,{records,peer,buildId:readback.runtime.buildId});
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
