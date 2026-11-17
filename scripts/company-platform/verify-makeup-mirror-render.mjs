import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {createMirrorBinding,createMirrorBindings,createMirrorController,mirrorResourceSnapshot} from '../../prototype/src/company/mirror-render.js';

const output=path.resolve(process.argv[2] || 'evidence/company-makeup-mirror-render-v1');
await fs.mkdir(output,{recursive:true});
const checks=[];
function check(name,action) {
  try { const detail=action(); checks.push({name,status:'passed',...(detail ? {detail} : {})}); }
  catch(error) { checks.push({name,status:'failed',error:error.stack,code:error.code}); }
}
function rendererSubstitute() {
  let target=null,face=0,mip=0,viewport=new THREE.Vector4(0,0,900,900),scissor=new THREE.Vector4(5,6,300,301),scissorTest=true;
  const programs=new Map();
  const context={SCISSOR_BOX:0xc10,SCISSOR_TEST:0xc11,FRAMEBUFFER:0x8d40,FRAMEBUFFER_COMPLETE:0x8cd5,SAMPLES:0x80a9,
    isContextLost:()=>false,getError:()=>0,
    checkFramebufferStatus(){return renderer.inspectFramebuffer?.(target) ?? this.FRAMEBUFFER_COMPLETE;},
    getParameter(value){if(value===this.SCISSOR_BOX)return scissor.toArray();if(value===this.SCISSOR_TEST)return scissorTest;if(value===this.SAMPLES)return target?.samples||0;throw Error('Unexpected GL parameter');}};
  const renderer={xr:{enabled:true},shadowMap:{autoUpdate:true},autoClear:false,debug:{onShaderError:null,checkShaderErrors:false},calls:0,
    info:{autoReset:false,render:{calls:0,triangles:0}},
    properties:{get:material=>programs.get(material)},
    compile(object){programs.set(object.material,{currentProgram:{getUniforms(){renderer.inspectCompile?.(object);return {};}}});},
    state:{buffers:{depth:{setMask(){}}},viewport(value){viewport.copy(value);},scissor(value){scissor.copy(value);},setScissorTest(value){scissorTest=value;}},
    getContext:()=>context,getRenderTarget:()=>target,getActiveCubeFace:()=>face,getActiveMipmapLevel:()=>mip,
    getCurrentViewport:result=>result.copy(viewport),
    setRenderTarget(value,nextFace=0,nextMip=0){target=value;face=nextFace;mip=nextMip;viewport.copy(value?.viewport||new THREE.Vector4(0,0,900,900));scissor.copy(value?.scissor||new THREE.Vector4(0,0,900,900));scissorTest=value?.scissorTest||false;},
    clear(){},
    render(world,camera){this.calls++;this.info.render.calls+=2;this.info.render.triangles+=20;this.inspect?.(world,camera);},
    snapshot(){return {target,face,mip,viewport:viewport.toArray(),scissor:scissor.toArray(),scissorTest,xr:this.xr.enabled,shadow:this.shadowMap.autoUpdate};},
  };
  return renderer;
}
function panelDefinition(id) {
  const x=id==='left'?-.14:id==='right'?.14:0,yaw=id==='left'?Math.PI/6:id==='right'?-Math.PI/6:0;
  const minX=id==='right'?0:-.14,maxX=id==='left'?0:.14;
  return {id,node:`makeup-face-${id}`,backNode:`makeup-back-${id}`,position:[x,.365,0],yaw,
    polygons:[[[minX,-.185],[maxX,-.185],[maxX,.185],[minX,.185]]]};
}
function fixture(maxFacesPerMirror=3) {
  const world=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,1,.05,100),groups=[];
  camera.position.set(0,.365,3);camera.lookAt(0,.365,0);camera.updateMatrixWorld(true);
  const renderer=rendererSubstitute(),controller=createMirrorController({maxFacesPerMirror});
  function add(id,ids=['center','left','right']) {
    const parent=new THREE.Group(),asset=new THREE.Group();asset.name='asset-root';parent.add(asset);world.add(parent);
    const parts=new Map([['asset-root',asset]]),panels=ids.map(panelDefinition);
    for(const panel of panels) {
      const polygon=panel.polygons[0],shape=new THREE.Shape(polygon.map(p=>new THREE.Vector2(...p)));
      const geometry=new THREE.ShapeGeometry(shape).rotateY(panel.yaw).translate(...panel.position);
      const surface=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial()),back=new THREE.Mesh(new THREE.BoxGeometry(.1,.1,.01),new THREE.MeshStandardMaterial());
      surface.name=panel.node;back.name=panel.backNode;asset.add(surface,back);parts.set(surface.name,surface);parts.set(back.name,back);
    }
    const resource={id:`makeup-mirror-${ids.length===3?'tri-fold':'round'}`,mountRole:'makeup-mirror',
      mirrorSurface:{schema:'makeup-mirror-v1',profile:'single-512-v1',maxFaces:3},mirrorPanels:panels};
    const bindings=createMirrorBindings(resource,parts,id),group={id,parent,asset,parts,resource,bindings};groups.push(group);return group;
  }
  return {world,camera,renderer,controller,add,groups,
    update(frameId,timeMs,bindings=groups.flatMap(g=>g.bindings)){return controller.update(bindings,renderer,world,camera,{frameId,timeMs});},
    preflight(bindings,frameId=1,timeMs=0){return controller.preflight(bindings,renderer,world,camera,{frameId,timeMs});},
    dispose(){controller.dispose();for(const group of groups){for(const binding of group.bindings)binding.dispose();group.asset.traverse(node=>{node.geometry?.dispose();node.material?.dispose();});}world.clear();}};
}

check('legacy singular API stays strict and plural API keeps empty/single result',()=>{
  assert.deepEqual(createMirrorBindings({},new Map()),[]);
  const parent=new THREE.Group(),surface=new THREE.Mesh(new THREE.PlaneGeometry(.6,1).translate(0,0,.026),new THREE.MeshBasicMaterial());parent.add(surface);
  const resource={mirrorSurface:{schema:'planar-mirror-v1',profile:'single-512-v1',position:[0,0,.026]},mirrorNodes:{face:'face'}};
  const bindings=createMirrorBindings(resource,new Map([['face',surface]]),'wall');
  assert.equal(bindings.length,1);assert.equal(bindings[0].id,'wall');assert.equal(bindings[0].ownerId,'wall');bindings[0].dispose();surface.geometry.dispose();surface.material.dispose();
  const f=fixture();try{const group=f.add('tri');assert.throws(()=>createMirrorBinding(group.resource,group.parts,'tri'),e=>e.code==='invalid-mirror-binding');}finally{f.dispose();}
});
check('three baked planes inverse-transform and reapply parent world pose without moving vertices',()=>{
  const f=fixture();try {
    const group=f.add('tri');group.parent.position.set(1.2,.78,-1.8);group.parent.rotation.y=.7;
    for(const binding of group.bindings) {
      binding.activate();f.world.updateMatrixWorld(true);
      const before=binding.surface.geometry.getAttribute('position'),after=binding.reflector.geometry.getAttribute('position');
      for(let i=0;i<before.count;i++) {
        const original=new THREE.Vector3().fromBufferAttribute(before,i).applyMatrix4(binding.surface.matrixWorld);
        const reflected=new THREE.Vector3().fromBufferAttribute(after,i).applyMatrix4(binding.reflector.matrixWorld);
        assert(original.distanceTo(reflected)<1e-7);assert(Math.abs(after.getZ(i))<1e-7);
      }
      assert.equal(binding.ownerId,'tri');assert.equal(binding.id,`tri#${binding.panelId}`);
    }
  }finally{f.dispose();}
});
check('three distinct reflected cameras match their world planes after a rotated parent',()=>{
  const f=fixture();try {
    const group=f.add('tri');group.parent.position.set(.2,.78,-.4);group.parent.rotation.y=.8;
    f.camera.position.copy(group.parent.localToWorld(new THREE.Vector3(0,.365,3)));f.camera.lookAt(group.parent.localToWorld(new THREE.Vector3(0,.365,0)));
    const result=f.update(1,0);assert.equal(result.faceCount,3);const reflectedPositions=[];
    for(const binding of group.bindings) {
      const point=binding.reflector.getWorldPosition(new THREE.Vector3()),normal=new THREE.Vector3(0,0,1).transformDirection(binding.reflector.matrixWorld);
      const expected=f.camera.position.clone().addScaledVector(normal,-2*f.camera.position.clone().sub(point).dot(normal));
      const actual=binding.reflector.getReflectionCamera(f.camera).position;assert(expected.distanceTo(actual)<1e-7);reflectedPositions.push(actual.clone());
    }
    assert(reflectedPositions[0].distanceTo(reflectedPositions[1])>.5);assert(reflectedPositions[1].distanceTo(reflectedPositions[2])>.5);
  }finally{f.dispose();}
});
check('stable one-owner selection admits all three faces at 30Hz and reports real face passes',()=>{
  const f=fixture();try {
    const b=f.add('b'),a=f.add('a');const result=f.update(1,0);
    assert.equal(result.activeId,'a');assert.equal(result.faceCount,3);assert.equal(f.renderer.calls,3);assert(b.bindings.every(b=>!b.active));
    assert.equal(f.update(1,100).reason,'host-budget');assert.equal(f.update(2,10).updated,false);assert.equal(f.update(3,34).updated,true);
    assert.equal(f.renderer.calls,6);assert(a.bindings.every(b=>b.snapshot().updates===2));
    const stats=f.controller.snapshot();assert.equal(stats.reflectionPasses,6);assert.equal(stats.groupUpdates,2);assert.equal(stats.lastAdmissionFacePasses,3);assert.equal(stats.activeFaceCount,3);assert.equal(stats.lastReflection.calls,2);
  }finally{f.dispose();}
});
check('actual wing normal rejects its back side and no invisible wing target survives',()=>{
  const f=fixture();try {
    const group=f.add('tri');f.update(1,0);
    f.camera.position.set(-3,.365,.8);f.camera.lookAt(0,.365,0);
    const result=f.update(2,34);assert.equal(result.faceCount,2);
    assert.equal(group.bindings.find(b=>b.panelId==='left').active,false);assert.equal(f.renderer.calls,5);
    group.parent.visible=false;assert.equal(f.update(3,68).reason,'no-visible-mirror');assert(group.bindings.every(b=>!b.active));
  }finally{f.dispose();}
});
check('default one-face host rejects tri-fold even behind an earlier selected single-face owner',()=>{
  const f=fixture(1);try {
    const single=f.add('a',['center']);f.update(1,0,single.bindings);const oldTarget=single.bindings[0].reflector.getRenderTarget(),tri=f.add('z');
    assert.throws(()=>f.preflight([...single.bindings,...tri.bindings]),e=>e.code==='mirror-face-budget-exceeded');assert.equal(single.bindings[0].reflector.getRenderTarget(),oldTarget);assert(tri.bindings.every(b=>!b.active));
    assert.throws(()=>f.preflight([tri.bindings[0]]),e=>e.code==='mirror-incomplete-group');
  }finally{f.dispose();}
});
check('three-face candidate handoff retains six targets at peak and releases previous candidate and owner',()=>{
  const f=fixture();try {
    const old=f.add('owner');f.update(1,0,old.bindings);const oldTargets=old.bindings.map(b=>b.reflector.getRenderTarget());old.parent.visible=false;
    const next=f.add('owner');f.preflight(next.bindings);assert.equal(mirrorResourceSnapshot().live,6);assert.equal(f.controller.snapshot().candidateFaceCount,3);
    const nextTargets=next.bindings.map(b=>b.reflector.getRenderTarget());let released=0;for(const target of nextTargets)target.addEventListener('dispose',()=>released++);
    next.parent.visible=false;const last=f.add('owner');f.preflight(last.bindings);assert.equal(released,3);assert.equal(mirrorResourceSnapshot().live,6);
    assert.deepEqual(old.bindings.map(b=>b.reflector.getRenderTarget()),oldTargets);
    f.update(2,34,last.bindings);assert.equal(mirrorResourceSnapshot().live,3);assert(old.bindings.every(b=>!b.active));assert.equal(f.controller.snapshot().candidateFaceCount,0);
  }finally{f.dispose();}
});
check('preflight-only installs retain the previous scene before any host update',()=>{
  const f=fixture();try {
    const old=f.add('owner');f.preflight(old.bindings);const targets=old.bindings.map(b=>b.reflector.getRenderTarget());old.parent.visible=false;
    const failed=f.add('owner');f.renderer.inspectCompile=()=>f.renderer.debug.onShaderError();
    assert.throws(()=>f.preflight(failed.bindings),e=>e.code==='mirror-shader-failed');assert.deepEqual(old.bindings.map(b=>b.reflector.getRenderTarget()),targets);
    failed.parent.visible=false;f.renderer.inspectCompile=null;const committed=f.add('owner');f.preflight(committed.bindings);
    for(const binding of old.bindings)binding.dispose();committed.parent.visible=false;const committedTargets=committed.bindings.map(b=>b.reflector.getRenderTarget());
    const next=f.add('owner');f.renderer.inspectCompile=()=>f.renderer.debug.onShaderError();
    assert.throws(()=>f.preflight(next.bindings),e=>e.code==='mirror-shader-failed');assert.deepEqual(committed.bindings.map(b=>b.reflector.getRenderTarget()),committedTargets);assert.equal(mirrorResourceSnapshot().live,3);
  }finally{f.dispose();}
});
for(const mode of ['shader-second-face','target-second-face','draw-second-face'])check(`${mode} releases whole candidate and preserves old targets and renderer state`,()=>{
  const f=fixture();try {
    const old=f.add('owner');f.update(1,0,old.bindings);old.parent.visible=false;const targets=old.bindings.map(b=>b.reflector.getRenderTarget()),next=f.add('owner');
    const saved=f.renderer.snapshot(),render=f.renderer.render;let calls=0,compiles=0,framebuffers=0;
    if(mode==='shader-second-face')f.renderer.inspectCompile=()=>{if(++compiles===2)f.renderer.debug.onShaderError();};
    if(mode==='target-second-face')f.renderer.inspectFramebuffer=()=>++framebuffers===2 ? 0 : undefined;
    if(mode==='draw-second-face')f.renderer.inspect=()=>{if(++calls===2)throw Error('Injected unknown renderer state failure');};
    const code=mode==='shader-second-face'?'mirror-shader-failed':mode==='target-second-face'?'mirror-target-failed':'mirror-renderer-reset-required';
    assert.throws(()=>f.preflight(next.bindings),e=>e.code===code);assert(next.bindings.every(b=>!b.active));assert.deepEqual(old.bindings.map(b=>b.reflector.getRenderTarget()),targets);
    assert.equal(mirrorResourceSnapshot().live,3);assert.deepEqual(f.renderer.snapshot(),saved);assert.equal(f.renderer.render,render);assert.equal(f.controller.snapshot().inPass,false);
  }finally{f.dispose();}
});
check('failed normal admission consumes the frame and cannot retry another three passes',()=>{
  const f=fixture();try {
    const group=f.add('tri');f.renderer.inspect=()=>{throw Error('Injected draw failure');};
    assert.throws(()=>f.update(1,0),e=>e.code==='mirror-renderer-reset-required');assert(group.bindings.every(b=>!b.active));f.renderer.inspect=null;
    assert.equal(f.update(1,100).reason,'host-budget-awaiting-fresh');assert.equal(f.renderer.calls,1);assert.equal(f.update(2,134).faceCount,3);
  }finally{f.dispose();}
});
check('all owners and wings stay hidden during reflection and recursive update stays guarded',()=>{
  const f=fixture();try {
    const a=f.add('a'),b=f.add('b');let inspected=0;
    f.renderer.inspect=()=>{
      f.world.traverse(node=>{if(node.userData.companyMirrorSurface)assert.equal(node.visible,false);});
      assert.equal(f.update(99,99).reason,'reflection-pass-guard');assert.throws(()=>f.preflight(b.bindings),e=>e.code==='mirror-preflight-reentrant');
      for(const binding of a.bindings)binding.reflector.onBeforeRender(f.renderer,f.world,f.camera);inspected++;
    };
    f.update(1,0);assert.equal(inspected,3);assert.equal(f.renderer.calls,3);assert(a.bindings.every(b=>b.reflector.visible));
  }finally{f.dispose();}
});
check('controller disposal during second attachment cannot leave or resurrect any face target',()=>{
  const f=fixture();try {
    const group=f.add('tri');let attached=0;
    group.asset.addEventListener('childadded',event=>{if(event.child.isReflector&&++attached===2)f.controller.dispose();});
    assert.throws(()=>f.update(1,0),e=>e.code==='mirror-binding-disposed');assert(group.bindings.every(b=>!b.active));assert.equal(mirrorResourceSnapshot().live,0);assert.equal(f.renderer.calls,0);
  }finally{f.dispose();}
});
check('face disposal during drawing fails and releases its whole owner group once',()=>{
  const f=fixture();try {
    const group=f.add('tri');f.renderer.inspect=()=>group.bindings[2].dispose();
    assert.throws(()=>f.update(1,0),e=>e.code==='mirror-binding-disposed');assert(group.bindings.every(b=>!b.active));assert.equal(mirrorResourceSnapshot().live,0);
    assert(group.bindings.every(b=>b.surface.visible));
    for(const binding of group.bindings){binding.dispose();binding.dispose();assert.equal(binding.snapshot().created,1);assert.equal(binding.snapshot().disposed,1);}
  }finally{f.dispose();}
});
check('renderer restoration exception requires host rebuild and still releases every target',()=>{
  const f=fixture();try {
    const group=f.add('tri');f.renderer.state.scissor=()=>{throw Error('Injected renderer restore failure');};
    assert.throws(()=>f.update(1,0),e=>e.code==='mirror-renderer-reset-required');assert(group.bindings.every(b=>!b.active&&b.surface.visible));assert.equal(f.controller.snapshot().inPass,false);
  }finally{f.dispose();}
});
check('owner release callback cannot reenter update or consume the outer admission',()=>{
  const f=fixture();try {
    const old=f.add('old'),next=f.add('next'),nested=f.add('nested');f.update(1,0,old.bindings);
    let invoked=false,nestedResult;
    old.asset.addEventListener('childremoved',event=>{
      if(invoked||!event.child.isReflector)return;invoked=true;nestedResult=f.update(99,1000,nested.bindings);
    });
    const result=f.update(2,34,next.bindings);
    assert.equal(nestedResult.reason,'reflection-pass-guard');assert.equal(result.activeId,'next');assert.equal(result.faceCount,3);
    assert(nested.bindings.every(b=>!b.active));assert.equal(f.renderer.calls,6);assert.equal(mirrorResourceSnapshot().live,3);assert.equal(f.controller.snapshot().hostFrameId,2);
  }finally{f.dispose();}
});
check('candidate release callback cannot enter another preflight or exceed six targets',()=>{
  const f=fixture();try {
    const old=f.add('old'),first=f.add('first'),next=f.add('next'),nested=f.add('nested');f.update(1,0,old.bindings);f.preflight(first.bindings);
    let invoked=false,nestedError;
    first.asset.addEventListener('childremoved',event=>{
      if(invoked||!event.child.isReflector)return;invoked=true;
      try{f.preflight(nested.bindings);}catch(error){nestedError=error.code;}
    });
    f.preflight(next.bindings);assert.equal(nestedError,'mirror-preflight-reentrant');assert(nested.bindings.every(b=>!b.active));assert(first.bindings.every(b=>!b.active));assert.equal(mirrorResourceSnapshot().live,6);
  }finally{f.dispose();}
});
check('controller disposal guards its own release callbacks and cannot create orphan faces',()=>{
  const f=fixture();try {
    const old=f.add('old'),nested=f.add('nested');f.update(1,0,old.bindings);let invoked=false,nestedResult,nestedError;
    old.asset.addEventListener('childremoved',event=>{
      if(invoked||!event.child.isReflector)return;invoked=true;nestedResult=f.update(99,1000,nested.bindings);
      try{f.preflight(nested.bindings);}catch(error){nestedError=error.code;}
    });
    f.controller.dispose();assert.equal(nestedResult.reason,'reflection-pass-guard');assert.equal(nestedError,'mirror-preflight-reentrant');assert.equal(mirrorResourceSnapshot().live,0);assert(nested.bindings.every(b=>!b.active));
    assert.throws(()=>f.update(2,34,nested.bindings),e=>e.code==='mirror-controller-disposed');
  }finally{f.dispose();}
});
check('controller disposal from owner release cancels the outer handoff before allocating its successor',()=>{
  const f=fixture();try {
    const old=f.add('old'),next=f.add('next');f.update(1,0,old.bindings);let invoked=false;
    old.asset.addEventListener('childremoved',event=>{if(!invoked&&event.child.isReflector){invoked=true;f.controller.dispose();}});
    assert.throws(()=>f.update(2,34,next.bindings),e=>e.code==='mirror-controller-disposed');assert(next.bindings.every(b=>!b.active));assert.equal(mirrorResourceSnapshot().live,0);assert.equal(f.renderer.calls,3);
  }finally{f.dispose();}
});
check('a throwing owner removal callback releases every target and clears the operation guard',()=>{
  const f=fixture();try {
    const old=f.add('old'),next=f.add('next');f.update(1,0,old.bindings);let invoked=false;
    old.asset.addEventListener('childremoved',event=>{if(!invoked&&event.child.isReflector){invoked=true;throw Error('Injected removal callback failure');}});
    assert.throws(()=>f.update(2,34,next.bindings),/Injected removal callback failure/);assert(old.bindings.every(b=>!b.active&&b.surface.visible));assert.equal(mirrorResourceSnapshot().live,0);
    assert.equal(f.update(3,68,next.bindings).faceCount,3);assert.equal(mirrorResourceSnapshot().live,3);
  }finally{f.dispose();}
});
check('invalid plane/transform/contour or missing back fails before target allocation or mesh marking',()=>{
  const mutations=[
    g=>{g.resource.mirrorPanels[1].yaw=0;},g=>{g.resource.mirrorPanels[0].position[2]=.01;},
    g=>{g.parts.get('makeup-face-left').position.x=.01;},g=>{g.asset.rotation.y=.1;},
    g=>{const unnamed=new THREE.Group();unnamed.position.z=.01;g.asset.add(unnamed);unnamed.add(g.parts.get('makeup-face-left'));},
    g=>{g.parts.get('makeup-face-left').geometry.getAttribute('position').setZ(0,.5);},
    g=>{g.parts.delete('makeup-back-right');},g=>{g.resource.mirrorPanels[0].polygons[0].reverse();},
    g=>{g.resource.mirrorPanels[2].id='left';},g=>{g.resource.mirrorSurface.maxFaces=1;},
  ];
  for(const mutate of mutations){const f=fixture();try{
    const group=f.add('tri');for(const binding of group.bindings)binding.dispose();const before=mirrorResourceSnapshot().created;mutate(group);
    assert.throws(()=>createMirrorBindings(group.resource,group.parts,'invalid'),e=>e.code==='invalid-mirror-binding');assert.equal(mirrorResourceSnapshot().created,before);
    for(const surface of group.parts.values())assert.equal(surface.userData.companyMirrorSurface,undefined);
  }finally{f.dispose();}}
});
check('all three targets materials and private plane geometries dispose exactly once',()=>{
  const f=fixture();try {
    const group=f.add('tri');f.update(1,0);const counts=[0,0,0];
    for(const b of group.bindings){b.reflector.getRenderTarget().addEventListener('dispose',()=>counts[0]++);b.reflector.material.addEventListener('dispose',()=>counts[1]++);b.reflector.geometry.addEventListener('dispose',()=>counts[2]++);}
    f.controller.dispose();f.controller.dispose();for(const b of group.bindings){b.dispose();b.dispose();}assert.deepEqual(counts,[3,3,3]);
  }finally{f.dispose();}
});

for(const name of ['round','lit-frame','arch','tri-fold']) {
  const directory=`prototype/public/company-assets/makeup-mirror-v1/${name}/v1`,resource=JSON.parse(await fs.readFile(`${directory}/resource.json`,'utf8'));
  const bytes=await fs.readFile(`${directory}/model.glb`),gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  check(`production ${name} loaded GLB binds every declared true plane in all three quality profiles`,()=>{
    const f=fixture(),parts=new Map(),parent=new THREE.Group();let bindings=[];
    parent.position.set(.2,.78,-.4);parent.rotation.y=.65;parent.add(gltf.scene);f.world.add(parent);
    gltf.scene.traverse(node=>{if(node.name)parts.set(node.name,node);});
    try {
      bindings=createMirrorBindings(resource,parts,'production');assert.equal(bindings.length,name==='tri-fold'?3:1);
      f.camera.position.copy(parent.localToWorld(new THREE.Vector3(0,.365,3)));f.camera.lookAt(parent.localToWorld(new THREE.Vector3(0,.365,0)));
      let frame=0;
      for(const [profile,size,samples] of [['single-512-v1',512,0],['detail-1024-v1',1024,0],['detail-1024-msaa4-v1',1024,4]]) {
        for(const binding of bindings){binding.deactivate();binding.setRenderProfile(profile);}
        assert.equal(f.update(++frame,frame*34,bindings).faceCount,bindings.length);
        for(const binding of bindings) {
          const before=binding.surface.geometry.getAttribute('position'),after=binding.reflector.geometry.getAttribute('position'),target=binding.reflector.getRenderTarget();
          assert.equal(target.width,size);assert.equal(target.samples,samples);assert.equal(target.texture.type,THREE.HalfFloatType);
          for(let i=0;i<before.count;i++) {
            const original=new THREE.Vector3().fromBufferAttribute(before,i).applyMatrix4(binding.surface.matrixWorld),reflected=new THREE.Vector3().fromBufferAttribute(after,i).applyMatrix4(binding.reflector.matrixWorld);
            assert(original.distanceTo(reflected)<1e-7);assert(Math.abs(after.getZ(i))<1e-6);
          }
        }
      }
      assert.equal(f.renderer.calls,bindings.length*3);
      return {glbSha256:createHash('sha256').update(bytes).digest('hex'),faceCount:bindings.length,actualCpuReflectorPasses:f.renderer.calls};
    }finally {
      f.dispose();for(const binding of bindings)binding.dispose();
      const geometries=new Set(),materials=new Set();gltf.scene.traverse(node=>{if(node.geometry)geometries.add(node.geometry);for(const material of node.material?[node.material].flat():[])materials.add(material);});
      for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();
    }
  });
}

const resources=mirrorResourceSnapshot();checks.push({name:'all reflection targets released',status:resources.live===0?'passed':'failed',resources});
const sourceHashes={};
for(const filename of ['prototype/src/company/mirror-render.js','scripts/company-platform/verify-makeup-mirror-render.mjs','prototype/node_modules/three/examples/jsm/objects/Reflector.js'])sourceHashes[filename]=createHash('sha256').update(await fs.readFile(filename)).digest('hex');
const report={status:checks.every(check=>check.status==='passed')?'passed':'failed',checks,sourceHashes,
  limits:['Actual locked Three r187 Reflector with synthetic geometry and four actual loaded production GLBs, using a limited renderer substitute. This does not verify real WebGL shader links/framebuffers, visible reflections, browser close/reopen or ordinary-computer performance.',
    'Target counts describe target objects and dispose events. Unknown renderer exceptions still require the host to rebuild its renderer. Public state restoration does not establish private Three render-stack recovery.',
    'Main-scene rendering is owned by the host. This script measures the distinct reflection face passes and does not claim a main-scene GPU timing.']};
await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(report.status!=='passed')process.exitCode=1;
