// Read-only CPU comparison of the actual two loader paths and adapter binding.
// Image decoding is a 1px fixture. This does not reproduce GPU alpha sampling.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
const base=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(base,'../../..'),fixed=path.join(root,'experiments/native-mtoon-fixed-v1');
const load=p=>import(pathToFileURL(path.join(fixed,p)).href);
const T=await load('prototype/node_modules/three/build/three.module.js');
const {GLTFLoader}=await load('prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
const {VRMLoaderPlugin}=await load('prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js');
const {createEquipment}=await load('prototype/src/equipment.js');
const originalFetch=globalThis.fetch;
globalThis.self=globalThis;
globalThis.window={location:{href:'http://cpu.local/',search:''}};
globalThis.ProgressEvent=class extends Event{constructor(t,p={}){super(t);Object.assign(this,p);}};
globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}});
const folder=path.join(root,'assets-source/native-vroid-equipment-v1');
globalThis.fetch=async(input,options)=>{const u=new URL(typeof input==='string'?input:input.url??input,'http://cpu.local/');if(u.hostname!=='cpu.local')return originalFetch(input,options);const file=path.join(folder,path.basename(u.pathname));return new Response(await fs.readFile(file));};
const sourceBytes=await fs.readFile(path.join(root,'assets-source/vroid-bridge-study-v1/generated/female-native-round-waist-216.vrm'));
const loader=new GLTFLoader();loader.register(p=>new VRMLoaderPlugin(p));
const parsed=await loader.parseAsync(sourceBytes.buffer.slice(sourceBytes.byteOffset,sourceBytes.byteOffset+sourceBytes.byteLength),'');
const vrm=parsed.userData.vrm;vrm.update(0);vrm.scene.updateMatrixWorld(true);
const manifest=JSON.parse(await fs.readFile(path.join(folder,'equipment.json')));
const originals=[];vrm.scene.traverse(n=>{if(n.isSkinnedMesh)originals.push(n);});
const adapter=await createEquipment({vrm,avatarSha256:'78912a7a48e114107ccf16ecd7896edff2fe2664bbc25fb4f8a807fca68c01b3',manifestUrl:'/equipment.json'});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function packed(attribute){const a=[];for(let i=0;i<attribute.count;i++)for(let k=0;k<attribute.itemSize;k++)a.push(attribute.getComponent(i,k));return sha(Buffer.from(new Float64Array(a).buffer));}
function value(x){
 if(x===null||typeof x!=='object')return x;
 if(x.isTexture)return {texture:true,name:x.name,channel:x.channel,colorSpace:x.colorSpace,flipY:x.flipY,wrapS:x.wrapS,wrapT:x.wrapT,magFilter:x.magFilter,minFilter:x.minFilter,matrix:x.matrix.toArray(),offset:x.offset.toArray(),repeat:x.repeat.toArray(),rotation:x.rotation,generateMipmaps:x.generateMipmaps,premultiplyAlpha:x.premultiplyAlpha};
 if(Array.isArray(x))return x.map(value);
 if(x.toArray)return x.toArray();
 return String(x);
}
function material(m){return {name:m.name,isOutline:m.isOutline,defines:m.defines,uniforms:Object.fromEntries(Object.entries(m.uniforms).map(([k,u])=>[k,value(u.value)])),renderFlags:{side:m.side,transparent:m.transparent,alphaTest:m.alphaTest,depthTest:m.depthTest,depthWrite:m.depthWrite,blending:m.blending,premultipliedAlpha:m.premultipliedAlpha,polygonOffset:m.polygonOffset,toneMapped:m.toneMapped}};}
function differences(a,b,p=''){const out=[];if(a&&b&&typeof a==='object'&&typeof b==='object'){for(const k of new Set([...Object.keys(a),...Object.keys(b)]))out.push(...differences(a[k],b[k],p+'.'+k));}else if(!Object.is(a,b))out.push({path:p,source:a,independent:b});return out;}
function normal(mesh,id,camera){
 const indices=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight,n=new T.Vector3().fromBufferAttribute(mesh.geometry.attributes.normal,id),skin=new T.Matrix4();skin.elements.fill(0);
 for(let k=0;k<4;k++){const bone=new T.Matrix4().fromArray(mesh.skeleton.boneMatrices,indices.getComponent(id,k)*16);for(let j=0;j<16;j++)skin.elements[j]+=weights.getComponent(id,k)*bone.elements[j];}
 skin.premultiply(mesh.bindMatrixInverse).multiply(mesh.bindMatrix);n.applyMatrix3(new T.Matrix3().setFromMatrix4(skin));
 const rawLength=n.length();n.normalize();const transformed=n.clone().applyMatrix3(new T.Matrix3().getNormalMatrix(new T.Matrix4().multiplyMatrices(camera.matrixWorldInverse,mesh.matrixWorld)));
 return {direction:n,rawLength,transformedLength:transformed.length()};
}
const camera=new T.PerspectiveCamera(40,1040/814,.01,100);camera.position.set(0,1.03,3);camera.lookAt(0,.95,0);camera.updateMatrixWorld(true);
const result={schema:'native-equipment-mtoon-actual-cpu-diagnosis-v1',textureFixture:'1px image decode only. No actual texture pixel or GPU program evaluation.',sourceSha256:sha(sourceBytes),cases:[]};
for(const entry of manifest.items){
 const item=await adapter.load(entry.id),gear=item.meshes[0];const gearNames=(Array.isArray(gear.material)?gear.material:[gear.material]).map(m=>m.name);
 const source=originals.find(m=>(Array.isArray(m.material)?m.material:[m.material]).some(x=>x.name===gearNames[0]));
 if(!source)throw Error('Source garment missing');item.container.visible=true;
 vrm.update(1/60);adapter.update(1/60);vrm.scene.updateMatrixWorld(true);source.skeleton.update();gear.skeleton.update();
 const a=(Array.isArray(source.material)?source.material:[source.material]).map(material),b=(Array.isArray(gear.material)?gear.material:[gear.material]).map(material);
 let maximumNormalAngleDegrees=0,maximumRawNormalLengthDifference=0,maximumTransformedNormalLengthDifference=0,maxSourceNormalLength=0,maxIndependentNormalLength=0;
 for(const id of new Set(source.geometry.index.array)){const x=normal(source,id,camera),y=normal(gear,id,camera);if(![...x.direction,...y.direction,x.rawLength,y.rawLength,x.transformedLength,y.transformedLength].every(Number.isFinite))throw Error('Nonfinite normal');maximumNormalAngleDegrees=Math.max(maximumNormalAngleDegrees,x.direction.angleTo(y.direction)*180/Math.PI);maximumRawNormalLengthDifference=Math.max(maximumRawNormalLengthDifference,Math.abs(x.rawLength-y.rawLength));maximumTransformedNormalLengthDifference=Math.max(maximumTransformedNormalLengthDifference,Math.abs(x.transformedLength-y.transformedLength));maxSourceNormalLength=Math.max(maxSourceNormalLength,x.transformedLength);maxIndependentNormalLength=Math.max(maxIndependentNormalLength,y.transformedLength);}
 const attributes={};for(const semantic of ['position','normal','uv','skinIndex','skinWeight'])attributes[semantic]={source:packed(source.geometry.attributes[semantic]),independent:packed(gear.geometry.attributes[semantic])};
 result.cases.push({id:entry.id,attributes,sourceGroups:source.geometry.groups,independentGroups:gear.geometry.groups,sourceDrawRange:source.geometry.drawRange,independentDrawRange:gear.geometry.drawRange,sourceMatrix:source.matrixWorld.toArray(),independentMatrix:gear.matrixWorld.toArray(),sourceBind:source.bindMatrix.toArray(),independentBind:gear.bindMatrix.toArray(),sourceBindInverse:source.bindMatrixInverse.toArray(),independentBindInverse:gear.bindMatrixInverse.toArray(),sourceMaterials:a,independentMaterials:b,materialDifferences:differences(a,b),normals:{maximumNormalAngleDegrees,maximumRawNormalLengthDifference,maximumTransformedNormalLengthDifference,maxSourceNormalLength,maxIndependentNormalLength}});
}
adapter.dispose();await fs.writeFile(path.join(base,'material-normal-diagnosis.json'),JSON.stringify(result,(_,v)=>typeof v==='number'&&!Number.isFinite(v)?String(v):v,2)+'\n');
console.log(JSON.stringify(result.cases.map(c=>({id:c.id,materialDifferences:c.materialDifferences,groups:[c.sourceGroups,c.independentGroups],normals:c.normals,attributesIdentical:Object.values(c.attributes).every(a=>a.source===a.independent)}))));
