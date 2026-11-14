// Bounded diagnostic overrides of a real fixed instance. Never edits product files.
const {chromium}=require('../../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path');
const build=process.env.QA_BUILD;if(!build)throw Error('QA_BUILD required');
const root=path.resolve(__dirname,'../..'),base=process.argv[2];if(!base)throw Error('Fixed runner URL required');
(async()=>{
 const configs=JSON.parse(await fs.readFile(path.join(__dirname,'grip-candidates.json'),'utf8')).candidates;
 const sourcePose=process.env.GRIP_SOURCE_POSE==='1';
 const out=path.join(root,'output/playwright/m1c-grip',build+(sourcePose?'-source-pose'+(process.env.GRIP_LABEL?'-'+process.env.GRIP_LABEL:''):''));await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true});const reports=[];
 try{for(const body of ['female','male']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  const url=new URL(base);url.searchParams.set('body',body);await page.goto(url.href);await page.waitForFunction(()=>__debug?.ready);
  const activeConfigs=sourcePose?[configs[0],{id:'source-fit',normal:0,forward:0,fingerScale:1,thumbScale:1,sourceGrip:JSON.parse(await fs.readFile(path.join(root,'assets-source/m1c-grip',body,'grip.json'),'utf8')),skinReference:JSON.parse(await fs.readFile(path.join(root,'assets-source/m1c-grip',body,'skin-reference.json'),'utf8'))}]:configs;
  const result=await page.evaluate(async({build,body,configs})=>{
   const d=__debug;if(d.buildInfo.development||d.buildInfo.shortId!==build)throw Error('Fixed mismatch');
   const c=d.game.scene.getScene('CharacterStudio'),a=d.avatar(),live=a.livePresentation;
   d.reset();d.setPaused(true);d.setBodyMode('dressed');d.setOutfit(0);d.setDynamics(false);d.setCorrections('full');
   const seat=d.snapshot().chair;a.root.position.set(...seat.approach);a.root.rotation.y=c.yaw=seat.yaw;d.motion().reset();a.update(0,{action:'idle'});a.resetSecondary?.();
   await live.setAccessory('mic',true);live.setSpeaking(true);for(let i=0;i<120;i++)c.simulate(1/120);
   const V=a.root.position.constructor,Q=a.root.quaternion.constructor,raw=n=>a.vrm.humanoid.getRawBoneNode(n),normalized=n=>a.vrm.humanoid.getNormalizedBoneNode(n),wp=b=>b.getWorldPosition(new V());
   const pre=live.preUpdate,post=live.postUpdate;let current=configs[0];
   const fingers=[];
   for(const finger of ['Thumb','Index','Middle','Ring','Little'])for(const segment of ['Metacarpal','Proximal','Intermediate','Distal']){
    const name='right'+finger+segment,bone=normalized(name);if(!bone)continue;
    const rest=a.vrm.humanoid.normalizedRestPose[name]?.rotation;fingers.push({name,bone,rest:new Q(...(rest||[0,0,0,1])),thumb:finger==='Thumb'});
   }
   live.preUpdate=(dt,state)=>{pre(dt,state);for(const f of fingers){if(current.sourceGrip){const q=current.sourceGrip.normalizedFingerRotations[f.name];if(q)f.bone.quaternion.fromArray(q);continue;}const scale=f.thumb?current.thumbScale:current.fingerScale;if(scale===1)continue;const delta=f.rest.clone().invert().multiply(f.bone.quaternion);const q=new Q().slerp(delta,scale);f.bone.quaternion.copy(f.rest).multiply(q);}a.root.updateMatrixWorld(true);};
   live.postUpdate=()=>{post();const mic=d.scene.getObjectByName('LiveAccessory:mic');if(!mic)return;if(current.sourceGrip){const hand=raw('rightHand'),fit=current.sourceGrip.micRawHandLocal,p=hand.localToWorld(new V(...fit.position)),q=hand.getWorldQuaternion(new Q()).multiply(new Q(...fit.quaternion));mic.position.copy(mic.parent.worldToLocal(p));mic.quaternion.copy(mic.parent.getWorldQuaternion(new Q()).invert().multiply(q));mic.updateMatrixWorld(true);return;}const forward=wp(raw('rightMiddleProximal')).sub(wp(raw('rightHand'))).normalize(),across=wp(raw('rightIndexProximal')).sub(wp(raw('rightLittleProximal'))).normalize(),normal=new V().crossVectors(across,forward).normalize();const p=mic.getWorldPosition(new V()).addScaledVector(normal,current.normal).addScaledVector(forward,current.forward);mic.position.copy(mic.parent.worldToLocal(p));mic.updateMatrixWorld(true);};
   const families=new Map([[raw('rightHand'),'palm']]);for(const f of ['Thumb','Index','Middle','Ring','Little'])for(const s of ['Metacarpal','Proximal','Intermediate','Distal']){const b=raw('right'+f+s);if(b)families.set(b,f.toLowerCase());}
   const hand=[];a.vrm.scene.traverse(m=>{if(!m.isSkinnedMesh||!(Array.isArray(m.material)?m.material:[m.material]).some(x=>/Body_.*SKIN/.test(x.name)))return;const joint=m.geometry.attributes.skinIndex,w=m.geometry.attributes.skinWeight;for(const i of new Set(m.geometry.index?.array)){let total=0,best=0,family='palm';for(let k=0;k<4;k++){const f=families.get(m.skeleton.bones[joint.getComponent(i,k)]);if(f){const weight=w.getComponent(i,k);total+=weight;if(weight>best){best=weight;family=f;}}}if(total>.5)hand.push({mesh:m,index:i,family});}});
   function measure(){const mic=d.scene.getObjectByName('LiveAccessory:mic'),inv=mic.matrixWorld.clone().invert(),p=new V(),handInv=raw('rightHand').matrixWorld.clone().invert();let maxDepth=0,inside=0,near=0,minAbs=Infinity,skinReferenceMaxError=0,fullyHandWeightedMaxError=0,maxErrorVertex=null;const groups={},ref=current.skinReference,expected=ref?new Map(ref.vertexIds.map((id,i)=>[id,ref.rawHandLocalPoints[i]])):null;for(const item of hand){item.mesh.getVertexPosition(item.index,p);p.applyMatrix4(item.mesh.matrixWorld);if(expected?.has(item.index)){const e=p.clone().applyMatrix4(handInv).distanceTo(new V(...expected.get(item.index))),i=ref.vertexIds.indexOf(item.index),weight=ref.rightHandTreeWeight?.[i];if(e>skinReferenceMaxError){skinReferenceMaxError=e;maxErrorVertex={index:item.index,family:item.family,handTreeWeight:weight,error:e};}if(weight>.99999)fullyHandWeightedMaxError=Math.max(fullyHandWeightedMaxError,e);}p.applyMatrix4(inv);if(p.y<-.075||p.y>.085)continue;const gap=Math.hypot(p.x,p.z)-.013;minAbs=Math.min(minAbs,Math.abs(gap));const g=groups[item.family]??={inside:0,near:0,maxDepth:0,minAbsGap:Infinity};g.minAbsGap=Math.min(g.minAbsGap,Math.abs(gap));if(gap<-.001){inside++;g.inside++;maxDepth=Math.max(maxDepth,-gap);g.maxDepth=Math.max(g.maxDepth,-gap);}if(Math.abs(gap)<=.002){near++;g.near++;}}return{maxDepth,inside,near,minAbsGap:minAbs,groups,skinReferenceMaxError:ref?skinReferenceMaxError:null,fullyHandWeightedMaxError:ref?fullyHandWeightedMaxError:null,maxErrorVertex};}
   const rows=[],shots=[];const camera=d.cameraObject();
   function capture(action){for(const view of ['front','side']){const at=wp(raw('rightHand')).add(new V(0,.035,0)),offset=new V(...(view==='front'?[0,.035,.43]:[.43,.035,0])).applyQuaternion(a.root.getWorldQuaternion(new Q()));camera.position.copy(at).add(offset);camera.lookAt(at);camera.updateMatrixWorld(true);d.renderer.render(d.scene,camera);shots.push({name:body+'-'+action+'-'+current.id+'-'+view,data:d.renderer.domElement.toDataURL('image/png').split(',')[1]});}}
   for(const action of ['stand','sit','walk']){
    current=configs[0];if(action==='sit'){c.action('sit');for(let i=0;i<240;i++)c.simulate(1/120);}if(action==='walk'){c.action('stand');for(let i=0;i<240;i++)c.simulate(1/120);c.setSpeed(.85);c.go(a.root.position.x,a.root.position.z+2);}
    for(let frame=0;frame<60;frame++){
     current=configs[0];c.simulate(1/120);
     if(frame%6===0||frame===59)for(const config of configs){current=config;a.update(0,{action:c.mode});a.root.updateMatrixWorld(true);rows.push({action,frame,candidate:config.id,mode:c.mode,contact:measure()});if(frame===59)capture(action);}
    }
   }
   live.preUpdate=pre;live.postUpdate=post;current=configs[0];a.update(0,{action:c.mode});
   return{build:d.buildInfo,body,diagnosticOverrides:true,configs,handVertices:hand.length,rows,shots,limits:['Handle cylinder vertex probe, not complete triangle CCD.','No runtime edits; offsets/finger scaling applied only to this temporary browser instance.','Two close grip views per pose; screenshots must also be checked for floating handle and thumb quality.','Female/male trousers; no skirt-drape inference.']};
  },{build,body,configs:activeConfigs});
  for(const shot of result.shots)await fs.writeFile(path.join(out,shot.name+'.png'),Buffer.from(shot.data,'base64'));delete result.shots;reports.push({...result,errors});await fs.writeFile(path.join(out,'report.json'),JSON.stringify(reports,null,2));await page.close();console.log(body+' grip candidates complete');
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
