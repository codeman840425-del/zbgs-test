import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {Box3, Raycaster, Vector3} from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {compareFacilityFunction} from '../../prototype/src/company/appearance-contract.js';
import {createCompany,prepareCompanyChange} from '../../prototype/src/company/document.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
import {validateSupportGeometry} from '../../prototype/src/company/support-geometry.js';
import {preflightLibraryAssets} from './preflight-library-assets.mjs';
import {fileURLToPath} from 'node:url';

const root=new URL('../../',import.meta.url);
const read=name=>fs.readFile(new URL(name,root));
const data=async name=>JSON.parse(await read(name));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const near=(a,b,tol=1e-5)=>assert(Math.abs(a-b)<tol,a+' != '+b);
const round=n=>Number(n.toFixed(6));
const xyz=v=>v.toArray().map(round);
const bounds=object=>new Box3().setFromObject(object,true);
const boxRecord=b=>({min:xyz(b.min),max:xyz(b.max)});
const family='assets-source/company-sofa-textile-host-v1';
const recipe=await data(family+'/parameters.json');
const catalog=await data('prototype/src/company/library-catalog.json');
const templates=await data('prototype/src/company/templates-extended.json');
const originalIds=[['lounge-sofa',1],['lounge-sofa',2],['timber-sofa',1],['sofa-modular',1],['sofa-arch',1]];
const originals=[],hosts=[],retained=[],sources=new Map(),resources=[];
const surface={id:'textile-rest',center:[1.18,0],topY:.70,halfSize:[.22,.21],clearanceHeight:.15};
const footprint={center:[.16,0],halfSize:[1.26,.42],blocking:true};

async function glb(resource){
  const bytes=await read('prototype/public'+resource.asset.url);
  assert.equal(hash(bytes),resource.asset.sha256);assert.equal(bytes.length,resource.asset.bytes);
  const scene=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
  scene.updateMatrixWorld(true);return scene;
}
function hit(object,origin,direction){
  const ray=new Raycaster(new Vector3(...origin),new Vector3(...direction));
  const first=ray.intersectObject(object,false)[0]; assert(first,'Missing actual mesh contact on '+object.name);
  return first.point;
}
function checkSeats(scene,r){
  assert.equal(r.usePoints.length,2);
  return r.usePoints.map(p=>{
    const [x,,z]=p.position,seat=scene.getObjectByName(p.seatNodeId),back=scene.getObjectByName(p.backNodeId);
    const seatHit=hit(seat,[x,1.5,z],[0,-1,0]),backHit=hit(back,[x,.72,.5],[0,0,-1]);
    near(seatHit.y,p.seatHeight); near(p.seatHeight,.47);near(Math.abs(x),.48);
    assert(backHit.z<-.26&&backHit.z>-.33);assert.deepEqual(p.clearance,{width:.92,depth:1.11});
    return {id:p.id,seat:xyz(seatHit),back:xyz(backHit),approach:p.approach,exit:p.exit,
      useX:[round(x-p.clearance.width/2),round(x+p.clearance.width/2)]};
  });
}
for(const [id,version] of originalIds){
  const r=catalog.resources.find(r=>r.id===id&&r.version===version),scene=await glb(r);
  sources.set(id+'@'+version,{r,scene});
  const arms=[];scene.traverse(n=>{if(n.isMesh&&/arm-right$/.test(n.name))arms.push(n);});assert.equal(arms.length,1);
  const b=bounds(arms[0]),top=hit(arms[0],[(b.min.x+b.max.x)/2,1.5,0],[0,-1,0]);
  const back=bounds(scene.getObjectByName('back-right'));
  assert(!r.supportSurfaces?.length && b.max.x-b.min.x<.36 && back.max.z-back.min.z<.36);
  originals.push({id,version,sha256:r.asset.sha256,bounds:boxRecord(bounds(scene)),seats:checkSeats(scene,r),
    rightArm:{name:arms[0].name,bounds:boxRecord(b),topAtCentre:xyz(top)},backDepth:round(back.max.z-back.min.z)});
}

for(const design of recipe.designs){
  const r=await data('prototype/public/company-assets/sofa-textile-host-v1/'+design.id+'/v'+design.version+'/resource.json');
  const scene=await glb(r),original=JSON.parse(await read(design.original)),source=sources.get(original.id+'@'+original.version);
  assert.equal(r.mountRole,'sofa');assert.equal(r.productionBranch,'sofa-textile-host');
  assert.deepEqual(r.footprint,footprint);assert.deepEqual(r.supportSurfaces,[surface]);assert.deepEqual(r.supportNodes,{'textile-rest':'textile-rest-arm'});
  assert.deepEqual(r.usePoints,original.usePoints);assert.deepEqual(r.stateDefaults,original.stateDefaults);
  const seatChecks=checkSeats(scene,r);assert.deepEqual(seatChecks,checkSeats(source.scene,original));
  let retainedMeshes=0,retainedVertices=0;
  source.scene.traverse(before=>{
    if(!before.isMesh||before.name===design.armToReplace)return;
    const after=scene.getObjectByName(before.name);assert(after?.isMesh);
    const old=before.geometry.attributes.position,next=after.geometry.attributes.position;
    assert.equal(old.count,next.count);
    for(let i=0;i<old.count;i++){
      const a=before.localToWorld(new Vector3().fromBufferAttribute(old,i)),b=after.localToWorld(new Vector3().fromBufferAttribute(next,i));
      near(a.distanceTo(b),0);
    }
    retainedMeshes++;retainedVertices+=old.count;
  });
  assert.equal(scene.getObjectByName(design.armToReplace),undefined);
  const arm=scene.getObjectByName('textile-rest-arm'),armBox=bounds(arm),sceneBox=bounds(scene);
  assert.equal(arm.material,scene.getObjectByName('seat-right').material);
  near(armBox.min.x,.94);near(armBox.max.x,1.42);near(armBox.min.y,0);near(armBox.max.y,.7);
  near(sceneBox.min.x,-1.1,.006);near(sceneBox.max.x,1.42);near(sceneBox.min.z,-.42);near(sceneBox.max.z,.42);
  const actual=validateSupportGeometry(scene,r,(code,p,message)=>{throw Error(code+' '+p+' '+message);});
  assert.equal(actual.surfaces[0].triangles,2);near(actual.bottomY,0);
  const supportSamples=[];
  for(const x of [.96,1.18,1.4])for(const z of [-.21,0,.21]){
    const top=hit(arm,[x,.95,z],[0,-1,0]),bottom=hit(arm,[x,-.15,z],[0,1,0]);
    near(top.y,.70);near(bottom.y,0);supportSamples.push({top:xyz(top),bottom:xyz(bottom)});
  }
  const orientations=[0,Math.PI/2].map(yaw=>{
    const hx=yaw===0?.2:.18,hz=yaw===0?.18:.2;
    assert(hx<=surface.halfSize[0]&&hz<=surface.halfSize[1]);
    const marginToSeat=surface.center[0]-hx-seatChecks[1].useX[1];
    assert(marginToSeat>.039);return {yaw:round(yaw),marginToRightSeatX:round(marginToSeat)};
  });
  assert.equal(compareFacilityFunction(original,r).compatible,false);
  retained.push({sourceId:original.id,resource:r.id,unchangedMeshes:retainedMeshes,unchangedVertices:retainedVertices});
  hosts.push({resource:r.id,sha256:r.asset.sha256,bounds:boxRecord(sceneBox),arm:boxRecord(armBox),support:actual,
    seats:seatChecks,supportSamples,childEnvelope:{width:.4,height:.15,depth:.36,orientations}});
  resources.push(r);
}
assert(compareFacilityFunction(resources[0],resources[1]).compatible);
await preflightLibraryAssets({root:fileURLToPath(root),resources});
const working={...catalog,resources:[...catalog.resources.filter(r=>!resources.some(host=>r.id===host.id&&r.version===host.version)),...resources]};
const doc=createCompany({id:'two-usable-sofa-places'},working);
doc.nodes[0].transform={position:[3,0,-2],yaw:Math.PI/2};
doc.nodes.push({id:'test-sofa',kind:'facility',parentId:doc.nodes[1].id,resource:{id:resources[0].id,version:1},
  state:{},transform:{position:[.4,0,-.3],yaw:Math.PI/2}});
let current=doc;
for(const r of resources){
  const {document}=prepareCompanyChange(current,[{type:'replace-resource',id:'test-sofa',resource:{id:r.id,version:1}}],{catalog:working,templates});
  const audit=inspectCompanyPlacement(document,working,templates);
  assert.equal(audit.checkedPoints.length,2);assert(audit.checkedPoints.every(p=>p.approachConnected&&p.exitConnected));current=document;
}
const result={status:'passed',scope:'Actual static seat/back triangles, declared two-person use spaces, visible upholstered arm and shared navigation footprint. Character animation was outside this CPU test.',
  originals,hosts,retained,sharedSurface:surface,sharedFootprint:footprint,compatibleNewHosts:true,
  publicPreflight:true,rotatedFloorAndSofaApproachesAndExits:2};
await fs.mkdir(new URL('output/',root),{recursive:true});
await fs.writeFile(new URL('output/sofa-textile-host-geometry-v1.json',root),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,originals:originals.length,hosts:hosts.length,receipt:'output/sofa-textile-host-geometry-v1.json'}));
