import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFExporter} from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import {createCompanyAssetLibrary} from '../../prototype/src/company/asset-library.js';
import {createCompanyAuthoring} from '../../prototype/src/company/authoring.js';
import {compareFacilityFunction} from '../../prototype/src/company/appearance-contract.js';
import {encodeCompanySave,decodeCompanySave} from '../../prototype/src/company/persistence.js';
import {installNodeImageDecodeShim} from './preflight-library-assets.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const out=path.resolve(process.argv[2]||path.join(root,'output/wall-ambient/runtime'));
const read=async f=>JSON.parse(await fs.readFile(f,'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const publicDir=path.join(root,'prototype/public'), company=path.join(root,'prototype/src/company');
const originalCatalog=await read(path.join(company,'library-catalog.json')),templates=await read(path.join(company,'templates-extended.json'));
const sample=await read(path.join(company,'examples/c1-studio.json'));
const role='ambient-led-and-neon', bytes=new Map();
const rg={id:'wall-ambient-runtime-fixture',version:1,displayName:'Wall ambient fixture',category:'dynamic',mountRole:role,productionBranch:role,
  mount:'wall',parent:'room.wall',mounting:{origin:'center',width:.62,height:.35,depth:.04},coordinates:{units:'metres',up:'+Y',forward:'+Z'},
  usePoints:[],stateDefaults:{on:true,intensity:4,colorHue:30},stateSchema:{on:{type:'boolean'},intensity:{type:'number',min:0,max:8},colorHue:{type:'number',min:0,max:359}},
  stateSemantics:{on:'wall-ambient-enabled-v1',intensity:'wall-ambient-candela-v1',colorHue:'wall-ambient-color-hue-degrees-v1'},
  display:{diffuser:{nodes:['ambient-diffuser'],stateField:'on',offColor:'#e2e0da',onIntensity:1.5}},
  light:{kind:'spot',color:'#e19447',distance:1.6,angle:.60,penumbra:.60,position:[0,0,.04],target:[0,-.56,.70]}};
installNodeImageDecodeShim();
globalThis.FileReader??=class {readAsArrayBuffer(blob){blob.arrayBuffer().then(data=>{this.result=data;this.onloadend?.();});}};
const library=createCompanyAssetLibrary({fetchImpl:async url=>new Response(bytes.get(url)??await fs.readFile(path.join(publicDir,url)))});
const report={assets:[],rejections:[],status:'running'};
function model(){
  const scene=new THREE.Group();
  for(const [name,w,h,d,z] of [['backing',.45,.20,.012,.006],['ambient-diffuser',.42,.034,.024,.025]]){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d).translate(0,0,z),new THREE.MeshStandardMaterial());
    mesh.name=name;scene.add(mesh);
  }
  return scene;
}
async function fixture(id,mutate=()=>{}){
  const scene=model(),resource=structuredClone(rg);mutate(scene,resource);resource.id=id;
  const buffer=Buffer.from(await new GLTFExporter().parseAsync(scene,{binary:true})),url='/fixture/'+id+'.glb';
  resource.asset={format:'glb',url,sha256:sha(buffer),bytes:buffer.length};bytes.set(url,buffer);
  return resource;
}
const fixtureA=await fixture('ambient-fixture-a'),fixtureB=await fixture('ambient-fixture-b',(_s,r)=>{r.light.position[0]=r.light.target[0]=.12;});
const resources=[fixtureA,fixtureB];const catalog={...originalCatalog,resources:[...originalCatalog.resources]};
if(process.argv[3]){
  const family=path.resolve(process.argv[3]);
  for(const id of await fs.readdir(family,{withFileTypes:true})) if(id.isDirectory()){
    for(const version of await fs.readdir(path.join(family,id.name),{withFileTypes:true}))if(version.isDirectory()){
      const p=path.join(family,id.name,version.name),r=await read(path.join(p,'resource.json'));
      bytes.set(r.asset.url,await fs.readFile(path.join(p,'model.glb')));resources.push(r);
    }
  }
  assert(resources.length>2,'The supplied candidate directory contains no real GLB resources');
}else resources.push(...catalog.resources.filter(r=>r.mountRole===role));
for(const r of resources)if(!catalog.resources.some(t=>t.id===r.id&&t.version===r.version))catalog.resources.push(r);
const ref=r=>({id:r.id,version:r.version}),state=(id,patch)=>({type:'set-state',id,state:patch});
const savedItems=new Map(),storage={getItem:k=>savedItems.get(k)??null,setItem:(k,v)=>savedItems.set(k,v)};
let session;
const near=(a,b)=>assert(Math.abs(a-b)<1e-7,a+' vs '+b);
try{
  const legacy=await encodeCompanySave(sample,originalCatalog,templates);assert.deepEqual(await decodeCompanySave(legacy,catalog,templates),sample);
  const doc={...sample,nodes:sample.nodes.filter(n=>n.kind==='floor'||n.kind==='room')};
  const room=doc.nodes.find(n=>n.kind==='room').id;
  function add(id,r,position,yaw=0){doc.nodes.push({id,parentId:room,kind:'facility',resource:r,transform:{position,yaw},state:{}});}
  add('a-ambient',ref(fixtureA),[-1,1.6,-3.4]);add('b-ambient',ref(fixtureA),[-4.4,1.6,1],Math.PI/2);
  add('chair-preserved',{id:'chair-ladder',version:1},[2,0,-1.5]);
  add('y-task',{id:'fill-light',version:1},[-2,0,1.5]);add('z-task',{id:'fill-light',version:1},[2,0,1.5]);
  session=await createCompanyAuthoring(new THREE.Group(),doc,{catalog,templates,assetLibrary:library,storage});
  const [beforeSeat]=session.scene.listUsePoints();assert.equal(beforeSeat.facilityId,'chair-preserved');
  const occupied=await session.scene.retainUsePointContact(beforeSeat.id);
  const host=id=>session.scene.root.getObjectByName(id);
  const spot=id=>host(id).children.find(n=>n.isSpotLight);
  const online=()=>{const names=[];session.scene.root.traverseVisible(n=>{if(n.isSpotLight)names.push(n.parent.name);});assert(names.length<=2);return names.sort();};
  const field=(k,v)=>session.apply([state(k,v)]);
  function inspect(id,r,settings,allocated){
    session.scene.root.updateWorldMatrix(true,true);
    const obj=host(id),light=spot(id),face=obj.getObjectByName('ambient-diffuser'),mat=face.material;
    const emitting=settings.on&&settings.intensity>0;
    const color=new THREE.Color().setHSL(settings.colorHue/360,.72,.58,THREE.SRGBColorSpace).getHexString();
    assert.equal(light.color.getHexString(),color);assert.equal(light.visible,allocated);
    near(light.intensity,allocated?settings.intensity:0);assert.equal(light.castShadow,false);
    near(light.distance,1.6);near(light.angle,.60);near(light.penumbra,.60);near(light.decay,2);
    assert.equal(mat.emissive.getHexString(),emitting?color:'000000');assert.equal(mat.color.getHexString(),emitting?color:'e2e0da');
    near(mat.emissiveIntensity,emitting?1.5*settings.intensity/8:0);
    const source=light.getWorldPosition(new THREE.Vector3()),target=light.target.getWorldPosition(new THREE.Vector3());
    near(source.distanceTo(obj.localToWorld(new THREE.Vector3(...r.light.position))),0);
    near(target.distanceTo(obj.localToWorld(new THREE.Vector3(...r.light.target))),0);
    return {color,source:source.toArray(),beam:target.sub(source).normalize().toArray(),emission:mat.emissiveIntensity};
  }
  session.scene.setWallView({mode:'full'});report.budget={allEnabled:online()};assert.deepEqual(report.budget.allEnabled,['y-task','z-task']);
  const defaultState=fixtureA.stateDefaults;assert.equal(inspect('a-ambient',fixtureA,defaultState,false).color,'e19447');
  await field('z-task',{on:false});report.budget.oneTaskDisabled=online();assert.deepEqual(report.budget.oneTaskDisabled,['a-ambient','y-task']);
  await field('y-task',{on:false});report.budget.bothTasksDisabled=online();assert.deepEqual(report.budget.bothTasksDisabled,['a-ambient','b-ambient']);const unchanged=inspect('b-ambient',fixtureA,defaultState,true);
  assert.notDeepEqual(unchanged.beam,inspect('a-ambient',fixtureA,defaultState,true).beam);
  assert.notEqual(host('a-ambient').getObjectByName('ambient-diffuser').material,host('b-ambient').getObjectByName('ambient-diffuser').material);
  let last=fixtureA;
  for(const r of resources){
    assert(compareFacilityFunction(last,r).compatible);
    const settings={on:true,intensity:6,colorHue:210};await field('a-ambient',settings);
    const before=session.document.nodes.find(n=>n.id==='a-ambient');
    await session.apply([{type:'replace-resource',id:'a-ambient',resource:ref(r)}]);
    const after=session.document.nodes.find(n=>n.id==='a-ambient');assert.deepEqual({...before,resource:ref(r)},after);
    const observed=inspect('a-ambient',r,settings,true);
    assert.deepEqual(inspect('b-ambient',fixtureA,defaultState,true),unchanged);
    const switches=[];
    for(const setting of [{...settings,on:false},{...settings,intensity:0},{on:true,intensity:8,colorHue:359},{on:true,intensity:1,colorHue:0}]){
      await field('a-ambient',setting);const pose=inspect('a-ambient',r,setting,setting.on&&setting.intensity>0);
      switches.push({state:setting,diffuserIntensity:pose.emission,lightIntensity:spot('a-ambient').intensity,shaderLight:spot('a-ambient').visible,color:pose.color});
    }
    report.assets.push({id:r.id,sha256:r.asset.sha256,switches,...observed});last=r;
  }
  await field('a-ambient',{on:true,intensity:6,colorHue:210});
  const initial=session.document,save=await session.export();
  session.scene.setWallView({mode:'cutaway',cameraPosition:[0,1.5,-8]});
  assert(!host('a-ambient').visible);assert(!spot('a-ambient').visible);
  session.scene.setWallView({mode:'full'});inspect('a-ambient',last,{on:true,intensity:6,colorHue:210},true);
  assert.equal(session.scene.resolveUsePoint(beforeSeat.id).chairSeat,beforeSeat.chairSeat);
  assert.equal(session.scene.resolveUsePoint(beforeSeat.id).chairBack,beforeSeat.chairBack);
  report.wallCutaway={hostHidden:true,spotExcluded:true,persistentLayoutUnchanged:true,retainedSeat:beforeSeat.id};
  session.scene.releaseUsePointContact(occupied);
  assert.equal(await session.export(),save);await session.save();
  await field('a-ambient',{on:false,colorHue:0});await session.restore(initial.id);
  assert.deepEqual(session.document,initial);assert.equal(await session.export(),save);
  for(const patch of [{on:1},{intensity:-1},{intensity:9},{colorHue:360},{colorHue:-1},{colorHue:'30'}]){
    await assert.rejects(field('a-ambient',patch),{code:'invalid-device-state'});assert.equal(await session.export(),save);
  }
  async function reject(name,code,mutate){
    const r=await fixture('bad-wall-ambient-'+name,mutate);
    await assert.rejects(library.preload([r]),e=>{assert.equal(e.code,code);assert(e.path);report.rejections.push({name,code,path:e.path});return true;});
  }
  await reject('missing-face','invalid-wall-ambient-diffuser',s=>s.children[1].name='old-face');
  await reject('shared-material','invalid-wall-ambient-diffuser',s=>s.children[0].material=s.children[1].material);
  await reject('embedded-light','invalid-wall-ambient-embedded-light',s=>s.add(new THREE.PointLight(0xffffff,1)));
  await reject('emissive-housing','invalid-wall-ambient-diffuser',s=>s.children[0].material.emissive.set('#f0f0c0'));
  await reject('floating','invalid-wall-ambient-backing',s=>s.children[0].position.z=.003);
  await reject('overhang','invalid-wall-ambient-envelope',s=>s.children[0].position.x=.25);
  await reject('source-misses-face','invalid-wall-ambient-calibration',(_s,r)=>r.light.position[0]=r.light.target[0]=.27);
  await reject('covered-emitter','invalid-wall-ambient-calibration',s=>{const cap=s.children[0].clone();cap.name='opaque-cap';cap.scale.z=.15;cap.position.z=.038;s.add(cap);});
  await reject('wrong-direction','invalid-wall-ambient-optics',(_s,r)=>r.light.target[1]+=.1);
  await reject('injected-seat','invalid-wall-ambient-contract',(_s,r)=>r.usePoints.push({id:'chair'}));
  const wrong=structuredClone(last);wrong.light.target[1]+=.1;assert(!compareFacilityFunction(last,wrong).compatible);
  report.savedSha256=sha(save);report.status='passed';
  await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,assets:report.assets.map(a=>a.id),rejections:report.rejections.length}));
}finally{session?.dispose();library.dispose();}
