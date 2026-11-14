// Development-only isolated geometry comparison. Both skirt solvers receive the
// same current raw bones. Hands remain from the live runtime; this is not final
// integrated hand/garment acceptance. No product source is changed by this probe.
const {chromium}=require('../../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
(async()=>{
 const label=process.env.QA_LABEL||'continuous-drape',url=process.argv[2]||'http://127.0.0.1:5173/',out=path.join(root,'output/playwright/m1-skirt-shape',label);await fs.mkdir(out,{recursive:true});
 const sources={reference:await fs.readFile(path.join(root,'assets-source/m1/checkpoints/m1-skirt-equivalent-optimized.js'),'utf8'),candidate:await fs.readFile(path.join(root,process.env.QA_CANDIDATE||'assets-source/m1/checkpoints/m1-skirt-continuous-drape-experiment.js'),'utf8')};
 const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}});
 try{
 await page.goto(url);await page.waitForFunction(()=>__debug?.ready);
 const report=await page.evaluate(async sources=>{
  const THREE=await import('/node_modules/three/build/three.module.js'),d=__debug,c=d.game.scene.getScene('CharacterStudio'),a=d.avatar();d.setPaused(true);d.reset();d.setOutfit(1);d.setBodyMode('dressed');d.setDynamics(true);d.setCorrections('full');
  const body=[];a.vrm.scene.traverse(m=>{if(m.isSkinnedMesh&&(Array.isArray(m.material)?m.material:[m.material]).some(x=>/_Body_\d+_SKIN/.test(x.name)))body.push(m);});
  let source;d.scene.getObjectByName('Equipment:m1-uniform-skirt').traverse(m=>{if(m.isSkinnedMesh)source=m;});
  const live=d.scene.getObjectByName('M1_UniformSkirt_Constrained');
  const solvers=Object.fromEntries(Object.entries(sources).map(([name,text])=>[name,new Function('THREE',text.replace(/import \* as THREE from [^;]+;/,'').replace('export function createM1Skirt','function createM1Skirt')+';return createM1Skirt;')(THREE)({vrm:a.vrm,source,body})]));
  const bounds=d.chairColliders(),V=THREE.Vector3,p=new V(),local=new V(),near=new V(),axis=new V(),offset=new V();
  const legs=['left','right'].map(side=>({upper:a.vrm.humanoid.getRawBoneNode(side+'UpperLeg'),lower:a.vrm.humanoid.getRawBoneNode(side+'LowerLeg'),start:new V(),end:new V(),radius:solvers.reference.getInfo().thighRadii[side==='left'?0:1]}));
  const chairBoxes=bounds.map(b=>({box:b.localBox,inverse:b.matrixWorld.clone().invert()}));
  const indices=solvers.reference.mesh.geometry.index,uv=solvers.reference.mesh.geometry.attributes.uv,mat=solvers.reference.mesh.material,texture=(Array.isArray(mat)?mat[0]:mat).map;
  const ac=document.createElement('canvas');ac.width=texture.image.width;ac.height=texture.image.height;const ax=ac.getContext('2d');ax.drawImage(texture.image,0,0);const pixels=ax.getImageData(0,0,ac.width,ac.height).data,alphaTest=(Array.isArray(mat)?mat[0]:mat).alphaTest;
  const samples=[];
  for(let t=0;t<indices.count;t+=3){const ids=[indices.getX(t),indices.getX(t+1),indices.getX(t+2)];for(const bary of [[1,0,0],[0,1,0],[0,0,1],[.5,.5,0],[0,.5,.5],[.5,0,.5],[1/3,1/3,1/3]]){let u=0,v=0;for(let k=0;k<3;k++){u+=uv.getX(ids[k])*bary[k];v+=uv.getY(ids[k])*bary[k];}const x=Math.max(0,Math.min(ac.width-1,Math.floor(u*ac.width))),y=Math.max(0,Math.min(ac.height-1,Math.floor((texture.flipY?1-v:v)*ac.height)));if(pixels[(y*ac.width+x)*4+3]/255>=alphaTest)samples.push({ids,bary});}}
  function measure(solver){
   const positions=solver.mesh.geometry.attributes.position,world=solver.mesh.matrixWorld;let chairSamples=0,capsuleSamples=0,maxCapsuleDepth=0,maxChairDepth=0;
   for(const s of samples){p.set(0,0,0);for(let k=0;k<3;k++)p.addScaledVector(local.fromBufferAttribute(positions,s.ids[k]),s.bary[k]);p.applyMatrix4(world);for(const b of chairBoxes){local.copy(p).applyMatrix4(b.inverse);if(b.box.containsPoint(local)){chairSamples++;maxChairDepth=Math.max(maxChairDepth,Math.min(local.x-b.box.min.x,b.box.max.x-local.x,local.y-b.box.min.y,b.box.max.y-local.y,local.z-b.box.min.z,b.box.max.z-local.z));}}
   for(const leg of legs){axis.subVectors(leg.end,leg.start);const t=THREE.MathUtils.clamp(offset.subVectors(p,leg.start).dot(axis)/axis.lengthSq(),0,1);near.copy(leg.start).addScaledVector(axis,t);const depth=leg.radius-p.distanceTo(near);if(depth>.002){capsuleSamples++;maxCapsuleDepth=Math.max(maxCapsuleDepth,depth);}}}
   return{...solver.getInfo(),chairSamples,capsuleSamples,maxCapsuleDepth,maxChairDepth};
  }
  const canvas=document.createElement('canvas');canvas.width=1440;canvas.height=820;const ctx=canvas.getContext('2d'),chunks=[],stream=canvas.captureStream(30),recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:6000000});recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  const data=[],keys={},frames=[];let kind='walk',camera='front',step=0,previous=null;
  const draw=()=>{d.advance(0);live.visible=false;for(const s of Object.values(solvers))s.mesh.visible=false;ctx.fillStyle='#e6e8e8';ctx.fillRect(0,0,1440,820);let panel=0;for(const [name,solver]of Object.entries(solvers)){solver.mesh.visible=true;d.renderer.render(d.scene,d.cameraObject());const image=d.renderer.domElement,scale=Math.min(720/image.width,770/image.height),w=image.width*scale,h=image.height*scale;ctx.drawImage(image,panel*720+(720-w)/2,50+(770-h)/2,w,h);ctx.fillStyle='#18343d';ctx.fillRect(panel*720,0,720,50);ctx.fillStyle='white';ctx.font='19px sans-serif';ctx.fillText(`${name} | ${kind} ${camera} | t=${(step/120).toFixed(2)}s | 1x`,panel*720+15,32);solver.mesh.visible=false;panel++;}live.visible=true;};
  function setup(k,v){kind=k;camera=v;step=0;previous=null;d.reset();d.setPaused(true);d.setOutfit(1);d.setBodyMode('dressed');d.setDynamics(true);if(k==='walk'){a.root.position.set(-2.5,0,2.2);c.yaw=Math.PI/2;d.setSpeed(.75);}else{const seat=d.snapshot().chair;a.root.position.set(...seat.approach);c.yaw=seat.yaw;}a.root.rotation.y=c.yaw;d.motion().reset();a.update(0);a.root.updateMatrixWorld(true);a.resetSecondary?.();for(let i=0;i<240;i++)c.simulate(1/120);d.view(v);if(k==='walk')c.go(1.5,2.2);Object.values(solvers).forEach(s=>s.update(0,bounds));draw();}
  recorder.start(200);
  for(const [k,v,duration]of [['walk','front',4],['sit-rise','side',7],['sit-rise','front',7]]){
   setup(k,v);const started=performance.now();let lastFrame;
   await new Promise(resolve=>{const frame=now=>{if(lastFrame!==undefined)frames.push(now-lastFrame);lastFrame=now;const goal=Math.min(duration*120,Math.floor((now-started)*.12));while(step<goal){if(k==='sit-rise'&&step===0)c.action('sit');if(k==='sit-rise'&&step===480)c.action('stand');c.simulate(1/120);legs.forEach(l=>{l.upper.getWorldPosition(l.start);l.lower.getWorldPosition(l.end);});const row={kind:k,camera:v,step,t:step/120,mode:c.mode,sitProgress:d.motion().getMetrics().sitProgress};for(const[name,s]of Object.entries(solvers)){s.update(1/120,bounds);row[name]=measure(s);}data.push(row);step++;if([60,120,180,240,420,540,600,750].includes(step)){draw();keys[`${k}-${v}-${step}`]=canvas.toDataURL('image/png').split(',')[1];}}draw();if(step<duration*120)requestAnimationFrame(frame);else resolve();};requestAnimationFrame(frame);});
  }
  await new Promise(resolve=>{recorder.onstop=resolve;recorder.stop();});stream.getTracks().forEach(t=>t.stop());const bytes=new Uint8Array(await new Blob(chunks,{type:'video/webm'}).arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));Object.values(solvers).forEach(s=>s.dispose());source.visible=false;live.visible=true;
  return{build:d.buildInfo,frames,data,keys,video:btoa(binary),samplesPerFrame:samples.length};
 },sources);
 await fs.writeFile(path.join(out,'comparison.webm'),Buffer.from(report.video,'base64'));delete report.video;for(const[k,v]of Object.entries(report.keys))await fs.writeFile(path.join(out,k+'.png'),Buffer.from(v,'base64'));delete report.keys;
 report.sourceHashes=Object.fromEntries(Object.entries(sources).map(([k,v])=>[k,crypto.createHash('sha256').update(v).digest('hex')]));report.url=url;report.limitations=['Development injected solver comparison, not fixed build. Actual full body and garments visible.','Hands use live runtime skirt and are identical in both views; final hand/garment contact must be rerun after chosen geometry integration.','Contacts sample actual alpha-filtered triangle vertices, edge midpoints and centroids against actual chair OBB and fitted thigh capsule; not true skin triangle collision or CCD. Capsule depths include solver clothing clearance radius.','120Hz numerical steps rendered at wall-clock1x; recorder requested30FPS is not a measured performance pass.'];
 report.summary=['walk','sit-rise'].map(kind=>({kind,...Object.fromEntries(['reference','candidate'].map(name=>{const rows=report.data.filter(r=>r.kind===kind).map(r=>r[name]);return[name,{maxStretch:Math.max(...rows.map(r=>r.maxEdgeStretch)),chairContactFrames:rows.filter(r=>r.chairSamples).length,maxChairDepth:Math.max(...rows.map(r=>r.maxChairDepth)),capsuleContactFrames:rows.filter(r=>r.capsuleSamples).length,maxCapsuleDepth:Math.max(...rows.map(r=>r.maxCapsuleDepth))}];}))}));
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({out,summary:report.summary},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
