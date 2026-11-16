import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as THREE from '../prototype/node_modules/three/build/three.module.js';
import {createCharacterAppearance} from '../prototype/src/character-appearance.js';

const root=path.resolve(import.meta.dirname,'..'),out=path.resolve(process.argv[2]);
await fs.mkdir(out,{recursive:false});
const body='027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95';
const checks=[],fixtures=[];
function fixture(){
  const scene=new THREE.Group(),head=new THREE.Bone(),material=new THREE.MeshBasicMaterial();
  material.name='F00_000_HairBack_00_HAIR';
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(.1,.1,.1),material);head.add(mesh);scene.add(head);
  const state={equipped:false,seen:[]};
  const appearance=createCharacterAppearance({vrm:{scene,humanoid:{getRawBoneNode:()=>head}},avatarSha256:body,
    validateHairChange:selection=>{state.seen.push(selection);if(state.equipped&&selection.hairStyle!=='original')throw Error('incompatible equipped fixture');}});
  const f={appearance,state,mesh,material};fixtures.push(f);return f;
}
async function check(name,run){await run();checks.push({name,passed:true});}
let failure;
try{
  await check('already equipped rejects incompatible selection before intent or visibility changes',async()=>{
    const f=fixture();f.state.equipped=true;const before=f.appearance.getState();
    const result=await f.appearance.set({hairStyle:'none'});assert.equal(result.applied,false);
    assert.deepEqual(f.appearance.getState(),before);assert.equal(f.mesh.visible,true);
  });
  await check('equipment appearing after prepare prevents staged whole appearance commit',async()=>{
    const f=fixture(),update=await f.appearance.prepareUpdate({hairStyle:'none',skinTone:'warm'});
    assert(update.commit);f.state.equipped=true;assert.throws(()=>update.commit(),/incompatible/);update.dispose();
    assert.equal(f.appearance.getState().hairStyle,'original');assert.equal(f.appearance.getState().skinTone,'original');assert(f.mesh.visible);
  });
  await check('late independent style intent cannot break newly equipped dependency',async()=>{
    const f=fixture(),update=await f.appearance.prepareUpdate({hairStyle:'none'},{trackIntent:true});
    assert((await f.appearance.set({skinTone:'warm'})).applied);assert.equal(update.isCurrent(),false);
    f.state.equipped=true;assert.throws(()=>update.applyStyleIntent(),/incompatible/);update.dispose();
    assert.equal(f.appearance.getState().hairStyle,'original');assert.equal(f.appearance.getState().skinTone,'warm');assert(f.mesh.visible);
  });
  await check('unloaded equipment permits change and restoration; compatible tint still applies',async()=>{
    const f=fixture();f.state.equipped=true;assert((await f.appearance.set({skinTone:'warm'})).applied);
    f.state.equipped=false;assert((await f.appearance.set({hairStyle:'none'})).applied);assert(!f.mesh.visible);
    assert((await f.appearance.set({hairStyle:'original'})).applied);assert(f.mesh.visible);
  });
  await check('dependency gates remain per instance',async()=>{
    const a=fixture(),b=fixture();a.state.equipped=true;
    assert((await b.appearance.set({hairStyle:'none'})).applied);assert.equal(a.appearance.getState().hairStyle,'original');
    assert(a.mesh.visible);assert(!b.mesh.visible);
  });
}catch(e){failure=String(e.stack??e);process.exitCode=1;}
finally{
  for(const f of fixtures){f.appearance.dispose();f.mesh.geometry.dispose();f.material.dispose();}
  const source=await fs.readFile(path.join(root,'prototype/src/character-appearance.js'));
  await fs.copyFile(import.meta.filename,path.join(out,'executed-check.mjs'));
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify({sourceSha256:createHash('sha256').update(source).digest('hex'),checks,failure,
    scope:'Actual appearance module with a minimal Three mesh and synchronous equipment admission callback. Covers preparation/commit/late intent races; does not establish real hat GLTF fit or browser visuals.'},null,2));
}
console.log(JSON.stringify({checks:checks.length,failure,out}));
