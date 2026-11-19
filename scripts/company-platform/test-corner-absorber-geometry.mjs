import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as T from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {inspectCornerAbsorberModel as inspect} from '../../prototype/src/company/corner-absorber-geometry.js';
import {installNodeImageDecodeShim} from './preflight-library-assets.mjs';
import {checkManagedOutput} from './package-company.mjs';

// The optional trial is produced by build-corner-absorber.mjs --parameters ... --output ...
const [outputFile, trialDirectory, ...extra]=process.argv.slice(2);
assert(outputFile && !extra.length,'Use test-corner-absorber-geometry.mjs NEW_REPORT_JSON [FIVE_TIER_TRIAL_DIRECTORY]');
const root=path.resolve(import.meta.dirname,'../..'),out=path.resolve(outputFile);
await checkManagedOutput(out,root,{allowDelivery:false});
installNodeImageDecodeShim();
const family='prototype/public/company-assets/corner-absorber-v1';
const ids=['triangular','column','segmented','upholstered'].map(k=>'corner-absorber-'+k);
const locations=ids.map(id=>path.join(root,family,id,'v1'));
if(trialDirectory)locations.push(path.resolve(trialDirectory,family,'corner-absorber-segmented','v2'));
const cases=[],models=[];
let card,scene;
const fail=(code,id,message)=>{throw Object.assign(Error(message),{code,id});};
for(const location of locations){
  const r=JSON.parse(await fs.readFile(path.join(location,'resource.json'))),b=await fs.readFile(path.join(location,'model.glb'));
  assert.equal(createHash('sha256').update(b).digest('hex'),r.asset.sha256,r.id);
  const s=(await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'')).scene;
  const measurement=inspect(s,r,T,fail);models.push({id:r.id,version:r.version,sha256:r.asset.sha256,...measurement});
  if(r.id.endsWith('-upholstered')){card=r;scene=s;}
}
function test(label,s,code){
  let caught;try{inspect(s,card,T,fail);}catch(e){caught=e;}
  assert.equal(caught?.code,code,label+' '+caught?.message);cases.push({label,code:code??null});
}
const anonymous=scene.clone(true);anonymous.traverse(n=>{n.name='';});test('renamed GLB',anonymous);
const detached=scene.clone(true),body=detached.getObjectByName('body'),ratio=.96;
body.scale.y=ratio;body.position.y=2.2*(1-ratio);
test('upper unit raised clear of shelf while its height still overlaps the rails',detached,'corner-absorber-geometry-support');
const missing=scene.clone(true);const zRail=missing.getObjectByName('z-rail');zRail.removeFromParent();
function rail(parent,lo,hi){
 const m=new T.Mesh(new T.BoxGeometry(.0375,hi-lo,.0208),new T.MeshStandardMaterial());
 m.position.set(.145,(lo+hi)/2,.0104);parent.add(m);return m;
}
const hardware=missing.getObjectByName('hardware');
rail(hardware,0,.82);rail(hardware,.83,2.10);rail(hardware,0,.82);
test('10 mm break in wall-facing rail, with overlapping duplicate steel below',missing,'corner-absorber-geometry-bearing');
const fake=scene.clone(true),outer=fake.getObjectByName('x-rail');
outer.removeFromParent();const sheet=new T.Mesh(new T.PlaneGeometry(.0375,2.10),new T.MeshStandardMaterial({side:T.DoubleSide}));
sheet.rotation.y=-Math.PI/2;sheet.position.set(0,1.05,.145);fake.getObjectByName('hardware').add(sheet);
test('a double-sided flat label substitutes for one wall bearing',fake,'corner-absorber-geometry-bearing');
const inside=scene.clone(true);inside.getObjectByName('body').position.x=-.06;
test('core protrudes behind the inner wall plane',inside,'corner-absorber-geometry-envelope');
await fs.mkdir(path.dirname(out),{recursive:true});
await fs.writeFile(out,JSON.stringify({status:'passed',models,cases},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({models:models.length,cases:cases.length,output:out}));
