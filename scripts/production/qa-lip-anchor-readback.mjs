import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {registerHooks} from 'node:module';
import path from 'node:path';
import {parseArgs} from 'node:util';
import outputs from '../project-output.cjs';

const {values}=parseArgs({options:{case:{type:'string',multiple:true},output:{type:'string'}}});
const root=await outputs.productionRoot();
const destination=values.output && await outputs.projectOutput(values.output,root);
const folder='evidence/m2-lip-anchor-intake-v1';
const cases=values.case??[
  'source-female-uniform-texture-v1='+folder+'/uniform-lite-female.json',
  'source-male-cc0-texture-release-v1='+folder+'/uniform-lite-male.json',
  'native-contour-roundness-a-v1='+folder+'/native-contour-roundness-a-v1.json',
  'native-contour-cheek-b-v1='+folder+'/native-contour-cheek-b-v1.json',
];
const sha=data=>createHash('sha256').update(data).digest('hex');
const relative=file=>path.relative(root,file).split(path.sep).join('/');
const hook=registerHooks({load(url,ctx,next){
  return next(url,url.endsWith('.json')?{...ctx,importAttributes:{type:'json'}}:ctx);
}});
const {THREE,loadGeometryAvatar}=await import('../headless-avatar-node.mjs');
const {vocalPerformer}=await import('../../prototype/src/facility-vocal.js');
globalThis.createImageBitmap=async blob=>{
  const head=Buffer.from(await blob.slice(0,24).arrayBuffer());
  const png=head.length===24 && head.readUInt32BE(0)===0x89504e47;
  return {width:png?head.readUInt32BE(16):1,height:png?head.readUInt32BE(20):1,close(){}};
};

function indexHash(ids){
  const bytes=Buffer.alloc(ids.length*4);
  ids.forEach((id,i)=>bytes.writeUInt32LE(id,4*i));
  return sha(bytes);
}

// Check primitive order and vertex numbering against the actual GLB being
// consumed. A compacted/reindexed render mesh needs an explicit correspondence.
function verifyPrimitive(glb,anchor,avatar){
  assert.equal(anchor.schema,'character-lip-anchor-v1');
  assert.equal(anchor.bodySha256,avatar.getAssetProfile().sha256,'loaded body SHA mismatch');
  assert.equal(sha(glb),anchor.bodySha256,'source body SHA mismatch');
  const jsonEnd=20+glb.readUInt32LE(12),doc=JSON.parse(glb.subarray(20,jsonEnd));
  const {node,mesh,primitive,material}=anchor.faceMouth;
  assert.equal(doc.nodes[node].mesh,mesh);
  const source=doc.meshes[mesh].primitives[primitive];
  assert.equal(doc.materials[source.material].name,material);
  const ext=doc.extensions[anchor.source.extension];
  assert.equal(ext.specVersion,anchor.source.specVersion);
  const binds=anchor.source.extension==='VRM'
    ?ext.blendShapeMaster.blendShapeGroups.find(row=>row.presetName==='a')?.binds
    :ext.expressions.preset.aa.morphTargetBinds;
  assert.deepEqual(binds,[anchor.source.bind]);
  assert.equal(anchor.source.preset,anchor.source.extension==='VRM'?'a':'aa');
  const rawTarget=anchor.source.bind.index;
  const expression=avatar.vrm.expressionManager.getExpression('aa');
  assert.equal(expression.binds.length,1);
  const [binding]=expression.binds,mouth=binding.primitives[primitive];
  assert.equal(binding.index,rawTarget);assert.equal(binding.weight,1);
  const main=Array.isArray(mouth.material)?mouth.material[0]:mouth.material;
  assert.equal(main.name,material);assert.ok(mouth.isSkinnedMesh);
  const names=source.extras?.targetNames??doc.meshes[mesh].extras?.targetNames;
  assert.equal(names?.[rawTarget],anchor.source.morphTargetName,'source morph target name/index mismatch');
  // GLTFLoader recognizes mesh-level names. For primitive-only VRM0
  // names it exposes numeric keys; the real VRM expression still binds by index.
  const loadedName=doc.meshes[mesh].extras?.targetNames?.[rawTarget]??String(rawTarget);
  assert.equal(mouth.morphTargetDictionary[loadedName],rawTarget,'runtime morph target name/index mismatch');
  const index=doc.accessors[source.indices],view=doc.bufferViews[index.bufferView];
  const width=({5121:1,5123:2,5125:4})[index.componentType];
  assert.ok(width && !index.sparse && view.buffer===0);
  const start=jsonEnd+8+(view.byteOffset??0)+(index.byteOffset??0);
  assert.equal(mouth.geometry.attributes.position.count,doc.accessors[source.attributes.POSITION].count);
  assert.equal(mouth.geometry.index.count,index.count);
  for(let i=0;i<index.count;i++){
    assert.equal(mouth.geometry.index.getX(i),glb.readUIntLE(start+i*(view.byteStride??width),width),'render triangle index remapped');
  }
  return mouth;
}

function validateRing(anchor,mouth){
  const ids=anchor.rimVertexIds,referenced=new Set(mouth.geometry.index.array);
  assert.equal(ids.length,32);
  assert.ok(ids.every((v,i)=>Number.isInteger(v)&&referenced.has(v)&&(i===0||v>ids[i-1])),'invalid referenced lip indices');
  assert.equal(indexHash(ids),anchor.rimVertexIdsSha256,'rim SHA mismatch');
  return ids;
}

const tolerance=1e-6;
function compareSample(anchor,mouth,avatar,detected,aa,headYaw){
  const {vrm}=avatar,head=vrm.humanoid.getNormalizedBoneNode('head');
  head.quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),headYaw);
  vrm.expressionManager.setValue('aa',aa);
  vrm.update(0);avatar.root.updateMatrixWorld(true);
  assert.equal(mouth.morphTargetInfluences[anchor.source.bind.index],aa);
  const world=new THREE.Vector3(),vertex=new THREE.Vector3();
  for(const i of validateRing(anchor,mouth)) world.add(mouth.getVertexPosition(i,vertex));
  mouth.localToWorld(world.divideScalar(anchor.rimVertexIds.length));
  const fromGeometry=detected.mouth();
  const dynamicError=world.distanceTo(fromGeometry);
  assert.ok(dynamicError<tolerance,'registered/dynamically detected lip seam mismatch');
  const rawHead=vrm.humanoid.getRawBoneNode('head');
  const local=rawHead.worldToLocal(world.clone());
  const reference=aa?anchor.reference.fullVowelCentroid:anchor.reference.neutralCentroid;
  const referenceError=local.distanceTo(new THREE.Vector3(...reference));
  assert.ok(referenceError<tolerance,'production raw-head-local centroid mismatch: '+referenceError);
  return {aa,headYaw,world:world.toArray(),dynamicallyDetectedWorld:fromGeometry.toArray(),rawHeadLocal:local.toArray(),
    dynamicErrorM:dynamicError,referenceErrorM:referenceError};
}

async function readCase({body,file,bytes,anchor},otherBody){
  const {avatar}=await loadGeometryAvatar(body);
  try {
    const sourceFile=path.join(root,'prototype/public',avatar.getAssetProfile().url);
    const glb=await readFile(sourceFile);
    const mouth=verifyPrimitive(glb,anchor,avatar);
    const detected=vocalPerformer(avatar);
    const samples=[[0,0],[1,0],[1,.4]].map(([aa,yaw])=>compareSample(anchor,mouth,avatar,detected,aa,yaw));
    const distance=(a,b)=>new THREE.Vector3(...a).distanceTo(new THREE.Vector3(...b));
    const aaTravel=distance(samples[0].world,samples[1].world),turnTravel=distance(samples[1].world,samples[2].world);
    assert.ok(aaTravel>tolerance && turnTravel>tolerance,'The loaded mouth must actually deform and turn');
    const wrongBody={...anchor,bodySha256:otherBody};
    assert.throws(()=>verifyPrimitive(glb,wrongBody,avatar),/loaded body SHA mismatch/);
    const relocated={...anchor,source:{...anchor.source,path:'source-archive/renamed.vrm'}};
    assert.equal(verifyPrimitive(glb,relocated,avatar),mouth);
    const wrong=structuredClone(anchor);
    const other=[...mouth.geometry.index.array].find(i=>!wrong.rimVertexIds.includes(i));
    wrong.rimVertexIds[0]=other;wrong.rimVertexIds.sort((a,b)=>a-b);
    assert.throws(()=>validateRing(wrong,mouth),/rim SHA mismatch/);
    wrong.rimVertexIdsSha256=indexHash(wrong.rimVertexIds);
    assert.throws(()=>compareSample(wrong,mouth,avatar,detected,0,0),/dynamically detected lip seam mismatch/);
    return {body,bodySha256:anchor.bodySha256,sourcePath:anchor.source.path,loadedPath:relative(sourceFile),
      anchor:relative(file),anchorSha256:sha(bytes),faceMouth:anchor.faceMouth,
      rimVertexIdsSha256:anchor.rimVertexIdsSha256,triangleIndexCount:mouth.geometry.index.count,unchangedTriangleIndices:true,
      sourceBinding:anchor.source.bind,sourcePreset:anchor.source.preset,loadedPreset:'aa',morphTargetName:anchor.source.morphTargetName,
      loadedMorphTargetKey:Object.keys(mouth.morphTargetDictionary).find(k=>mouth.morphTargetDictionary[k]===anchor.source.bind.index),
      aaTravelM:aaTravel,turnTravelM:turnTravel,samples,renamedSourceProvenanceAccepted:true,
      rejections:['wrong-body','stale-rim-digest','rehashed-wrong-referenced-vertex']};
  }finally{avatar.dispose();}
}

try{
  const inputs=await Promise.all(cases.map(async spec=>{
    const split=spec.indexOf('=');assert.ok(split>0,'Expected --case BODY_TYPE=ANCHOR.json');
    const body=spec.slice(0,split),file=path.resolve(root,spec.slice(split+1)),bytes=await readFile(file);
    return {body,file,bytes,anchor:JSON.parse(bytes)};
  }));
  const results=[];
  for(const item of inputs){
    const other=inputs.find(row=>row.anchor.bodySha256!==item.anchor.bodySha256);
    results.push(await readCase(item,other?.anchor.bodySha256??'0'.repeat(64)));
  }
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
  const report={schema:'character-lip-anchor-runtime-readback-v1',commandCases:cases,coordinateToleranceM:tolerance,
    runtimeTree:git('rev-parse','HEAD:prototype/src'),runtimeSourceChanges:git('status','--porcelain','--','prototype/src'),
    node:process.version,readbackSha256:sha(await readFile(new URL(import.meta.url))),
    scope:'CPU source and game geometry, expression and head rotation. No facility, handheld equipment, GPU or visual acceptance.',results};
  const result=JSON.stringify(report,null,2)+'\n';
  if(destination){
    await mkdir(path.dirname(destination),{recursive:true});
    try{await writeFile(destination,result,{flag:'wx'});}
    catch(error){if(error.code!=='EEXIST')throw error;assert.equal(await readFile(destination,'utf8'),result,'Existing readback differs');}
  }
  else process.stdout.write(result);
}finally{hook.deregister();}
