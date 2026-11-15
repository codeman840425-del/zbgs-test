// Narrow adaptation of qa-m1-user-chain.cjs / qa-shorts-material-diagnosis.cjs.
// Real ordinary task flow at 1x. No pose injection, advance or simulate calls.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {verifyCandidate}=require('../qa-m1-common.cjs');
const recipeId='m1b-shorts-cloth-v4-review1',equipmentId='m1b-uniform-shorts-v1';
const plan={body:'male',variants:['original',recipeId],camera:'same fixed room',playbackRate:1,
 chain:['fresh page original long trousers','shorts / long / shorts UI toggles','stand','ordinary path to chair + sit + stable hold','stand','ordinary path to dance space','full 7.2s technical dance completion','restore original material + long trousers'],
 evidence:'Each variant complete normal-time viewport recording, actual task results, per-rAF state, initial/final build/body and recipe identity',
 limits:['Video collection is not visual naturalness or mesh/contact acceptance','Current record-v2 cannot persist recipe; no save claim','Requires integrated avatar material API; never injects the shader into a fixed build']};
if(process.argv.includes('--plan')){console.log(JSON.stringify(plan,null,2));process.exit(0);}
(async()=>{
 const build=process.env.QA_M1_BUILD,base=process.argv[2];assert.match(build||'',/^[a-f0-9]{12}$/);assert.match(base||'',/^http:\/\/127\.0\.0\.1:\d+\/$/);
 const expected={build,assetId:'beta-base-male-m1b',sha256:'62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff'};
 const {chromium}=require('../../prototype/node_modules/playwright'),out=path.resolve('output/shorts-material-recipe/'+build+'-'+Date.now());await fs.mkdir(out,{recursive:true});
 const report={plan,build,variants:[],visualReview:'pending'},browser=await chromium.launch({channel:'chrome',headless:process.env.QA_HEADLESS==='1'});
 try{for(const variant of plan.variants){
  const dir=path.join(out,variant);await fs.mkdir(dir,{recursive:true});const context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir,size:{width:1440,height:1000}}}),page=await context.newPage(),video=page.video();
  const r={variant,inputs:[],errors:[],checks:[]};report.variants.push(r);page.on('pageerror',e=>r.errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')r.errors.push(m.text());});await page.route('**/favicon.ico',route=>route.fulfill({status:204}));
  const state=()=>page.evaluate(id=>({snapshot:__debug.snapshot(),material:__debug.avatar().getMaterialRecipeState(id)}),equipmentId);
  const mark=async name=>r.inputs.push({name,wall:new Date().toISOString(),state:await state()});
  const task=async(requestId,kind,payload={})=>{await mark('request '+requestId);await page.evaluate(r=>__debug.request(r),{requestId,kind,payload});await page.waitForFunction(id=>['completed','cancelled','failed'].includes(__debug.tasks().get(id)?.state),requestId,{timeout:45000});const result=await page.evaluate(id=>__debug.tasks().get(id),requestId);assert.equal(result.state,'completed',requestId);r.checks.push({requestId,result});};
  const shot=async name=>{await mark(name);await page.screenshot({path:path.join(dir,name+'.png')});};
  try{
   await page.goto(new URL('?body=male',base).href);await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});r.initialGate=await verifyCandidate(page,expected);
   await page.evaluate(()=>{const d=__debug;if(typeof d.avatar().setMaterialRecipe!=='function')throw Error('Integrated recipe API absent; do not substitute a QA overlay');d.setPlaybackRate(1);d.setPaused(true);d.setDynamics(true);d.setBodyMode('dressed');d.setCorrections('full');d.game.scene.getScene('CharacterStudio').cameraPreset('room',true);});
   r.beforeMaterial=await page.evaluate(async id=>{
    const d=__debug,a=d.avatar(),container=d.scene.getObjectByName('Equipment:'+id);if(!container)throw Error('Actual shorts equipment missing');
    const meshes=[];container.traverse(m=>{if(m.isSkinnedMesh)meshes.push(m);});if(meshes.length!==2)throw Error('Expected outer shorts and inner cuff');
    const bodies=[];a.root.traverse(m=>{if(m.isSkinnedMesh&&m.userData.assetRole==='body')bodies.push(m);});if(!bodies.length)throw Error('Complete actual body not found');
    const counts={clonesDisposed:0,originalsDisposed:0,texturesDisposed:0},tracked=new Set(),slots=meshes.map(m=>m.material);
    const materials=slots.flatMap(m=>Array.isArray(m)?m:[m]);materials.forEach(m=>m.addEventListener('dispose',()=>counts.originalsDisposed++));
    const textures=new Set(materials.flatMap(m=>Object.values(m).filter(t=>t?.isTexture)));textures.forEach(t=>t.addEventListener('dispose',()=>counts.texturesDisposed++));
    const digest=async a=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',a))].map(n=>n.toString(16).padStart(2,'0')).join('');
    const bytes=a=>a.buffer.slice(a.byteOffset,a.byteOffset+a.byteLength);
    async function inspect(){
     a.root.updateMatrixWorld(true);const V=a.root.position.constructor,geometry=[];
     for(const mesh of [...meshes,...bodies]){
      const attrs={};for(const name of ['position','normal','uv','skinIndex','skinWeight']){const x=mesh.geometry.attributes[name];if(x)attrs[name]=await digest(bytes(x.array));}
      if(mesh.geometry.index)attrs.index=await digest(bytes(mesh.geometry.index.array));
      const posed=new Float64Array(mesh.geometry.attributes.position.count*3),v=new V();
      for(let i=0;i<mesh.geometry.attributes.position.count;i++){mesh.getVertexPosition(i,v).applyMatrix4(mesh.matrixWorld);posed.set(v.toArray(),i*3);}
      geometry.push({name:mesh.name,attributes:attrs,posedSha256:await digest(bytes(posed)),visible:mesh.visible});
     }
     const maps=[];for(const original of materials){const map=original.map;if(!map){maps.push(null);continue;}
      const canvas=document.createElement('canvas');canvas.width=map.image.width;canvas.height=map.image.height;const ctx=canvas.getContext('2d');ctx.drawImage(map.image,0,0);const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data,alpha=new Uint8Array(canvas.width*canvas.height);for(let i=0;i<alpha.length;i++)alpha[i]=rgba[i*4+3];
      maps.push({width:canvas.width,height:canvas.height,rgbaSha256:await digest(bytes(rgba)),alphaSha256:await digest(bytes(alpha)),alphaTest:original.alphaTest});
     }
     const active=meshes.flatMap(m=>Array.isArray(m.material)?m.material:[m.material]);
     active.forEach(m=>{if(!materials.includes(m)&&!tracked.has(m)){tracked.add(m);m.addEventListener('dispose',()=>counts.clonesDisposed++);}});
     return {geometry,maps,counts:{...counts},originalMaterialReferencesRestored:meshes.every((m,i)=>m.material===slots[i]),
      originalMapAndAlphaPropertiesRetained:active.every((m,i)=>['map','alphaMap','alphaTest','opacity','transparent','side'].every(key=>m[key]===materials[i][key]))};
    }
    window.__materialSourceQA={inspect,slots,meshes,counts};return inspect();
   },equipmentId);
   r.materialSelection=await page.evaluate(async({equipmentId,variant})=>__debug.avatar().setMaterialRecipe(equipmentId,variant==='original'?null:variant),{equipmentId,variant});assert(r.materialSelection.applied);
   if(variant!=='original'){const active=r.materialSelection.state.active;assert.equal(active.recipeSha256,'6307ada57e83d74a34305708e747f452c9bde9f4b18dc4caea150f83d9d32824');assert.equal(active.garmentSha256,'c8a1afd0742cbb99302abc107673744751a8cfd77c6c89df039b068054a947d0');assert.equal(active.implementationSha256,'4539ac3f83bc5fb1fa9aa91dbfb7323a8f2e7084a5f762d9713d0ae36bcfb565');}
   r.afterMaterial=await page.evaluate(async()=>{const d=__debug;d.renderer.render(d.scene,d.cameraObject());return __materialSourceQA.inspect();});
   assert.deepEqual(r.afterMaterial.geometry,r.beforeMaterial.geometry,'Same-pose geometry/body/weights changed');assert.deepEqual(r.afterMaterial.maps,r.beforeMaterial.maps,'Original actual texture/alpha changed');assert(r.afterMaterial.originalMapAndAlphaPropertiesRetained);
   await page.evaluate(()=>__debug.setPaused(false));
   await page.evaluate(({equipmentId,variant})=>{const d=__debug,tag=document.createElement('div');tag.textContent='QA 1× '+variant;Object.assign(tag.style,{position:'fixed',bottom:'8px',left:'8px',background:'#102c34',color:'white',padding:'8px',zIndex:99999,pointerEvents:'none'});document.body.append(tag);let running=true;const rows=[];window.__recipeFilm={rows,stop:()=>running=false};const tick=now=>{if(!running)return;const s=d.snapshot();rows.push({wall:now,time:s.simulationTime,mode:s.mode,outfit:s.outfit,paused:s.paused,rate:s.playbackRate,camera:s.camera,hidden:document.hidden,material:d.avatar().getMaterialRecipeState(equipmentId)});requestAnimationFrame(tick);};requestAnimationFrame(tick);},{equipmentId,variant});
   for(const value of [0,2,0,2]){await mark('UI outfit '+value);await page.locator('[data-outfit="'+value+'"]').click();assert.equal((await state()).snapshot.outfit,value);await page.waitForTimeout(600);}
   await shot('standing');await task('recipe-sit','sit');await page.waitForTimeout(900);await shot('seated');
   await task('recipe-rise','stand');await task('recipe-dance-space','walk',{x:-.5,z:1.8});
   await task('recipe-dance-once','dance',{danceId:'dance-technical-once-v1'});await shot('dance-complete');
   const before=await state();r.checks.push({name:'recipe retained through action chain',passed:variant==='original'?before.material.active===null:before.material.active.recipeId===variant});assert(r.checks.at(-1).passed);
   await page.evaluate(id=>__debug.avatar().setMaterialRecipe(id,null),equipmentId);assert.equal((await state()).material.active,null);
   r.afterRestore=await page.evaluate(()=>__materialSourceQA.inspect());assert(r.afterRestore.originalMaterialReferencesRestored);assert(r.afterRestore.originalMapAndAlphaPropertiesRetained);assert.deepEqual(r.afterRestore.maps,r.beforeMaterial.maps);
   assert.equal(r.afterRestore.counts.originalsDisposed,0);assert.equal(r.afterRestore.counts.texturesDisposed,0);assert.equal(r.afterRestore.counts.clonesDisposed,variant==='original'?0:2);
   for(let i=0;i<r.afterRestore.geometry.length;i++)assert.deepEqual(r.afterRestore.geometry[i].attributes,r.beforeMaterial.geometry[i].attributes,'Attributes changed through live chain');
   await page.locator('[data-outfit="0"]').click();await page.waitForTimeout(400);await shot('restored-original-long');
   r.finalGate=await verifyCandidate(page,expected);assert.equal(r.errors.length,0,JSON.stringify(r.errors));r.collectionComplete=true;
  }catch(e){r.failure=String(e);await page.screenshot({path:path.join(dir,'failure.png')}).catch(()=>{});throw e;}
  finally{r.frames=await page.evaluate(()=>{window.__recipeFilm?.stop();return window.__recipeFilm?.rows??[];}).catch(()=>[]);r.cameraReference=r.frames[0]?.camera??null;r.frameGateFailures=r.frames.filter(f=>f.rate!==1||f.paused||f.hidden||f.camera?.mode!=='room'||JSON.stringify(f.camera)!==JSON.stringify(r.cameraReference));await context.close();await video.saveAs(path.join(dir,'normal-chain.webm'));await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));if(!r.failure)assert.equal(r.frameGateFailures.length,0,'Normal-time/camera frame gate');}
 }}finally{await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(out);}
})().catch(e=>{console.error(e);process.exitCode=1;});
