// Continuous source-clip skirt self-check. No chair in this qualification page.
const {chromium}=require('../../prototype/node_modules/playwright');
const esbuild=require('../../prototype/node_modules/esbuild');
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
(async()=>{
 const url=process.argv[2]||'http://127.0.0.1:5173/foundation.html?source=roundtrip';
 const out=path.join(root,'output/playwright/m1-skirt-selfcheck');await fs.mkdir(out,{recursive:true});
 const bundle=await esbuild.build({entryPoints:[path.join(root,'prototype/src/m1-equipment.js')],bundle:true,write:false,format:'iife',globalName:'M1Check',platform:'browser',logLevel:'silent'});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:out,size:{width:1440,height:1000}}});const page=await context.newPage();
 try{
 await page.goto(url);await page.waitForFunction(()=>window.__foundation?.ready);await page.addScriptTag({content:bundle.outputFiles[0].text});
 await page.evaluate(async()=>{const f=__foundation;f.pause(true);f.body(false);f.play('rest');f.advance(0);window.m1check=await M1Check.createM1Equipment({vrm:f.vrm,avatarSha256:M1Check.M1_AVATAR_SHA256});m1check.setOutfit(1);f.view(Math.PI/2);});
 const samples=[];
 for(const clip of ['idle','sitEnter','sitExit','idle']){
  await page.evaluate(clip=>__foundation.play(clip),clip);
  for(let i=0;i<60;i++){
   samples.push(await page.evaluate(()=>{const f=__foundation;f.advance(1/30);m1check.update(1/30,[]);const a=m1check.getAssetProfile().skirt[0].geometry.attributes.position.array;return {state:f.state(),finite:[...a].every(Number.isFinite),info:m1check.getInfo().skirtDynamics,bodyVisible:m1check.getAssetProfile().body.every(m=>m.visible)};}));
   await page.waitForTimeout(1000/30);
  }
  await page.screenshot({path:path.join(out,clip+'-side.png')});
 }
 if(!samples.every(x=>x.finite&&x.bodyVisible))throw Error('Invalid skirt/body state');
 await fs.writeFile(path.join(out,'observations.json'),JSON.stringify({url,sourceSha256:crypto.createHash('sha256').update(await fs.readFile(path.join(root,'prototype/src/m1-skirt.js'))).digest('hex'),limits:['Qualification page has no chair','Continuous source clip only; room IK and chair need integrated acceptance','Pose corrective has no cloth inertia/self-collision'],samples},null,2));
 console.log(JSON.stringify({samples:samples.length,allFinite:true,bodyAlwaysVisible:true,maxPanelCorrection:Math.max(...samples.map(x=>x.info.maxPanelCorrection))}));
 }finally{const video=page.video();await context.close();await video.saveAs(path.join(out,'stand-sit-rise.webm'));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
