const {chromium}=require('../prototype/node_modules/playwright');const fs=require('node:fs/promises'),path=require('node:path');
(async()=>{const out=path.resolve('output/playwright/stop-final');await fs.mkdir(out,{recursive:true});const b=await chromium.launch({channel:'chrome',headless:false}),c=await b.newContext({viewport:{width:1440,height:1080},recordVideo:{dir:out,size:{width:1440,height:1080}}}),p=await c.newPage();try{
 await p.goto(process.argv[2]||'http://127.0.0.1:5183');await p.waitForFunction(()=>window.__debug?.ready);await p.evaluate(()=>{Object.assign(document.querySelector('#stage').style,{height:'900px',minHeight:'900px',maxHeight:'900px'});window.__debug.camera('close');});
 for(const speed of [.45,.85,1.3]){await p.evaluate(speed=>{const d=window.__debug;d.reset();d.setSpeed(speed);d.setOutfit(0);d.setDynamics?.(false);d.walkTo(-2.7,2.1);},speed);await p.waitForTimeout(1800);await p.evaluate(()=>window.__debug.action('idle'));
  for(let i=0;i<5;i++){await p.waitForTimeout(100);await p.screenshot({path:path.join(out,`stop-${speed}-${i}.png`)});}await p.waitForTimeout(700);
 }
 }finally{const v=p.video();await c.close();await v.saveAs(path.join(out,'three-speed-stop.webm'));await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
