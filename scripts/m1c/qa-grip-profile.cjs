// Fixed-product grip contract checks. No diagnostic pose/module overrides.
const {chromium}=require('../../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const build=process.env.QA_BUILD,base=process.argv[2],root=path.resolve(__dirname,'../..');
if(!build||!base)throw Error('QA_BUILD and temporary fixed URL required');
(async()=>{
 const out=path.join(root,'output/playwright/m1c-grip-product',build);await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
 async function open(body,route){const page=await browser.newPage();if(route)await route(page);const url=new URL(base);url.searchParams.set('body',body);await page.goto(url.href);await page.waitForFunction(()=>__debug?.ready);const actual=await page.evaluate(()=>__debug.buildInfo);assert.equal(actual.shortId,build);assert.equal(actual.development,false);await page.evaluate(()=>{__debug.setPaused(true);__debug.setDynamics(false);});return page;}
 try{
  for(const body of ['female','male']){
   const page=await open(body);
   const result=await page.evaluate(async()=>{
    const d=__debug,a=d.avatar(),c=d.game.scene.getScene('CharacterStudio'),live=a.livePresentation;await live.setAccessory('mic',true);live.setSpeaking(true);
    const V=a.root.position.constructor,bones=new Set([a.vrm.humanoid.getRawBoneNode('rightHand')]);for(const f of ['Thumb','Index','Middle','Ring','Little'])for(const s of ['Metacarpal','Proximal','Intermediate','Distal']){const b=a.vrm.humanoid.getRawBoneNode('right'+f+s);if(b)bones.add(b);}
    const hand=[];a.vrm.scene.traverse(m=>{if(!m.isSkinnedMesh||!(Array.isArray(m.material)?m.material:[m.material]).some(x=>/Body_.*SKIN/.test(x.name)))return;const j=m.geometry.attributes.skinIndex,w=m.geometry.attributes.skinWeight;for(const id of new Set(m.geometry.index.array)){let sum=0;for(let k=0;k<4;k++)if(bones.has(m.skeleton.bones[j.getComponent(id,k)]))sum+=w.getComponent(id,k);if(sum>.5)hand.push([m,id]);}});
    const nodes=()=>{const names=[];d.scene.traverse(x=>{if(x.name.startsWith('LiveAccessory:'))names.push(x.name);});return names;};
    function contact(){const mic=d.scene.getObjectByName('LiveAccessory:mic'),inv=mic.matrixWorld.clone().invert(),p=new V();let inside=0,depth=0,near=0;for(const [mesh,id]of hand){mesh.getVertexPosition(id,p);p.applyMatrix4(mesh.matrixWorld).applyMatrix4(inv);if(p.y<-.075||p.y>.085)continue;const gap=Math.hypot(p.x,p.z)-.013;if(gap<-.001){inside++;depth=Math.max(depth,-gap);}if(Math.abs(gap)<.002)near++;}return{inside,depth,near};}
    const seat=d.snapshot().chair;a.root.position.set(...seat.approach);a.root.rotation.y=c.yaw=seat.yaw;d.motion().reset();a.update(0,{action:'idle'});a.resetSecondary?.();for(let i=0;i<150;i++)c.simulate(1/120);
    const rows=[];for(const action of ['stand','sit','walk']){if(action==='sit'){c.action('sit');for(let i=0;i<240;i++)c.simulate(1/120);}if(action==='walk'){c.action('stand');for(let i=0;i<240;i++)c.simulate(1/120);c.setSpeed(.85);c.go(a.root.position.x,a.root.position.z+2);}for(let i=0;i<60;i++){c.simulate(1/120);if(i%6===0)rows.push({action,mode:c.mode,...contact()});}}
    const loaded=live.getState();await live.setAccessory('mic',false);const races=await Promise.allSettled([live.setAccessory('mic',true),live.setAccessory('mic',false),live.setAccessory('mic',true)]);const afterRace=live.getState();await live.setAccessory('mic',false);for(let i=0;i<120;i++)c.simulate(1/120);return{loaded,rows,races,afterRace,afterUnload:live.getState(),remaining:nodes(),handVertices:hand.length};
   });
   assert.equal(result.loaded.fit.gripProfile.compatibleAvatarSha256,result.loaded.avatarSha256);assert.equal(result.loaded.fit.gripProfile.compatibleAccessorySha256,result.loaded.accessories.mic.sha256);assert.equal(result.afterRace.accessories.mic.status,'on');assert.equal(result.afterUnload.accessories.mic.requested,false);assert.deepEqual(result.remaining,[]);assert.equal(Math.max(...result.rows.map(x=>x.inside)),0);results.push({case:body,productOnly:true,...result});await page.close();
  }
  for(const failure of ['profile-http','profile-hash','mic-http','cancel-profile']){
   const page=await open('female',async page=>{
    const pattern=failure==='mic-http'?'**/studio-microphone-v1.glb':'**/grips/female-source-grip-v1.json';
    await page.route(pattern,async route=>{try{if(failure==='cancel-profile'){await new Promise(resolve=>setTimeout(resolve,150));return await route.continue();}return await route.fulfill({status:failure==='profile-hash'?200:503,body:failure==='profile-hash'?'{}':'diagnostic failure'});}catch{ /* request may be cancelled intentionally */ }});
   });
   const result=await page.evaluate(async failure=>{const d=__debug,a=d.avatar(),l=a.livePresentation;let outcome;const pending=l.setAccessory('mic',true);if(failure==='cancel-profile')await l.setAccessory('mic',false);try{outcome=await pending;}catch(e){outcome={error:String(e.message)};}await l.setAccessory('glasses',true);const state=l.getState(),nodes=[];d.scene.traverse(x=>{if(x.name==='LiveAccessory:mic')nodes.push(x.name);});return{outcome,state,micNodes:nodes};},failure);
   assert.equal(result.state.accessories.mic.requested,false);assert.equal(result.state.accessories.mic.loaded,false);assert.deepEqual(result.micNodes,[]);assert.equal(result.state.accessories.glasses.status,'on');if(failure==='cancel-profile'){assert.equal(result.outcome.cancelled,true);assert.equal(result.state.accessories.mic.status,'off');}else{assert.ok(result.outcome.error);assert.equal(result.state.accessories.mic.status,'error');}results.push({case:failure,...result});await page.close();
  }
  for(const body of ['m1a-jaw-v1','m1a-waisthip-v1']){
   const page=await open(body);const result=await page.evaluate(async()=>{const l=__debug.avatar().livePresentation;let error;try{await l.setAccessory('mic',true);}catch(e){error=e.message;}await l.setAccessory('glasses',true);return{error,state:l.getState()};});assert.match(result.error,/匹配/);assert.equal(result.state.accessories.mic.requested,false);assert.equal(result.state.accessories.mic.loaded,false);assert.equal(result.state.accessories.mic.status,'error');assert.equal(result.state.accessories.glasses.status,'on');results.push({case:body,...result});await page.close();
  }
 }finally{await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify({build,productOnly:true,results},null,2));}
 console.log('Fixed grip profile contract passed',results.map(x=>x.case));
})().catch(e=>{console.error(e);process.exitCode=1;});
