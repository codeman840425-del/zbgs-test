// CPU name-resolution diagnosis only. Materials/images are omitted in-memory.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
const base=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(base,'../../..');
const fixed=path.join(root,'experiments/native-mtoon-fixed-v1');
const {GLTFLoader}=await import(pathToFileURL(path.join(fixed,'prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js')).href);
const source=await fs.readFile(path.join(root,'assets-source/vroid-bridge-study-v1/generated/female-native-round-waist-216.vrm'));
const manifest=JSON.parse(await fs.readFile(path.join(root,'assets-source/native-vroid-equipment-v1/equipment.json')));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function names(bytes){
 const length=bytes.readUInt32LE(12),doc=JSON.parse(bytes.subarray(20,20+length).toString());
 const bin=bytes.subarray(28+length);doc.materials=(doc.materials??[]).map(m=>({name:m.name}));delete doc.images;delete doc.textures;delete doc.extensions;delete doc.extensionsUsed;delete doc.extensionsRequired;
 const json=Buffer.from(JSON.stringify(doc)),j=Buffer.concat([json,Buffer.alloc((-json.length)&3,32)]),b=Buffer.concat([bin,Buffer.alloc((-bin.length)&3)]);
 const header=Buffer.alloc(12);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+j.length+b.length,8);
 const chunk=(v,t)=>{const h=Buffer.alloc(8);h.writeUInt32LE(v.length);h.write(t,4);return Buffer.concat([h,v]);};
 const glb=Buffer.concat([header,chunk(j,'JSON'),chunk(b,'BIN\0')]);
 const parsed=await new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset,glb.byteOffset+glb.byteLength),'');
 const bones=[];parsed.scene.traverse(n=>{if(n.isBone)bones.push({name:n.name,originalName:n.userData.name??null,node:parsed.parser.associations.get(n)?.nodes});});
 return bones;
}
const original=await names(source),result={schema:'native-equipment-name-resolution-diagnosis-v1',sourceSha256:hash(source),scope:'Actual official GLTFLoader node naming, in-memory materials/images omitted. No renderer/VRM pose/fit changes.',originalBoneCount:original.length,sourceRenamedBones:original.filter(b=>b.name!==b.originalName),cases:[]};
for(const entry of manifest.items){
 const bytes=await fs.readFile(path.join(root,'assets-source/native-vroid-equipment-v1',entry.url));const gear=await names(bytes);
 result.cases.push({id:entry.id,sha256:hash(bytes),boneCount:gear.length,unresolvedTargetNames:entry.bindings.filter(b=>!original.some(n=>n.name===b.targetRawBone)).map(b=>({requested:b.targetRawBone,originalAliases:original.filter(n=>n.originalName===b.targetRawBone)})),unresolvedSourceNames:gear.filter(n=>!entry.bindings.some(b=>b.sourceBone===n.name)),sourceOriginalAliasComplete:gear.every(n=>entry.bindings.some(b=>b.sourceBone===n.originalName)),targetOriginalAliasComplete:entry.bindings.every(b=>original.some(n=>n.originalName===b.targetRawBone))});
}
await fs.writeFile(path.join(base,'name-probe.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
