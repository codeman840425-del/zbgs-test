// Run against the private 102344d95ee2 distribution via run-fixed-check.cjs.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { chromium } = require('../prototype/node_modules/playwright');
const { productionRoot, projectOutput } = require('./project-output.cjs');

const BUILD = '102344d95ee237d4137c4ecbe5f414bc5c87b149600573f38a6828964c479e70';
const BODY = 'bedc5970d9a248aa5870f3bfa6f3413736637db571846622ec4cf154c80a31a1';
const RECORD = '5a9741a2425caebb71acad1693314ecb0b9f1abbc4cb7e38d8a676e739f9fcc8';
const FAMILY = '/assets/native-studio-01-yun-lan-v1/';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

async function inspectActor({id, materialName, switchMode}) {
  const consumer = window.__recordConsumer;
  const instance = consumer.actors.get(id), {avatar} = instance;
  if (consumer.actors.size !== 1 || avatar.root.parent !== consumer.scene ||
      typeof avatar.setDebugBody !== 'function') throw Error('Live consumer avatar mode unavailable');
  const renderer = consumer.renderer;
  const startFrame = renderer.info.render.frame;
  // Observe the actual camera without changing the arguments or result of render.
  let camera;
  const render = renderer.render;
  renderer.render = function(scene, usedCamera) {
    camera = usedCamera;
    return render.call(this, scene, usedCamera);
  };
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d',{willReadFrequently:true});
  const cache = new WeakMap();
  function alpha(image) {
    if (cache.has(image)) return cache.get(image);
    canvas.width = image.width;
    canvas.height = image.height;
    ctx.drawImage(image, 0, 0);
    const rgba = ctx.getImageData(0,0,canvas.width,canvas.height).data;
    let zero = 0, partial = 0;
    for (let i = 3; i < rgba.length; i += 4) {
      if (rgba[i] === 0) zero++;
      else if (rgba[i] !== 255) partial++;
    }
    const value = {width:canvas.width,height:canvas.height,zero,partial,nonOpaque:zero+partial};
    cache.set(image,value);
    return value;
  }
  function inspect() {
    if (!camera) throw Error('Actual render camera unavailable');
    const materials = new Set();
    avatar.vrm.scene.traverseVisible(mesh => {
      if (!mesh.isMesh) return;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (material.name === materialName || material.name === materialName+' (Outline)')
          materials.add(material);
      }
    });
    if (!materials.size) throw Error('Exact visible Body materials unavailable');
    const look = avatar.getOutfitInfo();
    return {
      mode:avatar.getDebugState().mode,
      outfit:look.index,
      root:avatar.root.uuid,vrm:avatar.vrm.scene.uuid,
      camera:{world:camera.matrixWorld.toArray(),projection:camera.projectionMatrix.toArray()},
      rootWorld:avatar.root.matrixWorld.toArray(),
      coverage:look.equipment.bodyTextureCoverage,
      gear:Object.fromEntries(Object.values(look.equipment.items).map(item=>[item.id,item.visible])),
      materials:[...materials].map(m=>({
        name:m.name,uuid:m.uuid,alphaTest:m.alphaTest,transparent:m.transparent,
        mtoon:m.isMToonMaterial === true,outline:m.isOutline === true,
        map:{uuid:m.map.uuid,...alpha(m.map.image)},
        shade:{uuid:m.shadeMultiplyTexture.uuid,...alpha(m.shadeMultiplyTexture.image)},
      })),
    };
  }
  try {
    await new Promise(resolve => setTimeout(resolve,650));
    const dressed = inspect();
    let base, restored;
    if (switchMode) {
      // No animation frame or screenshot runs during this synchronous section.
      try { avatar.setDebugBody(true); base = inspect(); }
      finally { avatar.setDebugBody(false); }
      restored = inspect();
    }
    const captured = await instance.capture();
    return {
      record:{identity:instance.identity,revision:instance.revision,sha256:instance.recordSha256,
        recipe:captured.appearanceRecipe,liveAccessories:captured.liveAccessories,
        equipmentMaterials:captured.equipmentMaterials,resourceIdentities:captured.resourceIdentities},
      userAgent:navigator.userAgent,body:avatar.profile.sha256,frameAdvance:renderer.info.render.frame-startFrame,
      dressed,base,restored,errors:[...consumer.errors],
    };
  } finally {
    renderer.render = render;
    canvas.width = canvas.height = 0;
  }
}

async function observe(context, origin, record, manifest, report, out, switchMode) {
  const page = context.pages()[0] ?? await context.newPage();
  const replies = [], pageErrors = [];
  report.pageErrors=pageErrors;
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.origin !== origin.origin || !url.pathname.startsWith(FAMILY)) return;
    replies.push((async () => {
      const lengthHeader=await response.headerValue('content-length');
      assert.match(lengthHeader ?? '',/^\d+$/);
      const row={path:url.pathname,status:response.status(),browserContentLength:Number(lengthHeader)};
      let bytes;
      try {
        bytes=await response.body();
        row.hashMethod='browser-response';
      } catch (error) {
        if (!error.message.includes('evicted from inspector cache')) throw error;
        const readback=await fetch(url,{cache:'no-store',redirect:'error'});
        assert.equal(readback.status,row.status);
        row.independentGetStatus=readback.status;
        bytes=Buffer.from(await readback.arrayBuffer());
        row.hashMethod='independent-get-after-browser-response-eviction';
      }
      assert.equal(bytes.length,row.browserContentLength);
      return {...row,bytes:bytes.length,sha256:sha(bytes)};
    })().catch(error => ({path:url.pathname,status:response.status(),error:error.message})));
  });
  await page.goto(new URL('/record-consumer.html?production=1',origin).href);
  try { await page.waitForFunction(() => window.__recordConsumer?.ready, null, {timeout:30000}); }
  catch (error) { throw Error('Record consumer did not initialize: '+(pageErrors.join(' | ') || error.message)); }
  const batch = await page.evaluate(async ({record,build}) => {
    const consumer = window.__recordConsumer;
    if (consumer.buildInfo.sourceDigest !== build) throw Error('Unexpected fixed build');
    return consumer.selectGroup(0,[record]);
  }, {record,build:BUILD});
  report.batch=batch;
  assert.deepEqual(batch.items.map(({status,recordSha256,revision})=>[status,recordSha256,revision]),
    [['completed',RECORD,record.revision]]);
  assert.deepEqual(batch.cleanupErrors,[]);
  const result = await page.evaluate(inspectActor,{id:record.identity.id,materialName:manifest.materialName,switchMode});
  const {record:captured,...samples}=result;
  Object.assign(report,samples);
  report.resources=await Promise.all(replies);
  assert.deepEqual(pageErrors,[]);
  assert.deepEqual(result.errors,[]);
  assert.equal(result.body,BODY);
  assert.ok(result.frameAdvance>0);
  // Page evaluation preserves JavaScript -0. The signed JSON format serializes it as 0.
  assert.deepEqual(JSON.parse(JSON.stringify(captured)),{
    identity:record.identity,revision:record.revision,sha256:RECORD,recipe:record.appearanceRecipe,
    liveAccessories:record.liveAccessories,equipmentMaterials:record.equipmentMaterials,resourceIdentities:record.resourceIdentities,
  });
  report.record={identity:captured.identity,revision:captured.revision,sha256:RECORD,lookReadbackEqual:true};
  const top=manifest.equipment.find(row=>row.slot==='top');
  const bottom=manifest.equipment.find(row=>row.slot==='bottom');
  const shoes=manifest.equipment.find(row=>row.slot==='shoes');
  const validate = (state,covered) => {
    assert.equal(state.mode,covered?'dressed':'base');
    assert.equal(state.coverage.covered,covered);
    assert.equal(state.coverage.avatarSha256,BODY);
    assert.equal(state.coverage.maskedPngSha256,manifest.covered.sha256);
    assert.deepEqual(state.coverage.cleanupErrors,[]);
    assert.equal(state.coverage.pendingUpdates,0);
    assert.equal(state.gear[top.id],covered);
    assert.equal(state.gear[bottom.id],covered);
    assert.equal(state.gear[shoes.id],true);
    assert.deepEqual([...state.coverage.activeIds].sort(),(covered?[top.id,bottom.id,shoes.id]:[shoes.id]).sort());
    for (const {mtoon,alphaTest,transparent,map,shade} of state.materials) {
      assert.ok(mtoon && !transparent);
      assert.equal(alphaTest,manifest.alphaTest);
      for (const pixels of [map,shade]) {
        assert.deepEqual([pixels.width,pixels.height],[2048,2048]);
        assert.equal(pixels.nonOpaque,covered?1020687:0);
      }
    }
  };
  validate(result.dressed,true);
  if (switchMode) {
    validate(result.base,false);
    validate(result.restored,true);
    assert.deepEqual(result.restored,result.dressed);
    for (const prop of ['root','vrm','camera','outfit','rootWorld'])
      assert.deepEqual(result.base[prop],result.dressed[prop],prop);
    for (let i=0;i<result.dressed.materials.length;i++) {
      const a=result.dressed.materials[i],b=result.base.materials[i];
      assert.equal(a.uuid,b.uuid);
      assert.notEqual(a.map.uuid,b.map.uuid);
      assert.notEqual(a.shade.uuid,b.shade.uuid);
    }
  }
  await page.screenshot({path:path.join(out,switchMode?'dressed-after-restore.png':'dressed-cold-reopen.png')});
}

async function main() {
  const [base,snapshot,run,executablePath] = process.argv.slice(2);
  if (!base || !snapshot || !/^[a-z][a-z0-9-]{0,47}$/.test(run ?? ''))
    throw Error('Expected loopback URL, original private snapshot and a fresh run name');
  const origin=new URL(base);
  assert.equal(origin.protocol,'http:');
  assert.equal(origin.hostname,'127.0.0.1');
  const root=await productionRoot();
  const expectedOutput=path.join(root,'output/native-donor-room');
  const outputRoot=await projectOutput(expectedOutput,root);
  if (path.relative(expectedOutput,outputRoot)) throw Error('Private output root is redirected');
  const out=await projectOutput(path.join(outputRoot,run),root);
  if (path.dirname(out)!==outputRoot) throw Error('Expected an unredirected private run directory');
  const inventory=JSON.parse(await fs.readFile(path.join(snapshot,'source-inventory.json')));
  const dist=path.join(snapshot,'fixed-dist');
  const manifestBytes=await fs.readFile(path.join(dist,FAMILY,'manifest.json'));
  const manifest=JSON.parse(manifestBytes);
  const rawRecord=await fs.readFile(path.join(snapshot,'yun.record.json'));
  const record=JSON.parse(rawRecord);
  assert.equal(inventory.runtimeDigest,BUILD);
  assert.equal(record.integrity.recordSha256,RECORD);
  assert.equal(sha(rawRecord),inventory.record.sha256);
  assert.equal(manifest.avatarSha256,BODY);
  const report={
    status:'incomplete',operator:inventory.officialOperator,privateSourceCommit:inventory.localSourceSnapshot,
    runtimeDigest:BUILD,oldRecordFileSha256:sha(rawRecord),maskManifestSha256:sha(manifestBytes),
    mask:manifest.covered,unmaskedBodyPngSha256:manifest.basePngSha256,body:BODY,
    equipment:manifest.equipment,endpoint:'/record-consumer.html?production=1',
    scope:'Private fixed consumer and actual shared avatar mode. Base is sampled synchronously from live texture maps without render or capture. Screenshots contain clothed state only.',
    sessions:[],
  };
  const pins=new Map([
    ['body.vrm',BODY],['manifest.json',report.maskManifestSha256],[manifest.covered.url,manifest.covered.sha256],
    ['equipment.json',sha(await fs.readFile(path.join(dist,FAMILY,'equipment.json')))],
    ...manifest.equipment.map(item=>[item.id+'.glb',item.sha256]),
  ]);
  await fs.mkdir(outputRoot,{recursive:true});
  await fs.mkdir(out);
  const tmp=path.join(out,'tmp');
  await fs.mkdir(tmp);
  Object.assign(process.env,{TEMP:tmp,TMP:tmp,TMPDIR:tmp});
  try {
    for (const [label,mode] of [['first',true],['cold-reopen',false]]) {
      const profile=path.join(out,'browser-'+label);
      await fs.mkdir(profile);
      const session={label};
      report.sessions.push(session);
      const browser=await chromium.launch({
        ...(executablePath ? {executablePath} : {channel:'chrome'}),
        headless:true,timeout:12000,artifactsDir:tmp,
        env:{...process.env,USERPROFILE:profile,LOCALAPPDATA:profile,APPDATA:profile,
          XDG_CACHE_HOME:tmp,CUDA_CACHE_PATH:tmp,__GL_SHADER_DISK_CACHE_PATH:tmp,
          CHROME_LOG_FILE:path.join(tmp,label+'.log')},
        args:['--disk-cache-dir='+path.join(profile,'disk-cache'),'--crash-dumps-dir='+tmp],
      });
      try {
        session.browser=browser.version();
        const context=await browser.newContext({viewport:{width:1320,height:920},deviceScaleFactor:1,acceptDownloads:false});
        await observe(context,origin,record,manifest,session,out,mode);
        for (const [name,digest] of pins) {
          const rows=session.resources.filter(row=>row.path===FAMILY+name);
          assert.ok(rows.length>0 && rows.every(row=>row.status===200 && row.sha256===digest),JSON.stringify(rows));
        }
      } finally { await browser.close(); }
    }
    const [first,cold]=report.sessions;
    assert.notEqual(first.dressed.root,cold.dressed.root);
    assert.notEqual(first.dressed.vrm,cold.dressed.vrm);
    report.status='technical-pass';
  } catch(error) {
    report.failure=String(error.stack ?? error);
    throw error;
  } finally {
    await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    console.log(out);
  }
}

main().catch(error=>{console.error(error);process.exitCode=1;});
