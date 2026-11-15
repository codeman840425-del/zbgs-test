// Fixed-build microphone-use geometry and front/side images. Not a movie pass.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const [base,build,outArg]=process.argv.slice(2),out=path.resolve(outArg);
(async()=>{
 await fs.mkdir(out,{recursive:true});try{await fs.access(path.join(out,'report.json'));throw Error('Refuse overwrite');}catch(e){if(e.code!=='ENOENT')throw e;}
 const anchors=JSON.parse(await fs.readFile('evidence/mic-mouth-target/source-anchors.json','utf8'));
 const browser=await chromium.launch({channel:'chrome',headless:true}),rows=[],errors=[];
 try{for(const body of anchors.bodies){
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));await page.goto(new URL('?body='+body.body,base).href);await page.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});
  const gate=await verifyCandidate(page,{build,assetId:body.body==='female'?'beta-base-female-m1':'beta-base-male-m1b',sha256:body.bodySha256});
  await page.evaluate(async()=>{const d=__debug,a=d.avatar(),c=d.game.scene.getScene('CharacterStudio');d.reset();d.setPaused(true);d.setDynamics(true);d.setOutfit(a.config.id==='beta-base-male-m1b'?2:0);const seat=d.snapshot().chair;a.root.position.set(...seat.approach);a.root.rotation.y=c.yaw=seat.yaw;d.motion().reset();a.update(0);await a.livePresentation.setAccessory('mic',true);a.livePresentation.setSpeaking(false);for(let i=0;i<180;i++)c.simulate(1/120);
   const render=d.renderer.render;window.__micReviewAngle='front';d.renderer.render=function(scene,camera){const V=a.root.position.constructor,head=a.vrm.humanoid.getRawBoneNode('head').getWorldPosition(new V()),q=a.root.getWorldQuaternion(a.root.quaternion.clone()),offset=new V(...(__micReviewAngle==='front'?[0,.01,1.55]:[-1.55,.01,.05])).applyQuaternion(q);camera.position.copy(head).add(offset);camera.fov=38;camera.updateProjectionMatrix();camera.lookAt(head.clone().add(new V(0,-.19,0)));return render.call(this,scene,camera)};
  });
  for(const pose of ['carry','talk','sit']){
   if(pose!=='carry')await page.evaluate(pose=>{const d=__debug,a=d.avatar(),c=d.game.scene.getScene('CharacterStudio');a.livePresentation.setSpeaking(true);if(pose==='sit')c.action('sit');for(let i=0;i<300;i++)c.simulate(1/120);},pose);
   const data=await page.evaluate(({body,mic})=>{const d=__debug,a=d.avatar(),V=a.root.position.constructor,head=a.vrm.humanoid.getRawBoneNode('head'),object=d.scene.getObjectByName('LiveAccessory:mic');a.root.updateMatrixWorld(true);const mouth=head.localToWorld(new V(...body.mouthRawHeadLocal)),tip=object.localToWorld(new V(...mic.grilleFrontPoleLocal)),axis=new V(0,1,0).transformDirection(object.matrixWorld),direction=mouth.clone().sub(tip).normalize(),localTip=head.worldToLocal(tip.clone());
    const handBones=new Set();for(const f of ['Hand','ThumbMetacarpal','ThumbProximal','ThumbDistal','IndexProximal','IndexIntermediate','IndexDistal','MiddleProximal','MiddleIntermediate','MiddleDistal','RingProximal','RingIntermediate','RingDistal','LittleProximal','LittleIntermediate','LittleDistal']){const b=a.vrm.humanoid.getRawBoneNode('right'+f);if(b)handBones.add(b);}
    let inside=0,near=0,points=0;const inv=object.matrixWorld.clone().invert();a.vrm.scene.traverse(mesh=>{if(!mesh.isSkinnedMesh||!(Array.isArray(mesh.material)?mesh.material:[mesh.material]).some(m=>/Body_.*SKIN/.test(m.name)))return;const j=mesh.geometry.attributes.skinIndex,w=mesh.geometry.attributes.skinWeight;for(const id of new Set(mesh.geometry.index.array)){let sum=0;for(let k=0;k<4;k++)if(handBones.has(mesh.skeleton.bones[j.getComponent(id,k)]))sum+=w.getComponent(id,k);if(sum<=.5)continue;points++;const p=mesh.getVertexPosition(id,new V()).applyMatrix4(mesh.matrixWorld).applyMatrix4(inv);if(p.y<-.075||p.y>.085)continue;const gap=Math.hypot(p.x,p.z)-.013;if(gap<-.001)inside++;if(Math.abs(gap)<.002)near++;}});
    const wrist=a.vrm.humanoid.getRawBoneNode('rightHand').getWorldPosition(new V()),elbow=a.vrm.humanoid.getRawBoneNode('rightLowerArm').getWorldPosition(new V()),knuckle=a.vrm.humanoid.getRawBoneNode('rightMiddleProximal').getWorldPosition(new V());
    const wristBendDegrees=Math.acos(Math.max(-1,Math.min(1,wrist.clone().sub(elbow).normalize().dot(knuckle.sub(wrist).normalize()))))*180/Math.PI;
    return{mouth:mouth.toArray(),tip:tip.toArray(),tipHeadLocal:localTip.toArray(),mouthDistance:tip.distanceTo(mouth),axis:axis.toArray(),wristBendDegrees,axisToMouthDegrees:Math.acos(Math.max(-1,Math.min(1,axis.dot(direction))))*180/Math.PI,arm:a.livePresentation.getState().arm,contact:{insideOver1mm:inside,near2mm:near,handVertices:points,limit:'Finite skin-vertex cylinder probe, not full triangles'},snapshot:d.snapshot()};
   },{body,mic:anchors.microphone});
   for(const view of ['front','side']){await page.evaluate(view=>{window.__micReviewAngle=view;},view);await page.waitForTimeout(120);await page.screenshot({path:path.join(out,`${body.body}-${pose}-${view}.png`)});}
   rows.push({body:body.body,pose,gate,...data});
  }await page.close();
 }}finally{await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify({build,rows,errors,scope:'Static actual source pose evaluation plus actual front/side renders; no continuous naturalness or target-device pass'},null,2));}
 console.log(JSON.stringify({out,rows:rows.map(r=>({body:r.body,pose:r.pose,distance:r.mouthDistance,aim:r.axisToMouthDegrees,wristBend:r.wristBendDegrees,clamped:r.arm.reachClamped,contact:r.contact})),errors}));
})().catch(e=>{console.error(e);process.exitCode=1});
