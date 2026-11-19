const fs = require('node:fs/promises');
const path = require('node:path');

// The fixed room does not export its Three namespace. Only supply the render
// target and math classes; the actual renderer, camera and materials stay live.
async function installAnkleBootProbe(page) {
  const core = await fs.readFile(path.join(__dirname,'../prototype/node_modules/three/build/three.core.js'));
  await page.route('**/__qa_ankleboot_three_core.mjs', route =>
    route.fulfill({contentType:'text/javascript',body:core}));
}

// Standalone page.evaluate function. The caller owns pause and video capture.
async function sampleAnkleBootVisibility({shoeId,cameraView,expectedShoeSha256}) {
  const d=window.__debug?.avatar ? window.__debug : window.__debugRig;
  if(!d || !['room','feet-close'].includes(cameraView) || !shoeId)throw Error('Expected a paused room, shoe ID and camera view');
  const T=d.three??window.__debugRig?.three??await import('/__qa_ankleboot_three_core.mjs');
  const actor=d.avatar(),scene=d.scene,renderer=d.renderer,roomCamera=d.cameraObject();
  const started=performance.now(),item=actor.profile.motion.getFootwear();
  if(!item || item.id!==shoeId || (expectedShoeSha256 && item.entry.sha256!==expectedShoeSha256))
    throw Error('Requested footwear is not the active loaded resource');
  if(renderer.getRenderTarget() || scene.overrideMaterial || renderer.xr?.isPresenting)throw Error('Expected normal room renderer');
  const camera=roomCamera.clone(),root=actor.root.getWorldPosition(new T.Vector3());
  if(cameraView==='feet-close'){
    camera.position.set(root.x+1.42,.65,root.z+1.15);
    camera.lookAt(root.x,.44,root.z);
    camera.fov=33;
  }
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const width=renderer.domElement.width,height=renderer.domElement.height;
  const body=new Set(actor.profile.meshRoles.body),pants=new Set(actor.profile.meshRoles.pants);
  const shoes=new Set(item.meshes.map(m=>m.uuid));
  const visible=[],owned={skin:[],pants:[],boot:[]};
  scene.updateMatrixWorld(true);
  scene.traverseVisible(m=>{
    if(!m.material || !m.layers.test(camera.layers))return;
    const role=shoes.has(m.uuid)?'boot':pants.has(m.uuid)?'pants':body.has(m.uuid)?'skin':'scene';
    if(role!=='scene'){
      if(!m.isSkinnedMesh)throw Error('Expected a skinned '+role+' surface');
      m.skeleton.update();
      owned[role].push(m);
    }
    visible.push({m,role,original:m.material});
  });
  if(!owned.skin.length || !owned.pants.length || owned.boot.length!==shoes.size || !shoes.size)
    throw Error('Selected clothing/skin is not present in the visible room scene');

  // The authored Toigo sample has two welded open rims. Find its actual
  // boundary in bind space, then sample every boundary point in the live pose.
  const rim={left:[],right:[]};
  const boneSides=new Map();
  for(const side of ['left','right'])for(const suffix of ['Foot','LowerLeg','Toes']){
    const bone=actor.vrm.humanoid.getRawBoneNode(side+suffix);
    if(bone)boneSides.set(bone,side);
  }
  for(const mesh of owned.boot){
    const g=mesh.geometry,attr=g.attributes,idx=g.index,edges=new Map(),representatives=[],keys=new Map();
    if(!idx || g.drawRange.start!==0 || g.drawRange.count<idx.count)throw Error('Expected complete indexed boot mesh');
    const welded=new Map();
    function vertex(i){
      if(welded.has(i))return welded.get(i);
      const p=new T.Vector3().fromBufferAttribute(attr.position,i),key=p.toArray().join(',');
      if(!keys.has(key)){keys.set(key,representatives.length);representatives.push(i);}
      const id=keys.get(key);welded.set(i,id);return id;
    }
    for(let i=0;i<idx.count;i+=3){
      const face=[0,1,2].map(k=>vertex(idx.getX(i+k)));
      for(let k=0;k<3;k++){
        const a=face[k],b=face[(k+1)%3],key=Math.min(a,b)+'/'+Math.max(a,b);
        edges.set(key,(edges.get(key)??0)+1);
      }
    }
    const boundary=new Map();
    for(const [key,count] of edges){
      if(count!==1)continue;
      const [a,b]=key.split('/').map(Number);
      for(const j of [a,b])boundary.set(j,(boundary.get(j)??0)+1);
    }
    for(const [j,degree] of boundary){
      if(degree!==2)throw Error('Boot cuff is not a closed boundary');
      const i=representatives[j],weight={left:0,right:0};
      for(let k=0;k<4;k++){
        const side=boneSides.get(mesh.skeleton.bones[attr.skinIndex.getComponent(i,k)]);
        if(side)weight[side]+=attr.skinWeight.getComponent(i,k);
      }
      const side=weight.left>.999?'left':weight.right>.999?'right':null;
      if(!side)throw Error('Cannot assign cuff vertex to one raw leg');
      rim[side].push(mesh.getVertexPosition(i,new T.Vector3()).applyMatrix4(mesh.matrixWorld));
    }
  }
  const bands=['left','right'].map(side=>{
    const points=rim[side];
    if(points.length!==22)throw Error('Expected 22 authored cuff points per leg, found '+points.length);
    const ankle=actor.vrm.humanoid.getRawBoneNode(side+'Foot').getWorldPosition(new T.Vector3());
    const center=points.reduce((sum,p)=>sum.add(p),new T.Vector3()).divideScalar(points.length);
    const axis=center.clone().sub(ankle),length=axis.length();
    if(length<.01)throw Error('Degenerate posed ankle-to-cuff span');
    axis.divideScalar(length);
    const radius=Math.max(...points.map(p=>p.clone().sub(center).cross(axis).length()))+.03;
    return {side,ankle,axis,length,radius,center,cuffVertices:points.length};
  });
  // Use screen targets only for reading categorical depth. Capture the normal
  // image with the renderer's actual canvas output transform/tone mapping.
  const target=new T.WebGLRenderTarget(width,height,{depthBuffer:true,stencilBuffer:true,samples:0});
  const clipToWorld=camera.matrixWorld.clone().multiply(camera.projectionMatrixInverse);
  const hideSkin={value:false},copies=new Map();
  // Bytes: R=surface (32 skin, 96 boot, 160 pants, 224 other), G=band
  // (40 left, 120 right, 200 both, 0 outside), B=73 identity sentinel.
  function wrapped(source,name,tail,prefix=''){
    const re=/\bvoid\s+main\s*\(\s*(?:void\s*)?\)/g;
    const hits=[...source.matchAll(re)];
    if(hits.length!==1)throw Error('Unsupported '+name+' shader main');
    return prefix+'\n'+source.replace(re,'void ankleBootOriginalMain()')+'\nvoid main(){ ankleBootOriginalMain(); '+tail+' }\n';
  }
  function material(original,role){
    const key=original.uuid+'/'+role;
    if(copies.has(key))return copies.get(key);
    const copy=original.clone();
    if(original.isShaderMaterial)copy.uniforms={...original.uniforms};
    const code={skin:32,boot:96,pants:160,scene:224}[role];
    copy.customProgramCacheKey=()=>original.customProgramCacheKey()+'/ankle-boot-id-1/'+code;
    copy.onBeforeCompile=(s,r)=>{
      original.onBeforeCompile.call(copy,s,r);
      s.uniforms.qaBootWorldFromClip={value:clipToWorld};
      s.uniforms.qaBootHide=hideSkin;
      for(const [i,b] of bands.entries()){
        s.uniforms['qaBootStart'+i]={value:new T.Vector4(...b.ankle.toArray(),b.length)};
        s.uniforms['qaBootAxis'+i]={value:new T.Vector4(...b.axis.toArray(),b.radius)};
      }
      s.vertexShader=wrapped(s.vertexShader,'vertex',
        'vec4 w=qaBootWorldFromClip*gl_Position; qaBootWorld=w.xyz/w.w;',
        'uniform mat4 qaBootWorldFromClip; varying vec3 qaBootWorld;');
      s.fragmentShader=wrapped(s.fragmentShader,'fragment',`
        bool l=qaBootBand(qaBootStart0,qaBootAxis0), r=qaBootBand(qaBootStart1,qaBootAxis1);
        if(qaBootHide && ${code}==32 && (l||r))discard;
        if(gl_FragColor.a<=0.0)discard;
        if(gl_FragColor.a<0.999)gl_FragColor=vec4(1.,0.,1.,1.);
        else gl_FragColor=vec4(${code}.0/255.,(l&&r?200.0:l?40.0:r?120.0:0.0)/255.,73.0/255.,1.);`,
        `varying vec3 qaBootWorld; uniform bool qaBootHide;
        uniform vec4 qaBootStart0,qaBootAxis0,qaBootStart1,qaBootAxis1;
        bool qaBootBand(vec4 start,vec4 axis){vec3 delta=qaBootWorld-start.xyz;
          float h=dot(delta,axis.xyz);
          return h>=0.0 && h<=start.w && length(delta-h*axis.xyz)<=axis.w;}`);
    };
    copies.set(key,copy);
    return copy;
  }
  const oldBackground=scene.background,oldClear=renderer.getClearColor(new T.Color()),oldAlpha=renderer.getClearAlpha();
  const oldShadows=renderer.shadowMap.autoUpdate;
  const gl=renderer.getContext(),oldCheck=renderer.debug.onShaderError;
  let normal,front,second;
  function read(){
    renderer.clear(true,true,true);
    renderer.render(scene,camera);
    const pixels=new Uint8Array(width*height*4);
    renderer.readRenderTargetPixels(target,0,0,width,height,pixels);
    return pixels;
  }
  try{
    renderer.render(scene,camera);
    normal=renderer.domElement.toDataURL('image/png').split(',')[1];
    renderer.shadowMap.autoUpdate=false;
    renderer.debug.onShaderError=(gl,program,vs,fs)=>{throw Error('Ankle-boot ID shader: '+gl.getProgramInfoLog(program)+' '+gl.getShaderInfoLog(vs)+' '+gl.getShaderInfoLog(fs));};
    for(const row of visible)row.m.material=Array.isArray(row.original)?row.original.map(m=>material(m,row.role)):material(row.original,row.role);
    scene.background=null;
    renderer.setClearColor(0,1);
    renderer.setRenderTarget(target);
    front=read();hideSkin.value=true;second=read();
  }finally{
    renderer.debug.onShaderError=oldCheck;
    for(const row of visible)row.m.material=row.original;
    scene.background=oldBackground;
    renderer.setClearColor(oldClear,oldAlpha);
    renderer.shadowMap.autoUpdate=oldShadows;
    renderer.setRenderTarget(null);
    target.dispose();
    for(const copy of copies.values())copy.dispose();
    renderer.render(scene,roomCamera);
  }
  if(gl.isContextLost())throw Error('WebGL context lost during visibility measurement');

  // Conservative projected bounds for the finite anatomical cylinders.
  const rect=bands.map(b=>{
    const bounds={x0:width,y0:height,x1:0,y1:0};
    for(const p of [b.ankle,b.center])for(const dx of [-1,1])for(const dy of [-1,1])for(const dz of [-1,1]){
      const v=p.clone().add(new T.Vector3(dx,dy,dz).multiplyScalar(b.radius)).project(camera);
      if(v.z< -1 || v.z>1)throw Error('Cuff region outside camera clipping planes');
      const x=(v.x+1)*width/2,y=(1-v.y)*height/2;
      bounds.x0=Math.min(bounds.x0,Math.max(0,Math.floor(x)));bounds.x1=Math.max(bounds.x1,Math.min(width,Math.ceil(x)));
      bounds.y0=Math.min(bounds.y0,Math.max(0,Math.floor(y)));bounds.y1=Math.max(bounds.y1,Math.min(height,Math.ceil(y)));
    }
    return bounds;
  });
  const colors={outside:[20,24,29],skinBeforeBoot:[255,45,40],skinBeforePants:[255,140,40],
    skinOtherOrGap:[255,225,60],skinBehindUnknown:[200,100,225],bootFront:[70,160,245],pantsFront:[90,180,120],
    otherFront:[125,130,135],uncertain:[255,0,210]};
  const tally=()=>Object.fromEntries(Object.keys(colors).map(k=>[k,0]));
  const counts=tally(),perSide={left:tally(),right:tally()},witnesses={};
  const cn=document.createElement('canvas');cn.width=width;cn.height=height;
  const ctx=cn.getContext('2d'),im=ctx.createImageData(width,height);
  const valid=(p,i)=>p[i+2]===73 && [32,96,160,224].includes(p[i]) && [0,40,120,200].includes(p[i+1]);
  let roiPixels=0,hits=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=((height-1-y)*width+x)*4, j=(y*width+x)*4,sideByte=front[i+1];
    const inside=rect.some(b=>x>=b.x0 && x<b.x1 && y>=b.y0 && y<b.y1);
    let label='outside';
    if(valid(front,i))hits++;
    if(inside){
      roiPixels++;
      if(!valid(front,i))label=front[i]||front[i+1]||front[i+2]?'uncertain':'outside';
      else if(sideByte===200)label='uncertain';
      else if(sideByte){
        if(front[i]===32){
          if(!valid(second,i) && (second[i]||second[i+1]||second[i+2]))label='skinBehindUnknown';
          else if(second[i+1]===sideByte && second[i]===96)label='skinBeforeBoot';
          else if(second[i+1]===sideByte && second[i]===160)label='skinBeforePants';
          else label='skinOtherOrGap';
        }else label=front[i]===96?'bootFront':front[i]===160?'pantsFront':'otherFront';
        perSide[sideByte===40?'left':'right'][label]++;
      }
      counts[label]++;
      if(label.startsWith('skin') && (witnesses[label]?.length??0)<8)(witnesses[label]??=[]).push([x,y]);
    }
    im.data.set(colors[label],j);im.data[j+3]=255;
  }
  if(!hits || !roiPixels)throw Error('No valid scene ID pixels or projected cuff coverage');
  ctx.putImageData(im,0,0);
  const visibleSkin=counts.skinBeforeBoot+counts.skinBeforePants+counts.skinOtherOrGap+counts.skinBehindUnknown;
  return {cameraView,shoeId,shoeSha256:item.entry.sha256,bodySha256:actor.profile.sha256,
    build:d.buildInfo?.shortId,elapsedMs:performance.now()-started,width,height,
    camera:{position:camera.getWorldPosition(new T.Vector3()).toArray(),quaternion:camera.quaternion.toArray(),fov:camera.fov,
      world:camera.matrixWorld.toArray(),projection:camera.projectionMatrix.toArray()},
    meshes:Object.fromEntries(Object.entries(owned).map(([k,ms])=>[k,ms.map(m=>({uuid:m.uuid,name:m.name,geometry:m.geometry.uuid}))])),
    bands:bands.map((b,i)=>({side:b.side,ankle:b.ankle.toArray(),cuffCenter:b.center.toArray(),lengthM:b.length,radiusM:b.radius,
      cuffVertices:b.cuffVertices,projectedBoundingBox:rect[i]})),
    pixels:{roiPixels,counts,perSide,visibleBodySkinInBand:visibleSkin,sameBandClothingBehindSkin:counts.skinBeforeBoot+counts.skinBeforePants,
      visibleSkinLowerBound:visibleSkin,conservativeUpperBound:visibleSkin+counts.uncertain,witnesses,colors},
    scope:'Full drawing-buffer pixel centers, no MSAA. Surface/alpha/depth from the posed room materials. Two finite cylinders run from the raw ankles to their 22-point boot openings; radius is the maximum cuff radius plus 30 mm. Skin without a same-band clothing pixel behind may be an opening. Foremost boot or pants alone does not establish an intersection. Ambiguous pixels include partial transparency and overlapping leg bands; silhouette/MSAA boundaries and other camera directions are unmeasured.',
    images:{normal,mask:cn.toDataURL('image/png').split(',')[1]}};
}

module.exports={installAnkleBootProbe,sampleAnkleBootVisibility};
