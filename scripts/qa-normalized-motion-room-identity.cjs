// Fixed-room original/derived/original selection; no motion asset modification.
const fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require('../prototype/node_modules/playwright');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const [base,build,out,expected='fixed']=process.argv.slice(2);
(async()=>{
 await fs.mkdir(out,{recursive:true});
 try{await fs.access(path.join(out,'report.json'));throw Error('Refuse overwrite')}catch(e){if(e.code!=='ENOENT')throw e}
 const browser=await chromium.launch({channel:'chrome',headless:true});const results=[],errors=[];
 try{
  for(const [body,id,sha] of [
   ['female','beta-base-female-m1','027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'],
   ['male','beta-base-male-m1b','62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff']]){
   const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(String(e)));
   await page.goto(base+'?body='+body);await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});
   const identity=await verifyCandidate(page,{build,assetId:id,sha256:sha});
   const result=await page.evaluate(async body=>{
    const d=__debug,c=d.game.scene.getScene('CharacterStudio'),a=d.avatar();d.setPaused(true);
    const mf=await(await fetch('/assets/motion/m1c/dance-imports.json')).json();
    const ids=['rokoko-5359146-30s-v1','rokoko-5359146-30s-arm-local-v1','rokoko-5359146-30s-v1'];
    const names=['hips','leftUpperArm','leftLowerArm','leftHand','rightUpperArm','rightLowerArm','rightHand'];
    const samples=[];
    for(const [i,id] of ids.entries()){
     d.reset();d.setPaused(true);d.setCorrections('full');d.setDynamics(true);d.setBodyMode('dressed');d.setOutfit(body==='male'?2:0);
     a.root.position.set(-.9,0,1.4);a.root.rotation.y=c.yaw=0;c.turnPolicy.reset(0);d.motion().reset();a.update(0);
     d.command({type:'danceSelect',id});d.command({type:'action',name:'dance',requestId:'identity-'+body+'-'+i});
     let steps=0;while((d.motion().getMetrics().dance?.time??0)<3-1e-8){c.simulate(1/120);if(++steps>600)throw Error('Dance did not reach3s')}
     const m=d.motion().getMetrics();a.root.updateMatrixWorld(true);
     const bones=Object.fromEntries(names.map(n=>{const b=a.vrm.humanoid.getRawBoneNode(n);return[n,{p:b.getWorldPosition(a.root.position.clone()).toArray(),q:b.getWorldQuaternion(a.root.quaternion.clone()).toArray()}]}));
     samples.push({id,selected:d.motion().getDance().id,time:m.dance.time,bones,root:a.root.position.toArray(),steps});
    }
    const dist=(a,b)=>Math.max(...names.filter(n=>n!=='hips').map(n=>Math.hypot(...a.bones[n].p.map((x,j)=>x-b.bones[n].p[j]))));
    const variants=mf.entries.filter(e=>ids.includes(e.id)).map(e=>({id:e.id,variant:e.variants.find(v=>v.avatarSha256===a.getAssetProfile().sha256)}));
    return{samples,variants,differentActionDistanceM:dist(samples[0],samples[1]),restoredDistanceM:dist(samples[0],samples[2]),unchangedHip:JSON.stringify(samples[0].bones.hips)===JSON.stringify(samples[1].bones.hips),scope:'Three actual room selections at same3s with same assets and separate IDs. Reset used deliberately for identity comparison, not continuous transition acceptance.'};
   },body);
   result.passed=result.differentActionDistanceM>.001&&result.restoredDistanceM<1e-9&&result.unchangedHip;
   results.push({body,identity,...result});await page.close();
  }
 }finally{await browser.close()}
 const passed=!errors.length&&results.every(r=>expected==='broken'?!r.passed:r.passed);
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify({build,expected,errors,results,passed},null,2));
 console.log(JSON.stringify({build,expected,passed,results:results.map(r=>({body:r.body,changed:r.differentActionDistanceM,restored:r.restoredDistanceM,hipSame:r.unchangedHip}))}));
 if(!passed)throw Error('Room action identity mismatch; evidence saved');
})().catch(e=>{console.error(e);process.exitCode=1});
