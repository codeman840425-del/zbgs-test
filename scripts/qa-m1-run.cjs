// Deliberately bounded M1 draft. Requires a fixed build + explicit new-asset hash.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path');
const {expectations,prepareOutput,verifyCandidate,writeFailure}=require('./qa-m1-common.cjs');
if(process.argv.includes('--help')){
 console.log('QA_M1_BUILD=<fixed-id> QA_M1_ASSET_SHA=<new-body-sha256> QA_M1_CONFIG=<json-file> node scripts/qa-m1-run.cjs <url> <inventory|contacts|chain|response>\nConfig: outfits [{name,bodyMode,outfit,dynamics}], path [[x,z],...], responseTargets [{name,x,z,observeMs}], floorY. No server is started.');process.exit(0);
}
(async()=>{
 const identity=expectations(),url=process.argv[2],mode=process.argv[3]||'inventory',expected=identity.build,assetHash=identity.sha256;
 if(!url||!expected||!assetHash)throw Error('Require URL, QA_M1_BUILD and QA_M1_ASSET_SHA; never reuse old-avatar acceptance implicitly. See --help.');
 if(!['inventory','contacts','chain','response'].includes(mode))throw Error('Unknown mode '+mode);
 const config=process.env.QA_M1_CONFIG?JSON.parse(await fs.readFile(process.env.QA_M1_CONFIG,'utf8')):{};
 const out=await prepareOutput(expected,mode),records=[];let initialGate,frameViolation;
 const browser=await chromium.launch({channel:'chrome',headless:config.headless===true||mode==='inventory'||mode==='contacts'}),context=await browser.newContext({viewport:{width:1440,height:1000},...(mode==='chain'?{recordVideo:{dir:out,size:{width:1440,height:1000}}}:{})}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 try{
  await page.goto(url);await page.waitForFunction(()=>window.__debug?.ready&&window.__debug.buildInfo?.shortId);
  initialGate=await verifyCandidate(page,identity);await fs.writeFile(path.join(out,'start-manifest.json'),JSON.stringify({expected:identity,initialGate,mode,config},null,2));
  await page.evaluate(async({code,floorY})=>{const m=await import(URL.createObjectURL(new Blob([code],{type:'text/javascript'})));m.installM1Probes({floorY});},{code:await fs.readFile(path.join(__dirname,'qa-m1-probes.mjs'),'utf8'),floorY:config.floorY});
  const inventory=await page.evaluate(()=>window.__m1qa.inventory());if(inventory.build.shortId!==expected)throw Error('Fixed build mismatch');
  if(config.auditCommands){await page.exposeFunction('__m1ReportOutfitFailure',entry=>{frameViolation=entry;void page.close().catch(()=>{});});await page.evaluate(()=>{
   const d=__debug,c=d.game.scene.getScene('CharacterStudio'),original=c.setOutfit,command=c.command;window.__m1InputAudit=[];
   c.setOutfit=function(value){const entry={type:'setOutfit',t:performance.now(),value,before:this.outfit,stack:new Error('setOutfit trace').stack};window.__m1InputAudit.push(entry);const result=original.call(this,value);entry.after=this.outfit;entry.assetOutfit=d.avatar().getOutfitInfo().index;return result;};
   c.command=function(value){window.__m1InputAudit.push({type:'command',t:performance.now(),value});return command.call(this,value);};
   for(const kind of ['pointerdown','pointerup','click'])document.addEventListener(kind,e=>window.__m1InputAudit.push({type:kind,t:performance.now(),trusted:e.isTrusted,target:{tag:e.target?.tagName,id:e.target?.id,dataset:{...e.target?.dataset}},x:e.clientX,y:e.clientY}),true);
   window.__m1OutfitFrames=[];window.__m1ExpectedOutfit=null;
   const tick=()=>{if(window.__m1OutfitViolation)return;const expected=window.__m1ExpectedOutfit;if(expected!==null){const row={t:performance.now(),expected,controller:c.outfit,asset:d.avatar().getOutfitInfo().index,mode:c.mode};window.__m1OutfitFrames.push(row);if(row.controller!==expected||row.asset!==expected){window.__m1OutfitViolation={...row,inputAudit:window.__m1InputAudit,frames:window.__m1OutfitFrames};void window.__m1ReportOutfitFailure(window.__m1OutfitViolation).catch(()=>{});return;}}requestAnimationFrame(tick);};requestAnimationFrame(tick);
  });}
  const assets=await page.evaluate(async urls=>Promise.all([...new Set(urls)].map(async url=>{const bytes=await(await fetch(url)).arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');return {url,sha256:hash};})),inventory.assetUrls);
  if(!assets.some(x=>x.sha256===assetHash))throw Error('Expected new VRM is not among loaded asset hashes');
  if(config.assetId&&inventory.profile.id!==config.assetId)throw Error('Live avatar assetProfile.id mismatch');
  const outfits=config.outfits??inventory.profile.qa?.outfits;
  if(['contacts','chain'].includes(mode)&&!outfits?.length)throw Error('Supply semantic outfit definitions; no legacy 0/1/2 default');
  async function applyOutfit(o){await page.evaluate(o=>{window.__m1ExpectedOutfit=null;const d=window.__debug;d.reset();d.setBodyMode(o.bodyMode||'dressed');if(o.outfit!==undefined)d.setOutfit(o.outfit);d.setDynamics(o.dynamics!==false);window.__m1ExpectedOutfit=o.outfit??null;},o);}
  if(mode==='contacts')for(const outfit of outfits){
   await applyOutfit(outfit);const result=await page.evaluate(()=>{const d=window.__debug,c=d.game.scene.getScene('CharacterStudio'),q=window.__m1qa;d.setPaused(true);for(let i=0;i<180;i++)c.simulate(1/120);q.resetHistory();const idle={state:d.snapshot(),feet:q.feet()};c.action('sit');const transition=[];let i=0;while(i++<7200&&!(c.mode==='sit'&&d.motion().getMetrics().sitProgress>.999)){c.simulate(1/120);if(c.mode==='sit'&&i%4===0)transition.push({simulationTime:c.simulationTime,feet:q.feet(),seat:q.seat()});}if(i>=7200)throw Error('Seat approach/entry timed out');for(let j=0;j<120;j++)c.simulate(1/120);const seated=q.seat();c.action('stand');i=0;while(i++<1800&&c.mode!=='idle'){c.simulate(1/120);if(i%4===0)transition.push({simulationTime:c.simulationTime,feet:q.feet(),seat:q.seat()});}return {idle,seated,transition,standing:{state:d.snapshot(),feet:q.feet()},completed:c.mode==='idle'};});records.push({outfit,...result});
  }
  if(mode==='chain'){
   if(!config.path?.length)throw Error('Supply the reviewed room path; no old-room coordinate default');
   if(config.camera!=='room') await page.evaluate(()=>{const d=window.__debug,a=d.avatar(),head=a.vrm.humanoid.getNormalizedBoneNode('head').getWorldPosition(a.root.position.clone());window.__m1camera={height:Math.max(.5,head.y-a.root.position.y+.15),yaw:Math.PI/2};const original=d.renderer.render;d.renderer.render=function(scene,camera){const h=window.__m1camera.height,p=a.root.position,y=window.__m1camera.yaw,dist=h/(2*Math.tan(camera.fov*Math.PI/360))*1.35;camera.position.set(p.x+Math.sin(y)*dist,p.y+h*.55,p.z+Math.cos(y)*dist);camera.lookAt(p.x,p.y+h*.5,p.z);return original.call(this,scene,camera);};});
   for(const outfit of outfits){await applyOutfit(outfit);const milestones=[],record={outfit,milestones,completed:false};records.push(record);const mark=async label=>{const entry=await page.evaluate(label=>({label,t:performance.now(),state:window.__debug.snapshot()}),label);milestones.push(entry);if(outfit.outfit!==undefined&&(entry.state.outfit!==outfit.outfit||entry.state.outfitInfo?.index!==outfit.outfit))throw Error(`Outfit changed during ${outfit.name}/${label}: expected ${outfit.outfit}, controller ${entry.state.outfit}, asset ${entry.state.outfitInfo?.index}`);if(outfit.bodyMode&&entry.state.inspection?.bodyMode!==outfit.bodyMode)throw Error('Body mode changed during '+outfit.name+'/'+label);};await page.evaluate(({name,speed,capture})=>{if(speed!==undefined)window.__debug.setSpeed(speed);if(capture)window.__m1qa.startFootTrace(name);window.__debug.setPaused(false);},{name:outfit.name,speed:config.speed,capture:config.captureGeometry===true});await page.waitForTimeout(800);await mark('idle');
    for(const point of config.path){await page.evaluate(([x,z])=>window.__debug.walkTo(x,z),point);await page.waitForFunction(([x,z])=>{const s=window.__debug.snapshot();return !s.target&&!s.pending&&s.mode==='idle'&&Math.hypot(s.position[0]-x,s.position[2]-z)<.05;},point,{timeout:45000});}
    await page.waitForTimeout(600);await mark('path-stopped');await page.evaluate(()=>window.__debug.action('turn'));await page.waitForFunction(()=>window.__debug.snapshot().mode==='idle'&&!window.__debug.snapshot().turnPlan?.active,null,{timeout:15000});await mark('360-turn-complete');
    await page.evaluate(()=>window.__debug.action('sit'));await page.waitForFunction(()=>window.__debug.snapshot().motion.sitProgress>.999,null,{timeout:45000});await page.waitForTimeout(500);await mark('seated');const seated=config.captureGeometry?await page.evaluate(()=>window.__m1qa.seat()):null;await page.screenshot({path:path.join(out,`${outfit.name}-seat.png`)});
    await page.evaluate(()=>window.__debug.action('stand'));await page.waitForFunction(()=>window.__debug.snapshot().mode==='idle',null,{timeout:10000});await mark('standing');
    const returnPoint=config.afterStandTarget??config.path[0];await page.evaluate(([x,z])=>window.__debug.walkTo(x,z),returnPoint);await page.waitForFunction(([x,z])=>{const s=window.__debug.snapshot();return !s.target&&!s.pending&&s.mode==='idle'&&Math.hypot(s.position[0]-x,s.position[2]-z)<.05;},returnPoint,{timeout:45000});await mark('post-stand-walk-complete');
    await page.evaluate(()=>window.__debug.action('dance'));await mark('dance-start');await page.waitForTimeout((config.danceSeconds??3)*1000);await page.screenshot({path:path.join(out,`${outfit.name}-dance.png`)});await page.evaluate(()=>window.__debug.action('idle'));await page.waitForTimeout(1200);await mark('end');Object.assign(record,{seated,trace:await page.evaluate(()=>window.__m1qa.stopFootTrace()),end:await page.evaluate(()=>({state:window.__debug.snapshot(),pose:window.__m1qa.pose()})),completed:true});
   }
  }
  if(mode==='response'){
   if(!config.responseTargets?.length)throw Error('Supply valid reviewed room click targets');
   for(const t of config.responseTargets){if(t.reset!==false){await page.evaluate(()=>{window.__debug.reset();window.__debug.camera('room');window.__debug.setPaused(false);});await page.waitForTimeout(600);}await page.evaluate(label=>window.__m1qa.startTrace(label),t.name);const screen=await page.evaluate(t=>window.__m1qa.project(t.x,t.z),t);await page.mouse.click(screen.x,screen.y);await page.waitForTimeout(t.observeMs??5000);records.push(await page.evaluate(()=>window.__m1qa.stopTrace()));}
  }
  const finalGate=await verifyCandidate(page,identity),finalBuild=finalGate.runtimeBuild;
  await fs.writeFile(path.join(out,'observations.json'),JSON.stringify({kind:'M1 collection; numeric collection is not visual acceptance',mode,url,inventory,initialGate,finalGate,finalBuild,assets,config,records,inputAudit:await page.evaluate(()=>window.__m1InputAudit??[]),outfitFrames:await page.evaluate(()=>window.__m1OutfitFrames??[]),errors,warnings:await page.evaluate(()=>window.__m1qa.warnings())},null,2));
  if(errors.length||records.some(r=>r.completed===false)||mode==='response'&&records.some(r=>!r.events.some(e=>e.type==='command')))throw Error('Collection has pageerrors, unfinished scenarios or missing click commands; inspect observations');
  console.log(`Saved ${mode} observations for ${expected}; no inherited pass status.`);
 }catch(error){let inputAudit;try{inputAudit=await page.evaluate(()=>window.__m1InputAudit??[]);}catch{}await writeFailure(out,error,{initialGate,records,inputAudit,frameViolation,errors});throw error;}
 finally{try{if(mode==='chain'){const video=page.video();await context.close();await video.saveAs(path.join(out,'same-camera-chain.webm'));}}finally{await browser.close();}}
})().catch(e=>{console.error(e);process.exitCode=1});
