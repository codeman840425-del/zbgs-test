import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {createMakeupWallMirrorSample} from '../../prototype/src/company/makeup-wall-mirror-samples.js';
import {deriveCompany} from '../../prototype/src/company/document.js';
import {inspectCompanyPlacement} from '../../prototype/src/company/placement.js';
import {createCompanyScene} from '../../prototype/src/company/render.js';
import {createCompanyAssetLibrary} from '../../prototype/src/company/asset-library.js';
import {compareFacilityFunction} from '../../prototype/src/company/appearance-contract.js';
const root=new URL('../../',import.meta.url),read=async p=>JSON.parse(await fs.readFile(new URL(p,root)));
const catalog=await read('prototype/src/company/library-catalog.json'),templates=await read('prototype/src/company/templates-extended.json');
const mirrors=catalog.resources.filter(r=>r.mountRole==='makeup-mirror-wall'),checks=[];
const report={status:'running',checks,limits:['Actual GLB/scene graph CPU checks. GPU preflight is deliberately stubbed. Browser reflection, illumination, process restart, C3 and ordinary-PC performance require separate evidence.']};
const library=createCompanyAssetLibrary({fetchImpl:async url=>{const bytes=await fs.readFile(new URL('prototype/public'+url,root));return{ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};}});
let scene;
const ref=r=>({id:r.id,version:r.version});
async function check(name,fn){checks.push({name,passed:true,result:await fn()});}
function apply(ops){let handle;try{handle=scene.prepareChange(ops);return scene.commit(handle);}finally{if(handle)scene.discard(handle);}}
try {
  await check('Four distinct wall appearances and both room layouts fit actual installation and unchanged functional rules',()=>{
    assert.equal(mirrors.length,4);assert.equal(new Set(mirrors.map(r=>r.asset.sha256)).size,4);
    const result=[];
    for(let index=0;index<4;index++)for(const alternate of [false,true]) {
      assert(compareFacilityFunction(mirrors[0],mirrors[index]).compatible);
      const {document}=createMakeupWallMirrorSample(catalog,templates,{index,alternate});
      const d=deriveCompany(document,catalog,templates);inspectCompanyPlacement(document,catalog,templates);
      const walls=d.facilities.filter(f=>f.resource.mountRole==='makeup-mirror-wall');assert.equal(walls.length,alternate?2:1);
      assert(walls.every(f=>d.nodes.get(f.node.parentId).kind==='room'));
      result.push({index,alternate,resources:walls.map(f=>({id:f.id,resource:f.node.resource,world:f.world}))});
    }return result;
  });
  const sample=createMakeupWallMirrorSample(catalog,templates).document;
  await library.preload([...deriveCompany(sample,catalog,templates).facilities.map(f=>f.resource),...mirrors]);
  scene=createCompanyScene(new THREE.Scene(),sample,{catalog,templates,assetLibrary:library,mirrorPreflight:()=>{}});
  await check('Every actual wall GLB swaps independently of table and seat and round-trips nondefault state',()=>{
    const before=scene.document.nodes.filter(n=>n.id!=='makeup-wall/primary'),results=[];
    for(const r of mirrors) {
      apply([{type:'replace-resource',id:'makeup-wall/primary',resource:ref(r)}]);
      assert.deepEqual(scene.document.nodes.filter(n=>n.id!=='makeup-wall/primary'),before);
      const n=scene.document.nodes.find(n=>n.id==='makeup-wall/primary');assert.deepEqual(n.state,{on:true,intensity:7});
      const object=scene.root.getObjectByName(n.id);assert(object.getObjectByName('makeup-wall-mount')?.isMesh);assert(!object.getObjectByName('makeup-base'));
      assert.equal(scene.mirrorBindings().length,r.mirrorPanels.length);
      const saved=scene.save();scene.restore(saved);assert.equal(scene.save(),saved);
      results.push({resource:ref(r),panels:r.mirrorPanels.length,state:n.state});
    }return results;
  });
  await check('North and east wall transforms place actual spotlight, target and reflection planes consistently; bad wall move preserves scene',async()=>{
    const doc=createMakeupWallMirrorSample(catalog,templates,{alternate:true,index:2}).document;
    await library.preload(deriveCompany(doc,catalog,templates).facilities.map(f=>f.resource));scene.restore(JSON.stringify(doc));
    const derived=deriveCompany(scene.document,catalog,templates),result=[];
    for(const id of ['makeup-wall/primary','makeup-wall/secondary']) {
      const object=scene.root.getObjectByName(id),light=object.children.find(n=>n.isSpotLight);assert(light);assert.equal(light.castShadow,false);
      assert(object.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(...derived.worlds.get(id).position))<1e-8);
      for(const [target,local]of [[light,mirrors[0].light.position],[light.target,mirrors[0].light.target]])assert(target.getWorldPosition(new THREE.Vector3()).distanceTo(object.localToWorld(new THREE.Vector3(...local)))<1e-8);
      result.push({id,light:light.getWorldPosition(new THREE.Vector3()).toArray(),target:light.target.getWorldPosition(new THREE.Vector3()).toArray(),panels:scene.mirrorBindings().filter(b=>b.ownerId===id).map(b=>b.snapshot())});
    }
    const saved=scene.save(),oldRoot=scene.root;let code;
    try{apply([{type:'move',id:'makeup-wall/primary',transform:{position:[0,1.145,0],yaw:0}}]);}catch(e){code=e.code;}
    assert(code);assert.equal(scene.save(),saved);assert.equal(scene.root,oldRoot);return{result,rejected:code};
  });
  report.status='passed';
}catch(e){report.status='failed';report.error=e.stack;process.exitCode=1;}
finally{scene?.dispose();library.dispose();const out=new URL(process.argv[2]||'evidence/company-makeup-wall-mirror-actual-data-v1/report.json',root);await fs.mkdir(new URL('./',out),{recursive:true});await fs.writeFile(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:checks.length,error:report.error}));}
