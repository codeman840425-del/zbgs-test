// Actual two-actor accessory lifecycle; source/node isolation tests remain separate.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('../prototype/node_modules/playwright');
const {verifyCandidate,expectations}=require('./qa-m1-common.cjs');
(async()=>{
 const out=path.resolve(process.env.QA_M1_RUN_ROOT);await fs.mkdir(out,{recursive:true});
 try{await fs.access(path.join(out,'report.json'));throw Error('Refuse overwrite');}catch(e){if(e.code!=='ENOENT')throw e;}
 const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage(),report={errors:[]};
 page.on('pageerror',e=>report.errors.push(String(e)));
 try{
  await page.goto(process.argv[2]);await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});report.identity=await verifyCandidate(page,expectations());
  report.result=await page.evaluate(async()=>{
   const d=__debug;d.setPaused(true);const a=d.avatar(),peer=await d.loadComparison('male'),b=peer.avatar;
   await Promise.all([a.livePresentation.setAccessory('glasses',true),b.livePresentation.setAccessory('glasses',true)]);
   const originalA=a.root.getObjectByName('LiveAccessory:glasses'),originalB=b.root.getObjectByName('LiveAccessory:glasses');
   const aTemple=originalA.getObjectByName('Temple1'),bTemple=originalB.getObjectByName('Temple1');
   const before=Array.from(bTemple.geometry.attributes.position.array),peerDisposals=[];
   originalB.traverse(m=>{if(m.isMesh){m.geometry.addEventListener('dispose',()=>peerDisposals.push(m.name+':geometry'));for(const mat of Array.isArray(m.material)?m.material:[m.material])mat.addEventListener('dispose',()=>peerDisposals.push(m.name+':material'));}});
   const initial={female:a.livePresentation.getState(),male:b.livePresentation.getState(),distinctGeometry:aTemple.geometry!==bTemple.geometry,distinctArray:aTemple.geometry.attributes.position.array!==bTemple.geometry.attributes.position.array};
   await a.livePresentation.setAccessory('glasses',false);
   const afterOff={femaleMounted:!!a.root.getObjectByName('LiveAccessory:glasses'),samePeerObject:b.root.getObjectByName('LiveAccessory:glasses')===originalB,peerState:b.livePresentation.getState(),unchangedPeer:before.every((x,i)=>Object.is(x,bTemple.geometry.attributes.position.array[i])),peerDisposals:peerDisposals.slice()};
   await a.livePresentation.setAccessory('glasses',true);const replacement=a.root.getObjectByName('LiveAccessory:glasses');
   d.removeComparison();const afterPeerDestroy={femaleSameObject:a.root.getObjectByName('LiveAccessory:glasses')===replacement,femaleLoaded:a.livePresentation.getState().accessories.glasses.loaded,peerGone:!d.comparison()};
   await a.livePresentation.setAccessory('glasses',false);
   return {initial,afterOff,afterPeerDestroy,limits:'Two exact base bodies, paused load/off/reload/dispose. No new shape, continuous motion, or full GPU-memory lifetime claim.'};
  });
  const r=report.result;assert(r.initial.distinctGeometry&&r.initial.distinctArray);assert(!r.afterOff.femaleMounted&&r.afterOff.samePeerObject&&r.afterOff.unchangedPeer);assert.equal(r.afterOff.peerDisposals.length,0);assert(r.afterOff.peerState.accessories.glasses.loaded);assert(Object.values(r.afterPeerDestroy).every(Boolean));assert.equal(report.errors.length,0);report.passed=true;
 }catch(e){report.failure=String(e);throw e;}finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify({out,passed:report.passed}));}
})().catch(e=>{console.error(e);process.exitCode=1;});
