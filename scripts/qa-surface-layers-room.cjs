const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const [url,build,destination]=process.argv.slice(2),out=path.resolve(destination);
const ids={male:['beta-base-male-m1b','62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff'],female:['beta-base-female-m1','027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95']};
const layers=[{id:'freckles',opacity:1},{id:'blush',opacity:.65}];
async function installProbe(p){await p.evaluate(()=>{
 const a=__debug.avatar(),materials=new Set();a.vrm.scene.traverse(n=>{if(n.isMesh)for(const m of [].concat(n.material))if(/_Face_\d+_SKIN$/.test(m.name))materials.add(m);});
 if(materials.size!==1)throw Error('Expected one actual face skin material');
 const material=[...materials][0];
 const read=t=>{const c=document.createElement('canvas');c.width=t.image.width;c.height=t.image.height;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(t.image,0,0);return ctx.getImageData(0,0,c.width,c.height).data;};
 const digest=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
 window.__surfaceProbe={material,source:material.map,original:read(material.map),read,digest,
  async snapshot(){return{map:await digest(read(material.map)),source:await digest(read(this.source)),sameOriginal:material.map===this.source,state:a.appearance.getState()};}};
 });}
const read=p=>p.evaluate(()=>__surfaceProbe.snapshot());
(async()=>{
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:true}),report={build,bodies:[],errors:[],status:'running',limits:['Development PC only','No human normal-speed acceptance claimed','Only exact original male/female source bodies and declared two surface layers']};
 try{for(const body of ['female','male']){
  const dir=path.join(out,body);await fs.mkdir(dir);const ctx=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir,size:{width:1440,height:900}}}),p=await ctx.newPage();
  const row={body,checks:[]};report.bodies.push(row);p.on('pageerror',e=>report.errors.push(String(e)));
  const set=input=>p.evaluate(input=>__debug.command({type:'appearance',...input}),input);
  const shot=name=>p.screenshot({path:path.join(dir,name+'.png')});
  let finalRecipe,finalMap;
  try{
   await p.goto(url+'?body='+body+'&workbench=appearance');await p.waitForFunction(()=>__debug?.ready,null,{timeout:60000});
   row.identity=await verifyCandidate(p,{build,assetId:ids[body][0],sha256:ids[body][1]});
   await installProbe(p);const original=await read(p),oldRecipe=await p.evaluate(()=>__debug.exportAppearanceRecipe());
   assert.equal(JSON.parse(oldRecipe).schema,'workbench-appearance-recipe-v6');
   await p.evaluate(()=>{__debug.camera('inspect-face-front');__debug.setPlaybackRate(1);});await p.waitForTimeout(500);await shot('original');
   assert((await set({lipColor:'rose',skinTone:'warm'})).applied);const rose=await read(p);
   await p.evaluate(()=>{__surfaceProbe.rose=__surfaceProbe.read(__surfaceProbe.material.map);});
   assert((await set({surfaceLayers:[layers[0]]})).applied);await p.waitForTimeout(350);await shot('freckles');const freckles=await read(p);
   assert.notEqual(freckles.map,rose.map);assert.equal(freckles.source,original.source);
   assert((await set({surfaceLayers:layers})).applied);await p.waitForTimeout(350);await shot('layered');const both=await read(p);
   assert.notEqual(both.map,freckles.map);assert.equal(both.source,original.source);
   assert.deepEqual(both.state.surfaceLayers,layers);
   row.pixelProtection=await p.evaluate(async()=>{
    const root='/assets/m2-surface-layer-v1/',manifest=await(await fetch(root+'manifest.json')).json();
    const variant=manifest.variants.find(v=>v.avatarSha256===__debug.avatar().getAssetProfile().sha256);
    async function decode(file){const b=await createImageBitmap(await(await fetch(root+file)).blob());try{const c=document.createElement('canvas');c.width=b.width;c.height=b.height;const x=c.getContext('2d');x.drawImage(b,0,0);return x.getImageData(0,0,c.width,c.height).data;}finally{b.close();}}
    const protectedPixels=await decode(variant.protectedMask.url),overlays=await Promise.all(variant.layers.map(x=>decode(x.url)));
    const before=__surfaceProbe.rose,after=__surfaceProbe.read(__surfaceProbe.material.map);let changed=0,protectedChanged=0,outsideChanged=0,alphaChanged=0;
    for(let i=0;i<after.length;i+=4){const difference=[0,1,2].some(c=>after[i+c]!==before[i+c]);if(difference){changed++;if(protectedPixels[i])protectedChanged++;if(!overlays.some(o=>o[i+3]))outsideChanged++;}if(after[i+3]!==before[i+3])alphaChanged++;}
    return{changed,protectedChanged,outsideChanged,alphaChanged,scope:'Actual browser face RGB compared with same rose lip base; masks loaded from exact admitted package'};
   });
   assert(row.pixelProtection.changed>0);assert.equal(row.pixelProtection.protectedChanged,0);assert.equal(row.pixelProtection.outsideChanged,0);assert.equal(row.pixelProtection.alphaChanged,0);
   row.checks.push({name:'actual distinct layers compose without modifying original texture',passed:true,original,rose,freckles,both});
   assert((await set({lipColor:'coral',eyeColor:'green',skinTone:'deep'})).applied);
   const tinted=await read(p);assert.deepEqual(tinted.state.surfaceLayers,layers);assert.notEqual(tinted.map,both.map);assert.equal(tinted.source,original.source);await shot('layered-colors');
   const bad=await set({surfaceLayers:[{id:'freckles',opacity:2}]});assert.equal(bad.applied,false);assert.equal((await read(p)).map,tinted.map);
   const unknown=await set({surfaceLayers:[{id:'unknown',opacity:1}]});assert.equal(unknown.applied,false);assert.equal((await read(p)).map,tinted.map);
   row.checks.push({name:'invalid and missing layers preserve prior visible state',passed:true,bad,unknown});
   assert((await set({surfaceLayers:[],lipColor:'rose',skinTone:'warm'})).applied);assert.equal((await read(p)).map,rose.map);assert.equal((await read(p)).state.surfaceTextureCount,0);
   assert((await p.evaluate(text=>__debug.importAppearanceRecipe(text),oldRecipe)).applied);assert.equal((await read(p)).map,original.map);assert.deepEqual((await read(p)).state.surfaceLayers,[]);
   assert.equal(await p.evaluate(()=>__debug.exportAppearanceRecipe()),oldRecipe);
   row.checks.push({name:'unload restores lip variant; legacy v6 restores exact original selection',passed:true});
   const rapid=await p.evaluate(async layers=>{const a=__debug.command({type:'appearance',surfaceLayers:layers});const b=__debug.command({type:'appearance',surfaceLayers:[]});return{a:await a,b:await b};},layers);
   assert(rapid.b.applied);assert.deepEqual((await read(p)).state.surfaceLayers,[]);assert.equal((await read(p)).map,original.map);
   assert((await set({surfaceLayers:layers,lipColor:'rose',skinTone:'warm'})).applied);
   for(const expression of ['neutral','happy','aa','neutral']){
    await p.evaluate(name=>{__debug.command({type:'expression',name});__debug.command({type:'speaking',value:name==='aa'});},expression);
    await p.waitForTimeout(700);await shot('expression-'+expression);
   }
   row.blink=await p.evaluate(()=>new Promise(resolve=>{const start=performance.now();let maximum=0;const sample=t=>{maximum=Math.max(maximum,__debug.avatar().vrm.expressionManager.getValue('blink')||0);if(t-start>4000)resolve({maximum,seconds:(t-start)/1000});else requestAnimationFrame(sample);};requestAnimationFrame(sample);}));
   assert(row.blink.maximum>.7,'Actual automatic blink must occur while layers remain applied');
   await p.evaluate(()=>{__debug.command({type:'speaking',value:true});__debug.command({type:'gaze',target:[1,1.6,4]});});await p.waitForTimeout(1400);await shot('gaze-speaking');
   await p.evaluate(()=>{__debug.command({type:'speaking',value:false});__debug.command({type:'expression',name:'neutral'});__debug.camera('inspect-half-side');});await p.waitForTimeout(500);await shot('side');
   await p.evaluate(()=>{__debug.camera('room');__debug.setSpeed(1.05);__debug.walkTo(1.2,1.8);});
   await p.waitForFunction(()=>{const s=__debug.snapshot();return s.mode==='idle'&&!s.target&&!s.pending;},null,{timeout:30000});
   await p.evaluate(()=>__debug.action('sit'));await p.waitForFunction(()=>__debug.snapshot().motion.sitProgress>.999,null,{timeout:45000});
   await p.evaluate(()=>{__debug.camera('inspect-face-front');__debug.command({type:'speaking',value:true});});await p.waitForTimeout(1600);await shot('seated-speaking');
   await p.evaluate(()=>{__debug.command({type:'speaking',value:false});__debug.action('stand');});await p.waitForFunction(()=>__debug.snapshot().mode==='idle',null,{timeout:20000});
   finalRecipe=await p.evaluate(()=>__debug.exportAppearanceRecipe());assert.equal(JSON.parse(finalRecipe).schema,'workbench-appearance-recipe-v7');finalMap=(await read(p)).map;
   await fs.writeFile(path.join(dir,'recipe-v7.json'),finalRecipe);
   await p.evaluate(()=>__debug.setPaused(true));const beforePeer=await read(p);
   const peer=await p.evaluate(async ({body,layers})=>{await __debug.loadComparison(body);const peer=__debug.comparison();peer.controller.paused=true;const on=await peer.command({type:'appearance',surfaceLayers:layers});const active=peer.avatar.appearance.getState();const off=await peer.command({type:'appearance',surfaceLayers:[]});__debug.removeComparison();return{on,off,active};},{body:body==='male'?'female':'male',layers});
   assert(peer.on.applied&&peer.off.applied);assert.equal((await read(p)).map,beforePeer.map);assert.deepEqual((await read(p)).state.surfaceLayers,beforePeer.state.surfaceLayers);
   row.checks.push({name:'opposite-body independent layer selection/unload/disposal preserves primary',passed:true,peer});
  }finally{const v=p.video();await ctx.close();await v.saveAs(path.join(dir,'normal1x.webm'));await v.delete();}
  const cold=await browser.newContext({viewport:{width:1440,height:900}});try{
   const q=await cold.newPage();await q.goto(url+'?body='+body+'&workbench=appearance');await q.waitForFunction(()=>__debug?.ready,null,{timeout:60000});await installProbe(q);
   const before=await read(q);await q.route('**/m2-surface-layer-v1/manifest.json',route=>route.fulfill({status:503,body:'injected first load failure'}));
   const failed=await q.evaluate(async text=>{try{return await __debug.importAppearanceRecipe(text);}catch(e){return{applied:false,reason:String(e)};}},finalRecipe);assert.equal(failed.applied,false);assert.equal((await read(q)).map,before.map);assert.deepEqual((await read(q)).state.surfaceLayers,[]);
   await q.unroute('**/m2-surface-layer-v1/manifest.json');const restored=await q.evaluate(text=>__debug.importAppearanceRecipe(text),finalRecipe);assert(restored.applied,JSON.stringify(restored));assert.equal((await read(q)).map,finalMap);assert.equal(await q.evaluate(()=>__debug.exportAppearanceRecipe()),finalRecipe);
   row.checks.push({name:'fresh context failure retains original; retry restores exact v7 face pixels',passed:true,failed,restored});
  }finally{await cold.close();}
 }
 assert.deepEqual(report.errors,[]);report.status='technical-checks-passed-visual-pending';
 }catch(e){report.error=String(e);report.status='failed-or-incomplete';throw e;}
 finally{await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
 console.log(JSON.stringify({out,status:report.status}));
})().catch(e=>{console.error(e);process.exitCode=1;});
