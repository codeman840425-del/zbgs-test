export async function startGaitReview(clipName) {
  // Use the candidate's own Vite-resolved dependency URLs, including its
  // isolated cache directory. Avoid loading an untransformed bare import.
  const assetModule=await(await fetch('/src/assets.js')).text();
  const threeURL=assetModule.match(/from\s+["']([^"']*\/three\.js[^"']*)["']/)[1];
  const loaderURL=assetModule.match(/from\s+["']([^"']*GLTFLoader[^"']*)["']/)[1];
  const THREE = await import(location.origin + threeURL);
  const {GLTFLoader} = await import(location.origin + loaderURL);
  const {createMotion} = await import(location.origin + '/src/motion.js');
  const {loadRetargetedMotions} = await import(location.origin + '/src/motion-source.js');
  const d=window.__debug,a=d.avatar(),vrm=a.vrm,root=a.root,gameScene=d.game.scene.getScene('CharacterStudio');
  gameScene.paused=true;a.setOutfit(0);root.position.set(0,0,0);root.rotation.set(0,0,0);
  const stage=document.querySelector('#stage');Object.assign(stage.style,{height:'800px',minHeight:'800px',maxHeight:'800px'});
  vrm.humanoid.resetNormalizedPose();vrm.update(0);root.updateWorldMatrix(true,true);
  const motions=await loadRetargetedMotions(vrm,{walkClip:clipName});
  const rawRoot=new THREE.Group();rawRoot.add(vrm.humanoid.normalizedHumanBonesRoot.clone(true));
  const rawMixer=new THREE.AnimationMixer(rawRoot),rawAction=rawMixer.clipAction(motions.clips.walk);rawAction.play();rawAction.paused=true;
  const motion=createMotion(vrm,root,motions);
  // CPU-deform the actual shoe mesh, independently of the analytic landmarks.
  const shoeMeshes=[];
  vrm.scene.traverse(o=>{if(o.isSkinnedMesh && (Array.isArray(o.material)?o.material:[o.material]).some(m=>/Shoes/i.test(m.name))) shoeMeshes.push(o);});
  const shoeSamples={left:[],right:[]};
  for(const mesh of shoeMeshes){mesh.skeleton.update();for(let i=0;i<mesh.geometry.attributes.position.count;i++){
    const p=mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld),local=root.worldToLocal(p.clone());
    shoeSamples[local.x>0?'left':'right'].push({mesh,index:i,last:p.clone()});
  }}
  for(const side of ['left','right']){const minY=Math.min(...shoeSamples[side].map(x=>x.last.y));shoeSamples[side]=shoeSamples[side].filter(x=>x.last.y<minY+.012);}
  const source=await new GLTFLoader().loadAsync('/assets/motion/UAL1_Standard.glb');
  const sourceRoot=new THREE.Group();sourceRoot.add(source.scene);sourceRoot.scale.setScalar(motions.ratio);
  const sourceMixer=new THREE.AnimationMixer(source.scene),sourceAction=sourceMixer.clipAction(THREE.AnimationClip.findByName(source.animations,clipName));sourceAction.play();sourceAction.paused=true;
  const scene=d.scene;
  scene.children.forEach(o=>{if(o!==root&&!o.isLight)o.visible=false;});
  scene.add(sourceRoot);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:'#ccd6ce',roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.007;scene.add(floor);
  const grid=new THREE.GridHelper(200,400,0xaab8b0,0xb8c4ba);grid.position.y=-.006;scene.add(grid);
  sourceRoot.updateWorldMatrix(true,true);const box=new THREE.Box3().setFromObject(sourceRoot);sourceRoot.position.y=-box.min.y;
  const banner=document.createElement('div');banner.style='position:absolute;left:24px;right:24px;top:80px;background:#f5f3e9e8;padding:12px;color:#223b38;font:16px sans-serif;z-index:20';stage.append(banner);
  let view='front',travel=0,sampleTime=0,rate=1,records=[],running=false,last=0,lastSample=-1,resolveRun=null,cycles=3,moveRoot=true,speed=.85,frameMs=0,allFrames=false;
  const camera=new THREE.PerspectiveCamera(33,1,.05,300),originalRender=d.renderer.render.bind(d.renderer);
  d.renderer.render=()=>{
    const size=d.renderer.getSize(new THREE.Vector2());camera.aspect=size.x/size.y;
    if(view==='front'){sourceRoot.position.x=-.75;sourceRoot.position.z=travel;camera.position.set(0,1.1,travel+4.8);camera.lookAt(0,.85,travel);}
    else{sourceRoot.position.x=0;sourceRoot.position.z=travel-1.55;camera.position.set(4.8,1.15,travel-.75);camera.lookAt(0,.85,travel-.75);}
    sourceRoot.updateWorldMatrix(true,true);root.updateWorldMatrix(true,true);
    camera.updateProjectionMatrix();originalRender(scene,camera);
  };
  const pos=(node,parent)=>parent.worldToLocal(node.getWorldPosition(new THREE.Vector3()));
  const bend=(h,k,f)=>180-THREE.MathUtils.radToDeg(h.clone().sub(k).angleTo(f.clone().sub(k)));
  function measure(){
    const result={time:sampleTime,frameMs,phase:motion.getMetrics().phase,hipDrop:motion.getMetrics().adaptiveHipDrop,source:{},raw:{},corrected:{},metrics:motion.getMetrics()};
    const srcNames={hip:'pelvis',leftUpperLeg:'thigh_l',leftLowerLeg:'calf_l',leftFoot:'foot_l',rightUpperLeg:'thigh_r',rightLowerLeg:'calf_r',rightFoot:'foot_r'};
    for(const side of ['left','right']){
      const s=['UpperLeg','LowerLeg','Foot'].map(n=>pos(source.scene.getObjectByName(srcNames[side+n]),sourceRoot));
      const t=['UpperLeg','LowerLeg','Foot'].map(n=>pos(vrm.humanoid.getNormalizedBoneNode(side+n),root));
      const r=['UpperLeg','LowerLeg','Foot'].map(n=>pos(rawRoot.getObjectByName(vrm.humanoid.getNormalizedBoneNode(side+n).name),rawRoot));
      result.source[side]={kneeFlex:bend(...s),points:s.map(v=>v.toArray())};
      result.raw[side]={kneeFlex:bend(...r),points:r.map(v=>v.toArray())};
      result.corrected[side]={kneeFlex:bend(...t),points:t.map(v=>v.toArray())};
    }
    result.source.hip=pos(source.scene.getObjectByName('pelvis'),sourceRoot).toArray();
    result.raw.hip=pos(rawRoot.getObjectByName(vrm.humanoid.getNormalizedBoneNode('hips').name),rawRoot).toArray();
    result.corrected.hip=pos(vrm.humanoid.getNormalizedBoneNode('hips'),root).toArray();
    result.shoes={};
    for(const mesh of shoeMeshes)mesh.skeleton.update();
    for(const side of ['left','right']){
      let lowest=null;
      for(const vertex of shoeSamples[side]){
        const p=vertex.mesh.getVertexPosition(vertex.index,new THREE.Vector3()).applyMatrix4(vertex.mesh.matrixWorld);
        const delta=p.clone().sub(vertex.last);vertex.last.copy(p);
        if(!lowest||p.y<lowest.y)lowest={y:p.y,world:p.toArray(),vertex:vertex.index,delta:delta.toArray()};
      }
      result.shoes[side]=lowest;
    }
    return result;
  }
  function advance(dt){
    if(moveRoot)travel+=speed*dt;root.position.z=travel;
    motion.update(dt,{action:'walk',moving:true,distanceDelta:speed*dt,speed,treadmill:!moveRoot});vrm.update(dt);root.updateWorldMatrix(true,true);
    const p=motion.getMetrics().phase;
    sourceAction.time=p*sourceAction.getClip().duration;sourceMixer.update(0);sourceRoot.updateWorldMatrix(true,true);
    rawAction.time=p*motions.clips.walk.duration;rawMixer.update(0);rawRoot.updateWorldMatrix(true,true);
  }
  function tick(now){
    if(running){frameMs=Math.max(0,now-last);const dt=Math.min(frameMs/1000,.04)*rate;sampleTime+=dt;advance(dt);if(dt>0&&(allFrames||sampleTime-lastSample>=1/60)){records.push(measure());lastSample=sampleTime;}
      if(sampleTime>=cycles*motion.getMetrics().stride/speed){running=false;resolveRun({clipName,view,rate,moveRoot,speed,corrections:motion.getMetrics().corrections,stride:motion.getMetrics().stride,duration:sampleTime,records});}
    }
    last=now;requestAnimationFrame(tick);
  }requestAnimationFrame(tick);
  window.__gaitReview={run(nextView,nextRate,nextCycles=3,options={}){
    view=nextView;rate=nextRate;cycles=nextCycles;moveRoot=options.moveRoot??true;speed=options.speed??.85;allFrames=options.allFrames??false;root.position.set(view==='front'?.75:0,0,0);root.rotation.set(0,0,0);travel=0;motion.reset();
    motion.setCorrections?.(options.corrections??{footIK:true,pelvis:true});
    // Warm the blend and contact state for two full cycles before measurement.
    for(let i=0;i<Math.ceil(2*motion.getMetrics().stride/speed*60);i++)advance(1/60);
    records=[];sampleTime=0;lastSample=-1;banner.textContent=`${clipName} · ${view==='front'?'正面':'侧面'} · ${rate===1?'正常速度':'0.25倍慢放'} · ${moveRoot?'路径':'原地诊断'} · ${options.label??'完整修正'} · 连续3周期`;
    running=true;last=performance.now();return new Promise(resolve=>{resolveRun=resolve;});
  },ready:true};
}
