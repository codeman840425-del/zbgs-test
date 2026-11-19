import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as T from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {inspectGlassPartitionModel} from '../../prototype/src/company/glass-partition-geometry.js';

const root=new URL('../../',import.meta.url);
const collection=JSON.parse(await fs.readFile(new URL('collection.json',import.meta.url)));
const examples=new Map();
for(const row of collection.resources){
  const bytes=await fs.readFile(new URL(row.modelPath,root));
  const resource=JSON.parse(await fs.readFile(new URL(row.resourcePath,root)));
  const model=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
  assert.deepEqual(JSON.parse(JSON.stringify(inspectGlassPartitionModel(model,resource,T))),row.inspection);
  examples.set(resource.glassPartition.construction,{model,resource});
}
const checks=[];
function rejected(label,kind,change,reason){
  const {model,resource}=examples.get(kind),edited=model.clone(true);
  change(edited);
  assert.throws(()=>inspectGlassPartitionModel(edited,resource,T),reason);
  checks.push(label);
}
rejected('suspended head web','clear',m=>m.getObjectByName('head-web').position.y-=.008,/bearing|centred/);
rejected('missing framed pane','framed',m=>m.getObjectByName('pane-c1-r2').removeFromParent(),/Unfilled opening/);
rejected('disconnected glass edge','framed',m=>m.getObjectByName('pane-c1-r2').position.y+=.01,/edge misses/);
rejected('opaque face marked clear','clear',m=>m.getObjectByName('head-web').userData.glazingRole='pane',/opaque structural face/);
rejected('privacy marked clear','frosted',m=>m.getObjectByName('pane-c2-r1').userData.glazingRole='pane',/optical role/);
rejected('zero-thickness glass','clear',m=>m.getObjectByName('pane-c1-r1').scale.z=0,/solid thickness/);
rejected('opaque backing behind clear panel','clear',m=>{
  const back=new T.Mesh(new T.BoxGeometry(2.4,2.68,.003),new T.MeshStandardMaterial());
  back.position.set(0,1.4,.02);m.add(back);
},/opaque object/);
console.log(JSON.stringify({valid:examples.size,rejected:checks}));
