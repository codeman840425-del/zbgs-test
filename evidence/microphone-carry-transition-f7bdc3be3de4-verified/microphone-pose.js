import * as THREE from 'three';

const V = THREE.Vector3, Q = THREE.Quaternion, M = THREE.Matrix4;

// A microphone is aimed by its capsule, not by the wrist or a head-bone offset.
// The existing raw-hand grip stays rigid: rotating the microphone rotates the
// same fitted hand/finger pose, rather than changing its attachment afterwards.
export function microphoneHandTarget({capsule, axis, side, capsuleLocal, mount, rawToNormalized}) {
  const y = axis.clone().normalize();
  const x = side.clone().addScaledVector(y, -side.dot(y)).normalize();
  if (x.lengthSq() < .99) throw new Error('Microphone aim has no stable roll reference');
  const microphoneQuaternion = new Q().setFromRotationMatrix(new M().makeBasis(x, y, new V().crossVectors(x, y)));
  const rawHandQuaternion = microphoneQuaternion.clone().multiply(new Q(...mount.quaternion).invert());
  const origin = capsule.clone().sub(new V(...capsuleLocal).applyQuaternion(microphoneQuaternion));
  const wrist = origin.clone().sub(new V(...mount.position).applyQuaternion(rawHandQuaternion));
  return {wrist, handQuaternion: rawHandQuaternion.multiply(rawToNormalized), microphoneQuaternion, origin};
}

export function microphoneElbow(shoulder, wrist, lengths, pole) {
  const direction=wrist.clone().sub(shoulder), wanted=direction.length();
  direction.normalize();
  const length=THREE.MathUtils.clamp(wanted,Math.abs(lengths[0]-lengths[1])+1e-5,lengths[0]+lengths[1]-1e-5);
  const along=(lengths[0]**2-lengths[1]**2+length**2)/(2*length);
  const height=Math.sqrt(Math.max(0,lengths[0]**2-along**2));
  const bend=pole.clone().addScaledVector(direction,-pole.dot(direction)).normalize();
  return {elbow:shoulder.clone().addScaledVector(direction,along).addScaledVector(bend,height),reachable:shoulder.clone().addScaledVector(direction,length),clamped:Math.abs(wanted-length)>.001};
}

// The shaft leaves one free roll angle. Align its palm-longitudinal axis to
// the actual forearm, not the shoulder-to-prop line. The wrist position moves
// slightly as this rigid grip rolls; four bounded geometric refinements avoid
// accumulating per-frame pose state or searching arbitrary rotation offsets.
export function microphoneArmTarget(options) {
  let side=options.capsule.clone().sub(options.shoulder),target;
  for(let i=0;i<4;i++) {
    target=microphoneHandTarget({...options,side});
    const arm=microphoneElbow(options.shoulder,target.wrist,options.lengths,options.pole);
    side=target.wrist.clone().sub(arm.elbow);
  }
  return target;
}

// A lowered microphone has no acoustic target. Choose the relaxed wrist first,
// then put the rigid fitted grip on it; don't bend the wrist to reach a capsule
// target and an independently fixed shaft angle at the same time.
export function microphoneCarryTarget(options) {
  const arm=microphoneElbow(options.shoulder,options.wrist,options.lengths,options.pole);
  const side=arm.reachable.clone().sub(arm.elbow).normalize();
  const axis=options.up.clone().addScaledVector(side,-options.up.dot(side)).normalize();
  const target=microphoneHandTarget({...options,capsule:new V(),axis,side});
  const shift=arm.reachable.clone().sub(target.wrist);
  target.origin.add(shift);target.wrist.copy(arm.reachable);
  target.capsule=new V(...options.capsuleLocal).applyQuaternion(target.microphoneQuaternion).add(target.origin);
  return target;
}
