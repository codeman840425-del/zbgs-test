// Fixed workbench acceptance: real controls, exact assets, existing room runtime.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const {productionRoot,projectOutput}=require('./project-output.cjs');
const {launchQABrowser}=require('./qa-browser-workspace.cjs');
const BUILD='b44b5af53491',base='http://127.0.0.1:4196/';
let out;
const bodies={
 female:['beta-base-female-m1','027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'],
 male:['beta-base-male-m1b','62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff'],
 'm1a-jaw-v1':['m1a-jaw-v1','3c11caaed49f6db514acb7678551352afdf1c2893ef92ca93b959a8d09691011'],
 'm1a-waisthip-v1':['m1a-waisthip-v1','10778174ece87e3e3a00ecaf5e0c98eef59cd7d762e9bb52daa50162ee1743b5'],
 'm2-male-jaw-v1':['m2-male-jaw-v1','25ac8a8174110d7b0a6bb290ac8cab66ad6939ea522f80cdef62571d2ab24153'],
};
const report={build:BUILD,base,viewport:{width:1600,height:1000},started:new Date().toISOString(),checks:[],identities:[],screenshots:[],videos:[],pageerrors:[],limits:['Headless development machine, not ordinary-PC performance acceptance','Static screenshots and sampled review are not continuous human 1x acceptance','No general hairstyle, derived-body dance or arbitrary material admission'],status:'running'};
const save=()=>fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
async function check(name,fn){try{const result=await fn();report.checks.push({name,passed:true,result});}catch(e){report.checks.push({name,passed:false,error:String(e),stack:e.stack});console.error('CHECK FAILED',name,String(e));}await save();}
async function appearance(page){return page.evaluate(()=>__debug.avatar().appearance.getState());}
async function select(page,id,value){await page.locator(id).selectOption(value);await page.waitForFunction(()=>!document.querySelector('#appearance-fields').disabled);return appearance(page);}
async function screenshot(page,name){await page.screenshot({path:path.join(out,name+'.png')});report.screenshots.push({file:name+'.png',state:await page.evaluate(()=>({appearance:__debug.avatar().appearance.getState(),camera:__debug.snapshot().camera,mode:__debug.snapshot().mode,body:__debug.avatar().getAssetProfile().id,simulationTime:__debug.snapshot().simulationTime}))});}
async function view(page,frame,direction){await page.locator(`[data-inspect-framing="${frame}"]`).click();await page.locator(`[data-inspect-direction="${direction}"]`).click();await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>__debug.snapshot().camera.mode),`inspect-${frame}-${direction}`);}
async function collectMaterialState(page,retain=false){return page.evaluate(async retain=>{
 const a=__debug.avatar(),items=[];a.vrm.scene.traverse(o=>{if(!o.isMesh)return;for(const m of (Array.isArray(o.material)?o.material:[o.material]))if(/_(Body|Face)_\d+_SKIN|_HAIR|_FaceBrow_/.test(m.name))items.push({mesh:o,m});});
 const unique=[...new Map(items.map(x=>[x.m.uuid,x])).values()];
 if(retain)window.__appearanceOriginal=unique.map(x=>({m:x.m,mesh:x.mesh,map:x.m.map,source:x.m.map?.source,shadeMap:x.m.shadeMultiplyTexture,color:x.m.color.toArray(),shade:x.m.shadeColorFactor?.toArray(),visible:x.mesh.visible}));
 const rows=[];
 for(const {mesh,m} of unique){let pixels=null;if(m.map?.image){const im=m.map.image,c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(im,0,0);const bytes=ctx.getImageData(0,0,c.width,c.height).data;pixels=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');}
 rows.push({name:m.name,uuid:m.uuid,map:m.map?.uuid,source:m.map?.source.uuid,pixels,color:m.color.toArray(),shade:m.shadeColorFactor?.toArray(),visible:mesh.visible,vertices:mesh.geometry.attributes.position.count});}
 return rows;
},retain);}

(async()=>{
 const project=await productionRoot();
 out=await projectOutput(process.argv[2]??path.join(project,'evidence','m2-appearance-workbench-'+BUILD),project);
 await fs.mkdir(path.dirname(out),{recursive:true});
 await fs.mkdir(out);
 await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));await save();
 const {browser,close}=await launchQABrowser(out,{channel:'chrome'});
 async function open(body,record=false){const context=await browser.newContext({viewport:report.viewport,...(record?{recordVideo:{dir:path.join(out,'raw-video'),size:report.viewport}}:{})});const page=await context.newPage();page.on('pageerror',e=>report.pageerrors.push({body,error:String(e)}));await page.goto(base+`?body=${body}&workbench=appearance`);await page.waitForFunction(()=>window.__debug?.ready&&!document.querySelector('#appearance-fields').disabled,null,{timeout:60000});report.identities.push(await verifyCandidate(page,{build:BUILD,assetId:bodies[body][0],sha256:bodies[body][1]}));return{page,context};}
 try{
  let {page,context}=await open('female');
  const original=await collectMaterialState(page,true);
  await screenshot(page,'female-original-face-front-initial');
  await check('female hair original -> bob -> original and retained color',async()=>{
   assert.equal((await appearance(page)).hairStyle,'original');
   for(const style of ['original','female-bob-v1']){if(style!=='original')assert.equal((await select(page,'#appearance-hair-style',style)).hairStyle,style);for(const direction of ['front','side','back']){await view(page,'face',direction);await screenshot(page,`female-${style}-face-${direction}`);}}
   assert.equal((await select(page,'#appearance-hair-color','brown')).hairColor,'brown');
   let state=await select(page,'#appearance-hair-style','original');assert.equal(state.hairColor,'brown');
   state=await select(page,'#appearance-hair-style','female-bob-v1');assert.equal(state.hairColor,'brown');
   await select(page,'#appearance-hair-style','original');return{state:await appearance(page)};
  });
  await check('all advertised color presets and exact source restoration',async()=>{
   await view(page,'face','front');
   const states=[];for(const color of ['black','brown','blonde']){const state=await select(page,'#appearance-hair-color',color);assert.equal(state.hairColor,color);await screenshot(page,'female-hair-'+color);states.push(state);}
   for(const tone of ['original','warm','deep']){const state=await select(page,'#appearance-skin-tone',tone);assert.equal(state.skinTone,tone);await screenshot(page,'female-skin-'+tone);states.push(state);}
   await page.locator('#appearance-reset').click();await page.waitForFunction(()=>!document.querySelector('#appearance-fields').disabled);
   const restored=await collectMaterialState(page);const originalIds=new Set(original.map(x=>x.uuid));assert.deepEqual(restored.filter(x=>originalIds.has(x.uuid)),original);
   const refs=await page.evaluate(()=>window.__appearanceOriginal.map(x=>({name:x.m.name,map:x.map===x.m.map,source:x.source===x.m.map?.source,shade:x.shadeMap===x.m.shadeMultiplyTexture,visibility:x.visible===x.mesh.visible})));
   assert(refs.every(x=>x.map&&x.source&&x.shade&&x.visibility));return{states,refs,original,restored};
  });
  await check('nine camera combinations through actual controls',async()=>{const states=[];for(const framing of ['face','half','full'])for(const dir of ['front','side','back']){await view(page,framing,dir);await screenshot(page,`female-camera-${framing}-${dir}`);const s=await page.evaluate(()=>({camera:__debug.snapshot().camera,url:location.href}));assert(s.url.includes(`view=inspect-${framing}-${dir}`));states.push(s);}return states;});
  await context.close();
  ({page,context}=await open('female'));
  await check('loading failure retains original and UI retry recovers',async()=>{
   await page.route('**/assets/m2-hairstyle-v1/manifest.json',route=>route.fulfill({status:503,body:'fixture unavailable'}));
   await page.locator('#appearance-hair-style').selectOption('female-bob-v1');await page.waitForFunction(()=>!document.querySelector('#appearance-fields').disabled);
   const failure={state:await appearance(page),text:await page.locator('#appearance-status').textContent()};assert.equal(failure.state.hairStyle,'original');assert(failure.state.error.includes('503'));await screenshot(page,'hair-load-503-original-retained');
   await page.unroute('**/assets/m2-hairstyle-v1/manifest.json');assert.equal((await select(page,'#appearance-hair-style','female-bob-v1')).hairStyle,'female-bob-v1');return failure;
  });await context.close();
  ({page,context}=await open('female'));
  await check('rapid API style changes keep final intent without duplicate hair',async()=>{
   await page.route('**/assets/m2-hairstyle-v1/manifest.json',async route=>{await new Promise(r=>setTimeout(r,180));await route.continue();});
   const result=await page.evaluate(async()=>{const d=__debug,p1=d.command({type:'appearance',hairStyle:'female-bob-v1'}),p2=d.command({type:'appearance',hairStyle:'original'}),p3=d.command({type:'appearance',hairStyle:'female-bob-v1'}),p4=d.command({type:'appearance',hairColor:'black'});const results=await Promise.all([p1,p2,p3,p4]);let meshes=0;d.avatar().root.traverse(o=>{if(o.isMesh&&o.userData.assetRole==='hair')meshes++;});return{results,state:d.avatar().appearance.getState(),replacementMeshes:meshes};});assert.equal(result.state.hairStyle,'female-bob-v1');assert.equal(result.state.hairColor,'black');assert.equal(result.state.loading,false);assert.equal(result.replacementMeshes,1);return result;
  });
  await check('two actual female instances keep independent color/style and original pixels',async()=>{
   const result=await page.evaluate(async()=>{const d=__debug;await d.command({type:'appearance',hairStyle:'original',hairColor:'brown',skinTone:'warm'});const peer=await d.loadComparison('female');const a=d.avatar(),b=peer.avatar;
    const mats=x=>{const r=[];x.vrm.scene.traverse(o=>{if(o.isMesh)for(const m of(Array.isArray(o.material)?o.material:[o.material]))if(/_HAIR|_FaceBrow_|_(Body|Face)_\d+_SKIN/.test(m.name))r.push(m);});return[...new Set(r)];};
    const before=mats(a).map(m=>({uuid:m.uuid,color:m.color.toArray(),map:m.map?.uuid,source:m.map?.source.uuid}));
    await peer.command({type:'appearance',hairStyle:'female-bob-v1',hairColor:'blonde',skinTone:'deep'});
    const after=mats(a).map(m=>({uuid:m.uuid,color:m.color.toArray(),map:m.map?.uuid,source:m.map?.source.uuid}));
    const sharedMaterials=mats(a).filter(m=>mats(b).includes(m)).length;
    return{before,after,sharedMaterials,primary:a.appearance.getState(),peer:b.appearance.getState()};});
   assert.deepEqual(result.before,result.after);assert.equal(result.sharedMaterials,0);assert.equal(result.primary.hairStyle,'original');assert.equal(result.primary.hairColor,'brown');assert.equal(result.peer.hairStyle,'female-bob-v1');await screenshot(page,'two-female-instances-distinct-appearance');await page.evaluate(()=>__debug.removeComparison());return result;
  });await context.close();
  for(const body of Object.keys(bodies)){
   ({page,context}=await open(body));
   await check('same camera '+body+' appearance admission and shape screenshots',async()=>{
    const state=await appearance(page),dance=await page.locator('select[aria-label="舞蹈样件"]').inputValue();
    for(const [frame,dir]of[['face','front'],['face','side'],['half','front'],['half','side']]){await view(page,frame,dir);await screenshot(page,`${body}-compare-${frame}-${dir}`);}
    if(body!=='female'){assert.deepEqual(state.availableStyles,['original']);const r=await page.evaluate(()=>__debug.command({type:'appearance',hairStyle:'female-bob-v1'}));assert.equal(r.applied,false);}
    if(body==='male'||body==='female')assert.equal(dance,'rokoko-5359146-30s-v1');else assert(!dance.startsWith('rokoko-'));
    return{state,dance};
   });await context.close();
  }
  for(const body of ['female','male']){
   ({page,context}=await open(body,true));const video=page.video();
   await check(body+' original thirty-second normal-1x dance, pause/resume and idle completion',async()=>{
    await view(page,'full','front');await page.evaluate(()=>{__debug.setPlaybackRate(1);__debug.setHelpers(false);__debug.setDynamics(true);const q=window.__appearanceFilm={start:performance.now(),rows:[],running:true,last:null};function tick(now){if(!q.running)return;const s=__debug.snapshot();q.rows.push({t:(now-q.start)/1000,dt:q.last===null?null:(now-q.last)/1000,simulationTime:s.simulationTime,mode:s.mode,paused:s.paused,root:s.position,dance:s.motion.dance,danceMix:s.motion.danceMix,appearance:s.appearance,camera:s.camera,task:__debug.tasks().active()});q.last=now;requestAnimationFrame(tick);}requestAnimationFrame(tick);});
    const request=await page.evaluate(()=>__debug.command({type:'action',name:'dance',requestId:'appearance-dance-original'}));
    await page.waitForFunction(()=>__debug.snapshot().motion.dance.time>=5,null,{timeout:20000});
    await page.locator('#pause').click();const pauseStart=await page.evaluate(()=>__debug.snapshot());await page.waitForTimeout(900);const pauseEnd=await page.evaluate(()=>__debug.snapshot());assert.equal(pauseEnd.motion.dance.time,pauseStart.motion.dance.time);await page.locator('#pause').click();
    await page.waitForFunction(()=>['completed','failed','cancelled'].includes(__debug.tasks().get('appearance-dance-original')?.state),null,{timeout:50000});await page.waitForTimeout(500);
    const final=await page.evaluate(()=>({snapshot:__debug.snapshot(),task:__debug.tasks().get('appearance-dance-original')}));assert.equal(final.task.state,'completed');assert.equal(final.snapshot.mode,'idle');
    return{request,pause:{start:pauseStart.motion.dance.time,end:pauseEnd.motion.dance.time},final};
   });
   const trace=await page.evaluate(()=>{const q=window.__appearanceFilm;q.running=false;return{start:q.start,rows:q.rows};});await fs.writeFile(path.join(out,body+'-dance-trace.json'),JSON.stringify(trace));
   await context.close();await video.saveAs(path.join(out,body+'-original-30s-1x.webm'));report.videos.push({body,file:body+'-original-30s-1x.webm',trace:body+'-dance-trace.json',recording:'Full original 1600x1000 page; loading/setup included before trace start; intentional pause included',rows:trace.rows.length});await save();
  }
  report.status=report.checks.every(c=>c.passed)&&report.pageerrors.length===0?'technical-checks-passed-visual-review-pending':'failures-preserved';
 }catch(error){report.fatal={error:String(error),stack:error.stack};report.status='incomplete';throw error;}
 finally{report.finished=new Date().toISOString();await close();await save();console.log(out);}
})().catch(e=>{console.error(e);process.exitCode=1;});
