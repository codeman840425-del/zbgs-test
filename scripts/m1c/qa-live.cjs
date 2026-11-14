const {chromium}=require('../../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true}),out=path.join(root,'output/playwright/m1c-live',process.env.QA_LABEL||'first-fit');await fs.mkdir(out,{recursive:true});const reports=[];
 try{for(const body of ['female','male']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  const url=(process.argv[2]||'http://127.0.0.1:5173/')+'?body='+body;await page.goto(url);await page.waitForFunction(()=>__debug?.ready);
  await page.evaluate(async()=>{
   const d=__debug,c=d.game.scene.getScene('CharacterStudio'),a=d.avatar();d.reset();d.setPaused(true);d.setBodyMode('dressed');d.setOutfit(0);d.setDynamics(true);
   let live=a.livePresentation||a.getLivePresentation?.();let injected=false;
   if(!live){const {createLivePresentation}=await import('/src/live-presentation.js');live=createLivePresentation({vrm:a.vrm,root:a.root,bodyType:a.profile.bodyType});const original=c.simulate;c.simulate=function(dt){const value=original.call(this,dt);live.preUpdate(dt,{action:this.mode});a.vrm.update(0);a.root.updateMatrixWorld(true);live.postUpdate();return value;};injected=true;}
   window.__liveQA={live,injected};await Promise.all([live.setAccessory('mic',true),live.setAccessory('glasses',true)]);live.setSpeaking(true);live.setGaze([0,1.4,5]);for(let i=0;i<120;i++)c.simulate(1/120);d.view('front');d.advance(0);
  });
  const images=[];
  for(const view of ['front','side','back']){await page.evaluate(view=>{__debug.view(view);__debug.advance(0);},view);const file=body+'-idle-'+view+'.png';await page.screenshot({path:path.join(out,file)});images.push(file);}
  const report=await page.evaluate(()=>{
   const d=__debug,c=d.game.scene.getScene('CharacterStudio'),a=d.avatar(),live=__liveQA.live;
   const snapshots=[];const snapshot=label=>({label,live:live.getState(),mode:c.mode,root:a.root.position.toArray(),mic: d.scene.getObjectByName('LiveAccessory:mic')?.getWorldPosition(a.root.position.clone()).toArray(),glasses:d.scene.getObjectByName('LiveAccessory:glasses')?.getWorldPosition(a.root.position.clone()).toArray()});
   snapshots.push(snapshot('idle'));a.root.position.set(-2.5,0,2.2);c.yaw=Math.PI/2;a.root.rotation.y=c.yaw;d.motion().reset();a.update(0);a.root.updateMatrixWorld(true);a.resetSecondary?.();for(let i=0;i<120;i++)c.simulate(1/120);c.go(1.5,2.2);const frames=[];
   for(let i=0;i<360;i++){c.simulate(1/120);frames.push(snapshot('walk'));}snapshots.push(snapshot('walk'));
   c.clearPath();c.setMode('idle');c.pending=null;const seat=d.snapshot().chair;a.root.position.set(...seat.approach);c.yaw=seat.yaw;a.root.rotation.y=c.yaw;d.motion().reset();a.update(0);a.root.updateMatrixWorld(true);a.resetSecondary?.();for(let i=0;i<120;i++)c.simulate(1/120);c.action('sit');for(let i=0;i<240;i++){c.simulate(1/120);frames.push(snapshot('sit'));}snapshots.push(snapshot('sit'));d.view('side');d.advance(0);
   return{injected:__liveQA.injected,build:d.buildInfo,snapshots,frames,unsupported:live.canPerform('dance')};
  });
  for(const view of ['front','side']){await page.evaluate(view=>{__debug.view(view);__debug.advance(0);},view);const file=body+'-sit-'+view+'.png';await page.screenshot({path:path.join(out,file)});images.push(file);}
  const cleanup=await page.evaluate(async()=>{const d=__debug,c=d.game.scene.getScene('CharacterStudio'),live=__liveQA.live;c.action('stand');for(let i=0;i<240;i++)c.simulate(1/120);await live.setAccessory('mic',false);const races=await Promise.allSettled([live.setAccessory('mic',true),live.setAccessory('mic',false),live.setAccessory('mic',true)]);for(let i=0;i<120;i++)c.simulate(1/120);const afterRace=live.getState();await Promise.all([live.setAccessory('mic',false),live.setAccessory('glasses',false)]);for(let i=0;i<120;i++)c.simulate(1/120);const afterUnload=live.getState(),meshes=[];d.scene.traverse(o=>{if(o.name.startsWith('LiveAccessory:'))meshes.push(o.name);});return{races,afterRace,afterUnload,remainingAccessoryNodes:meshes};});
  const fingerPassthrough=await page.evaluate(()=>{const a=__debug.avatar(),live=__liveQA.live,names=['Index','Middle','Ring','Little'].flatMap(f=>['Proximal','Intermediate','Distal'].map(s=>'right'+f+s)),bones=names.map(n=>a.vrm.humanoid.getNormalizedBoneNode(n)).filter(Boolean);const before=bones.map(b=>b.quaternion.clone());live.preUpdate(0,{action:'idle'});const maxError=Math.max(...bones.map((b,i)=>1-Math.abs(b.quaternion.dot(before[i]))));if(maxError>1e-12)throw Error('Unloaded live layer changed authored fingers');return{bones:bones.length,maxQuaternionDotError:maxError};});
  await page.route('**/studio-microphone-v1.glb',route=>route.fulfill({status:200,contentType:'model/gltf-binary',body:Buffer.from('invalid-accessory-bytes')}));
  const integrity=await page.evaluate(async()=>{const live=__liveQA.live;let rejected=false;try{await live.setAccessory('mic',true);}catch(e){rejected=/integrity/.test(e.message);}if(!rejected||live.getState().accessories.mic.loaded)throw Error('Bad accessory bytes accepted');return{rejected,state:live.getState().accessories.mic};});await page.unroute('**/studio-microphone-v1.glb');
  await page.route('**/studio-microphone-v1.glb',async route=>{await new Promise(r=>setTimeout(r,250));await route.continue().catch(()=>{});});
  const pendingDispose=await page.evaluate(async()=>{const live=__liveQA.live,pending=live.setAccessory('mic',true);setTimeout(()=>live.dispose(),30);const result=await pending,nodes=[];__debug.scene.traverse(o=>{if(o.name.startsWith('LivePresentation:')||o.name.startsWith('LiveAccessory:'))nodes.push(o.name);});if(result.applied||nodes.length)throw Error('Pending accessory survived disposal');return{result,nodes};});
  reports.push({body,url,errors,images,...report,cleanup,fingerPassthrough,integrity,pendingDispose});await page.close();console.log(body+' complete');
 }
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify(reports,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
