// Read-only actual VRMLoader normalized/raw basis and attachment inverse check.
// No renderer, target pose acceptance, runtime mutation or source-asset edits.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as T from '../prototype/node_modules/three/build/three.module.js';
import { GLTFLoader } from '../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '../prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js';
const root=new URL('../',import.meta.url),read=p=>fs.readFile(new URL(p,root));
const anchors=JSON.parse(await read('evidence/mic-mouth-target/source-anchors.json'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const Q=n=>n.getWorldQuaternion(new T.Quaternion()),P=n=>n.getWorldPosition(new T.Vector3());
const result={schema:'mic-hand-basis-audit-v1',cases:[],formulas:{rawHandWorld:'micTargetWorldQ * inverse(micRawHandLocalQ)',normalizedHandWorld:'rawHandTargetWorldQ * inverse(rawHandRestWorldQ) * normalizedHandRestWorldQ',wristWorld:'micOriginWorld - rotate(rawHandTargetWorldQ, micRawHandLocalPosition)',micOriginWorld:'frontPoleTargetWorld - rotate(micTargetWorldQ, micScale * grilleFrontPoleLocal)'},limits:['Orientation and attachment algebra tested on actual body skeletons, not arm reach/IK convergence or visual acceptance.','Source geometry/materials retained except texture/material descriptors stripped in memory for headless loading.','Point formulas require actual world scale; measured cases use unit body/prop scale. Nonuniform scale is not covered.']};
for(const body of anchors.bodies){
 const bytes=await read(body.source.replaceAll('\\','/'));if(hash(bytes)!==body.bodySha256)throw Error('Body hash changed');
 const len=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+len));
 for(const m of json.meshes)for(const p of m.primitives)delete p.material;
 delete json.materials;delete json.images;delete json.textures;
 if(json.extensions.VRM){json.extensions.VRM.materialProperties=[];delete json.extensions.VRM.meta.texture;}
 const text=Buffer.from(JSON.stringify(json)),j=Buffer.concat([text,Buffer.alloc((4-text.length%4)%4,32)]),bin=bytes.subarray(20+len),h=Buffer.alloc(20);
 h.write('glTF');h.writeUInt32LE(2,4);h.writeUInt32LE(20+j.length+bin.length,8);h.writeUInt32LE(j.length,12);h.write('JSON',16);
 const cooked=Buffer.concat([h,j,bin]),loader=new GLTFLoader();loader.register(p=>new VRMLoaderPlugin(p));
 const {userData:{vrm}}=await loader.parseAsync(cooked.buffer.slice(cooked.byteOffset,cooked.byteOffset+cooked.length),'');
 VRMUtils.rotateVRM0(vrm);vrm.scene.updateMatrixWorld(true);
 const nb=n=>vrm.humanoid.getNormalizedBoneNode(n),rb=n=>vrm.humanoid.getRawBoneNode(n);
 const nr=Q(nb('rightHand')),rr=Q(rb('rightHand')),restScene=vrm.scene.quaternion.clone();
 const gripBytes=await read(`prototype/public/assets/m1c/grips/${body.body}-source-grip-v1.json`),grip=JSON.parse(gripBytes);
 if(grip.compatibleAvatarSha256!==body.bodySha256||grip.compatibleAccessorySha256!==anchors.microphone.sha256)throw Error('Grip identity mismatch');
 const mq=new T.Quaternion().fromArray(grip.micRawHandLocal.quaternion),mp=new T.Vector3().fromArray(grip.micRawHandLocal.position);
 const mouth=new T.Vector3().fromArray(body.mouthRawHeadLocal),normalizedMouth=nb('head').worldToLocal(rb('head').localToWorld(mouth.clone()));
 const row={body:body.body,bodySha256:body.bodySha256,gripSha256:hash(gripBytes),rawRestWorldQ:rr.toArray(),normalizedRestWorldQ:nr.toArray(),mouthNormalizedHeadLocal:normalizedMouth.toArray(),restHandOriginErrorMetres:P(nb('rightHand')).distanceTo(P(rb('rightHand'))),poses:[]};
 for(let i=0;i<6;i++){
  vrm.humanoid.resetNormalizedPose();
  vrm.scene.quaternion.copy(new T.Quaternion().setFromEuler(new T.Euler(.03*i,.31*i,-.02*i))).multiply(restScene);
  for(const [name,e] of [['spine',[.04*i,.03*i,0]],['rightUpperArm',[-.15*i,.08*i,.12*i]],['rightLowerArm',[.13*i,0,-.07*i]],['head',[.02*i,-.05*i,0]]])nb(name).quaternion.setFromEuler(new T.Euler(...e));
  vrm.scene.updateMatrixWorld(true);
  const micTargetQ=new T.Quaternion().setFromEuler(new T.Euler(.17*i,-.25+.23*i,.11+.09*i));
  const rawTargetQ=micTargetQ.clone().multiply(mq.clone().invert());
  const normalizedTargetQ=rawTargetQ.clone().multiply(rr.clone().invert()).multiply(nr);
  nb('rightHand').quaternion.copy(Q(nb('rightHand').parent).invert().multiply(normalizedTargetQ));
  vrm.scene.updateMatrixWorld(true);vrm.humanoid.update();vrm.scene.updateMatrixWorld(true);
  const rawActualQ=Q(rb('rightHand')),micActualQ=rawActualQ.clone().multiply(mq);
  const origin=P(rb('rightHand')).add(mp.clone().applyQuaternion(rawActualQ));
  const tip=origin.clone().add(new T.Vector3().fromArray(anchors.microphone.grilleFrontPoleLocal).applyQuaternion(micTargetQ));
  const inverseWrist=tip.clone().sub(new T.Vector3().fromArray(anchors.microphone.grilleFrontPoleLocal).applyQuaternion(micTargetQ)).sub(mp.clone().applyQuaternion(rawTargetQ));
  const rawMouth=rb('head').localToWorld(mouth.clone()),normalMouth=nb('head').localToWorld(normalizedMouth.clone());
  row.poses.push({case:i,rawTargetErrorRadians:rawActualQ.angleTo(rawTargetQ),microphoneTargetErrorRadians:micActualQ.angleTo(micTargetQ),inverseWristErrorMetres:inverseWrist.distanceTo(P(rb('rightHand'))),handOriginErrorMetres:P(nb('rightHand')).distanceTo(P(rb('rightHand'))),mouthWorldErrorMetres:rawMouth.distanceTo(normalMouth)});
 }
 result.cases.push(row);
}
result.passed=result.cases.every(x=>x.restHandOriginErrorMetres<1e-6&&x.poses.every(p=>p.rawTargetErrorRadians<1e-6&&p.microphoneTargetErrorRadians<1e-6&&p.inverseWristErrorMetres<1e-6&&p.handOriginErrorMetres<1e-6&&p.mouthWorldErrorMetres<1e-6));
result.sourcePins={script:hash(await fs.readFile(fileURLToPath(import.meta.url))),anchors:hash(await read('evidence/mic-mouth-target/source-anchors.json')),vrmCore:hash(await read('prototype/node_modules/@pixiv/three-vrm-core/lib/three-vrm-core.module.js'))};
await fs.writeFile(new URL('evidence/mic-mouth-target/hand-basis-check.json',root),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;
