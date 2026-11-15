const fs=require('node:fs/promises'),path=require('node:path'),{chromium}=require('../prototype/node_modules/playwright');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const [base,build,output]=process.argv.slice(2);
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(base);await page.waitForFunction(()=>__debug?.ready,null,{timeout:60000});
 const identity=await verifyCandidate(page,{build,assetId:'beta-base-female-m1',sha256:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'});
 const result=await page.evaluate(async()=>{
  const d=__debug,a=d.avatar(),c=d.game.scene.getScene('CharacterStudio');d.reset();d.setPaused(true);d.setOutfit(1);
  const draw=()=>{c.simulate(1/120);d.renderer.render(d.scene,d.cameraObject());};
  const stat=()=>({geometries:d.renderer.info.memory.geometries,textures:d.renderer.info.memory.textures,programs:d.renderer.info.programs.length});
  d.setBodyMode('base');draw();d.setBodyMode('dressed');draw();const baseline=stat(),rows=[];
  for(let i=0;i<4;i++){
   const peer=await d.loadComparison('female');peer.avatar.setOutfit(1);peer.avatar.setDebugBody(true);peer.update(1/120);draw();peer.avatar.setDebugBody(false);peer.update(1/120);draw();const on=stat();
   const before=a.getOutfitInfo().equipment.bodyCoverage;peer.avatar.setDebugBody(true);draw();const after=a.getOutfitInfo().equipment.bodyCoverage;
   d.removeComparison();draw();const off=stat();d.setBodyMode('base');draw();const full=a.getOutfitInfo().equipment.bodyCoverage;d.setBodyMode('dressed');draw();
   rows.push({i,on,off,primaryUnaffected:before.active===after.active&&after.renderFaces===7480,fullRestored:full.renderFaces===7732,geometryReturned:off.geometries===baseline.geometries,textureReturned:off.textures===baseline.textures});
  }
  return {baseline,rows,final:stat(),scope:'Four actual second-female create/render/debug/dispose cycles after warmup. Counts only, not GPU byte/JS heap/long-run leak proof. Primary coverage state and complete body restoration checked.'};
 });await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'report.json'),JSON.stringify({build,identity,errors,...result},null,2));console.log(JSON.stringify(result));
 if(errors.length||result.rows.some(r=>!r.primaryUnaffected||!r.fullRestored||!r.geometryReturned||!r.textureReturned))throw Error('Lifecycle failed; report retained');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
