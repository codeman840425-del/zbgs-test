import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {fileURLToPath} from 'node:url';
registerHooks({load(url, context, next) { if (url.endsWith('.json')) return {format:'module',source:'export default '+fs.readFileSync(new URL(url),'utf8'),shortCircuit:true}; return next(url, context); }});
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
await import('./headless-avatar-node.mjs');
globalThis.location={search:'',href:'http://geometry.local/'};
const {GLTFLoader}=await import('../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
const {VRMLoaderPlugin}=await import('../prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js');
const {createEyeBlinkCompatibility}=await import('../prototype/src/eye-blink-compatibility.js');
const entries=[
  ['female','prototype/public/assets/foundation/base-female-roundtrip.vrm'],
  ['native-contour-roundness-a-v1','prototype/public/assets/native-contour-roundness-a-v1/body.vrm'],
  ['native-contour-cheek-b-v1','prototype/public/assets/native-contour-cheek-b-v1/body.vrm'],
];
for(const [body,file] of entries){
  const bytes=fs.readFileSync(path.join(root,file)),loader=new GLTFLoader();loader.register(parser=>new VRMLoaderPlugin(parser));
  const parsed=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const hashes={'female':'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95','native-contour-roundness-a-v1':'825a82c944636971304ce50b7526b1410ea6f1c6b58bd36f166515295696a547','native-contour-cheek-b-v1':'9592933507b3290100d82ac315e5ddac7b6e284f372a1368de9f424643846ddb'};
  const vrm=parsed.userData.vrm, adapter=createEyeBlinkCompatibility({vrm,avatarSha256:hashes[body]}),state=adapter.getState();
  if(!state.available) throw Error(`${body}: ${state.reason}; targeted=${JSON.stringify(state.targetedMeshes)} protected=${JSON.stringify(state.protectedMeshes)}`);assert.equal(state.eyeTargetIndex,17);assert.equal(state.sourceTargetCount,body==='female'?56:57);assert.equal(state.targetedMeshes.length,4);assert.equal(state.protectedMeshes.length,body==='female'?5:4);
  const protectedInfluences=state.protectedMeshes.map(item=>{const mesh=vrm.scene.getObjectByName(item.name);return [item.materialRole,mesh.morphTargetInfluences.slice()];});
  const manager=vrm.expressionManager;manager.setValue('happy',.65);manager.setValue('blink',1);adapter.update();assert.equal(adapter.getState().coefficient,.65);assert.equal(manager.getExpression('workbenchJoyBlinkCompensationV1').outputWeight,.65);
  for(const [role,before] of protectedInfluences){const mesh=state.protectedMeshes.map(item=>item.materialRole).includes(role)?vrm.scene.getObjectByName(state.protectedMeshes.find(item=>item.materialRole===role).name):null;assert.deepEqual(mesh.morphTargetInfluences,before,`${body} protected ${role}`);}
  const peer=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');const peerAdapter=createEyeBlinkCompatibility({vrm:peer.userData.vrm,avatarSha256:state.avatarSha256});assert.equal(peerAdapter.getState().available,true);adapter.dispose();peerAdapter.dispose();assert.equal(manager.getExpression('workbenchJoyBlinkCompensationV1'),null);
}
console.log(JSON.stringify({passed:true,bodies:entries.map(([body])=>body),scope:'CPU GLTFLoader/VRM expression and two-instance ownership checks'}));
