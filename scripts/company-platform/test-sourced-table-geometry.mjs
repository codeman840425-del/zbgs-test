import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {BoxGeometry,Mesh} from '../../prototype/node_modules/three/build/three.module.js';
import {isTexturedRoundTable,validateTexturedRoundTable} from '../../prototype/src/company/textured-table-geometry.js';

const directory = new URL('../../prototype/public/company-assets/sourced-side-table-v1/side-table-carved-round/v1/',import.meta.url);
const resource = JSON.parse(await fs.readFile(new URL('resource.json',directory)));
const bytes = await fs.readFile(new URL('model.glb',directory));
globalThis.self ??= globalThis;
globalThis.createImageBitmap ??= async () => ({width:1,height:1,close() {}});
const {scene} = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'');
const fail = (code,where,message) => {throw Object.assign(Error(message),{code,where});};
const validate = root => validateTexturedRoundTable(root,resource,fail);
assert(isTexturedRoundTable(resource));
assert.equal(isTexturedRoundTable({...resource,id:'side-table-round'}),false);
const report = validate(scene);
assert(report.triangles <= 2500 && report.connectedParts > 1);
const checks = [];
function rejected(reason,change,code) {
  const copy = scene.clone(true);
  const body = copy.getObjectByName('sourced-side-table-body');
  change(copy,body);
  assert.throws(()=>validate(copy),{code});
  checks.push({reason,code});
}
rejected('A duplicate support patch is rejected',copy=>{
  const duplicate = copy.getObjectByName('side-table-top').clone();
  duplicate.name='uncut-top';
  copy.add(duplicate);
},'side-table-duplicate-top');
rejected('An isolated body component is rejected',(copy,body)=>{
  const detached = new Mesh(new BoxGeometry(.014,.014,.014),body.material);
  detached.position.set(.23,.2,.14);
  copy.add(detached);
},'side-table-detached');
rejected('Loss of the actual wood texture is rejected',(_copy,body)=>{
  body.material=body.material.clone();
  body.material.map=null;
},'side-table-source-material');
rejected('Foot area disappearing from one quarter is rejected',(_copy,body)=>{
  body.geometry=body.geometry.clone();
  const p=body.geometry.attributes.position;
  for(let i=0;i<p.count;i++) if(p.getX(i)>0 && p.getZ(i)>0 && p.getY(i)<.002) p.setY(i,p.getY(i)+.006);
},'side-table-floor-support');
console.log(JSON.stringify({report,checks,scope:'CPU triangle and material checks. Image decoding is verified in the browser.'},null,2));
