// Asset qualification only. Does not apply old-avatar IK, seat or garment fixes.
const {chromium}=require('../prototype/node_modules/playwright');const fs=require('node:fs/promises'),path=require('node:path');
(async()=>{const out=path.resolve('output/playwright/'+(process.env.QA_FOUNDATION_LABEL||'foundation-qualification'));await fs.mkdir(out,{recursive:true});const b=await chromium.launch({channel:'chrome',headless:false}),c=await b.newContext({viewport:{width:1280,height:960},recordVideo:{dir:out,size:{width:1280,height:960}}}),p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(String(e)));
 try{await p.goto(process.env.QA_FOUNDATION_URL||'http://127.0.0.1:5173/foundation.html');await p.waitForFunction(()=>window.__foundation?.ready);
 const info=await p.evaluate(()=>{const f=window.__foundation;return {state:f.state(),build:f.build,ratio:f.motions.ratio,durations:Object.fromEntries(Object.entries(f.motions.clips).map(([k,v])=>[k,v.duration])),version:f.vrm.meta?.metaVersion};});
 const fixedPhases=await p.evaluate(()=>{const f=window.__foundation,v=f.vrm,records=[];f.pause(true);
  for(const mode of ['walk','sitEnter','sitIdle','sitExit','dance'])for(const phase of [0,.125,.25,.375,.5,.625,.75,.875]){
   f.play(mode);f.advance(f.motions.clips[mode].duration*phase);const points={};let rawError=0,minY=Infinity,maxY=-Infinity,finite=true;
   for(const name of ['hips','head',...['left','right'].flatMap(s=>['UpperLeg','LowerLeg','Foot','UpperArm','LowerArm','Hand'].map(x=>s+x))]){const n=v.humanoid.getNormalizedBoneNode(name),r=v.humanoid.getRawBoneNode(name);if(!n)continue;const q=n.getWorldPosition(n.position.clone());points[name]=q.toArray();if(r)rawError=Math.max(rawError,q.distanceTo(r.getWorldPosition(r.position.clone())));}
   v.scene.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;mesh.skeleton.update();for(let i=0;i<mesh.geometry.attributes.position.count;i+=3){const p=mesh.getVertexPosition(i,mesh.position.clone()).applyMatrix4(mesh.matrixWorld);finite=finite&&[p.x,p.y,p.z].every(Number.isFinite);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);}});
   records.push({mode,phase,time:f.state().time,points,rawError,meshSample:{finite,minY,maxY}});
  }return records;
 });
 const records=[];
 for(const [action,angle]of (process.env.QA_FOUNDATION_SHORT?[['walk',Math.PI/2],['sitEnter',Math.PI/2],['sitIdle',Math.PI/2]]:[['rest',0],['walk',0],['walk',Math.PI/2],['sitEnter',Math.PI/2],['sitIdle',Math.PI/2],['sitExit',Math.PI/2],['dance',0],['dance',Math.PI/2]])){
  await p.evaluate(({action,angle})=>{const f=window.__foundation;f.view(angle);f.body(true);f.play(action);f.pause(false);document.querySelector('#action').value=action;},{action,angle});
  const duration=action==='rest'?.2:action==='walk'?info.durations.walk*2:action==='sitIdle'?1:info.durations[action];
  const samples=[];for(let t=0;t<duration;t+=.12){await p.waitForTimeout(120);samples.push(await p.evaluate(()=>{const f=window.__foundation,v=f.vrm,names=['hips','head','leftEye','rightEye',...['left','right'].flatMap(s=>['UpperLeg','LowerLeg','Foot','UpperArm','LowerArm','Hand'].map(x=>s+x))];const points={};let rawError=0;for(const name of names){const n=v.humanoid.getNormalizedBoneNode(name),r=v.humanoid.getRawBoneNode(name);if(n){const q=n.getWorldPosition(n.position.clone());points[name]=q.toArray();if(r)rawError=Math.max(rawError,q.distanceTo(r.getWorldPosition(r.position.clone())));}}return {time:f.state().time,points,rawError};}));
   if(samples.length%Math.max(1,Math.round(duration/.12/6))===0)await p.screenshot({path:path.join(out,`${action}-${angle===0?'front':'side'}-${samples.length}.png`)});
  }records.push({action,angle,duration,samples});console.log(action+' '+(angle===0?'front':'side'));
 }
 await fs.writeFile(path.join(out,'observations.json'),JSON.stringify({info,errors,fixedPhases,records},null,2));
 }finally{const v=p.video();await c.close();await v.saveAs(path.join(out,'qualification.webm'));await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
