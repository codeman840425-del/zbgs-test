// Real browser acceptance capture, not a visual-pass assertion.
// npm install --prefix prototype --save-dev playwright
// node scripts/qa-runtime.cjs [URL]
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '../prototype/node_modules/playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'output/playwright/anime');
(async () => {
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: false });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, recordVideo: { dir: out, size: { width: 1440, height: 960 } } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  const samples = [], captures = new Set();
  try {
    await page.goto(process.argv[2] || 'http://127.0.0.1:5173/');
    await page.waitForFunction(() => window.__debug?.ready, { timeout: 30000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(out, 'idle.png') });
    const skinning = await page.evaluate(() => {
      const result=[];
      window.__debug.avatar().root.traverse(object=>{
        if(!object.isSkinnedMesh)return;
        const weights=object.geometry.getAttribute('skinWeight'),joints=object.geometry.getAttribute('skinIndex');
        let multi=0,maxError=0;
        for(let i=0;i<weights.count;i++){
          const w=[weights.getX(i),weights.getY(i),weights.getZ(i),weights.getW(i)];
          const j=[joints.getX(i),joints.getY(i),joints.getZ(i),joints.getW(i)];
          multi+=new Set(j.filter((_,k)=>w[k]>1e-5)).size>1;
          maxError=Math.max(maxError,Math.abs(w.reduce((a,b)=>a+b,0)-1));
        }
        result.push({name:object.name,vertices:weights.count,multi,maxWeightSumError:maxError,bones:object.skeleton.bones.length,visible:object.visible});
      });
      return result;
    });
    await page.evaluate(()=>window.__debug.runSequence());
    const started=Date.now();
    while(Date.now()-started<240000){
      await page.waitForFunction(()=>window.__debug?.ready);
      const sample=await page.evaluate(()=>{
        const s=window.__debug.snapshot(),v=window.__debug.avatar().vrm;
        s.rawFeet=['leftFoot','rightFoot'].map(name=>{
          const raw=v.humanoid.getRawBoneNode(name),normal=v.humanoid.getNormalizedBoneNode(name);
          return {name,raw:raw.getWorldPosition(raw.position.clone()).toArray(),normalized:normal.getWorldPosition(normal.position.clone()).toArray()};
        });
        return s;
      });
      samples.push({elapsed:Date.now()-started,...sample});
      const key=`${sample.outfit}-${sample.mode}`;
      if(!captures.has(key)&&sample.motion.actionTime>.8){
        captures.add(key);
        await page.screenshot({path:path.join(out,`${key}.png`)});
      }
      if(samples.length>10&&sample.sequenceLength===0)break;
      await page.waitForTimeout(100);
    }
    const final=await page.evaluate(()=>window.__debug.snapshot());
    const footFrames=samples.flatMap(s=>(s.feet||[]).map((f,index)=>({...f,mode:s.mode,moving:s.motion.moving,turning:s.motion.turning,
      rawNormalizedError:Math.hypot(...s.rawFeet[index].raw.map((x,i)=>x-s.rawFeet[index].normalized[i]))})));
    const movingContacts=footFrames.filter(f=>f.contact&&f.moving);
    const turningContacts=footFrames.filter(f=>f.contact&&f.turning);
    const report={date:new Date().toISOString(),url:page.url(),viewport:{width:1440,height:960},browser:browser.version(),errors,
      sequenceCompleted:final.sequenceLength===0,skinning,
      summary:{samples:samples.length,collisionSamples:samples.filter(s=>s.collision).length,
        maxContactSlip:Math.max(0,...movingContacts.map(f=>f.slip)),maxContactTravel:Math.max(0,...movingContacts.map(f=>f.contactTravel)),
        maxTurnContactTravel:Math.max(0,...turningContacts.map(f=>f.contactTravel)),
        reachClampFrames:movingContacts.filter(f=>f.reachClamp).length,maxRawNormalizedError:Math.max(0,...footFrames.map(f=>f.rawNormalizedError)),
        modes:[...captures],final},samples};
    await fs.writeFile(path.join(out,'runtime-report.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({...report,samples:undefined,skinning:undefined},null,2));
  } finally {
    const video=page.video();await context.close();
    if(video)await video.saveAs(path.join(out,'complete-sequence.webm'));
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
