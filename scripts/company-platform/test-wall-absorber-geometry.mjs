import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {BoxGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial, PlaneGeometry} from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {installNodeImageDecodeShim} from './preflight-library-assets.mjs';
import {validateWallAbsorberGeometry,validateWallAbsorberResource} from '../../prototype/src/company/wall-absorber.js';

const root = new URL('../../',import.meta.url);
const data = await fs.readFile(new URL('prototype/src/company/library-catalog.json',root),'utf8');
const catalog = JSON.parse(data);
const fixed = {id:'probe',mountRole:'wall-absorber-panel',productionBranch:'wall-absorber-panel',mount:'wall',
  category:'decor',asset:{format:'glb'},mounting:{width:.6,height:1.2,depth:.08,origin:'center'},usePoints:[],stateDefaults:{}};
function fail(code, path, message) { throw Object.assign(Error(message),{code,path}); }
const validate = scene => validateWallAbsorberGeometry(scene,fixed,fail);
const material = new MeshStandardMaterial({side:DoubleSide});
function sample() {
  const scene=new Group(), board=new Mesh(new BoxGeometry(.6,1.2,.06),material);
  board.position.z=.03; scene.add(board);
  return scene;
}
const valid = validate(sample());
assert(Math.abs(valid.contactArea - .72)<1e-5 && valid.sideArea>.2 && valid.frontArea>.7);
const raised=sample();raised.children[0].position.z+=.005;
assert.throws(()=>validate(raised),{code:'wall-absorber-back-contact'});
const buried=sample();buried.children[0].position.z-=.005;
assert.throws(()=>validate(buried),{code:'wall-absorber-envelope'});
const flat=new Group(), face=new Mesh(new PlaneGeometry(.6,1.2),material);
const front=face.clone();front.position.z=.06;flat.add(face,front);
assert.throws(()=>validate(flat),{code:'wall-absorber-relief'});
const hidden=sample();hidden.visible=false;flat.add(hidden);
assert.throws(()=>validate(flat),{code:'wall-absorber-relief'});
assert.throws(()=>validateWallAbsorberResource({...fixed,mounting:{...fixed.mounting,depth:.001}},fail),{code:'invalid-wall-absorber-contract'});

const loader=new GLTFLoader(), results=[];
installNodeImageDecodeShim();
for(const resource of catalog.resources.filter(r=>r.productionBranch==='wall-absorber-panel')){
  validateWallAbsorberResource(resource,fail);
  const bytes=await fs.readFile(new URL('prototype/public'+resource.asset.url,root));
  const {scene}=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'');
  results.push({id:resource.id,version:resource.version,...validateWallAbsorberGeometry(scene,resource,fail)});
}
if (!process.argv.includes('--probe-only')) {
  for(const suffix of ['honeyfelt','timber','upholstered','foam'])
    assert(results.some(r=>r.id==='wall-absorber-'+suffix && r.version===1),'Missing registered 3D panel '+suffix);
}
console.log(JSON.stringify({status:'passed',geometryRejections:4,contractRejections:1,installed:results}));
