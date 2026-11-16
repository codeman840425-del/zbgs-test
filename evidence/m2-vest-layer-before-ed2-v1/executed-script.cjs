// Bounded read-only regression for the confirmed front-waist top/pants overlap.
// Uses the product task API and fixed cameras; never edits skin, layers or pose.
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {chromium} = require('../prototype/node_modules/playwright');
const {verifyCandidate} = require('./qa-m1-common.cjs');

async function main() {
  const [url, build, destination, indexPath] = process.argv.slice(2);
  assert(url && /^[a-f0-9]{12}$/.test(build) && destination && indexPath);
  const out = path.resolve(destination), bytes = await fs.readFile(indexPath);
  const index = JSON.parse(bytes);
  const cases = [{id:'female', profile:{id:'beta-base-female-m1', sha256:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'}},
    ...['female-round-full-v2','female-soft-wide-v2'].map(id => index.presets.find(p => p.id === id))];
  assert(cases.every(Boolean));
  await fs.mkdir(out, {recursive:false});
  await fs.copyFile(__filename, path.join(out,'executed-script.cjs'));
  await fs.writeFile(path.join(out,'executed-runtime-index.json'), bytes);
  const report = {schema:'vest-layer-chain-v1', build, status:'running', cases:[],
    runtimeIndexSha256:createHash('sha256').update(bytes).digest('hex'),
    limits:[
      '1x wall-clock playback; technical task completion is not visual acceptance.',
      'Front inspection camera follows the same product camera policy in both candidates; room view supplies wider context.',
      'Posed geometry samples every >=100ms only cover rest-space front-waist triangle AABB selection, not entire garments or continuous collisions.',
      'Thin open surfaces do not supply a reliable global signed penetration distance.',
      'Recorded frame timings include video and bounded diagnostic sampling; development machine only.',
      'Furniture is retained; obscured intervals must be reported rather than presumed clear.',
    ]};
  const browser = await chromium.launch({channel:'chrome',headless:true});
  report.browser = browser.version();
  try {
    for (const spec of cases) for (const view of ['room','inspect-half-front']) {
      const folder = path.join(out, spec.id+'-'+view); await fs.mkdir(folder);
      const context = await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir:folder,size:{width:1440,height:900}}});
      const page = await context.newPage(), row = {id:spec.id,view,build,status:'running',errors:[],tasks:[],visualAcceptance:'pending'};
      report.cases.push(row);
      page.on('pageerror', e => row.errors.push(String(e)));
      const mark = label => page.evaluate(label => {window.__vest.phase = label;},label);
      const task = async (kind,payload={}) => {
        const requestId = 'vest-'+spec.id+'-'+view+'-'+row.tasks.length;
        const admission = await page.evaluate(q => __debug.request(q),{requestId,kind,payload});
        row.tasks.push({requestId,kind,payload,admission});
        await page.waitForFunction(id => ['completed','failed','cancelled'].includes(__debug.tasks().get(id)?.state),requestId,{timeout:45000});
        const result = await page.evaluate(id => __debug.tasks().get(id),requestId);
        row.tasks.at(-1).result = result; assert.equal(result.state,'completed',JSON.stringify(result));
      };
      try {
        await page.goto(url+'?workbench=appearance&body='+spec.id);
        await page.waitForFunction(() => window.__debug?.ready && document.querySelector('#appearance-form')?.getAttribute('aria-busy') === 'false',null,{timeout:60000});
        row.identity = await verifyCandidate(page,{build,assetId:spec.profile.id,sha256:spec.profile.sha256});
        // Reset before every case, not while walking. No modified clock or bone pose.
        await page.evaluate(view => {__debug.reset(); __debug.setPlaybackRate(1); __debug.setPaused(false); __debug.camera(view);},view);
        await page.waitForTimeout(750);
        row.environment = await page.evaluate(() => {
          const gl = __debug.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
          return {userAgent:navigator.userAgent,viewport:[innerWidth,innerHeight],devicePixelRatio,
            renderer:gl.getParameter(gl.RENDERER),unmaskedRenderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null,
            vendor:ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):null,hardwareConcurrency:navigator.hardwareConcurrency};
        });
        row.surfaces = await page.evaluate(() => {
          const actor = __debug.avatar(), surfaces = [];
          const bounds = {min:[-.16,.95,-.3],max:[.16,1.10,-.03]};
          for (const role of ['top','pants']) for (const uuid of actor.profile.meshRoles[role]||[]) {
            const mesh = actor.root.getObjectByProperty('uuid',uuid); if(!mesh) throw Error('Missing '+role);
            const g=mesh.geometry, pos=g.getAttribute('position'), indices=g.index?Array.from(g.index.array):Array.from({length:pos.count},(_,i)=>i);
            const ids=new Set(),triangles=[];
            for(let t=0;t<indices.length;t+=3) {
              const tri=indices.slice(t,t+3), xyz=tri.map(i=>[pos.getX(i),pos.getY(i),pos.getZ(i)]);
              if([0,1,2].every(k=>Math.max(...xyz.map(v=>v[k]))>=bounds.min[k] && Math.min(...xyz.map(v=>v[k]))<=bounds.max[k])) {
                triangles.push({ordinal:t/3,indices:tri}); for(const i of tri)ids.add(i);
              }
            }
            const vertexIds=[...ids].sort((a,b)=>a-b);
            if(!vertexIds.length)throw Error('Empty waist selection: '+role);
            surfaces.push({mesh,role,vertexIds,triangles,point:mesh.position.clone()});
          }
          if(!['top','pants'].every(role=>surfaces.some(s=>s.role===role)))throw Error('Missing top/pants roles');
          window.__vest={phase:'idle',rows:[],frames:[],surfaces,raf:null,last:null,lastSample:-Infinity};
          function sample(now) {
            const v=window.__vest;
            if(v.last!==null)v.frames.push({ms:now,dt:now-v.last,phase:v.phase}); v.last=now;
            if(now-v.lastSample>=100) {
              v.lastSample=now;const start=performance.now(), s=__debug.snapshot(), camera=__debug.cameraObject();
              const meshes=v.surfaces.map(item=>{
                const {mesh,point}=item;mesh.skeleton?.update();
                return {role:item.role,name:mesh.name,visible:mesh.visible,
                  ancestorVisible:(()=>{for(let n=mesh;n;n=n.parent)if(!n.visible)return false;return true;})(),
                  world:item.vertexIds.map(i=>mesh.getVertexPosition(i,point).applyMatrix4(mesh.matrixWorld).toArray())};
              });
              v.rows.push({ms:now,phase:v.phase,simulationTime:s.simulationTime,mode:s.mode,position:s.position,motion:s.motion,
                rootMatrix:actor.root.matrixWorld.toArray(),cameraWorld:camera.matrixWorld.toArray(),cameraProjection:camera.projectionMatrix.toArray(),
                meshes,samplingMs:performance.now()-start});
            }
            v.raf=requestAnimationFrame(sample);
          }
          window.__vest.raf=requestAnimationFrame(sample);
          return {bounds,meshes:surfaces.map(({mesh,role,vertexIds,triangles})=>({role,name:mesh.name,vertexIds,triangles,
            rest:vertexIds.map(i=>[mesh.geometry.attributes.position.getX(i),mesh.geometry.attributes.position.getY(i),mesh.geometry.attributes.position.getZ(i)]),
            material:(Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(m=>({name:m.name,type:m.type,opacity:m.opacity,transparent:m.transparent,alphaTest:m.alphaTest,depthTest:m.depthTest,depthWrite:m.depthWrite}))}))};
        });
        await page.waitForTimeout(1000);await page.locator('#stage').screenshot({path:path.join(folder,'idle.png')});
        await mark('walk');await page.evaluate(()=>__debug.setSpeed(1.05));await task('walk',{x:-1.4,z:-.6});
        await mark('run-turn');await page.evaluate(()=>__debug.setSpeed(2.2));await task('walk',{x:1.2,z:1.6});
        await mark('sit');await page.evaluate(()=>__debug.setSpeed(1.05));await task('sit');
        await mark('seated');await page.waitForTimeout(1200);await page.locator('#stage').screenshot({path:path.join(folder,'seated.png')});
        await mark('stand');await task('stand');
        await mark('leave');await task('walk',{x:-.5,z:1.8});
        await mark('dance-technical');await task('dance',{danceId:'dance-technical-once-v1'});
        await mark('final-idle');await page.waitForTimeout(800);
        await page.locator('#stage').screenshot({path:path.join(folder,'end.png')});
        assert.deepEqual(row.errors,[]); row.status='captured-visual-pending';
      } catch(e) {row.status='failed';row.error=String(e.stack||e);try{await page.screenshot({path:path.join(folder,'failure.png')});}catch{}}
      finally {
        try {
          const data=await page.evaluate(()=>{if(!window.__vest)return null;cancelAnimationFrame(__vest.raf);return {rows:__vest.rows,frames:__vest.frames};});
          if(data) {
            await fs.writeFile(path.join(folder,'samples.json'),JSON.stringify(data));
            const dt=data.frames.map(x=>x.dt).sort((a,b)=>a-b), cost=data.rows.map(x=>x.samplingMs).sort((a,b)=>a-b);
            row.timing={frames:dt.length,p95:dt[Math.floor(dt.length*.95)],max:dt.at(-1),over50:dt.filter(v=>v>50).length,
              geometrySamples:cost.length,samplingP95:cost[Math.floor(cost.length*.95)],samplingMax:cost.at(-1)};
          }
        }catch(e){row.sampleError=String(e);row.status='failed';}
        const video=page.video();await context.close();await video.saveAs(path.join(folder,'normal1x.webm'));await video.delete();
        await fs.writeFile(path.join(folder,'report.json'),JSON.stringify(row,null,2));
        await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
        console.log(JSON.stringify({id:spec.id,view,status:row.status,error:row.error,timing:row.timing}));
      }
    }
  } finally {
    await browser.close();report.status=report.cases.length===6&&report.cases.every(r=>r.status==='captured-visual-pending')?'captured-visual-pending':'failed-or-incomplete';
    await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
  }
  if(report.status==='failed-or-incomplete')process.exitCode=1;
}
main().catch(error=>{console.error(error);process.exitCode=1;});
