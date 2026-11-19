// Bounded real-loader cost sampling, separate from recording and static RGBA estimates.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {productionRoot,projectOutput}=require('./project-output.cjs');
const {launchQABrowser}=require('./qa-browser-workspace.cjs');
const {browserConfigArgs}=require('./qa-browser-config-args.cjs');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

function parseArgs(args) {
 const {remaining,launchOptions}=browserConfigArgs(args);
 const [base,recordFile,folder,...options]=remaining;
 const inspectBuild=options[0]?.startsWith('--')?undefined:options.shift();
 const usage='Usage: BASE RECORDS OUTPUT [BUILD [--ordinary-package MANIFEST_SHA]] [--capture-config PATH] [--browser-config PATH]';
 const flags=new Map();
 for (let i=0;i<options.length;i+=2) {
  const [key,value]=options.slice(i,i+2);
  assert(['--ordinary-package','--capture-config'].includes(key) && value && !value.startsWith('--') && !flags.has(key),usage);
  flags.set(key,value);
 }
 const manifestSha=flags.get('--ordinary-package'),captureConfigPath=flags.get('--capture-config');
 assert(base && recordFile && folder && (!manifestSha || (inspectBuild && /^[0-9a-f]{64}$/.test(manifestSha))),usage);
 return {base,recordFile,folder,inspectBuild,manifestSha,launchOptions,...(captureConfigPath?{captureConfigPath}:{})};
}

function parseCaptureConfig(bytes) {
 const config=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));
 const keys=(value,expected)=>value && typeof value==='object' && !Array.isArray(value) &&
  Object.keys(value).length===expected.length && expected.every(key=>Object.hasOwn(value,key));
 assert(keys(config,['schema','deviceDescription','viewport','mode','sampleSeconds']) && config.schema==='record-budget-capture-v1',
  'Unsupported capture configuration fields or schema');
 const {deviceDescription,viewport,mode,sampleSeconds}=config;
 assert(typeof deviceDescription==='string' && deviceDescription.trim() && deviceDescription.length<=512,
  'Capture requires a nonempty operator-reported device description (up to 512 characters)');
 assert(keys(viewport,['width','height']) && Number.isInteger(viewport.width) && viewport.width>=320 && viewport.width<=3840 &&
  Number.isInteger(viewport.height) && viewport.height>=240 && viewport.height<=2160,'Invalid capture viewport');
 assert(mode==='headed' || mode==='headless','Capture mode must be headed or headless');
 assert(Number.isInteger(sampleSeconds) && sampleSeconds>=12 && sampleSeconds<=120,'Capture sampleSeconds must be an integer from 12 to 120');
 return {configSha256:sha(bytes),deviceDescription:deviceDescription.trim(),viewport,mode,sampleSeconds};
}

async function ordinaryInput(base, manifestSha, inspectBuild, records) {
 const origin=new URL(base);
 assert(origin.protocol==='http:' && origin.hostname==='127.0.0.1','Ordinary package must use the fixed loopback server');
 async function read(file) {
  const response=await fetch(new URL(file,origin),{redirect:'error',signal:AbortSignal.timeout(10000)});
  assert.equal(response.status,200,'Cannot read '+file);
  return Buffer.from(await response.arrayBuffer());
 }
 const bytes=await read('runtime-package.json');
 assert.equal(sha(bytes),manifestSha,'Package manifest SHA mismatch');
 const {schema,runtime,records:packed,files}=JSON.parse(bytes);
 assert.equal(schema,'game-character-record-package-v1');
 assert.equal(runtime.buildId,inspectBuild);
 assert.equal(runtime.entryUrl,'record-consumer.html?records=/records/manifest.json');
 assert.equal(records.length,2);
 const pins=new Map(files.map(file=>['/'+file.path,file]));
 const manifestBytes=await read('/records/manifest.json');
 assert.equal(sha(manifestBytes),pins.get('/records/manifest.json')?.sha256,'Record manifest SHA mismatch');
 const {schema:recordSchema,entries,ruleBodyDataPacks=[]}=JSON.parse(manifestBytes);
 assert.equal(recordSchema,'character-record-input-v1');
 const pointers=[];
 for (const {bodyType,url,sha256,bytes} of ruleBodyDataPacks) {
  assert.equal(pins.get(url)?.sha256,sha256,'External body pointer is not pinned in the package');
  assert.equal(pins.get(url)?.bytes,bytes);
  pointers.push(bodyType);
 }
 const actors=records.map(record=>{
  const {id}=record.identity, {recordSha256}=record.integrity;
  const {bodyType,sha256:bodySha256}=record.appearanceRecipe.base;
  const equipment=Object.values(record.appearanceRecipe.equipment.resources)
   .map(({id,slot,url,sha256})=>({id,slot,url,sha256})).sort((a,b)=>a.slot.localeCompare(b.slot));
  assert.deepEqual(equipment.map(item=>item.slot),['bottom','shoes','top']);
  for (const item of equipment) assert.equal(pins.get(item.url)?.sha256,item.sha256,'Equipment asset not pinned');
  const body=pointers.includes(bodyType)?'/assets/'+bodyType+'/body.vrm':undefined;
  if (body) assert.equal(pins.get(body)?.sha256,bodySha256,'External body asset not pinned');
  return {id,recordSha256,bodyType,bodySha256,body,equipment};
 });
 assert.deepEqual(entries,actors.map(({id,recordSha256})=>({id,url:'/records/'+id+'.json',recordSha256})));
 assert.deepEqual(packed.map(({id,recordSha256,bodyType,avatarSha256})=>({id,recordSha256,bodyType,bodySha256:avatarSha256})),
  actors.map(({id,recordSha256,bodyType,bodySha256})=>({id,recordSha256,bodyType,bodySha256})));
 assert.equal(new Set(actors.map(actor=>actor.id)).size,actors.length);
 assert(pointers.every(bodyType=>actors.some(actor=>actor.bodyType===bodyType)),'Unrelated external body pointer');
 return {entry:new URL(runtime.entryUrl,origin).href,runtime,actors,ruleBodyDataPacks};
}

async function run(args) {
 const {base,recordFile,folder,inspectBuild,manifestSha,launchOptions,captureConfigPath}=parseArgs(args);
 const root=await productionRoot(),out=await projectOutput(folder,root);
 const capture=captureConfigPath?parseCaptureConfig(await fs.readFile(captureConfigPath)):null;
 let records, ordinary, reportPath, scriptCopy;
 if (manifestSha) {
  records=JSON.parse(await fs.readFile(recordFile,'utf8'));
  ordinary=await ordinaryInput(base,manifestSha,inspectBuild,records);
 }
 reportPath=await projectOutput(path.join(out,'report.json'),root);
 scriptCopy=await projectOutput(path.join(out,'executed-script.cjs'),root);
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,scriptCopy);
 records ??=JSON.parse(await fs.readFile(recordFile,'utf8'));
 if(!Array.isArray(records)||records.length<2)throw Error('Budget input requires at least two records');
 const report={schema:ordinary?'ordinary-runtime-budget-trace-v1':'native-runtime-budget-trace-v1',status:'incomplete',viewport:{width:1440,height:1000},device:'Development Windows host, Ryzen 9 9950X3D / RTX4090; not ordinary-PC measurement',input:{path:path.resolve(recordFile),records:records.map(record=>({id:record.identity?.id,gender:record.identity?.gender,sourceRefs:record.provenance?.sourceRefs||[],bodySha256:record.appearanceRecipe?.base?.sha256||record.resourceIdentities?.find(item=>item.id==='appearance/base/sha256')?.sha256||null,recordSha256:record.integrity?.recordSha256||record.integrity?.sha256||null}))},cases:[],errors:[],limits:['Headless Chrome, no CPU/network throttling; 12-second bounded samples only.','Renderer memory reports object counts, not GPU bytes. Frame intervals include browser scheduling; CPU wrappers exclude GPU execution.','No recording in this measurement; original-speed movement films belong to production evidence. Idle/talking independent consumer only.']};
 if (capture) {
  const {configSha256,deviceDescription,viewport,mode,sampleSeconds}=capture;
  report.viewport=viewport;
  report.device='Operator-reported device; see capture.declaredDevice';
  report.capture={configSha256,declaredDevice:{description:deviceDescription,source:'operator-reported'},
   requested:{viewport,mode,sampleSeconds}};
  report.ordinaryPC='not-assessed';
  report.limits[0]=`Requested ${mode} Chrome with ${sampleSeconds}-second samples and no CPU/network throttling by this tool.`;
  report.limits.push('The operator reports the device. Browser and WebGL observations do not qualify the device or certify performance.');
 }
 if (ordinary) {
  report.package={manifestSha,runtime:ordinary.runtime,ruleBodyDataPacks:ordinary.ruleBodyDataPacks};
  report.networkIntegrity='not-evaluated';
  report.limits.push('Each fresh context first opens the full ordinary package, then removes the initial pair and samples the selected signed group with both external bodies already registered. Single-actor selection is not a cold single-actor startup.','HTTP Content-Length is declared by the server. Texture dimensions, source types and WebGL handles are observed on visible actor materials. No per-image decode time or physical GPU byte count.');
 }
 const groups=[[records[0]],[records[1]],[records[0],records[1]]];
 let session;
 try{
  session=await launchQABrowser(out,capture?{...launchOptions,headless:capture.mode==='headless'}:launchOptions);
  const {browser}=session;
  report.browser=browser.version();
  if (session.receipt) report.browserLaunch=session.receipt;
  if (capture) report.capture.observedBrowser={version:report.browser,
   selection:session.receipt?'reviewed-browser-configuration':'installed-system-chrome'};
  for(const group of groups){
   const context=await browser.newContext({viewport:report.viewport,...(ordinary?{serviceWorkers:'block'}:{})}),page=await context.newPage();const network=[];
   let phase='ordinary-cold-pair';
   page.on('pageerror',error=>report.errors.push(error.message));page.on('response',response=>{
    const contentLength=response.headers()['content-length'];
    network.push({url:response.url(),status:response.status(),...(ordinary?
     {phase,declaredContentLength:contentLength===undefined?null:Number(contentLength)}:{bytes:Number(contentLength??0)})});
   });
   const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
   const opening=performance.now();
   await page.goto(ordinary?.entry??base+'record-consumer.html?production=1');await page.waitForFunction(()=>window.__recordConsumer?.ready,null,{timeout:60000});
   const ordinaryEntryMs=ordinary?performance.now()-opening:undefined;
   if (ordinary) assert.deepEqual(await page.evaluate(()=>__recordConsumer.records),records,'Ordinary page did not restore the original signed inputs');
   phase='group-sample';
   const row=await page.evaluate(async ({inputs,inspectBuild,ordinary,capture})=>{
    const d=__recordConsumer,renderer=d.renderer,gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
    if(inspectBuild && d.buildInfo.shortId!==inspectBuild)throw Error('Unexpected fixed build: '+d.buildInfo.shortId);
    const stats=()=>({textures:renderer.info.memory.textures,geometries:renderer.info.memory.geometries,programs:renderer.info.programs.length,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles});
    const tick=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const observeEnvironment=()=>({viewport:{width:innerWidth,height:innerHeight},devicePixelRatio,
     drawingBuffer:{width:gl.drawingBufferWidth,height:gl.drawingBufferHeight},visibility:document.visibilityState,focused:document.hasFocus(),
     webglVersion:gl.getParameter(gl.VERSION),webglRenderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null,
     userAgent:navigator.userAgent,platform:navigator.platform,reportedLogicalProcessors:navigator.hardwareConcurrency,
     reportedDeviceMemoryGiB:navigator.deviceMemory??null});
    function requireActors(expected) {
     const items=d.snapshot()?.items,actual=[...d.actors.values()];
     if(d.inputFailure || d.errors.length || actual.length!==expected.length || items?.length!==expected.length)
      throw Error('Ordinary page did not select the pinned group: '+JSON.stringify({inputFailure:d.inputFailure,errors:d.errors,items}));
     return expected.map((pin,i)=>{
      const actor=actual[i],avatar=actor.avatar,outfit=avatar.getOutfitInfo(),profile=avatar.profile;
      const visible=Object.values(outfit.equipment.items).filter(item=>item.visible).map(item=>item.id).sort();
      const selected=Object.values(avatar.getEquipmentRecipe(outfit.index)).map(({id,slot,url,sha256})=>({id,slot,
       url:new URL(url,new URL(avatar.config.manifestUrl,location.href)).pathname,sha256})).sort((a,b)=>a.slot.localeCompare(b.slot));
      if(items[i].status!=='completed' || items[i].identityId!==pin.id || actor.identity.id!==pin.id || actor.recordSha256!==pin.recordSha256 ||
       avatar.root.parent!==d.scene || profile.bodyType!==pin.bodyType || profile.sha256!==pin.bodySha256 || (pin.body && profile.url!==pin.body) ||
       JSON.stringify(visible)!==JSON.stringify(pin.equipment.map(item=>item.id).sort()) || JSON.stringify(selected)!==JSON.stringify(pin.equipment))
       throw Error('Unexpected actor selected for '+pin.id);
      return {id:pin.id,recordSha256:actor.recordSha256,root:avatar.root.uuid,bodyType:profile.bodyType,bodySha256:profile.sha256,
       bodyUrl:profile.url,equipment:selected,visible};
     });
    }
    let ordinaryPair,selected;
    if (ordinary) {
     if (d.buildInfo.sourceDigest!==ordinary.runtime.sourceDigest) throw Error('Frozen source digest changed');
     await tick();ordinaryPair={actors:requireActors(ordinary.actors),renderer:stats()};
     for (const actor of ordinaryPair.actors) if (!d.removeActor(actor.id)) throw Error('Cannot remove initial actor '+actor.id);
    }
    const groupInput=ordinary?inputs.map(({identity})=>d.records.find(record=>record.identity.id===identity.id)):inputs;
    await tick();const baseline=stats(),started=performance.now(),result=await d.selectGroup(0,groupInput);await tick();
    if(result.items.some(r=>r.status!=='completed'))throw Error(JSON.stringify(result));
    const loaded=stats(),loadMs=performance.now()-started,frames=[];
    if(ordinary)selected=requireActors(inputs.map(({identity})=>ordinary.actors.find(actor=>actor.id===identity.id)));
    let last=null,updateMs=0,renderMs=0;
    const restores=[];
    for(const instance of d.actors.values()){
     const original=instance.update;instance.update=function(...args){const t=performance.now();try{return original.apply(this,args);}finally{updateMs+=performance.now()-t;}};
     restores.push(()=>instance.update=original);
    }
    const render=renderer.render;renderer.render=function(...args){const t=performance.now();try{return render.apply(this,args);}finally{renderMs+=performance.now()-t;}};
    restores.push(()=>renderer.render=render);
    const environment=capture?{before:observeEnvironment()}:undefined;
    const targetMs=(capture?.sampleSeconds??12)*1000;
    const startedSampling=performance.now();
    try{await new Promise((resolve,reject)=>{
     const start=performance.now();
     let request,deadline;
     function sample(t){
      if(last!==null)frames.push({frameMs:t-last,updateMs,renderMs});
      last=t;updateMs=0;renderMs=0;
      if(t-start<targetMs)request=requestAnimationFrame(sample);
      else {clearTimeout(deadline);resolve();}
     }
     request=requestAnimationFrame(sample);
     if(capture) deadline=setTimeout(()=>{cancelAnimationFrame(request);reject(Error('Capture frame sampling timed out'));},targetMs+15000);
    });}
    finally{for(const restore of restores)restore();}
    if(capture && !frames.length)throw Error('Capture produced no frame intervals');
    if(environment) Object.assign(environment,{after:observeEnvironment(),elapsedSampleMs:performance.now()-startedSampling});
    const summarize=key=>{const values=frames.map(r=>r[key]).sort((a,b)=>a-b);return{count:values.length,min:values[0],p50:values[Math.floor(values.length*.5)],p95:values[Math.floor(values.length*.95)],p99:values[Math.floor(values.length*.99)],max:values.at(-1),over33:values.filter(v=>v>33.34).length,over50:values.filter(v=>v>50).length};};
    const afterSample=stats();
    // Observe already-uploaded Three/WebGL2 resources after the timed sample, without
    // initializing textures, rendering extra passes or changing renderer ownership.
    const handles=new Map(),images=new Map(),bindings=[];
    function identity(map,object){if(!object)return null;if(!map.has(object))map.set(object,map.size+1);return map.get(object);}
    if(inspectBuild&&!ordinary)for(const actor of d.actors.values()){
      const materials=new Set();
      actor.avatar.root.traverseVisible(o=>{if(o.isMesh)for(const material of [].concat(o.material))materials.add(material);});
      for(const m of materials){
        if(!/_(Face_\d+_SKIN|Body_\d+_SKIN|FaceEyeline_)/.test(m.name))continue;
        for(const slot of ['map','shadeMultiplyTexture','normalMap']){
          const t=m[slot];if(!t?.isTexture)continue;
          const h=renderer.properties.has(t)?renderer.properties.get(t).__webglTexture:null;
          bindings.push({actor:actor.identity.id,material:m.name,outline:Boolean(m.isOutline),slot,
            texture:t.uuid,source:t.source.uuid,image:identity(images,t.image),width:t.image.width,height:t.image.height,
            imageBitmap:t.image instanceof ImageBitmap,handle:identity(handles,h),live:h?gl.isTexture(h):false});
        }
      }
    }
    let decodedTextures;
    if(ordinary){
     const textures=new Map(),imageRows=new Map();
     for(const actor of d.actors.values())actor.avatar.root.traverseVisible(mesh=>{
      if(!mesh.isMesh)return;
      for(const material of [].concat(mesh.material)){
       const slots=new Set([...Object.keys(material),'map','shadeMultiplyTexture','normalMap','rimMultiplyTexture','matcapTexture']);
       for(const slot of slots){
        const texture=material[slot],image=texture?.image;
        if(!texture?.isTexture || !image || !Number.isFinite(image.width) || !Number.isFinite(image.height))continue;
        if(!textures.has(texture)){
         const imageId=identity(images,image),h=renderer.properties.has(texture)?renderer.properties.get(texture).__webglTexture:null;
         imageRows.set(imageId,{id:imageId,kind:image.constructor?.name??'unknown',width:image.width,height:image.height});
         textures.set(texture,{texture:texture.uuid,source:texture.source?.uuid,image:imageId,handle:identity(handles,h),live:!!h&&gl.isTexture(h),actors:new Set()});
        }
        textures.get(texture).actors.add(actor.identity.id);
       }
      }
     });
     const entries=[...textures.values()].map(texture=>({...texture,actors:[...texture.actors]}));
     const sourceImages=[...imageRows.values()],byKind={};
     for(const {kind} of sourceImages)byKind[kind]=(byKind[kind]??0)+1;
     decodedTextures={webgl2:gl instanceof WebGL2RenderingContext,entries,sourceImages,byKind,
      distinctSources:new Set(entries.map(entry=>entry.source)).size,liveHandles:new Set(entries.filter(entry=>entry.live).map(entry=>entry.handle)).size};
    }
    for(const actor of d.actors.values())actor.dispose();d.actors.clear();await tick();const released=stats();
    if(decodedTextures)decodedTextures.afterRelease=[...handles].map(([h,id])=>({id,live:gl.isTexture(h)}));
    const handleProbe=inspectBuild&&!ordinary?{webgl2:gl instanceof WebGL2RenderingContext,bindings,
      afterRelease:[...handles].map(([h,id])=>({id,live:gl.isTexture(h)}))}:undefined;
    return{build:d.buildInfo.shortId,ids:inputs.map(r=>r.identity.id),baseline,loaded,loadMs,afterSample,released,frames,handleProbe,
     ordinaryPair,selected,decodedTextures,environment,summary:{frame:summarize('frameMs'),update:summarize('updateMs'),render:summarize('renderMs')},gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable'};
   },{inputs:group,inspectBuild,ordinary,capture:capture?{sampleSeconds:capture.sampleSeconds}:null});
   const inputIdentity=group.map(record=>report.input.records.find(item=>item.id===record.identity?.id));
   report.cases.push({...row,inputs:inputIdentity,network,ordinaryEntryMs});assert.equal(row.released.textures,row.baseline.textures);assert.equal(row.released.geometries,row.baseline.geometries);
   await context.close();console.log(JSON.stringify({case:row.ids,loadMs:row.loadMs,frame:row.summary.frame,loaded:row.loaded,released:row.released}));
  }
  assert.equal(report.errors.length,0,JSON.stringify(report.errors));report.status=capture?'measured-capture-only':'measured-development-only';
 }catch(error){report.failure=String(error.stack||error);process.exitCode=1;}
 finally{
  try { await session?.close(); }
  finally { await fs.writeFile(reportPath,JSON.stringify(report,null,2),{flag:'wx'}); }
  console.log(JSON.stringify({status:report.status,failure:report.failure}));
 }
}

if (require.main===module) run(process.argv.slice(2)).catch(error=>{console.error(error);process.exitCode=1;});
module.exports={parseArgs,parseCaptureConfig,ordinaryInput};
