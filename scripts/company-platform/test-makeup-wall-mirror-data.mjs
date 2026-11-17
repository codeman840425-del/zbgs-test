import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {createCompany,deriveCompany,prepareCompanyChange} from '../../prototype/src/company/document.js';
import {createCompanyScene} from '../../prototype/src/company/render.js';
import {createMirrorController,mirrorResourceSnapshot} from '../../prototype/src/company/mirror-render.js';
import {validateMirrorResource} from '../../prototype/src/company/mirror-data.js';
import {validateMakeupMirrorResource} from '../../prototype/src/company/makeup-mirror-data.js';
import {MAKEUP_WALL_LIGHT,MAKEUP_WALL_STATE_SCHEMA,MAKEUP_WALL_STATE_SEMANTICS,validateMakeupWallMirrorResource} from '../../prototype/src/company/makeup-wall-mirror-data.js';
import {compareFacilityFunction} from '../../prototype/src/company/appearance-contract.js';
import {encodeCompanySave,decodeCompanySave} from '../../prototype/src/company/persistence.js';

const output=path.resolve(process.argv[2]||'evidence/company-makeup-wall-mirror-data-v1');await fs.mkdir(output,{recursive:true});
const clone=value=>structuredClone(value),hash=bytes=>createHash('sha256').update(bytes).digest('hex'),checks=[];
const fail=(code,location,message)=>{throw Object.assign(Error(message),{code,path:location});};
async function check(name,action){try{checks.push({name,status:'passed',detail:await action()});}catch(error){checks.push({name,status:'failed',code:error.code,error:error.stack});}}
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const originals=await Promise.all(['round','lit-frame','arch','tri-fold'].map(name=>read(`prototype/public/company-assets/makeup-mirror-v1/${name}/v1/resource.json`)));
const table=await read('prototype/public/company-assets/vanity-table-v1/plain/v1/resource.json');
const oldCatalog=await read('prototype/src/company/facility-catalog.json'),fill=oldCatalog.resources.find(r=>r.id==='fill-light');
const walls=originals.map(original=>({id:original.id.replace('makeup-mirror-','makeup-wall-mirror-'),version:1,category:'dynamic',mountRole:'makeup-mirror-wall',productionBranch:'makeup-mirror-wall',mount:'wall',
  coordinates:{units:'metres',up:'+Y',forward:'+Z',origin:'Wall centre',scale:'Identity only'},mounting:{origin:'center',width:.7,height:.6,depth:.12},
  footprint:{center:[0,0],halfSize:[.35,.06],blocking:false},usePoints:[],asset:{format:'glb',url:'/synthetic-wall-only.glb',sha256:'0'.repeat(64),bytes:20},
  mirrorSurface:{schema:'makeup-wall-mirror-v1',profile:'single-512-v1',maxFaces:3},mirrorPanels:original.mirrorPanels.map(panel=>({...clone(panel),position:[panel.position[0],0,.038]})),
  makeupNodes:{mount:'makeup-wall-mount',lamp:'makeup-lamp'},makeupLamp:{node:'makeup-lamp',maxEmissiveIntensity:1.5},light:clone(MAKEUP_WALL_LIGHT),
  stateDefaults:{on:true,intensity:5},stateSchema:clone(MAKEUP_WALL_STATE_SCHEMA),stateSemantics:clone(MAKEUP_WALL_STATE_SEMANTICS)}));
const future={...clone(walls[3]),id:'future-wall-mirror',version:2},catalog={id:'wall-mirror-cpu',version:1,resources:[...walls,future,table,originals[0],fill]},templates={templates:[]},options={catalog,templates};
const ref=r=>({id:r.id,version:r.version});
const add=(id,parentId,resource,position,yaw=0,state={},attachment)=>({type:'add-facility',id,parentId,resource:ref(resource),transform:{position,yaw},state,...(attachment?{attachment:{surfaceId:attachment}}:{})});
function input(){const document=createCompany({id:'wall-fixture',width:7,depth:5.25},catalog);return prepareCompanyChange(document,[
  add('a-wall',document.nodes[1].id,walls[3],[-1,1.145,-2.525],0,{on:true,intensity:7}),add('b-table',document.nodes[1].id,table,[.8,0,-.5]),
  add('b-table/mirror','b-table',originals[0],[.02,.78,-.135],0,{on:true,intensity:6},'top'),add('c-fill',document.nodes[1].id,fill,[2.2,0,-1.8],0,{on:true,intensity:9})],options).document;}
function change(document,operations){return prepareCompanyChange(document,operations,options).document;}
const near=(actual,expected)=>{assert.equal(actual.length,expected.length);for(let i=0;i<actual.length;i++)assert(Math.abs(actual[i]-expected[i])<1e-7,`${actual} != ${expected}`);};

// Uses real r187 Reflector with public-state renderer/GL substitutes. This is
// intentionally not a shader compilation, actual framebuffer or pixel proof.
function rendererFixture(){let target=null,viewport=new THREE.Vector4(0,0,900,900),scissor=viewport.clone(),test=false;const programs=new Map();
  const gl={SCISSOR_BOX:1,SCISSOR_TEST:2,SAMPLES:3,FRAMEBUFFER:4,FRAMEBUFFER_COMPLETE:5,isContextLost:()=>false,getError:()=>0,checkFramebufferStatus:()=>5,
    getParameter(key){return key===1?scissor.toArray():key===2?test:target?.samples||0;}};
  const renderer={xr:{enabled:false},shadowMap:{autoUpdate:true},autoClear:true,calls:0,debug:{onShaderError:null,checkShaderErrors:false},
    info:{autoReset:false,render:{calls:0,triangles:0}},properties:{get:material=>programs.get(material)},
    compile(object){programs.set(object.material,{currentProgram:{getUniforms(){renderer.inspectCompile?.(object);return {};}}});},
    state:{buffers:{depth:{setMask(){}}},viewport(value){viewport.copy(value);},scissor(value){scissor.copy(value);},setScissorTest(value){test=value;}},
    getContext:()=>gl,getRenderTarget:()=>target,getActiveCubeFace:()=>0,getActiveMipmapLevel:()=>0,getCurrentViewport:value=>value.copy(viewport),
    setRenderTarget(value){target=value;},clear(){},render(){this.calls++;this.info.render.calls++;this.inspect?.();}};
  return renderer;
}
function libraryFixture(){return{instantiate(resource){const root=new THREE.Group(),nodes=new Map();root.name='synthetic-asset';nodes.set(root.name,root);
  function mesh(name,geometry=new THREE.BoxGeometry(.01,.01,.01)){const value=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial());value.name=name;root.add(value);nodes.set(name,value);}
  for(const panel of resource.mirrorPanels||[]){const shape=new THREE.Shape(panel.polygons[0].map(p=>new THREE.Vector2(...p)));mesh(panel.node,new THREE.ShapeGeometry(shape).rotateY(panel.yaw).translate(...panel.position));mesh(panel.backNode);}
  for(const name of Object.values(resource.makeupNodes||{}))if(!nodes.has(name))mesh(name);if(resource.mountRole==='vanity-table')mesh('vanity-top');return{root,nodes};
}};}
function fixture(document=input(),maxFacesPerMirror=3){const world=new THREE.Scene(),renderer=rendererFixture(),controller=createMirrorController({maxFacesPerMirror}),camera=new THREE.PerspectiveCamera(45,1,.05,100),control={preflight:null};
  camera.position.set(-1,1.145,.5);camera.lookAt(-1,1.145,-2.525);camera.updateMatrixWorld(true);
  const scene=createCompanyScene(world,document,{...options,assetLibrary:libraryFixture(),mirrorPreflight:context=>control.preflight?.(context)});
  let frame=0;
  return{world,renderer,controller,camera,scene,control,
    frame(){return controller.update(scene.mirrorBindings(),renderer,world,camera,{frameId:++frame,timeMs:frame*34});},
    apply(operations){let handle;try{handle=scene.prepareChange(operations);scene.commit(handle);}finally{if(handle)scene.discard(handle);}},
    dispose(){scene.dispose();controller.dispose();}};
}
const activeLights=scene=>scene.snapshot().lights.filter(l=>l.intensity>0).map(l=>({id:l.id,intensity:l.intensity}));

await check('four wall adapters and future positive version share function while adding exact light semantics',()=>{
  for(const resource of [...walls,future]){validateMakeupWallMirrorResource(resource,fail);validateMakeupMirrorResource(resource,fail);validateMirrorResource(resource,fail);assert(compareFacilityFunction(walls[0],resource).compatible);}
  const changed=clone(walls[0]);changed.light.target[0]=.01;assert(!compareFacilityFunction(walls[0],changed).compatible);
  assert(!compareFacilityFunction(originals[0],walls[0]).compatible);const omitted=clone(walls[0]);delete omitted.footprint;validateMirrorResource(omitted,fail);
  return{versions:[1,2],panelCounts:walls.map(r=>r.mirrorPanels.length),wallAndTabletopSeparateFunctions:true};
});
await check('role/schema/unknown fields and light or geometry mappings cannot bypass wall admission',()=>{
  const mutations=[r=>r.mountRole='other',r=>r.productionBranch='other',r=>r.mirrorSurface.schema='planar-mirror-v1',r=>delete r.mirrorSurface,
    r=>r.unknown=true,r=>r.mirrorSurface.extra=1,r=>r.mirrorPanels[0].extra=true,r=>r.light.intensity=5,r=>r.light.target[2]=.72,
    r=>r.light.position[2]=NaN,r=>r.light.color='#ffffff',r=>r.light.kind='point',r=>r.stateSemantics.on='reflective-on-off',
    r=>r.stateSchema.intensity.max=100,r=>r.makeupNodes.base='makeup-base',r=>r.makeupLamp.maxEmissiveIntensity=2,
    r=>r.mirrorPanels[1].yaw=0,r=>r.mirrorPanels[0].position[1]=.365,r=>r.mirrorPanels[0].polygons[0].reverse(),
    r=>r.mounting.depth=.08,r=>r.footprint.blocking=true,r=>r.supportMotion={},r=>r.asset.extra=true,r=>r.version=0];
  for(const mutate of mutations){const resource=clone(walls[3]);mutate(resource);assert.throws(()=>validateMirrorResource(resource,fail),error=>Boolean(error.code));}
  const malformed=clone(future);malformed.mountRole='other';malformed.mirrorSurface.schema='unknown';assert.throws(()=>validateMirrorResource(malformed,fail),error=>Boolean(error.code));
  return{rejectedMutations:mutations.length+1};
});
await check('three shared lights use two slots and hiding wall releases its actual output and slot without changing save',()=>{
  const f=fixture();try{const saved=f.scene.save();assert.deepEqual(activeLights(f.scene),[{id:'a-wall',intensity:7},{id:'b-table/mirror',intensity:6}]);
    f.scene.setWallView({mode:'cutaway',cameraPosition:[-1,1.5,-7]});assert.equal(f.scene.root.getObjectByName('a-wall').visible,false);
    assert.deepEqual(activeLights(f.scene),[{id:'b-table/mirror',intensity:6},{id:'c-fill',intensity:9}]);assert.equal(f.scene.snapshot().lights.find(l=>l.id==='a-wall').intensity,0);assert.equal(f.scene.save(),saved);
    f.scene.setWallView({mode:'full'});assert.deepEqual(activeLights(f.scene),[{id:'a-wall',intensity:7},{id:'b-table/mirror',intensity:6}]);assert.equal(f.scene.save(),saved);
    return{lights:3,budget:2,hiddenLampSlotReleased:true,desiredRestored:7};
  }finally{f.dispose();}
});
await check('ancestor hiding suppresses every descendant light and reflected face using the same visibility',()=>{
  const f=fixture();try{const saved=f.scene.save();f.frame();assert.equal(mirrorResourceSnapshot().live,3);
    const room=f.scene.root.getObjectByName('wall-fixture/room-1');room.visible=false;f.scene.setWallView({mode:'full'});assert.deepEqual(activeLights(f.scene),[]);assert.equal(f.frame().reason,'no-visible-mirror');assert.equal(mirrorResourceSnapshot().live,0);
    room.visible=true;f.scene.setWallView({mode:'full'});assert.equal(activeLights(f.scene).length,2);assert.equal(f.frame().faceCount,3);assert.equal(f.scene.save(),saved);
    return{hiddenAncestorReleasedLightsAndTargets:true};
  }finally{f.dispose();}
});
await check('off and zero intensity control actual lamp and diffuser while retaining true reflection',()=>{
  const f=fixture();try{for(const state of [{on:false,intensity:7},{on:true,intensity:0}]){
      f.apply([{type:'set-state',id:'a-wall',state}]);assert.equal(f.scene.snapshot().lights.find(l=>l.id==='a-wall').intensity,0);
      assert.equal(f.scene.root.getObjectByName('a-wall').getObjectByName('makeup-lamp').material.emissiveIntensity,0);assert.equal(f.frame().faceCount,3);
    }f.apply([{type:'set-state',id:'a-wall',state:{on:true,intensity:8}}]);assert.equal(f.scene.snapshot().lights.find(l=>l.id==='a-wall').intensity,8);
    near([f.scene.root.getObjectByName('a-wall').getObjectByName('makeup-lamp').material.emissiveIntensity],[1.2]);return{offStillReflects:true,zeroStillReflects:true};
  }finally{f.dispose();}
});
await check('wall yaw transforms real plane poses, virtual cameras, lamp and target together',()=>{
  const f=fixture();try{const results=[];
    for(const [position,yaw] of [[[-1,1.145,-2.525],0],[[3.4,1.145,.5],3*Math.PI/2]]){
      f.apply([{type:'move',id:'a-wall',transform:{position,yaw}}]);const root=f.scene.root.getObjectByName('a-wall'),front=new THREE.Vector3(0,0,3).applyAxisAngle(new THREE.Vector3(0,1,0),yaw);
      f.camera.position.copy(root.position).add(front);f.camera.lookAt(root.position);const result=f.frame();assert.equal(result.faceCount,3);
      const light=root.children.find(n=>n.isSpotLight);assert.equal(light.decay,2);assert.equal(light.castShadow,false);
      near(light.getWorldPosition(new THREE.Vector3()).toArray(),root.localToWorld(new THREE.Vector3(...MAKEUP_WALL_LIGHT.position)).toArray());
      near(light.target.getWorldPosition(new THREE.Vector3()).toArray(),root.localToWorld(new THREE.Vector3(...MAKEUP_WALL_LIGHT.target)).toArray());
      for(const binding of f.scene.mirrorBindings().filter(b=>b.ownerId==='a-wall')){
        const point=binding.reflector.getWorldPosition(new THREE.Vector3()),normal=new THREE.Vector3(0,0,1).transformDirection(binding.reflector.matrixWorld),expected=f.camera.position.clone().addScaledVector(normal,-2*f.camera.position.clone().sub(point).dot(normal));
        near(binding.reflector.getReflectionCamera(f.camera).position.toArray(),expected.toArray());
        const original=binding.surface.geometry.getAttribute('position'),local=binding.reflector.geometry.getAttribute('position');for(let i=0;i<original.count;i++)near(new THREE.Vector3().fromBufferAttribute(original,i).applyMatrix4(binding.surface.matrixWorld).toArray(),new THREE.Vector3().fromBufferAttribute(local,i).applyMatrix4(binding.reflector.matrixWorld).toArray());
      }results.push({position,yaw,faces:3,light:light.getWorldPosition(new THREE.Vector3()).toArray()});
    }return results;
  }finally{f.dispose();}
});
await check('shared default single-face budget refuses tri-fold and explicit three-face admission keeps the old throttle',()=>{
  const single=fixture(input(),1);try{assert.throws(()=>single.frame(),e=>e.code==='mirror-face-budget-exceeded');assert.equal(mirrorResourceSnapshot().live,0);}finally{single.dispose();}
  const f=fixture();try{assert.equal(f.frame().faceCount,3);assert.equal(f.renderer.calls,3);assert.equal(f.controller.update(f.scene.mirrorBindings(),f.renderer,f.world,f.camera,{frameId:1,timeMs:100}).reason,'host-budget');assert.equal(f.renderer.calls,3);
    f.scene.setWallView({mode:'cutaway',cameraPosition:[-1,1.5,-7]});f.frame();assert.equal(mirrorResourceSnapshot().live,0);return{passesPerAdmission:3,hiddenOwnerReleased:true};
  }finally{f.dispose();}
});
await check('four compatible appearances and a new version preserve installation and nondefault state through saves',async()=>{
  const f=fixture();try{const untouched=clone(f.scene.document.nodes.filter(n=>n.id!=='a-wall'));
    for(const resource of [...walls,future]){f.apply([{type:'replace-resource',id:'a-wall',resource:ref(resource)}]);assert.deepEqual(f.scene.document.nodes.filter(n=>n.id!=='a-wall'),untouched);
      const node=f.scene.document.nodes.find(n=>n.id==='a-wall');assert.deepEqual(node.state,{on:true,intensity:7});assert.deepEqual(node.transform,{position:[-1,1.145,-2.525],yaw:0});
      const saved=f.scene.save();f.scene.restore(saved);assert.equal(f.scene.save(),saved);const envelope=await encodeCompanySave(f.scene.document,catalog,templates);assert.deepEqual(await decodeCompanySave(envelope,catalog,templates),f.scene.document);
    }return{appearances:4,newVersion:2,nondefaultIntensity:7};
  }finally{f.dispose();}
});
await check('wrong wall position, height, yaw, parent and state preserve old scene and saved bytes',()=>{
  const f=fixture();try{const saved=f.scene.save(),root=f.scene.root,cases=[
      [{type:'move',id:'a-wall',transform:{position:[-1,1.145,-2.4],yaw:0}}],
      [{type:'move',id:'a-wall',transform:{position:[-1,2.7,-2.525],yaw:0}}],
      [{type:'move',id:'a-wall',transform:{position:[-1,1.145,-2.525],yaw:Math.PI/4}}],
      [{type:'set-state',id:'a-wall',state:{on:'true'}}],[{type:'set-state',id:'a-wall',state:{intensity:11}}],
      [{type:'set-state',id:'a-wall',state:{reflectionOn:false}}],
    ];for(const ops of cases){assert.throws(()=>f.apply(ops),e=>Boolean(e.code));assert.equal(f.scene.root,root);assert.equal(f.scene.save(),saved);}
    const wrongParent=f.scene.document;wrongParent.nodes.find(n=>n.id==='a-wall').parentId='b-table';assert.throws(()=>deriveCompany(wrongParent,catalog,templates),e=>e.code==='missing-mount-region');return{cases:cases.length+1};
  }finally{f.dispose();}
});
await check('failed candidate wall shader preflight releases the candidate group and preserves old targets and save',()=>{
  const f=fixture();try{f.frame();const oldBindings=f.scene.mirrorBindings().filter(b=>b.ownerId==='a-wall'),oldTargets=oldBindings.map(b=>b.reflector.getRenderTarget()),saved=f.scene.save(),root=f.scene.root;let compiled=0;
    f.renderer.inspectCompile=()=>{if(++compiled===2)f.renderer.debug.onShaderError();};f.control.preflight=({mirrors})=>f.controller.preflight(mirrors,f.renderer,f.world,f.camera,{frameId:2,timeMs:68});
    assert.throws(()=>f.apply([{type:'replace-resource',id:'a-wall',resource:ref(future)}]),e=>e.code==='mirror-shader-failed');assert.equal(f.scene.root,root);assert.equal(f.scene.save(),saved);
    assert.deepEqual(oldBindings.map(b=>b.reflector.getRenderTarget()),oldTargets);assert.equal(mirrorResourceSnapshot().live,3);return{oldTargetsRetained:3,candidateGroupReleased:true};
  }finally{f.dispose();}
});
await check('two-room focus and building round trip retain independent saved states and reassign only visible lights',()=>{
  let document=input();document.scale='rental-home';document=change(document,[{type:'add-room',id:'room-two',parentId:'wall-fixture/floor-1',bounds:{width:7,depth:5.25},transform:{position:[7,0,0],yaw:0}},
    add('z-wall','room-two',walls[0],[3.4,1.145,.5],3*Math.PI/2,{on:true,intensity:4})]);
  document.nodes.find(n=>n.kind==='floor').connections=[{id:'room-link',from:{regionId:'wall-fixture/room-1',edge:'east',offset:0,width:1.4},to:{regionId:'room-two',edge:'west',offset:0,width:1.4}}];
  assert.throws(()=>change(document,[{type:'move',id:'z-wall',transform:{position:[-3.4,1.145,.5],yaw:Math.PI/2}}]),e=>e.code==='wall-display-over-portal');
  const f=fixture(document);try{const saved=f.scene.save();f.scene.setView({mode:'room',roomId:'room-two'});assert.deepEqual(activeLights(f.scene),[{id:'z-wall',intensity:4}]);
    f.scene.setView({mode:'building'});assert.equal(f.scene.snapshot().lights.length,0);assert.equal(f.scene.mirrorBindings().length,0);
    f.scene.setView({mode:'floor'});assert.deepEqual(activeLights(f.scene),[{id:'a-wall',intensity:7},{id:'b-table/mirror',intensity:6}]);assert.equal(f.scene.save(),saved);return{independentStates:[7,4],buildingLights:0,portalInstallationRejected:true};
  }finally{f.dispose();}
});

const resources=mirrorResourceSnapshot();checks.push({name:'all owned reflection targets released',status:resources.live===0?'passed':'failed',resources});
const sourceHashes={};for(const filename of ['docs/COMPANY-MAKEUP-WALL-MIRROR-CONTRACT-v1.txt','prototype/src/company/makeup-wall-mirror-data.js','prototype/src/company/makeup-mirror-data.js','prototype/src/company/mirror-data.js','prototype/src/company/appearance-contract.js','prototype/src/company/mirror-render.js','prototype/src/company/render.js','scripts/company-platform/test-makeup-wall-mirror-data.mjs'])sourceHashes[filename]=hash(await fs.readFile(filename));
const report={status:checks.every(c=>c.status==='passed')?'passed':'failed',checks,sourceHashes,
  limits:['New wall meshes are synthetic fixtures built from source contour data. Actual production GLBs, mounting-plate contact, geometry defects and source adaptation are validated separately.',
    'CPU uses actual Three r187 Reflector with renderer/GL substitutes. No real shader link, framebuffer allocation, reflection pixels or non-emissive receiver lighting was verified.',
    'Save serialization and scene restore are exercised, not a browser process restart. No GPU service, ordinary-computer performance or C3 character acceptance was exercised.']};
await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(report.status!=='passed')process.exitCode=1;
