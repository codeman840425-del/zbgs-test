// Run from the repository root after exporting the signed standalone package.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {productionRoot,projectOutput} = require('../../scripts/project-output.cjs');

async function inspect() {
  const api=window.__recordConsumer, [actor]=api.actors.values();
  if(api.actors.size!==1 || api.inputFailure)throw Error(api.inputFailure??'Expected one actor');
  const outfit=Object.values(actor.avatar.getEquipmentRecipe(actor.controller.outfit));
  const tops=outfit.filter(e=>e.slot==='top');
  if(tops.length!==1)throw Error('Expected one equipped top');
  const top=tops[0], holder=actor.avatar.root.getObjectByName('Equipment:'+top.id);
  if(!holder)throw Error('No live equipment container: '+top.id);
  const draws=[], restore=[];
  holder.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const before=mesh.onAfterRender, byMaterial=new Map();
    for (const mat of [].concat(mesh.material)) {
      let visible=mat.visible;
      for(let p=mesh;p;p=p.parent)visible=visible && p.visible;
      const row={mesh:mesh.name,object:mesh.uuid,material:mat.name,geometry:mesh.geometry.uuid,
        indices:mesh.geometry.index?.count,skinned:!!mesh.isSkinnedMesh,bones:mesh.skeleton?.bones.length,
        positionCount:mesh.geometry.attributes.position.count,visible,textureSize:[mat.map?.image.width,mat.map?.image.height],
        draws:0,renderFrames:[]};
      draws.push(row);byMaterial.set(mat,row);
    }
    mesh.onAfterRender=function(...args){
      const row=byMaterial.get(args[4]);
      if(row && args[0]===api.renderer && args[1]===api.scene){
        row.draws++;row.renderFrames.push(args[0].info.render.frame);
      }
      return before.apply(this,args);
    };
    restore.push(()=>{mesh.onAfterRender=before;});
  });
  try{for(let i=0;i<8;i++)await new Promise(resolve=>requestAnimationFrame(resolve));}
  finally{restore.forEach(fn=>fn());}
  const captured=await actor.capture();
  return {build:api.buildInfo.sourceDigest,id:actor.identity.id,recordSha256:actor.recordSha256,
    root:actor.avatar.root.uuid,role:captured.appearanceRecipe.equipment.role,completeLook:captured.appearanceRecipe,
    top:{id:top.id,url:top.url,sha256:top.sha256},draws,slotCount:tops.length};
}

async function film(page,dest) {
  const base64=await page.evaluate(async()=>{
    const stream=__recordConsumer.renderer.domElement.captureStream(30),chunks=[];
    const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:4000000});
    try {
      const stopped=new Promise(resolve=>recorder.onstop=resolve);
      recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      recorder.start();await new Promise(resolve=>setTimeout(resolve,4000));recorder.stop();await stopped;
      return await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));});
    }finally{stream.getTracks().forEach(t=>t.stop());}
  });
  await fs.writeFile(dest,Buffer.from(base64,'base64'),{flag:'wx'});
}

async function main(){
  const root=await productionRoot(), e=path.join(root,'evidence/m2-garment-group-game-v1');
  const work=await projectOutput(path.join(root,'output/m2-grouped-top-game-v1'),root);
  const game=path.join(work,'game'), dist=path.join(root,'experiments/worktrees/garment-80fb16b7-repeat/prototype/dist');
  const {canonicalJson}=await import(require('node:url').pathToFileURL(
    path.join(dist,'../src/character-record.js')).href);
  const dir=await projectOutput(path.join(e,'independent'),root);
  const {digest,checkedBytes}=await import('../../scripts/runtime-package/files.mjs');
  const {verifyPackage}=await import('../../scripts/runtime-package/verify-character-handoff.mjs');
  const inventoryBytes=await fs.readFile(path.join(e,'inventory.json'));
  const inv=JSON.parse(inventoryBytes);
  assert.equal(digest(inventoryBytes),'c0165d4135e82370e53bbfb458744cca3e87bd6c20cb892a5164e8716ac05612');
  await verifyPackage(game,inv,inventoryBytes,27);
  const files=new Map(inv.files.map(r=>[r.path,r]));
  const [record]=JSON.parse(await fs.readFile(path.join(e,'records.json')));
  assert.deepEqual(JSON.parse(await checkedBytes(game,files.get(inv.records[0].file))),record);
  assert.equal(record.integrity.recordSha256,'44bbca66f7bbdfc4e19d12500ce94e87c82eec057c3ec697a4cae72fcdd31d2e');
  const alternateBytes=await fs.readFile(path.join(root,'evidence/m2-garment-texture-game-v1/receiver/far-inventory.json'));
  assert.equal(digest(alternateBytes),'5f77013f613de16c780b216551ac7a21aed3deb21978ef8e15c1278172f11230');
  const far=JSON.parse(alternateBytes);assert.deepEqual(inv.runtime,far.runtime);
  const completeFiles=new Map([...inv.files.filter(r=>r.generated===undefined),...far.files.filter(r=>r.generated===undefined)].map(r=>[r.path,r]));
  const original=Object.values(record.appearanceRecipe.equipment.resources).find(r=>r.slot==='top');
  const geometry=async (base,row)=>{
    const bytes=await checkedBytes(base,row),doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
    assert.equal(doc.meshes.length,1);
    return doc.meshes[0].primitives.map((p,index)=>({index,material:doc.materials[p.material].name,
      indices:doc.accessors[p.indices].count,vertices:doc.accessors[p.attributes.POSITION].count,mode:p.mode??4}));
  };
  const farTop=far.files.find(r=>r.path==='assets/garment-basecolor-release-v1/male/raw-male-uniform-top-1k-v1.glb');
  const source=await geometry(game,files.get(original.url.slice(1))), farSource=await geometry(dist,farTop);
  assert.deepEqual(source,farSource);assert.deepEqual(source.map(p=>p.indices),[6012,276]);
  assert(!files.has(farTop.path));
  await fs.mkdir(dir,{recursive:false});
  const scratch=await fs.mkdtemp(path.join(work,'.chrome-'));
  for(const key of ['TMP','TEMP','TMPDIR'])process.env[key]=scratch;
  const {chromium}=require('../../prototype/node_modules/playwright');
  const report={schema:'grouped-uniform-render-readback-v1',runtime:inv.runtime,inventorySha256:digest(inventoryBytes),
    recordSha256:record.integrity.recordSha256,rawTopPrimitives:source,cases:[],errors:[],runnerSha256:digest(await fs.readFile(__filename))};
  let browser;
  try {
    browser=await chromium.launch({channel:'chrome',headless:true});report.browser=browser.version();
    for(const phase of ['standalone-first','standalone-reopen','fixed-runtime-switch']){
      const full=phase==='fixed-runtime-switch', active=full?completeFiles:files;
      const context=await browser.newContext({viewport:{width:1200,height:860},serviceWorkers:'block'});
      const page=await context.newPage(), requests=new Set(), snapshots=[];
      page.on('pageerror',e=>report.errors.push(e.message));
      await context.route(/^https?:/,async route=>{
        try{
          const u=new URL(route.request().url()), name=u.pathname.slice(1);
          assert.equal(u.origin,'http://127.0.0.1');assert.equal(route.request().method(),'GET');
          if(name==='favicon.ico')return await route.fulfill({status:204});
          const row=active.get(name);assert(row,'Unpinned file: '+name);
          const body=await checkedBytes(full?dist:game,row);requests.add(name);
          const types={'.js':'text/javascript','.html':'text/html','.json':'application/json','.css':'text/css',
            '.svg':'image/svg+xml','.png':'image/png'};
          await route.fulfill({body,contentType:types[path.extname(name)]??'application/octet-stream'});
        }catch(error){report.errors.push(error.message);await route.abort();}
      });
      try{
        await page.goto('http://127.0.0.1/record-consumer.html?'+(full?'production=1':'records=/records/manifest.json'));
        await page.waitForFunction(()=>window.__recordConsumer?.ready,null,{timeout:90000});
        if(full){
          const status=await page.evaluate(async r=>(await __recordConsumer.selectGroup(0,[r])).items[0].status,record);
          assert.equal(status,'completed');
        }
        for(const select of full?[null,1,0]:[null]){
          if(select!==null)await page.evaluate(async index=>{
            const [actor]=__recordConsumer.actors.values(),update=await actor.controller.prepareOutfit(index);
            try{if(!update.isCurrent())throw Error('Superseded switch');update.commit();}finally{update.dispose();}
          },select);
          const s=await page.evaluate(inspect),alternate=select===1;
          const captured=s.completeLook; delete s.completeLook; snapshots.push(s);
          assert.equal(s.build,inv.runtime.sourceDigest);assert.equal(s.id,record.identity.id);
          assert.equal(s.recordSha256,record.integrity.recordSha256);
          assert.equal(s.role,alternate?'pants-top-far':'pants');
          assert.equal(s.top.id,alternate?'raw-male-uniform-top-1k-v1':original.id);
          assert.equal(s.top.sha256,alternate?farTop.sha256:original.sha256);assert.equal(s.slotCount,1);
          assert.deepEqual(s.draws.map(r=>[r.material,r.indices,r.positionCount]).sort(),
            source.map(p=>[p.material,p.indices,p.vertices]).sort());
          assert(s.draws.every(r=>r.visible && r.skinned && r.bones>0 && r.draws>0),'Both primitives must draw in the same eight-frame observation');
          assert(s.draws[0].renderFrames.some(frame=>s.draws.every(r=>r.renderFrames.includes(frame))),'No simultaneous draw frame');
          if(!alternate)assert.equal(canonicalJson(captured),canonicalJson(record.appearanceRecipe));
        }
        if(phase==='standalone-first'){
          await page.screenshot({path:path.join(dir,'first.png')});await film(page,path.join(dir,'grouped-top-1x.webm'));
        }else if(phase==='standalone-reopen')await page.screenshot({path:path.join(dir,'reopened.png')});
      }finally{
        await context.close();report.cases.push({phase,closed:true,snapshots,requests:[...requests].sort()});
      }
    }
    assert.notEqual(report.cases[0].snapshots[0].root,report.cases[1].snapshots[0].root);
    assert.equal(new Set(report.cases[2].snapshots.map(s=>s.root)).size,1);
    assert.deepEqual(report.errors,[]);report.status='technical-candidate-observed';
  }catch(error){report.status='failed';report.failure=String(error.stack||error);throw error;}
  finally{
    await browser?.close();await fs.writeFile(path.join(dir,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    await fs.rm(await projectOutput(scratch,work),{recursive:true,force:true});
  }
  console.log(JSON.stringify({status:report.status,perCase:report.cases.map(c=>[c.phase,c.snapshots.length])}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
