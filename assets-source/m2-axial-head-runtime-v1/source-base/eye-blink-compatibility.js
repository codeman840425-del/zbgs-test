import revisedBlink from '../public/assets/m2-representative-batch-v2/eye-blink-profiles.json' with {type:'json'};
import batchBlink from '../public/assets/m2-representative-batch-v1/eye-blink-profiles.json' with {type:'json'};
import {VRMExpression, VRMExpressionMorphTargetBind} from '@pixiv/three-vrm';

const NAME = 'workbenchJoyBlinkCompensationV1';
// Exact source families only. Derived identities are separately CPU-audited;
// this is not admission by prefix, sex label, or a changed geometry SHA.
const PROFILES = new Map([
  ...[...batchBlink.profiles,...revisedBlink.profiles].map(p=>[p.sha256,{prefix:p.prefix,targets:p.targets}]),
  ['027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95', {prefix:'F00_000_00_', targets:56}],
  ['62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff', {prefix:'M00_000_00_', targets:54}],
  ['3c11caaed49f6db514acb7678551352afdf1c2893ef92ca93b959a8d09691011', {prefix:'F00_000_00_', targets:56}],
  ['10778174ece87e3e3a00ecaf5e0c98eef59cd7d762e9bb52daa50162ee1743b5', {prefix:'F00_000_00_', targets:56}],
  ['25ac8a8174110d7b0a6bb290ac8cab66ad6939ea522f80cdef62571d2ab24153', {prefix:'M00_000_00_', targets:54}],
]);
const TARGET_ROLES = new Set(['Face_00_SKIN','EyeWhite_00_EYE','FaceEyeline_00_FACE','FaceEyelash_00_FACE']);
const PROTECTED_ROLES = new Set(['FaceMouth_00_FACE','FaceBrow_00_FACE','EyeIris_00_EYE','EyeHighlight_00_EYE','EyeExtra_01_EYE']);
const owners = new WeakMap();
const cleanName = m => m?.name?.replace(/ \(Outline\)$/, '');

/** Reuses an existing morph lane. No source/geometry/normal buffer changes.
 * Call update after setting happy/blink and before the ordinary vrm.update.
 * Only bilateral automatic blink is covered; independent blinkLeft/Right is
 * reported as unsupported and retains the original source behavior. */
export function createEyeBlinkCompatibility({vrm,avatarSha256}) {
  const manager=vrm.expressionManager, profile=PROFILES.get(avatarSha256), owner={};
  let mode='fixed', disposed=false, expression=null, reason=null, coefficient=0, skipped=null;
  const records=[],targeted=[],protectedMeshes=[];
  let eyeIndex=null, joyIndex=null, closeIndex=null;
  try {
    if(!profile)throw Error('Unregistered avatar source identity');
    if(!manager)throw Error('Expression manager unavailable');
    if(manager.getExpression(NAME))throw Error('Compatibility expression is already registered');
    vrm.scene.traverse(mesh=>{
      if(!mesh.isMesh)return;
      const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
      const names=materials.map(cleanName);
      const roles=names.map(n=>n?.startsWith(profile.prefix)?n.slice(profile.prefix.length):null);
      if(!roles.some(r=>TARGET_ROLES.has(r)||PROTECTED_ROLES.has(r)))return;
      if(!roles.every(r=>r===roles[0]))throw Error('Mixed protected and corrected primitive');
      const role=roles[0],g=mesh.geometry,influences=mesh.morphTargetInfluences,dict=mesh.morphTargetDictionary;
      if(!g.morphTargetsRelative||g.morphAttributes.position?.length!==profile.targets||!g.index||!influences||influences.length!==profile.targets||!dict)throw Error('Unexpected face morph layout');
      const find=s=>{const entries=Object.entries(dict).filter(([n])=>n.endsWith('_Fcl_'+s));if(entries.length!==1)throw Error('Missing/ambiguous source target '+s);return entries[0][1];};
      const e=find('EYE_Joy'),j=find('ALL_Joy'),c=find('EYE_Close');
      if(eyeIndex!==null&&(e!==eyeIndex||j!==joyIndex||c!==closeIndex))throw Error('Face target mapping differs between primitives');
      eyeIndex=e;joyIndex=j;closeIndex=c;
      if(records.some(r=>r.influences===influences)||owners.has(influences))throw Error('Face influences shared across primitive or live instance');
      if(influences[e]!==0)throw Error('Existing EYE_Joy lane is already in use');
      const record={mesh,role,influences,eyeIndex:e};records.push(record);
      (TARGET_ROLES.has(role)?targeted:protectedMeshes).push(record);
    });
    const roles=new Set(records.map(r=>r.role));
    if(roles.size!==9||[...TARGET_ROLES,...PROTECTED_ROLES].some(r=>!roles.has(r)))throw Error('Required face primitives missing');
    const correctedIds=new Set(targeted.flatMap(r=>[...r.mesh.geometry.index.array]));
    if(protectedMeshes.some(r=>[...r.mesh.geometry.index.array].some(i=>correctedIds.has(i))))throw Error('Protected and corrected source indices overlap');
    for(const [name,index] of [['happy',joyIndex],['blink',closeIndex]]){
      const e=manager.getExpression(name);
      if(!e||e.isBinary||e.overrideBlink!=='none'||e.overrideMouth!=='none'||e.overrideLookAt!=='none')throw Error('Source expression override differs');
      const bound=new Set();
      for(const bind of e.binds){
        if(!(bind instanceof VRMExpressionMorphTargetBind)||bind.index!==index||bind.weight!==1)throw Error('Source expression binding differs');
        for(const mesh of bind.primitives)bound.add(mesh);
      }
      if(records.some(r=>!bound.has(r.mesh)))throw Error('Source expression does not cover actual face meshes');
    }
    for(const e of manager.expressions)for(const b of e.binds)
      if(b instanceof VRMExpressionMorphTargetBind&&b.index===eyeIndex&&b.primitives.some(m=>records.some(r=>r.mesh===m)))throw Error('EYE_Joy already owned by an expression');
    expression=new VRMExpression(NAME);
    expression.addBind(new VRMExpressionMorphTargetBind({primitives:targeted.map(r=>r.mesh),index:eyeIndex,weight:-1}));
    manager.registerExpression(expression);
    for(const r of records)owners.set(r.influences,owner);
  } catch(e) { reason=e.message; }

  function update(){
    if(disposed||!expression)return;
    const h=manager.getExpression('happy').outputWeight,b=manager.getExpression('blink').outputWeight;
    const sideBlink=(manager.getExpression('blinkLeft')?.outputWeight||0)+(manager.getExpression('blinkRight')?.outputWeight||0);
    skipped=sideBlink>0?'single-eye-expression-not-covered':null;
    coefficient=mode==='fixed'&&!skipped?Math.max(0,Math.min(1,h))*Math.max(0,Math.min(1,b)):0;
    manager.setValue(NAME,coefficient);
  }
  return {
    update,
    setMode(value){if(!['legacy','fixed'].includes(value))throw RangeError('Expected legacy or fixed');if(disposed)return{applied:false,reason:'disposed'};mode=value;update();return{applied:!!expression,reason};},
    getState:()=>({available:!!expression&&!disposed,mode,avatarSha256,method:'existing-eye-joy-negative-bind-per-primitive-v1',reason,skipped,coefficient,expressionName:expression?NAME:null,eyeTargetIndex:eyeIndex,sourceTargetCount:profile?.targets??null,targetedMeshes:targeted.map(r=>({name:r.mesh.name,uuid:r.mesh.uuid,materialRole:r.role})),protectedMeshes:protectedMeshes.map(r=>({name:r.mesh.name,uuid:r.mesh.uuid,materialRole:r.role}))}),
    dispose(){if(disposed)return;disposed=true;coefficient=0;if(expression){expression.clearAppliedWeight();if(manager.getExpression(NAME)===expression)manager.unregisterExpression(expression);expression=null;}for(const r of records)if(owners.get(r.influences)===owner)owners.delete(r.influences);},
  };
}
