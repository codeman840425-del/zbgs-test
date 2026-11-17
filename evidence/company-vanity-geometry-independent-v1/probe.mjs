import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {validateVanityGeometry} from '../../prototype/src/company/vanity-geometry.js';
import {validateSupportGeometry} from '../../prototype/src/company/support-geometry.js';

const root=new URL('../../',import.meta.url);
const hash=value=>createHash('sha256').update(value).digest('hex');
const sourcePath='prototype/src/company/vanity-geometry.js';
const sourceBefore=await fs.readFile(new URL(sourcePath,root));
const geometrySha256=hash(sourceBefore);
const runId=new Date().toISOString().replace(/[:.]/g,'-');
const out=new URL(`run-${runId}/`,import.meta.url);
await fs.mkdir(out,{recursive:true});
await fs.writeFile(new URL('vanity-geometry.source.js',out),sourceBefore);
const checks=[],assets=[];
const fail=(code,path,message,details)=>{throw Object.assign(new Error(message),{code,path,details});};
const validate=(scene,resource)=>({geometry:validateVanityGeometry(scene,resource,fail),support:validateSupportGeometry(scene,resource,fail)});
const load=async name=>{
  const resourcePath=`prototype/public/company-assets/vanity-table-v1/${name}/v1/resource.json`;
  const resource=JSON.parse(await fs.readFile(new URL(resourcePath,root),'utf8'));
  const bytes=await fs.readFile(new URL(`prototype/public${resource.asset.url}`,root));
  assert.equal(hash(bytes),resource.asset.sha256);assert.equal(bytes.length,resource.asset.bytes);
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  return{scene:gltf.scene,resource,asset:{id:resource.id,version:resource.version,resourcePath,assetUrl:resource.asset.url,sha256:hash(bytes),bytes:bytes.length}};
};
for(const name of ['plain','drawer-style','corner','mobile']){
  try{const loaded=await load(name);assets.push(loaded.asset);const result=validate(loaded.scene,loaded.resource);checks.push({name:`actual GLB baseline ${name}`,passed:true,meshCount:result.geometry.meshCount,components:result.geometry.components.length});}
  catch(error){checks.push({name:`actual GLB baseline ${name}`,passed:false,error:{code:error.code,message:error.message}});}
}

// Keep the pinned corner identity and all existing supports. Converting the
// actual main slab into a full rectangle fills the notch while removing the
// redundant wing, so no extra intruder can reveal the change indirectly.
const corner=await load('corner'),board=corner.scene.getObjectByName('vanity-top');
board.geometry=board.geometry.clone();
const positions=board.geometry.getAttribute('position');
for(let i=0;i<positions.count;i++)if(positions.getX(i)<-.39)positions.setX(i,Math.fround(-.55));
board.geometry.computeVertexNormals();
corner.scene.getObjectByName('vanity-wing').removeFromParent();
await fs.writeFile(new URL('corner-filled-notch.scene.json',out),JSON.stringify(corner.scene.toJSON(),null,2)+'\n');
await fs.writeFile(new URL('corner-filled-notch.resource.json',out),JSON.stringify(corner.resource,null,2)+'\n');
let accepted,denied;
try{accepted=validate(corner.scene,corner.resource);}catch(error){denied={code:error.code,path:error.path,message:error.message,details:error.details};}
checks.push({name:'actual corner identity cannot silently become full rectangular table',passed:!!denied,mutation:{identity:corner.resource.id,sourceDesign:corner.resource.provenance.sourceDesign,mainSlabMinX:-.55,removedWing:true,notchFilledSquareMetres:.15*.25},denied,accepted:accepted?{meshCount:accepted.geometry.meshCount,grounded:accepted.geometry.grounded,support:accepted.support}:undefined});
const report={command:'node evidence/company-vanity-geometry-independent-v1/probe.mjs',createdAt:new Date().toISOString(),geometrySha256,sourceUnchangedDuringRun:hash(await fs.readFile(new URL(sourcePath,root)))===geometrySha256,assets,checks,passed:checks.filter(c=>c.passed).length,failed:checks.filter(c=>!c.passed).length,limits:['CPU GLTFLoader readback and actual source geometry only. No browser/GPU or actor claim.','One directed shape-profile counterexample on the actual corner GLB. Existing author topology/knee/contact matrix is not repeated.','Mutated scene and unchanged resource are evidence fixtures. Their original asset SHA is retained to identify the source GLB, not claimed to hash the mutated in-memory scene.']};
await fs.writeFile(new URL('report.json',out),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({runDirectory:out.pathname,...report},null,2));
process.exitCode=report.failed?1:0;
