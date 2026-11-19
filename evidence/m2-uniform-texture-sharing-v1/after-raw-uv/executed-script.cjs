const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const fs=require('node:fs/promises');
const path=require('node:path');
const {launchQABrowser}=require('./qa-browser-workspace.cjs');
const {projectOutput,productionRoot}=require('./project-output.cjs');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

// Runs inside one renderer context. Handles/IDs have no meaning across page closures.
function installProbe() {
  const d=window.__recordConsumer,r=d.renderer,gl=r.getContext();
  const handles=new Map(),images=new Map(),pixels=new Map();
  const ext=gl.getExtension('WEBGL_debug_renderer_info');
  const id=(map,obj)=>{if(!obj)return null;if(!map.has(obj))map.set(obj,map.size+1);return map.get(obj);};
  const tick=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const stats=()=>({textures:r.info.memory.textures,geometries:r.info.memory.geometries,drawCalls:r.info.render.calls});
  function part(m,mesh) {
    if(mesh.userData.assetRole==='hair'||/_HAIR/.test(m.name))return 'hair';
    if(/_FaceBrow_/.test(m.name))return 'eyebrow';
    if(/_Tops_/.test(m.name))return 'top';
    if(/_Accessory_Tie_/.test(m.name))return 'tie';
    if(/_Shoes_/.test(m.name))return 'shoes';
    if(/_Bottoms_|TrainingPants/.test(m.name))return 'bottom';
    if(/_(Body|Face)_\d+_SKIN/.test(m.name))return 'skin';
    if(/EyeIris/.test(m.name))return 'iris';
    return null;
  }
  async function pixelInfo(image) {
    const {width,height}=image;
    let data;
    if(image.data && image.data.length===width*height*4 && image.data.BYTES_PER_ELEMENT===1) data=image.data;
    else {
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      ctx.drawImage(image,0,0);data=ctx.getImageData(0,0,width,height).data;
    }
    const digest=await crypto.subtle.digest('SHA-256',data);
    const probes=[[.25,.25],[.5,.5],[.75,.75]].map(([u,v])=>{
      const x=Math.floor(width*u),y=Math.floor(height*v),o=(y*width+x)*4;
      return {x,y,rgba:Array.from(data.slice(o,o+4))};
    });
    return {width,height,rgbaSha256:Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join(''),probes};
  }
  async function snapshot() {
    await tick();
    const rows=new Map(),undos=[];
    // Observe the sampler on a real draw. Restore the active unit before leaving
    // the callback; do not initialize, bind, replace or dispose any texture.
    for(const actor of d.actors.values()) actor.avatar.root.traverseVisible(mesh=>{
      if(!mesh.isMesh)return;
      const previous=mesh.onAfterRender;
      mesh.onAfterRender=function(renderer,scene,camera,geometry,m,...rest){
        previous.call(this,renderer,scene,camera,geometry,m,...rest);
        const role=part(m,mesh),key=actor.identity.id+'/'+m.uuid;
        if(!role||rows.has(key))return;
        const row={actor:actor.identity.id,role,mesh:mesh.name,name:m.name,outline:!!m.isOutline,material:m.uuid,
          color:m.color?.toArray(),shade:m.shadeColorFactor?.toArray(),channels:{}};
        rows.set(key,row);
        const program=gl.getParameter(gl.CURRENT_PROGRAM),active=gl.getParameter(gl.ACTIVE_TEXTURE);
        try{
          for(const slot of ['map','shadeMultiplyTexture','normalMap','emissiveMap','roughnessMap','metalnessMap','alphaMap','aoMap','matcapTexture','rimMultiplyTexture']) {
            const t=m[slot];if(!t?.isTexture)continue;
            const gpu=r.properties.has(t)?r.properties.get(t).__webglTexture:null;
            const loc=gl.getUniformLocation(program,slot);
            let unit=null,bound=null;
            if(loc!==null){
              unit=gl.getUniform(program,loc);gl.activeTexture(gl.TEXTURE0+unit);
              bound=gl.getParameter(gl.TEXTURE_BINDING_2D);
            }
            const uv=gl.getUniformLocation(program,slot+'UvTransform');
            row.channels[slot]={texture:t.uuid,source:t.source.uuid,image:id(images,t.image),imageKind:t.image.constructor.name,
              handle:id(handles,gpu),live:!!gpu&&gl.isTexture(gpu),samplerUnit:unit,boundHandle:id(handles,bound),
              uvOffset:t.offset.toArray(),uvMatrix:t.matrix.toArray(),shaderUV:uv===null?null:Array.from(gl.getUniform(program,uv)),
              colorSpace:t.colorSpace,flipY:t.flipY,minFilter:t.minFilter,magFilter:t.magFilter,generateMipmaps:t.generateMipmaps};
          }
        }finally{gl.activeTexture(active);}
      };
      undos.push(()=>{mesh.onAfterRender=previous;});
    });
    try{await tick();}finally{undos.forEach(undo=>undo());}
    for(const [image,imageId] of images)if(!pixels.has(imageId))pixels.set(imageId,await pixelInfo(image));
    const appearances=[...d.actors.values()].map(a=>({id:a.identity.id,state:a.avatar.appearance.getState(),outfit:a.avatar.getOutfitInfo().index}));
    return {stats:stats(),actors:appearances,materials:[...rows.values()],liveHandles:[...handles].filter(([h])=>gl.isTexture(h)).map(([,number])=>number)};
  }
  function release(id){const actor=d.actors.get(id);if(!actor)throw Error('Missing actor '+id);actor.dispose();d.actors.delete(id);}
  const originalOffsets=new Map();
  function changeUV(id,restore) {
    if(restore){for(const [texture,offset] of originalOffsets){texture.offset.copy(offset);texture.updateMatrix();}originalOffsets.clear();return;}
    d.actors.get(id).avatar.root.traverseVisible(mesh=>{
      if(!mesh.isMesh)return;
      for(const m of [].concat(mesh.material)){
        if(!['hair','eyebrow'].includes(part(m,mesh)) || !m.map || originalOffsets.has(m.map))continue;
        originalOffsets.set(m.map,m.map.offset.clone());m.map.offset.x+=.125;m.map.updateMatrix();
      }
    });
  }
  return {snapshot,release,stats,tick,changeUV,identities:()=>Object.fromEntries(pixels),
    gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null};
}

function bindings(state,id) {
  return state.materials.filter(m=>m.actor===id).map(({role,name,outline,material,channels,color,shade})=>
    ({role,name,outline,material,color,shade,channels:Object.fromEntries(Object.entries(channels).map(([slot,t])=>[slot,[t.texture,t.source,t.image,t.handle,t.boundHandle,t.live,t.uvOffset,t.uvMatrix,t.shaderUV]]))}))
    .sort((a,b)=>a.material.localeCompare(b.material));
}

function summarize(stage,images) {
  const groups=new Map();
  for(const m of stage.materials)for(const [slot,t] of Object.entries(m.channels)){
    if(!t.live||t.boundHandle!==t.handle)continue;
    const p=images[t.image],key=[m.role,slot,p.width,p.height,p.rgbaSha256,t.colorSpace,t.flipY,t.minFilter,t.magFilter,t.generateMipmaps].join('/');
    if(!groups.has(key))groups.set(key,{role:m.role,slot,width:p.width,height:p.height,rgbaSha256:p.rgbaSha256,actors:new Set(),images:new Set(),sources:new Set(),textures:new Set(),handles:new Set()});
    const g=groups.get(key);
    for(const [set,value] of [['actors',m.actor],['images',t.image],['sources',t.source],['textures',t.texture],['handles',t.handle]])g[set].add(value);
  }
  return [...groups.values()].filter(g=>g.actors.size===2).map(g=>({...g,actors:[...g.actors],images:g.images.size,sources:g.sources.size,textures:g.textures.size,handles:[...g.handles]}));
}

// Original, decoded signed-pair pixels from the d9cadedb54f6 reference.
function requireSharedPair(stage,images,ids) {
  const expected={hair:'c242b34957498520d92e300ee4b27371e62ab3be47bb8f00c78e97226da65c34',
    eyebrow:'71c00265a613645f74a2f89e87307eb70dd3fa21bd6613763c8df91bbe48cc90'};
  const result={};
  for(const [role,hash] of Object.entries(expected)){
    const rows=ids.map(id=>stage.materials.find(m=>m.actor===id&&m.role===role&&!m.outline));
    assert(rows.every(Boolean),'Missing visible actor material for '+role);
    assert.notEqual(rows[0].material,rows[1].material);
    const four=rows.flatMap(row=>['map','shadeMultiplyTexture'].map(key=>row.channels[key]));
    for(const t of four){
      assert(t?.live && t.handle && t.handle===t.boundHandle,'Missing actual sampler binding '+role);
      assert.equal(images[t.image].rgbaSha256,hash);assert.equal(images[t.image].width,1024);
      assert.equal(images[t.image].height,role==='hair'?1024:256);
    }
    assert.equal(new Set(four.map(t=>t.handle)).size,1,role+' still uses duplicate WebGL allocations');
    assert.equal(new Set(four.map(t=>t.source)).size,1,role+' has duplicate Three sources');
    assert.equal(new Set(four.map(t=>t.texture)).size,4,role+' lost independent signed texture wrappers');
    result[role]={sharedHandle:four[0].handle,sharedSource:four[0].source,wrappers:four.map(t=>t.texture),rgbaSha256:hash};
  }
  assert.notEqual(result.hair.sharedHandle,result.eyebrow.sharedHandle);
  return result;
}

async function run(folder,pin,destination,option) {
  assert(!option||option==='--expect-shared-hair-brow','Unknown assertion mode '+option);
  const project=await productionRoot(),out=await projectOutput(destination,project);
  const {checkedBytes}=await import('./runtime-package/files.mjs');
  const dir=await fs.realpath(folder),receipt=await fs.readFile(path.join(dir,'runtime-package.json'));
  assert.equal(sha(receipt),pin,'Unexpected runtime inventory SHA256');
  const inventory=JSON.parse(receipt),files=new Map(inventory.files.map(f=>['/'+f.path,f]));
  const records=await Promise.all(inventory.records.map(row=>checkedBytes(dir,files.get('/'+row.file)).then(JSON.parse)));
  const ids=records.map(x=>x.identity.id);
  assert.deepEqual(ids,['uniform-warm-bob-v1','uniform-original-bob-v1']);
  const signed=JSON.parse(await fs.readFile(path.join(project,'evidence/m2-uniform-skin-v1/signed-pair.json')));
  assert.deepEqual(records,signed,'Expected original signed warm/original pair');
  await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out);
  const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.json':'application/json','.png':'image/png','.wasm':'application/wasm'};
  const url='http://127.0.0.1:47123';
  const report={schema:'runtime-pair-texture-observation-v1',status:'incomplete',assertionMode:option??'observe',inventorySha256:pin,runtime:inventory.runtime,
    signed:records.map(x=>({id:x.identity.id,recordSha256:x.integrity.recordSha256})),errors:[],sessions:[],
    limits:['This uses the installed developer GPU with headless Chrome. Physical VRAM bytes and ordinary-PC performance were not measured.',
      'RGBA hashes describe decoded source pixels read through a 2D canvas, not GPU texture storage or mip chains. GL handles are scoped to their WebGL context.',
      'Cold normal reopening uses a new browser context. No recording or upload timing benchmark.']};
  let session;
  try{
    session=await launchQABrowser(out,{channel:'chrome'});report.browser=session.browser.version();
    for(const mode of ['empty-then-pair','normal-reopen']) {
      const c=await session.browser.newContext({viewport:{width:1280,height:820},deviceScaleFactor:1,serviceWorkers:'block'});
      const log={mode,stages:{},requests:[]};report.sessions.push(log);
      try{
        await c.route(/^https?:/,async route=>{
          try{
            const u=new URL(route.request().url());assert.equal(u.origin,url);
            if(u.pathname==='/favicon.ico')return await route.fulfill({status:204});
            const row=files.get(u.pathname);assert(row,u.pathname);const bytes=await checkedBytes(dir,row);
            log.requests.push(row.path);
            await route.fulfill({contentType:types[path.extname(row.path)]??'application/octet-stream',body:bytes});
          }catch(error){report.errors.push(String(error));await route.abort();}
        });
        const page=await c.newPage();page.on('pageerror',e=>report.errors.push(e.message));
        await page.goto(url+'/record-consumer.html?'+(mode==='normal-reopen'?'records=/records/manifest.json':'production=1'));
        await page.waitForFunction(()=>window.__recordConsumer?.ready,null,{timeout:90000});
        assert.equal(await page.evaluate(()=>__recordConsumer.buildInfo.sourceDigest),inventory.runtime.sourceDigest);
        const probe=await page.evaluateHandle(installProbe);
        const take=async name=>log.stages[name]=await probe.evaluate(p=>p.snapshot());
        log.gpu=await probe.evaluate(p=>p.gpu);
        if(mode==='empty-then-pair'){
          await take('empty');
          const loaded=await page.evaluate(records=>__recordConsumer.selectGroup(0,records),records);
          assert(loaded.items.every(item=>item.status==='completed'));
        }
        const pair=await take('signedPair');
        await page.screenshot({path:path.join(out,mode+'.png')});
        const actual=pair.actors.map(a=>[a.id,a.state.hairStyle,a.state.hairColor,a.state.skinTone]);
        assert.deepEqual(actual,ids.map((id,i)=>[id,'female-bob-v1','blonde',i?'original':'warm']));
        const owned=new Set(pair.materials.filter(m=>m.actor===ids[0]).map(m=>m.material));
        assert(pair.materials.filter(m=>m.actor===ids[1]).every(m=>!owned.has(m.material)),'Shared mutable material between actors');
        if(mode==='empty-then-pair'){
          const peer=bindings(pair,ids[1]);
          if(option){
            await probe.evaluate((p,id)=>p.changeUV(id,false),ids[0]);
            const changed=await take('firstUVOffset');
            assert.deepEqual(bindings(changed,ids[1]),peer,'Peer UV or material changed');
            for(const role of ['hair','eyebrow']){
              const select=s=>s.materials.find(m=>m.actor===ids[0]&&m.role===role&&!m.outline);
              const prev=select(pair).channels,next=select(changed).channels;
              assert.equal(next.map.uvOffset[0],prev.map.uvOffset[0]+.125);
              assert.notDeepEqual(next.map.uvMatrix,prev.map.uvMatrix);
              if(prev.map.shaderUV)assert.notDeepEqual(next.map.shaderUV,prev.map.shaderUV);
              assert.deepEqual(next.shadeMultiplyTexture,prev.shadeMultiplyTexture);
              assert.equal(next.map.boundHandle,prev.map.boundHandle);
            }
            await probe.evaluate((p,id)=>p.changeUV(id,true),ids[0]);
            const reset=await take('firstUVRestored');assert.deepEqual(bindings(reset,ids[0]),bindings(pair,ids[0]));
          }
          const edit=await page.evaluate(()=>__recordConsumer.actors.values().next().value.avatar.appearance.set({hairColor:'original'}));
          assert(edit.applied,JSON.stringify(edit));
          const changed=await take('firstOriginalHair');
          assert.equal(changed.actors[0].state.hairColor,'original');
          for(const role of ['hair','eyebrow']){
            const material=s=>s.materials.find(m=>m.actor===ids[0]&&m.role===role&&!m.outline);
            assert.notDeepEqual(material(changed).color,material(pair).color);
          }
          assert.deepEqual(bindings(changed,ids[1]),peer);
          await page.evaluate(()=>__recordConsumer.actors.values().next().value.avatar.setDebugBody(true));
          const base=await take('firstBase');assert.equal(base.actors[0].state.bodyMode,'base');assert.deepEqual(bindings(base,ids[1]),peer);
          await page.evaluate(()=>__recordConsumer.actors.values().next().value.avatar.setDebugBody(false));
          await page.evaluate(()=>__recordConsumer.actors.values().next().value.avatar.appearance.set({hairColor:'blonde'}));
          const restored=await take('firstRestored');assert.equal(restored.actors[0].state.bodyMode,'dressed');
          assert.equal(restored.actors[0].state.hairColor,'blonde');assert.deepEqual(bindings(restored,ids[1]),peer);
          await probe.evaluate((p,id)=>p.release(id),ids[0]);
          const survivor=await take('survivor');assert.deepEqual(bindings(survivor,ids[1]),peer);
          await page.screenshot({path:path.join(out,'surviving-original.png')});
          await probe.evaluate((p,id)=>p.release(id),ids[1]);
          const empty=await take('bothReleased');assert.equal(empty.stats.textures,log.stages.empty.stats.textures);
          assert.equal(empty.stats.geometries,log.stages.empty.stats.geometries);assert.deepEqual(empty.liveHandles,[]);
        }else if(option){
          await probe.evaluate((p,id)=>p.release(id),ids[1]);
          const survivor=await take('warmSurvivor');assert.deepEqual(bindings(survivor,ids[0]),bindings(pair,ids[0]));
          await page.screenshot({path:path.join(out,'surviving-warm.png')});
          await probe.evaluate((p,id)=>p.release(id),ids[0]);
          const empty=await take('bothReleased');assert.deepEqual(empty.liveHandles,[]);
          assert.deepEqual(empty.stats,report.sessions[0].stages.empty.stats);
        }
        log.images=await probe.evaluate(p=>p.identities());
        log.crossActor= summarize(pair,log.images);
        for(const role of ['hair','eyebrow','top','shoes'])assert(log.crossActor.some(g=>g.role===role && g.slot==='map'),'No observed matching draw binding: '+role);
        if(option)log.checkedSharing=requireSharedPair(pair,log.images,ids);
      }finally{await c.close();}
    }
    assert.deepEqual(report.errors,[]);report.status='measured';
  }catch(error){report.failure=String(error.stack??error);throw error;}
  finally{
    try{await session?.close();}finally{
      await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
      await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    }
  }
}
if(require.main===module)run(...process.argv.slice(2)).catch(error=>{console.error(error);process.exitCode=1;});
module.exports={requireSharedPair};
