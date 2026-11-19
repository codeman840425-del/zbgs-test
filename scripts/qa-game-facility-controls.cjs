const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const fs=require('node:fs/promises');
const http=require('node:http');
const path=require('node:path');
const {productionRoot,projectOutput}=require('./project-output.cjs');
const {launchQABrowser}=require('./qa-browser-workspace.cjs');

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
// Execute in the browser. Read world-space joints from the live VRM rig once per frame.
function sampleBodySeparation(ids) {
  const actors=ids.map(id=>window.__recordConsumer.actors.get(id));
  const joints=actors.map(actor=>{
    const bones=actor.avatar.vrm.humanoid;
    return ['hips','leftUpperLeg','rightUpperLeg','leftUpperArm','rightUpperArm'].map(name=>{
      const bone=bones.getRawBoneNode(name);
      if(!bone)throw Error('Missing measured VRM joint '+name);
      return {bone,world:new window.__recordConsumer.three.Vector3()};
    });
  });
  const round=n=>Number(n.toFixed(5));
  const position=v=>[round(v.x),round(v.y),round(v.z)];
  function body(i) {
    const [hips,lHip,rHip,lShoulder,rShoulder]=joints[i].map(({bone,world})=>bone.getWorldPosition(world));
    const shoulder=lShoulder.clone().lerp(rShoulder,.5);
    const sit=actors[i].motion.getMetrics().sitProgress;
    return {hips:position(hips),hipSpan:round(lHip.distanceTo(rHip)),shoulders:position(shoulder),
      shoulderSpan:round(lShoulder.distanceTo(rShoulder)),sit:round(sit)};
  }
  const horizontal=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
  const rows=[],actions=[];
  const start=performance.now();let frame;
  function action(event) {
    if(!['facility-sit','facility-stand'].includes(event.target.id))return;
    actions.push({t:round((performance.now()-start)/1000),actor:document.querySelector('#facility-actor').value,control:event.target.id});
  }
  function read(now) {
    const pair=actors.map((_,i)=>body(i));
    rows.push({t:round((now-start)/1000),action:actions.length-1,pair,
      hipsXZ:round(horizontal(pair[0].hips,pair[1].hips)),shouldersXZ:round(horizontal(pair[0].shoulders,pair[1].shoulders))});
    frame=requestAnimationFrame(read);
  }
  document.addEventListener('click',action,true);frame=requestAnimationFrame(read);
  return {stop() {
    document.removeEventListener('click',action,true);cancelAnimationFrame(frame);
    return {ids,startSinceNavigationMs:start,actions,rows};
  }};
}

function describeSeparation(trace) {
  const posture=p=>p===1?'seated':p===0?'standing':'transition';
  const intervals=[];
  for(const row of trace.rows) {
    const postures=row.pair.map(a=>posture(a.sit)).join('/');
    let range=intervals.at(-1);
    if(!range || range.action!==row.action || range.postures!==postures) {
      range={action:row.action,postures,startSeconds:row.t,frames:0};
      intervals.push(range);
    }
    range.frames++;range.endSeconds=row.t;
    for(const field of ['hipsXZ','shouldersXZ']) {
      if(!range[field] || row[field]<range[field].metres) range[field]={metres:row[field],atSeconds:row.t};
    }
  }
  return {frames:trace.rows.length,actors:trace.ids,
    units:'metres in game world; XZ distances between pelvis centres and between shoulder centres',
    measurements:'Raw VRM hips position; hip span between upper-leg joint origins; shoulder midpoint and span between upper-arm joint origins. Sit progress 0/1 = standing/seated.',
    scope:'Centre distances and joint spans do not measure triangle collisions. Inspect the side video for visible overlap.',
    actions:trace.actions,intervals};
}
async function run(folder,pin,destination) {
  const out=await projectOutput(destination,await productionRoot());
  const root=await fs.realpath(folder);
  const manifestBytes=await fs.readFile(path.join(root,'facility-package.json'));
  assert.equal(sha(manifestBytes),pin,'Unexpected combined room package');
  const manifest=JSON.parse(manifestBytes);
  const entries=new Map(manifest.files.map(row=>['/'+row.path,row]));
  const room=manifest.rooms.find(item=>item.key==='plant-home');
  const result={passed:false,packageSha256:pin,build:manifest.gameRuntime.buildId,room,observations:[],errors:[]};
  const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.json':'application/json','.png':'image/png','.wasm':'application/wasm'};
  const server=http.createServer(async(req,res)=>{
    try {
      const name=new URL(req.url,'http://localhost').pathname;
      if(name==='/favicon.ico')return res.writeHead(204).end();
      const row=entries.get(name);
      if(!row)return res.writeHead(404).end();
      const file=await fs.realpath(path.join(root,row.path));
      assert.equal(path.relative(root,file).split(path.sep).join('/'),row.path);
      const content=await fs.readFile(file);
      assert.equal(sha(content),row.sha256);
      res.writeHead(200,{'Content-Type':types[path.extname(file)]??'application/octet-stream'}).end(content);
    }catch(error){result.errors.push(error.message);res.writeHead(500).end();}
  });
  await fs.mkdir(out);
  let browser,context,video,probe;
  try{
    await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
    browser=await launchQABrowser(out,{channel:'chrome'});
    const viewport={width:1280,height:840};
    context=await browser.browser.newContext({viewport,deviceScaleFactor:1,recordVideo:{dir:out,size:viewport}});
    const page=await context.newPage();video=page.video();
    page.on('pageerror',error=>result.errors.push(error.message));
    await page.goto('http://127.0.0.1:'+server.address().port+'/facility-room.html?room='+room.key);
    await page.waitForFunction(()=>['ready','error'].includes(document.querySelector('#room-status')?.dataset.state),null,{timeout:90000});
    const status=page.locator('#room-status'),actors=page.locator('#facility-actor');
    assert.equal(await status.getAttribute('data-state'),'ready',await status.innerText());
    const [first,second]=await actors.locator('option').evaluateAll(options=>options.map(o=>o.value));
    assert.equal(await page.locator('#facility-seat').inputValue(),room.seatId);
    assert.equal(await page.evaluate(()=>__recordConsumer.buildInfo.shortId),result.build);
    result.camera=await page.evaluate(seatId=>{
      const {camera}=__recordConsumer,{session,orbit}=facilityRoom;
      const point=session.scene.describeUsePoint(seatId),[x,y,z]=point.transform.position;
      const pose=()=>({position:camera.position.toArray(),target:orbit.target.toArray(),fov:camera.fov});
      const roomFrame=pose();
      camera.position.set(x+2.8,y+.98,z+.16);
      orbit.target.set(x,y+.77,z-.13);
      orbit.update();
      return {roomFrame,sideDetail:pose(),note:'Normal room framing is recorded under ../gameplay. Side detail uses the same camera, room, actors and animation clock.'};
    },room.seatId);
    async function clickAndRead(actor,control,expected) {
      await actors.selectOption(actor);await page.locator(control).click();
      await page.waitForFunction(phrase=>document.querySelector('#room-status').textContent===phrase,expected,{timeout:45000});
      const observed=await page.evaluate(({actor,seatId})=>{
        const controller=__recordConsumer.actors.get(actor).controller;
        const event=controller.behaviorTasks.history().at(-1);
        return {actor,status:document.querySelector('#room-status').textContent,task:event.task,
          pose:controller.captureFacilityPose(),lease:__recordConsumer.seatLeases.forSeat(seatId)};
      },{actor,seatId:room.seatId});
      result.observations.push(observed);return observed;
    }
    const seated=await clickAndRead(first,'#facility-sit','入座 · 完成');
    assert.equal(seated.pose.phase,'seated');assert.equal(seated.lease.ownerId,first);
    probe=await page.evaluateHandle(sampleBodySeparation,[first,second]);
    await page.screenshot({path:path.join(out,'seated-side.png')});
    const busy=await clickAndRead(second,'#facility-sit','入座 · 被拒绝 · seat-unavailable');
    assert.equal(busy.task.admission,'rejected');assert.equal(busy.lease.ownerId,first);
    await page.waitForTimeout(650);
    const exit=await clickAndRead(first,'#facility-stand','起身 · 完成');
    assert.equal(exit.pose.phase,'idle');assert.equal(exit.lease,null);
    assert(Math.hypot(...[0,2].map(i=>exit.pose.position[i]-seated.pose.position[i]))>.18);
    const next=await clickAndRead(second,'#facility-sit','入座 · 完成');
    assert.equal(next.lease.ownerId,second);assert.equal(next.pose.phase,'seated');
    await page.waitForTimeout(650);
    assert.deepEqual(result.errors,[]);result.passed=true;
  }catch(error){result.failure=String(error.stack??error);throw error;}
  finally {
    try{
      if(probe) {
        const trace=await probe.evaluate(p=>p.stop());
        result.separation=describeSeparation(trace);
        await fs.writeFile(path.join(out,'separation-frames.json'),JSON.stringify(trace)+'\n',{flag:'wx'});
      }
    }finally{
    try{await context?.close();if(video)await fs.rename(await video.path(),path.join(out,'room-controls-1x.webm'));}
    finally{try{await browser?.close();}finally{
      if(server.listening)await new Promise(resolve=>server.close(resolve));
      await fs.writeFile(path.join(out,'report.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
    }}}
  }
}
if(require.main===module)run(...process.argv.slice(2)).catch(error=>{console.error(error);process.exitCode=1;});
