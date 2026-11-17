// Real workbench buttons on a fixed build. Serial rendering; no fit bypass.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const [directory,output,...flags]=process.argv.slice(2);
if(!directory||!output)throw Error('Require fixed dist, fresh evidence folder, optional --mic');
const selectedCases=flags.find(x=>x.startsWith('--cases='))?.slice(8);
const exactCases=selectedCases?JSON.parse(require('node:fs').readFileSync(selectedCases,'utf8')):null;
if(exactCases&&(!Array.isArray(exactCases)||!exactCases.length||exactCases.some(r=>r.length!==3||!r.every(x=>typeof x==='string')||!/^[a-z0-9-]+$/.test(r[0])||!/^[a-f0-9]{64}$/.test(r[2]))))throw Error('Invalid explicit body cases');
const allSubjects=exactCases?exactCases.map(r=>r[0]):['native-female-843ac-v1','native-female-face-v1','native-female-waist-v1','native-male-7586-v1'];
const only=flags.find(x=>x.startsWith('--body='))?.slice(7);
if(only&&!allSubjects.includes(only))throw Error('Unknown exact subject');
const subjects=only?[only]:allSubjects;
const kinds=flags.includes('--mic')?['glasses','mic']:['glasses'];
(async()=>{
 const folder=path.resolve(directory),out=path.resolve(output),identity=JSON.parse(await fs.readFile(path.join(folder,'build-info.json'),'utf8'));
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const report={build:identity.shortId,status:'incomplete',cases:[],scope:'Actual workbench near 1x use and rapid equipment toggles. Not contact-free, arbitrary-body or target-device acceptance.'};
 const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
 const server=require('node:http').createServer(async(req,res)=>{try{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(folder,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(folder+path.sep)){res.writeHead(403).end();return;}const bytes=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);}catch{res.writeHead(404).end();}});
 let browser;
 try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({channel:'chrome',headless:true});report.browser=browser.version();report.viewport={width:1440,height:1000};
  for(const body of subjects){
   const page=await browser.newPage({viewport:report.viewport}),row={body,errors:[]};report.cases.push(row);page.on('pageerror',e=>row.errors.push(String(e)));
   await page.goto(`http://127.0.0.1:${server.address().port}/?workbench=appearance&body=${body}`);
   await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:90000});assert.equal(await page.evaluate(()=>__debug.buildInfo.shortId),identity.shortId);
   if(exactCases){const [,assetId,sha256]=exactCases.find(r=>r[0]===body);row.identity=await require('./qa-m1-common.cjs').verifyCandidate(page,{build:identity.shortId,assetId,sha256});}
   await page.locator('[data-workbench-tab="actions"]').click();
   for(const kind of kinds){
    const button=page.locator(`[data-accessory-kind="${kind}"]`);await button.click();
    await page.waitForFunction(k=>__debug.avatar().livePresentation.getState().accessories[k].status!=='loading',kind,{timeout:30000});
    assert.equal(await page.evaluate(k=>__debug.avatar().livePresentation.getState().accessories[k].loaded,kind),true,body+' '+kind);
    // on -> off -> on -> off -> on through real controls; latest choice wins.
    for(let i=0;i<4;i++)await button.click();
    await page.waitForFunction(k=>__debug.avatar().livePresentation.getState().accessories[k].status==='on',kind,{timeout:30000});
   }
   await page.locator('#speaking-button').click();await page.getByRole('button',{name:'看向镜头',exact:true}).click();
   await page.evaluate(()=>{__debug.camera('inspect-half-front');__debug.setPlaybackRate(1);__debug.setPaused(false);});await page.waitForTimeout(1000);
   row.before=await page.evaluate(()=>__debug.avatar().livePresentation.getState());
   await page.evaluate(()=>{const stream=__debug.renderer.domElement.captureStream(30),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:5000000});window.nativeLiveCapture={stream,chunks,recorder,done:new Promise(resolve=>recorder.onstop=resolve)};recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.start();});
   await page.waitForTimeout(3500);await page.screenshot({path:path.join(out,body+'-front.png')});
   await page.evaluate(()=>__debug.camera('inspect-face-side'));await page.waitForTimeout(3500);await page.screenshot({path:path.join(out,body+'-side.png')});
   // Actual speaking toggle: mic lowers for carry, then returns for speaking.
   await page.locator('#speaking-button').click();await page.evaluate(()=>__debug.camera('inspect-half-front'));await page.waitForTimeout(2000);
   await page.locator('#speaking-button').click();await page.waitForTimeout(2500);
   const data=await page.evaluate(async()=>{const c=window.nativeLiveCapture;c.recorder.stop();await c.done;c.stream.getTracks().forEach(t=>t.stop());return new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(new Blob(c.chunks,{type:'video/webm'}));});});
   await fs.writeFile(path.join(out,body+'-live-1x.webm'),Buffer.from(data.split(',')[1],'base64'));
   await page.evaluate(()=>__debug.setPaused(true));const beforePause=await page.evaluate(()=>__debug.avatar().livePresentation.getState().time);await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>__debug.avatar().livePresentation.getState().time),beforePause);
   await page.evaluate(()=>__debug.setPaused(false));await page.waitForTimeout(150);assert((await page.evaluate(()=>__debug.avatar().livePresentation.getState().time))>beforePause);
   row.after=await page.evaluate(()=>__debug.avatar().livePresentation.getState());
   for(const kind of kinds){await page.locator(`[data-accessory-kind="${kind}"]`).click();assert.equal(await page.evaluate(k=>__debug.avatar().livePresentation.getState().accessories[k].loaded,kind),false);}
   row.unloaded=await page.evaluate(()=>__debug.avatar().livePresentation.getState().accessories);assert.equal(row.errors.length,0);row.status='technical-pass-visual-pending';await page.close();
  }
  report.status='technical-pass-visual-pending';
 }catch(e){report.failure=String(e.stack||e);process.exitCode=1;}
 finally{await browser?.close();await new Promise(r=>server.close(r));await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,build:report.build,failure:report.failure,cases:report.cases.map(x=>({body:x.body,status:x.status}))}));}
})();
