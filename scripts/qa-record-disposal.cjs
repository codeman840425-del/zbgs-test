// node scripts/run-fixed-check.cjs PACKAGE scripts/qa-record-disposal.cjs INVENTORY_SHA before|after OUTPUT
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const {productionRoot, projectOutput} = require('./project-output.cjs');
const {launchQABrowser} = require('./qa-browser-workspace.cjs');

// Scope the listeners by object identity, including shared references across meshes/actors.
// No dispose method is replaced. Uniform structures can contain repeated references.
function observe() {
  const c = window.__recordConsumer, rows = new Map(), draws = [], clean = [];
  function watch(resource, kind, actor, mesh, slot) {
    if (!resource?.addEventListener) return;
    if (!rows.has(resource)) {
      const row = {kind, uuid:resource.uuid, name:resource.name, type:resource.type, refs:[], events:[]};
      const listen = () => row.events.push({stage, ms:performance.now()});
      resource.addEventListener('dispose', listen);
      clean.push(() => resource.removeEventListener('dispose', listen));
      rows.set(resource, row);
    }
    rows.get(resource).refs.push({actor, mesh:mesh.name, meshId:mesh.uuid, slot});
  }
  let stage = 'pair';
  for (const actor of c.actors.values()) actor.avatar.root.traverse(mesh => {
    if (!mesh.isMesh) return;
    const id = actor.identity.id;
    watch(mesh.geometry, 'geometry', id, mesh, 'geometry');
    watch(mesh.skeleton?.boneTexture, 'texture', id, mesh, 'skeleton.boneTexture');
    for (const [i, m] of [mesh.material].flat().entries()) {
      watch(m, 'material', id, mesh, String(i));
      for (const [key,t] of Object.entries(m)) if (t?.isTexture) watch(t, 'texture', id, mesh, key);
      function uniform(value, key, visited) {
        if (value?.isTexture) return watch(value, 'texture', id, mesh, key);
        if (!value || typeof value !== 'object' || visited.has(value)) return;
        if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) return;
        visited.add(value);
        for (const [field, child] of Object.entries(value)) uniform(child, key+'.'+field, visited);
      }
      for (const [key,u] of Object.entries(m.uniforms ?? {})) uniform(u.value, 'uniform.'+key, new Set());
    }
    let part;
    for (let n=mesh; n && !part; n=n.parent) {
      if (n.name === 'LiveAccessory:glasses') part='glasses';
      else if (n.userData.equipmentId) part=n.userData.equipmentId;
    }
    if (!part) return;
    const entry = {actor:id, part, name:mesh.name, mesh:mesh.uuid, geometry:mesh.geometry.uuid, draws:0};
    draws.push(entry);
    const prior=mesh.onAfterRender, own=Object.hasOwn(mesh,'onAfterRender');
    mesh.onAfterRender=function(...args) {
      prior.apply(this,args);
      if(args[0]===c.renderer && args[1]===c.scene) entry.draws++;
    };
    clean.push(()=>{if(own) mesh.onAfterRender=prior; else delete mesh.onAfterRender;});
  });
  const tick=()=>new Promise(resolve=>requestAnimationFrame(resolve));
  async function snapshot() {
    for(const entry of draws) entry.draws=0;
    const actors=[...c.actors.values()], poses=[];
    for(let frame=0;frame<12;frame++) {
      await tick();
      poses.push(actors.map(a=>{
        const head=a.avatar.vrm.humanoid.getRawBoneNode('head');
        const hips=a.avatar.vrm.humanoid.getRawBoneNode('hips');
        return {head:head.uuid,hips:hips.uuid,headWorld:head.matrixWorld.toArray(),
          hipsWorld:hips.matrixWorld.toArray(),clock:a.motion.getMetrics().actionTime};
      }));
    }
    return {actors:actors.map(a=>({id:a.identity.id,record:a.recordSha256,revision:a.revision,
      body:a.avatar.profile.sha256,root:a.avatar.root.uuid,attached:a.avatar.root.parent===c.scene,
      glasses:a.avatar.livePresentation.getState().accessories.glasses})),
      poses, draws:draws.filter(e=>e.draws>0).map(e=>({...e})),
      renderer:{...c.renderer.info.memory, programs:c.renderer.info.programs.length}, errors:[...c.errors]};
  }
  const gl=c.renderer.getContext(), ext=gl.getExtension('WEBGL_debug_renderer_info');
  return {gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),
    digest:c.buildInfo.sourceDigest, snapshot,
    remove(id,label){stage=label;return c.removeActor(id);},
    rows(){return [...rows.values()];},close(){for(const fn of clean.reverse())fn();}};
}

function check(report, records) {
  const [female,male]=records, {pair,one,empty,resources,removals}=report;
  assert.deepEqual(removals,[true,false,true,false]);
  assert.deepEqual(pair.actors.map(a=>a.id),records.map(a=>a.identity.id));
  assert.deepEqual(one.actors,[pair.actors[0]]);
  assert.deepEqual(empty.actors,[]);assert.deepEqual(empty.draws,[]);
  for(const s of [pair,one,empty]) assert.deepEqual(s.errors,[]);
  for(const [i,record] of records.entries()) {
    const a=pair.actors[i], selected=record.appearanceRecipe.equipment.resources;
    assert(a.attached && a.glasses.loaded && !a.glasses.pending);
    assert.equal(a.body,record.appearanceRecipe.base.sha256);assert.equal(a.record,record.integrity.recordSha256);
    assert.equal(a.revision,record.revision);
    assert.equal(a.glasses.identity.fit.sha256,record.liveAccessories.selections.glasses.identity.fit.sha256);
    const active=pair.draws.filter(r=>r.actor===a.id);
    assert.deepEqual([...new Set(active.map(r=>r.part))].sort(),['glasses',...Object.values(selected).map(v=>v.id)].sort());
    assert.equal(active.filter(r=>r.part==='glasses').length,7);
  }
  const meshes=s=>s.draws.filter(r=>r.actor===female.identity.id).map(({draws,...item})=>item);
  assert.deepEqual(meshes(one),meshes(pair));assert(one.draws.every(r=>r.actor===female.identity.id));
  const poses=one.poses.flat();assert.equal(poses[0].head,pair.poses[0][0].head);
  assert.equal(poses[0].hips,pair.poses[0][0].hips);
  assert(poses.at(-1).clock>poses[0].clock && poses[0].clock>pair.poses[0][0].clock);
  assert(poses.some(p=>p.headWorld.some((v,i)=>Math.abs(v-poses[0].headWorld[i])>1e-7)),'Idle skeleton did not advance');
  const count=(r,stage)=>r.events.filter(e=>e.stage===stage).length;
  for(const r of resources) {
    if(r.refs.some(ref=>ref.actor===female.identity.id)) assert.equal(count(r,'remove-male'),0,'Survivor resource disposed '+r.uuid);
    assert.equal(count(r,'repeat-male')+count(r,'repeat-female'),0,'Repeated public remove emitted dispose');
    if(report.mode==='after' || r.kind==='geometry' || r.kind==='material') {
      const owners=new Set(r.refs.map(ref=>ref.actor));
      const lastOwner=owners.has(female.identity.id)?'remove-female':'remove-male';
      assert(count(r,lastOwner)>0,'Missing '+r.kind+' release '+r.uuid);
      if(r.kind==='geometry' || report.mode==='after') assert.equal(r.events.length,1,'Repeated '+r.kind+' '+r.uuid);
    }
  }
  report.targets=[];
  for(const [name,refs] of [['M00_000_00_Face_00_SKIN',['Facebaked_5','Facebaked_8']],
                           ['M00_001_01_Body_00_SKIN',['Bodybaked','Bodybaked_1','Bodybaked_2','Bodybaked_3']]]) {
    const matches=resources.filter(r=>r.kind==='material' && r.name===name && r.type==='ShaderMaterial'
      && r.refs.every(ref=>ref.actor===male.identity.id) && r.refs.length===refs.length);
    assert.equal(matches.length,1,name);
    const [r]=matches;assert.deepEqual(r.refs.map(ref=>ref.mesh).sort(),refs);
    report.targets.push({name,uuid:r.uuid,meshes:refs,notifications:count(r,'remove-male')});
    assert.equal(count(r,'remove-male'),report.mode==='before'?refs.length:1,name);
  }
}

async function main(base,pin,mode,destination) {
  assert(['before','after'].includes(mode) && /^[0-9a-f]{64}$/.test(pin) && destination,'Expected runtime package pin, before|after and fresh output');
  const root=await productionRoot(), dir=await projectOutput(path.resolve(root,destination),root);
  const url=new URL(base);assert(url.protocol==='http:' && url.hostname==='127.0.0.1');
  const original=JSON.parse(await fs.readFile(path.join(root,'evidence/m2-uniform-lite-glasses-game-v1/signed-pair.json')));
  const bytes=Buffer.from(await (await fetch(new URL('runtime-package.json',url))).arrayBuffer());
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),pin);
  const pack=JSON.parse(bytes);
  for(const row of pack.files) {
    const asset=await fetch(new URL(row.path,url));assert.equal(asset.status,200,row.path);
    const b=Buffer.from(await asset.arrayBuffer());assert.equal(b.length,row.bytes);
    assert.equal(crypto.createHash('sha256').update(b).digest('hex'),row.sha256,row.path);
  }
  assert.deepEqual(pack.records.map(r=>r.recordSha256),original.map(r=>r.integrity.recordSha256));
  for(const [i,r] of pack.records.entries()) assert.deepEqual(await (await fetch(new URL(r.file,url))).json(),original[i]);
  if(mode==='before') assert.equal(pack.runtime.buildId,'60c87f62e8b0');
  await fs.mkdir(path.dirname(dir),{recursive:true});await fs.mkdir(dir);
  const file=name=>projectOutput(path.join(dir,name),root);
  const report={mode,packageSha256:pin,runtime:pack.runtime,checkedFiles:pack.files.length,
    signed:pack.records.map(({id,revision,recordSha256})=>({id,revision,recordSha256})),
    status:'incomplete',pageErrors:[],removals:[],limits:[
      'Listeners cover initially attached actor meshes, their geometry/materials, direct textures, plain/array uniform textures and allocated skeleton bone textures.',
      'Unattached caches, future objects, driver allocations/bytes, image closes and GPU leakage are outside this observation.',
      'Draw callbacks are camera render submissions; they do not count unoccluded pixels. Snapshots are at native animation speed.']};
  let session,probe,context,video;
  try {
    session=await launchQABrowser(dir,{channel:'chrome'});
    report.browser=session.browser.version();
    const size={width:1100,height:760};
    context=await session.browser.newContext({viewport:size,recordVideo:{dir,size}});
    const page=await context.newPage();
    video=page.video();
    page.on('pageerror',e=>report.pageErrors.push(e.message));
    await page.goto(new URL(pack.runtime.entryUrl,url).href);
    await page.waitForFunction(()=>window.__recordConsumer?.ready,null,{timeout:90000});
    probe=await page.evaluateHandle(observe);
    report.gpu=await probe.evaluate(p=>p.gpu);
    assert.equal(await probe.evaluate(p=>p.digest),pack.runtime.sourceDigest);
    const sample=()=>probe.evaluate(p=>p.snapshot());
    const remove=async(id,stage)=>report.removals.push(await probe.evaluate((p,[who,step])=>p.remove(who,step),[id,stage]));
    report.pair=await sample();await page.waitForTimeout(2000);await page.screenshot({path:await file('pair.png')});
    const [female,male]=original.map(r=>r.identity.id);
    await remove(male,'remove-male');await remove(male,'repeat-male');
    report.one=await sample();await page.waitForTimeout(2200);await page.screenshot({path:await file('survivor.png')});
    await remove(female,'remove-female');await remove(female,'repeat-female');
    report.empty=await sample();report.resources=await probe.evaluate(p=>p.rows());
    assert.deepEqual(report.pageErrors,[]);check(report,original);report.status='verified';
  } catch(error){report.error=error.stack;throw error;}
  finally {
    try {
      if(probe) await probe.evaluate(p=>p.close());
      if(context) await context.close();
      if(video) {
        const name='public-removal-1x.webm';
        await video.saveAs(await file(name));
        await video.delete();
        report.video={file:name,source:'real-time browser viewport',sha256:crypto.createHash('sha256').update(await fs.readFile(await file(name))).digest('hex')};
      }
    }
    finally{try{if(session)await session.close();}finally{
      await fs.writeFile(await file('report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    }}
  }
  console.log(JSON.stringify({mode,targets:report.targets,output:dir}));
}
if(require.main===module) main(...process.argv.slice(2)).catch(e=>{console.error(e);process.exitCode=1;});
module.exports={check};
