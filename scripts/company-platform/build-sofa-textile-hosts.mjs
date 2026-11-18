import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {Mesh} from '../../prototype/node_modules/three/build/three.module.js';
import {RoundedBoxGeometry} from '../../prototype/node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {GLTFExporter} from '../../prototype/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {validateSupportGeometry} from '../../prototype/src/company/support-geometry.js';

const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url)));
const family='assets-source/company-sofa-textile-host-v1';
const parameters=family+'/parameters.json', generator='scripts/company-platform/build-sofa-textile-hosts.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=name=>fs.readFile(path.join(root,name));
const json=value=>Buffer.from(JSON.stringify(value,null,2)+'\n');
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob){blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.({target:this});})
    .catch(error=>this.onerror?.({target:this,error}));}
};
const load=async bytes=>(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;

async function exportHost(bytes,design,recipe) {
  const scene=await load(bytes);
  const old=scene.getObjectByName(design.armToReplace), upholstered=scene.getObjectByName(recipe.arm.materialFrom);
  assert(old?.isMesh && upholstered?.isMesh && !Array.isArray(upholstered.material));
  // Preserve every seat, back and base. The arm begins at the outer seat boundary.
  // The new padded arm bears directly on the floor. Its single mesh includes its top.
  const arm=new Mesh(new RoundedBoxGeometry(...recipe.arm.size,recipe.arm.segments,recipe.arm.radius),upholstered.material);
  arm.name=recipe.arm.node;
  arm.position.set(recipe.surface.center[0],recipe.arm.size[1]/2,recipe.surface.center[1]);
  scene.updateWorldMatrix(true,true);
  assert.deepEqual(old.parent.matrixWorld.elements,[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
  old.parent.add(arm); old.removeFromParent();
  return Buffer.from(await new GLTFExporter().parseAsync(scene,{binary:true}));
}

const options=parseArgs({options:{check:{type:'boolean'},write:{type:'boolean'},output:{type:'string'}}}).values;
assert.equal([options.check,options.write,options.output].filter(Boolean).length,1,'Choose --check, --write or --output NEW_DIRECTORY');
const recipeBytes=await read(parameters),recipe=JSON.parse(recipeBytes);
assert.equal(recipe.schema,'company-sofa-textile-hosts'); assert.equal(recipe.version,1);
const generatorSha256=hash(await read(generator)),sourceParametersSha256=hash(recipeBytes);
const collection={schema:'company-sofa-textile-hosts',version:1,sourceParameters:parameters,sourceParametersSha256,generator,generatorSha256,resources:[]};
const files=new Map();
for(const design of recipe.designs){
  const originalBytes=await read(design.original);
  assert.equal(hash(originalBytes),design.originalSha256);
  const original=JSON.parse(originalBytes),sourceArtifactPath='prototype/public'+original.asset.url;
  const input=await read(sourceArtifactPath);
  assert.equal(hash(input),original.asset.sha256); assert.equal(original.mountRole,'sofa'); assert.equal(original.usePoints.length,2);
  const model=await exportHost(input,design,recipe);
  assert(model.equals(await exportHost(input,design,recipe)),'Repeated sofa export differs');
  const directory='prototype/public/company-assets/sofa-textile-host-v1/'+design.id+'/v'+design.version;
  const modelPath=directory+'/model.glb',resourcePath=directory+'/resource.json';
  const materialSlots=structuredClone(original.materialSlots);
  for(const slot of Object.keys(materialSlots)) materialSlots[slot]=materialSlots[slot].filter(n=>n!==design.armToReplace);
  const fabric=Object.values(materialSlots).find(names=>names.includes(recipe.arm.materialFrom));fabric.push(recipe.arm.node);
  const resource={id:design.id,version:design.version,displayName:design.displayName,category:original.category,mountRole:'sofa',productionBranch:'sofa-textile-host',
    coordinates:original.coordinates,footprint:recipe.footprint,supportSurfaces:[recipe.surface],supportNodes:{[recipe.surface.id]:recipe.arm.node},
    materialSlots,usePoints:original.usePoints,stateDefaults:original.stateDefaults,
    asset:{format:'glb',url:modelPath.slice('prototype/public'.length),sha256:hash(model),bytes:model.length},
    provenance:{license:original.provenance.license,sourceParameters:parameters,sourceParametersSha256,generator,generatorSha256,
      sourceArtifactPath,sourceArtifactSha256:original.asset.sha256,originalResource:design.original,originalResourceSha256:design.originalSha256,
      method:'Keep both seat and back assemblies. Replace the right arm with one floor-bearing rounded upholstered arm taken from the seat material.'}};
  validateSupportGeometry(await load(model),resource,(code,p,message)=>{throw Error(code+' '+p+' '+message);});
  files.set(modelPath,model);files.set(resourcePath,json(resource));
  collection.resources.push({id:design.id,version:design.version,resourcePath,modelPath,sha256:resource.asset.sha256});
}
files.set(family+'/collection.json',json(collection));
const destination=options.output?path.resolve(options.output):root;
if(options.output) await fs.mkdir(destination);
const missing=[];
for(const [name,bytes] of files){
  if(options.output){missing.push([name,bytes]);continue;}
  try {assert((await read(name)).equals(bytes),'Existing version differs: '+name);}
  catch(error){if(!options.write || error.code!=='ENOENT')throw error;missing.push([name,bytes]);}
}
for(const [name,bytes] of missing){const file=path.join(destination,name);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes,{flag:'wx'});}
console.log(JSON.stringify({status:'passed',resources:collection.resources}));
