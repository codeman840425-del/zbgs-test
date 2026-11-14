// Retargeting follows pixiv/three-vrm's MIT-licensed rest-world conversion.
// Animation data: Quaternius Universal Animation Library Standard, CC0.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const rigMap = {
  pelvis: "hips",
  spine_01: "spine",
  spine_02: "chest",
  spine_03: "upperChest",
  neck_01: "neck",
  Head: "head",
  clavicle_l: "leftShoulder",
  upperarm_l: "leftUpperArm",
  lowerarm_l: "leftLowerArm",
  hand_l: "leftHand",
  clavicle_r: "rightShoulder",
  upperarm_r: "rightUpperArm",
  lowerarm_r: "rightLowerArm",
  hand_r: "rightHand",
  thigh_l: "leftUpperLeg",
  calf_l: "leftLowerLeg",
  foot_l: "leftFoot",
  ball_l: "leftToes",
  thigh_r: "rightUpperLeg",
  calf_r: "rightLowerLeg",
  foot_r: "rightFoot",
  ball_r: "rightToes",
};
for (const [suffix, side] of [
  ["l", "left"],
  ["r", "right"],
])
  for (const [finger, vrmFinger] of [
    ["index", "Index"],
    ["middle", "Middle"],
    ["ring", "Ring"],
    ["pinky", "Little"],
    ["thumb", "Thumb"],
  ]) {
    for (let i = 1; i <= 3; i++)
      rigMap[`${finger}_0${i}_${suffix}`] =
        side +
        vrmFinger +
        (finger === "thumb"
          ? ["Metacarpal", "Proximal", "Distal"][i - 1]
          : ["Proximal", "Intermediate", "Distal"][i - 1]);
  }

export async function loadRetargetedMotions(vrm) {
  const source = await new GLTFLoader().loadAsync(
    "/assets/motion/UAL1_Standard.glb",
  );
  source.scene.updateWorldMatrix(true, true);
  vrm.scene.updateWorldMatrix(true, true);
  const sourceHips = source.scene.getObjectByName("pelvis");
  if (!sourceHips) throw new Error("Source motion missing Quaternius pelvis");
  const targetHips = vrm.humanoid.getNormalizedBoneNode("hips");
  const sourceRestHip = sourceHips.getWorldPosition(new THREE.Vector3());
  const targetRestHip = targetHips.getWorldPosition(new THREE.Vector3());
  const targetFloor = vrm.scene.getWorldPosition(new THREE.Vector3()).y;
  const ratio = (targetRestHip.y - targetFloor) / sourceRestHip.y;
  // Align facing using the left/right hip line, never the pelvis bone's local
  // pitch: that pitch is an authoring axis, not the character's facing.
  const lateral = source.scene
    .getObjectByName("thigh_l")
    .getWorldPosition(new THREE.Vector3())
    .sub(
      source.scene
        .getObjectByName("thigh_r")
        .getWorldPosition(new THREE.Vector3()),
    )
    .normalize();
  const forward = lateral.clone().cross(new THREE.Vector3(0, 1, 0));
  const correction = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    -Math.atan2(forward.x, forward.z),
  );
  const inverseCorrection = correction.clone().invert();
  const clips = {};
  for (const [name, sourceName] of Object.entries({
    idle: "Idle_Loop",
    walk: "Walk_Loop",
    dance: "Dance_Loop",
    sitEnter: "Sitting_Enter",
    sitExit: "Sitting_Exit",
    sitIdle: "Sitting_Idle_Loop",
  })) {
    const clip = THREE.AnimationClip.findByName(source.animations, sourceName);
    if (!clip) throw new Error(`Missing source clip ${sourceName}`);
    const tracks = [];
    for (const track of clip.tracks) {
      const dot = track.name.lastIndexOf("."),
        sourceName = track.name.slice(0, dot),
        property = track.name.slice(dot + 1);
      const mapped = rigMap[sourceName],
        target = mapped && vrm.humanoid.getNormalizedBoneNode(mapped);
      const sourceBone = source.scene.getObjectByName(sourceName);
      if (!target || !sourceBone) continue;
      if (property === "quaternion") {
        const inverseRest = sourceBone
          .getWorldQuaternion(new THREE.Quaternion())
          .invert();
        const parentRest = sourceBone.parent.getWorldQuaternion(
          new THREE.Quaternion(),
        );
        const values = [];
        for (let i = 0; i < track.values.length; i += 4) {
          const q = new THREE.Quaternion()
            .fromArray(track.values, i)
            .premultiply(parentRest)
            .multiply(inverseRest)
            .premultiply(correction)
            .multiply(inverseCorrection);
          q.multiply(target.quaternion);
          values.push(...q.toArray());
        }
        tracks.push(
          new THREE.QuaternionKeyframeTrack(
            `${target.name}.quaternion`,
            track.times.slice(),
            values,
          ),
        );
      } else if (property === "position" && mapped === "hips") {
        const values = [],
          first = new THREE.Vector3()
            .fromArray(track.values, 0)
            .applyMatrix4(sourceBone.parent.matrixWorld);
        const last = new THREE.Vector3()
          .fromArray(track.values, track.values.length - 3)
          .applyMatrix4(sourceBone.parent.matrixWorld);
        const rootTravel =
          name === "walk" ? last.clone().sub(first) : new THREE.Vector3();
        rootTravel.y = 0;
        for (let i = 0; i < track.values.length; i += 3) {
          const v = new THREE.Vector3()
            .fromArray(track.values, i)
            .applyMatrix4(sourceBone.parent.matrixWorld)
            .sub(sourceRestHip)
            .addScaledVector(rootTravel, -track.times[i / 3] / clip.duration)
            .applyQuaternion(correction)
            .multiplyScalar(ratio)
            .add(target.position);
          values.push(...v.toArray());
        }
        tracks.push(
          new THREE.VectorKeyframeTrack(
            `${target.name}.position`,
            track.times.slice(),
            values,
          ),
        );
      }
    }
    clips[name] = new THREE.AnimationClip(
      `retargeted-${sourceName}`,
      clip.duration,
      tracks,
    );
  }
  // Source model is used for conversion only and never added to the game scene.
  source.scene.traverse((object) => {
    if (object.isMesh) {
      object.geometry.dispose();
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material]) {
        for (const value of Object.values(material))
          if (value?.isTexture) value.dispose();
        material.dispose();
      }
    }
  });
  return {
    clips,
    source: "Quaternius Universal Animation Library Standard / CC0",
    retarget: "pixiv three-vrm rest-world conversion adapted for glTF axes",
    ratio,
  };
}
