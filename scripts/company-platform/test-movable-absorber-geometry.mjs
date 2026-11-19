import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {parseArgs} from 'node:util';
import * as T from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {mergeGeometries} from '../../prototype/node_modules/three/examples/jsm/utils/BufferGeometryUtils.js';
import {checkManagedOutput} from './package-company.mjs';
import {validateMovableAbsorberGeometry,validateMovableAbsorberResource} from '../../prototype/src/company/movable-absorber.js';

const args=parseArgs({options:{v2:{type:'string'},output:{type:'string'}}}).values;
const root=path.resolve(import.meta.dirname,'../..');
let reportFile;
if(args.output){
  const out=path.resolve(args.output);
  reportFile=path.join(out,'report.json');
  await checkManagedOutput(out,root,{allowDelivery:false});
  await checkManagedOutput(reportFile,root,{allowDelivery:false});
  const stat=p=>fs.lstat(p).catch(e=>{if(e.code!=='ENOENT')throw e;});
  for(let dir=out;;dir=path.dirname(dir)){
    const entry=await stat(dir);
    assert(!entry || (entry.isDirectory() && !entry.isSymbolicLink()),'Expected a directory without links: '+dir);
    if(path.dirname(dir)===dir)break;
  }
  assert(!await stat(reportFile),'Geometry report already exists: '+reportFile);
}
const hash=b=>createHash('sha256').update(b).digest('hex'), checkFile=path.join(root,'prototype/src/company/movable-absorber.js');
const report={checkerSha256:hash(await fs.readFile(checkFile)),models:[],cases:[]};
const fail=(code,location,message)=>{throw Object.assign(Error(message),{code,location});};
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const catalog=await read(path.join(root,'prototype/src/company/library-catalog.json'));
const list=catalog.resources.filter(r=>r.productionBranch==='movable-absorber-screen' && r.version===1);
assert.deepEqual(list.map(r=>r.id).sort(),['absorber-casters','absorber-curved','absorber-double-sided','absorber-folding']);
const baselines=list.map(r=>({card:r,model:path.join(root,'prototype/public',r.asset.url)}));
if(args.v2){
  const dir=path.resolve(args.v2),card=await read(path.join(dir,'resource.json'));
  assert.equal(card.id,'absorber-folding');assert.equal(card.version,2);
  baselines.push({card,model:path.join(dir,'model.glb')});
}
let sample,card;
for(const row of baselines){
  const bytes=await fs.readFile(row.model),r=row.card; assert.equal(hash(bytes),r.asset.sha256);
  const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'');
  validateMovableAbsorberResource(r,fail);
  try{
    const measurements=validateMovableAbsorberGeometry(scene,r,fail);
    report.models.push({id:r.id,version:r.version,sha256:r.asset.sha256,measurements,passed:true});
  }catch(e){report.models.push({id:r.id,version:r.version,sha256:r.asset.sha256,passed:false,code:e.code,reason:e.message});}
  if(r.id==='absorber-double-sided'){sample=scene;card=r;}
}
assert(sample);
const material=new T.MeshStandardMaterial(),v=(x,y,z)=>new T.Vector3(x,y,z);
const clone=()=>sample.clone(true);
function addBox(scene,[x,y,z],[w,h,d]){
  const node=new T.Mesh(new T.BoxGeometry(w,h,d),material);node.position.set(x,y,z);scene.add(node);return node;
}
function withoutFeet(){
  const scene=clone();for(const suffix of ['left','right'])scene.getObjectByName('steel-foot-'+suffix).removeFromParent();return scene;
}
function feetOnly(){
  const scene=new T.Group();sample.updateMatrixWorld(true);
  for(const side of ['left','right']){
    const m=sample.getObjectByName('steel-foot-'+side);
    scene.add(new T.Mesh(m.geometry.clone().applyMatrix4(m.matrixWorld),material));
  }
  return scene;
}
function withDetachedSupports(){
  const scene=withoutFeet();
  for(const x of [-.40,.40])for(const z of [-.16,.16])addBox(scene,[x,.04,z],[.24,.08,.06]);
  return scene;
}
function joinedDrawCall(scene){
  scene.updateMatrixWorld(true);const geometries=[];
  scene.traverseVisible(mesh=>{
    if(!mesh.isMesh)return;
    const g=(mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone()).applyMatrix4(mesh.matrixWorld);
    for(const k of Object.keys(g.attributes))if(k!=='position')g.deleteAttribute(k);
    geometries.push(g);
  });
  const result=new T.Group();result.add(new T.Mesh(mergeGeometries(geometries),material));return result;
}
function check(label,scene,shouldPass,details={}){
  let measurements,error;
  try{measurements=validateMovableAbsorberGeometry(scene,card,fail);}catch(e){error=e;}
  report.cases.push({label,expect:shouldPass?'accept':'reject',actual:error?'reject':'accept',passed:shouldPass===!error,
    ...(error?{code:error.code,reason:error.message}:{measurements}),...details});
}
check('same solids in one unnamed draw call',joinedDrawCall(clone()),true);
const raised=clone();raised.position.y=.018;check('entire actual screen floats 18 mm',raised,false);
const narrow=clone();narrow.scale.z=.12/.38;check('0.12m card understates actual deployed depth',narrow,false);
const oneSide=clone();oneSide.getObjectByName('steel-foot-left').position.x=.22;
check('both actual feet on right of centre',oneSide,false);
const floating=clone();
for(const side of ['left','right'])floating.getObjectByName('steel-foot-'+side).scale.y=.5;
check('gap above two ground soles',floating,false);
const gap={footZ:[[-.19,-.13],[.13,.19]],upperAtBaseZ:[-.06,.06],horizontalAirGapM:.07,overlappingHeightM:.02};
check('four detached soles overlap the panel in height',withDetachedSupports(),false,gap);
check('detached solids exported as one mesh',joinedDrawCall(withDetachedSupports()),false,gap);
const films=feetOnly();
for(const z of [-.035,.035]){
  const sheet=new T.Mesh(new T.PlaneGeometry(1.20,1.74),new T.MeshStandardMaterial({side:T.DoubleSide}));
  sheet.position.set(0,.93,z);films.add(sheet);
}
addBox(films,[-.58,.93,0],[.04,1.74,.075]);
check('two separate films plus one real edge spar',films,false);
const painting=feetOnly(),face=new T.Mesh(new T.PlaneGeometry(1.20,1.74),material);face.position.y=.93;painting.add(face);
check('single front surface on actual feet',painting,false);
const falseFeet=withoutFeet();
const paper=new T.Mesh(new T.PlaneGeometry(.96,.38),new T.MeshStandardMaterial({side:T.DoubleSide}));
paper.rotation.x=-Math.PI/2;falseFeet.add(paper);addBox(falseFeet,[.38,.042,0],[.04,.084,.04]);
check('floor image fakes support around a single off-centre post',falseFeet,false);
report.status=[...report.models,...report.cases].every(x=>x.passed)?'passed':'failed';
if(reportFile){await fs.mkdir(path.dirname(reportFile),{recursive:true});await fs.writeFile(reportFile,JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
console.log(JSON.stringify({status:report.status,models:report.models.map(r=>[r.id,r.version,r.passed]),cases:report.cases.map(r=>[r.label,r.actual,r.passed]),reportFile},null,2));
if(report.status!=='passed')process.exitCode=1;
