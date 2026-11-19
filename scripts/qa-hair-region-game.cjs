// run-fixed-check.cjs PACKAGE scripts/qa-hair-region-game.cjs PACKAGE MANIFEST_SHA SIGNED_PAIR FRESH_OUTPUT
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const {productionRoot, projectOutput} = require('./project-output.cjs');
const {launchQABrowser} = require('./qa-browser-workspace.cjs');

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const styles = ['female-ponytail-v1','female-ponytail-mauve-rose-v1'];
const body = '027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95';
const model = '1b785f9d54107818cee39eda2de7263ad0720ce90968fbaa7cc32c2465e3c385';

async function inputs(folder, pin, signed, target) {
  assert(folder && signed && target && /^[0-9a-f]{64}$/.test(pin), 'Expected package, manifest SHA, signed pair and fresh output');
  const root = await productionRoot();
  const out = await projectOutput(path.resolve(root,target),root);
  await assert.rejects(fs.lstat(out), {code:'ENOENT'}, 'Output must be fresh');
  const {checkedBytes} = await import('./runtime-package/files.mjs');
  const dir = path.resolve(root,folder), bytes = await fs.readFile(path.join(dir,'runtime-package.json'));
  assert.equal(digest(bytes),pin);
  const pack = JSON.parse(bytes);
  assert.equal(pack.schema,'game-character-record-package-v1');
  assert.equal(pack.runtime.entryUrl,'record-consumer.html?records=/records/manifest.json');
  const files = new Map(pack.files.map(f=>[f.path,f]));
  const read = name => checkedBytes(dir,files.get(name));
  const signedBytes = await fs.readFile(path.resolve(root,signed)), records = JSON.parse(signedBytes);
  assert.equal(records.length,2);
  assert.notEqual(records[0].identity.id,records[1].identity.id);
  assert.deepEqual(await Promise.all(pack.records.map(r=>read(r.file).then(JSON.parse))),records);
  assert.deepEqual(pack.records.map(r=>[r.id,r.recordSha256]),records.map(r=>[r.identity.id,r.integrity.recordSha256]));
  assert.deepEqual(records.map(r=>r.appearanceRecipe.appearance.hairStyle).sort(),[...styles].sort());
  for (const {appearanceRecipe:recipe} of records) {
    assert.equal(recipe.base.sha256,body);
    assert.equal(recipe.appearance.hairColor,'blonde');
    assert.equal(recipe.hairAssetSha256,model);
  }
  const models = pack.files.filter(row=>row.sha256===model);
  assert.equal(models.length,1);
  await read(models[0].path);
  const manifest = JSON.parse(await read('assets/m2-hair-region-v1/manifest.json'));
  const {regions,palette} = manifest.regionColorway;
  const map = JSON.parse(await read(regions.url.slice(1))), colors = JSON.parse(await read(palette.url.slice(1)));
  const mask = await read(path.posix.join(path.posix.dirname(regions.url.slice(1)),map.mask.file));
  assert.equal(map.vertices,609);
  assert.equal(mask.length,map.vertices*2);
  const expected = Buffer.alloc(map.vertices*3*4);
  let colored = 0;
  for (let i=0; i<map.vertices; i++) {
    const rootWeight=mask[i*2]/255, tipWeight=mask[i*2+1]/255;
    if (rootWeight || tipWeight) colored++;
    for (let c=0; c<3; c++) expected.writeFloatLE(1+(colors.rootLinearRgb[c]-1)*rootWeight+
      (colors.tipLinearRgb[c]-1)*tipWeight,(i*3+c)*4);
  }
  assert.equal(colored,305);
  return {out,pack,records,modelPath:'/'+models[0].path,signedFileSha256:digest(signedBytes),expected:digest(expected),colored};
}

// Observe the material actually submitted to this game's scene/camera for each hair mesh.
function observe() {
  const game=window.__recordConsumer, watched=[], clean=[];
  for (const actor of game.actors.values()) actor.avatar.root.traverseVisible(mesh=>{
    if (!mesh.isSkinnedMesh || mesh.userData.assetRole!=='hair') return;
    const view={actor,mesh,geometryDisposals:0,draws:new Map()};
    watched.push(view);
    const prior=mesh.onAfterRender, own=Object.hasOwn(mesh,'onAfterRender');
    mesh.onAfterRender=function(renderer,scene,camera,geometry,material,...rest) {
      prior.call(this,renderer,scene,camera,geometry,material,...rest);
      if (renderer===game.renderer && scene===game.scene && camera===game.camera && geometry===mesh.geometry)
        view.draws.set(material,(view.draws.get(material)??0)+1);
    };
    const disposed=()=>{view.geometryDisposals++;};
    mesh.geometry.addEventListener('dispose',disposed);
    clean.push(()=>{
      if (own) mesh.onAfterRender=prior; else delete mesh.onAfterRender;
      mesh.geometry.removeEventListener('dispose',disposed);
    });
  });
  return {close(){for(const fn of clean)fn();},async snapshot() {
    for(const item of watched)item.draws.clear();
    for(let frame=0;frame<12;frame++)await new Promise(requestAnimationFrame);
    const list=[];
    for (const {actor,mesh,geometryDisposals,draws} of watched) {
      const hair=actor.avatar.appearance.getState(), geometry=mesh.geometry, colors=geometry.getAttribute('color');
      let hash=null,count=0;
      if (colors) {
        const bytes=new DataView(new ArrayBuffer(colors.count*12));
        for(let i=0;i<colors.count;i++) {
          const values=[colors.getX(i),colors.getY(i),colors.getZ(i)];
          if(values.some(n=>n!==1))count++;
          values.forEach((v,c)=>bytes.setFloat32(i*12+c*4,v,true));
        }
        hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.buffer)),n=>n.toString(16).padStart(2,'0')).join('');
      }
      list.push({id:actor.identity.id,record:actor.recordSha256,root:actor.avatar.root.uuid,
        attached:actor.avatar.root.parent===game.scene && game.actors.get(actor.identity.id)===actor,
        body:actor.avatar.profile.sha256,style:hair.effectiveHairStyle,global:hair.hairColor,fit:hair.hairFit,
        glb:hair.replacementSHA256,geometry:geometry.uuid,vertices:geometry.attributes.position.count,
        colorVertices:colors?.count??0,changed:count,hash,geometryDisposals,
        draws:[...draws].map(([m,n])=>{
          const gl=game.renderer.getContext(), program=game.renderer.properties.get(m).currentProgram?.program;
          return {id:m.uuid,count:n,mtoon:m.isMToonMaterial===true,vertexColors:m.vertexColors===true,
            ignore:m.ignoreVertexColor===true,linked:program?gl.getProgramParameter(program,gl.LINK_STATUS):false,
            linkLog:program?gl.getProgramInfoLog(program):'missing WebGL program'};
        })});
    }
    return {roster:[...game.actors.keys()],errors:[...game.errors],list};
  }};
}

function check(snapshot,data,remaining) {
  assert.deepEqual(snapshot.errors,[]);
  assert.deepEqual(snapshot.roster.toSorted(),remaining.toSorted());
  for (const r of data.records) {
    const meshes=snapshot.list.filter(m=>m.id===r.identity.id);
    assert.equal(meshes.length,1,r.identity.id);
    const [m]=meshes, active=remaining.includes(m.id);
    assert.equal(m.attached,active);
    assert.equal(m.geometryDisposals,active?0:1);
    if (!active) {assert.deepEqual(m.draws,[]);continue;}
    assert.equal(m.record,r.integrity.recordSha256);
    assert.equal(m.body,body);
    assert.equal(m.style,r.appearanceRecipe.appearance.hairStyle);
    assert.equal(m.glb,model);
    assert.equal(m.global,'blonde');
    assert.deepEqual(m.fit,r.appearanceRecipe.hairFit);
    assert.equal(m.vertices,609);
    const colored=m.style===styles[1];
    assert.equal(m.hash,colored?data.expected:null);
    assert.equal(m.changed,colored?data.colored:0);
    assert.equal(m.colorVertices,colored?609:0);
    assert(m.draws.length>0 && m.draws.every(d=>d.count>0 && d.linked && d.mtoon && (d.vertexColors && !d.ignore)===colored),
      'Hair material draw requires a successfully linked WebGL program: '+m.style);
  }
}

async function run(base,folder,pin,signed,target) {
  const data=await inputs(folder,pin,signed,target);
  if(base==='--preflight') {console.log('Verified original record pair, package, hair GLB and expected vertex colors.');return;}
  const url=new URL(base);
  assert.equal(url.protocol,'http:');assert.equal(url.hostname,'127.0.0.1');
  const served=await fetch(new URL('runtime-package.json',url),{redirect:'error'});
  assert.equal(served.status,200);assert.equal(digest(Buffer.from(await served.arrayBuffer())),pin);
  await fs.mkdir(path.dirname(data.out),{recursive:true});await fs.mkdir(data.out);
  const report={packageSha256:pin,runtime:data.pack.runtime,signedFileSha256:data.signedFileSha256,
    model,modelPath:data.modelPath,expectedVertexColorsSha256:data.expected,sessions:[],status:'incomplete'};
  try {
    for (const [i,phase] of ['first','cold'].entries()) {
      const session=await launchQABrowser(data.out,{channel:'chrome'});
      const row={phase,errors:[],shaderErrors:[]};report.sessions.push(row);
      try {
        const page=await session.browser.newPage({viewport:{width:1280,height:800},acceptDownloads:false});
        page.on('pageerror',e=>row.errors.push(e.message));
        page.on('console',m=>{if (/shader error|VALIDATE_STATUS|GL_INVALID_OPERATION/i.test(m.text()) && row.shaderErrors.length<12)
          row.shaderErrors.push(m.text());});
        const responses=[];
        page.on('response',response=>{if(response.url()===new URL(data.modelPath,url).href)responses.push(response);});
        await page.goto(new URL(data.pack.runtime.entryUrl,url).href);
        await page.waitForFunction(()=>window.__recordConsumer?.ready,null,{timeout:120000});
        assert.equal(await page.evaluate(()=>__recordConsumer.buildInfo.sourceDigest),data.pack.runtime.sourceDigest);
        const inPage=await page.evaluate(()=>__recordConsumer.records);
        assert.deepEqual(inPage,data.records);
        assert(responses.length);
        for (const response of responses) {
          assert.equal(response.status(),200);
          assert.equal(digest(await response.body()),model);
        }
        row.modelHttp200=responses.length;row.browser=session.browser.version();
        const probe=await page.evaluateHandle(observe);
        try {
          const ids=data.records.map(r=>r.identity.id);
          row.pair=await probe.evaluate(p=>p.snapshot());check(row.pair,data,ids);
          assert.equal(new Set(row.pair.list.map(m=>m.geometry)).size,2);
          assert.equal(new Set(row.pair.list.map(m=>m.root)).size,2);
          if (i) assert(row.pair.list.every(m=>report.sessions[0].pair.list.every(prior=>prior.root!==m.root && prior.geometry!==m.geometry)));
          await page.locator('#stage canvas').screenshot({path:path.join(data.out,phase+'-pair.png')});
          // First remove the control, then after a fresh launch remove the colorway.
          const removeId=data.records.find(r=>r.appearanceRecipe.appearance.hairStyle===styles[i]).identity.id;
          assert.equal(await page.evaluate(id=>__recordConsumer.removeActor(id),removeId),true);
          row.removed=removeId;row.survivor=await probe.evaluate(p=>p.snapshot());check(row.survivor,data,ids.filter(id=>id!==removeId));
          await page.locator('#stage canvas').screenshot({path:path.join(data.out,phase+'-survivor.png')});
          assert.deepEqual(row.errors,[]);
          assert.deepEqual(row.shaderErrors,[]);
        } finally {await probe.evaluate(p=>p.close());await probe.dispose();}
      } finally {await session.close();}
    }
    report.status='technical-pass';
  } catch (error) {report.failure=String(error.stack??error);throw error;}
  finally {await fs.writeFile(path.join(data.out,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
}

if(require.main===module)run(...process.argv.slice(2)).catch(error=>{console.error(error);process.exitCode=1;});
