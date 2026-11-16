// Bounded actual-vertex seat calibration. Normal-speed film is a separate run.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const [base,build,folder]=process.argv.slice(2),out=path.resolve(folder);
(async()=>{
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:900}});
 const report={build,errors:[],measurements:[],scope:'Original male, onePiece index5, actual visible garment/body/shoe vertices versus current chair-local boxes. Temporary seat layer0/+10mm to measure response, not a performance run or visual pass.'};
 page.on('pageerror',e=>report.errors.push(String(e)));
 try{
  await page.goto(base+'?body=male&workbench=appearance');await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});
  report.identity=await verifyCandidate(page,{build,assetId:'beta-base-male-m1b',sha256:'62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff'});
  await page.evaluate(async code=>(await import(URL.createObjectURL(new Blob([code],{type:'text/javascript'})))).installM1Probes(),await fs.readFile(path.join(__dirname,'qa-m1-probes.mjs'),'utf8'));
  report.configuredLayer=await page.evaluate(()=>__debug.avatar().config.outfitSeatLayerThickness?.[5]);
  for(const layer of [0,.01]){
   const result=await page.evaluate(layer=>{
    const d=__debug,a=d.avatar(),c=d.game.scene.getScene('CharacterStudio'),prior=a.config.outfitSeatLayerThickness?.[5];
    if(a.profile.bodyType!=='male')throw Error('Wrong body');
    try{
     a.config.outfitSeatLayerThickness??={};a.config.outfitSeatLayerThickness[5]=layer;
     d.reset();d.setPaused(true);d.setOutfit(5);d.setBodyMode('dressed');
     for(let i=0;i<120;i++)c.simulate(1/120);
     c.action('sit');let i=0;for(;i<3000;i++){c.simulate(1/120);if(c.mode==='sit'&&d.motion().getMetrics().sitProgress>.999)break;}
     if(i===3000)throw Error('Seat target not reached');
     for(let j=0;j<120;j++)c.simulate(1/120);d.view('inspect-full-side');d.advance(0);
     return{layer,simulationSteps:i,seat:__m1qa.seat(),feet:__m1qa.feet()};
    }finally{if(prior===undefined)delete a.config.outfitSeatLayerThickness[5];else a.config.outfitSeatLayerThickness[5]=prior;}
   },layer);
   report.measurements.push(result);await page.screenshot({path:path.join(out,`seat-layer-${layer}.png`)});
  }
  assert.equal(report.errors.length,0);
  report.status='measured; not accepted';
 }catch(e){report.status='failed';report.error=String(e);process.exitCode=1;}
 finally{await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
 console.log(JSON.stringify({out,status:report.status,error:report.error,measurements:report.measurements.map(r=>({layer:r.layer,garment:r.seat.meshes.filter(m=>m.role==='onePiece').map(m=>({gap:m.minPelvisLocalGap,collisions:m.collisions})),feet:r.feet.map(f=>({side:f.side,minHeight:f.minHeight}))}))}));
})().catch(e=>{console.error(e);process.exitCode=1;});
