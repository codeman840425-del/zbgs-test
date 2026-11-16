// Retargeting follows pixiv/three-vrm's MIT-licensed rest-world conversion.
// Animation data: Quaternius Universal Animation Library Standard, CC0.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { parseNormalizedMotion } from "./normalized-motion.js";

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

export async function loadRetargetedMotions(
  vrm,
  { walkClip = "Walk_Loop", avatarSha256 = null, targetFloorY = null } = {},
) {
  const source = await new GLTFLoader().loadAsync(
    "/assets/motion/UAL1_Standard.glb",
  );
  const jogProfile = await (await fetch("/assets/motion/m1c/jog-ordinary-derived-v1.profile.json")).json();
  const jogResponse = await fetch("/assets/motion/m1c/jog-ordinary-derived-v1.glb");
  if (!jogResponse.ok) throw new Error("Jog asset unavailable");
  const jogBytes = await jogResponse.arrayBuffer();
  const jogSha = [...new Uint8Array(await crypto.subtle.digest("SHA-256", jogBytes))].map(n => n.toString(16).padStart(2,"0")).join("");
  if (jogSha !== jogProfile.sha256) throw new Error("Jog resource identity mismatch");
  const jogSource = await new GLTFLoader().parseAsync(jogBytes, "/assets/motion/m1c/");
  jogSource.scene.updateWorldMatrix(true, true);
  const danceManifestResponse = await fetch("/assets/motion/m1c/dance-imports.json");
  if (!danceManifestResponse.ok) throw new Error("Dance manifest unavailable");
  const danceManifest = await danceManifestResponse.json();
  if (danceManifest.schema !== "m1.motion-import-list.1") throw new Error("Unsupported dance manifest");
  const unavailableDances=[];
  const danceEntries=danceManifest.entries.flatMap(entry=>{
    if(entry.format!=='normalized-vrm-motion.1') return [entry];
    const variant=entry.variants?.find(v=>v.avatarSha256===avatarSha256);
    if(!variant){unavailableDances.push({id:entry.id,reason:'No fitted clip for this exact avatar'});return [];}
    return [{...entry,...variant}];
  });
  const danceLibraries = await Promise.all(danceEntries.map(async entry => {
    const response = await fetch("/assets/motion/m1c/" + entry.file);
    if (!response.ok) throw new Error(`Dance asset unavailable: ${entry.id}`);
    const bytes = await response.arrayBuffer();
    const sha = [...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))].map(n=>n.toString(16).padStart(2,"0")).join("");
    if (sha !== entry.sha256) throw new Error(`Dance identity mismatch: ${entry.id}`);
    if (entry.rootPolicy !== "local-displacement") throw new Error(`Unsupported dance root policy: ${entry.id}`);
    if(entry.format==='normalized-vrm-motion.1') {
      if(bytes.byteLength!==entry.bytes) throw Error('Normalized motion byte count mismatch');
      const fitted=parseNormalizedMotion(JSON.parse(new TextDecoder().decode(bytes)),vrm,avatarSha256,entry);
      return {entry,fitted,key:'dance:'+entry.id};
    }
    const library = await new GLTFLoader().parseAsync(bytes,"/assets/motion/m1c/");
    library.scene.updateWorldMatrix(true,true);
    return {entry, library, key:"dance:"+entry.id};
  }));
  source.scene.updateWorldMatrix(true, true);
  vrm.scene.updateWorldMatrix(true, true);
  const sourceHips = source.scene.getObjectByName("pelvis");
  if (!sourceHips) throw new Error("Source motion missing Quaternius pelvis");
  const targetHips = vrm.humanoid.getNormalizedBoneNode("hips");
  const sourceRestHip = sourceHips.getWorldPosition(new THREE.Vector3());
  const targetRestHip = targetHips.getWorldPosition(new THREE.Vector3());
  // A fitted model may be translated inside its world-movement root to align
  // its source shoe plane. Retarget against that root's ground, not the shifted
  // model origin, or proportional hip travel silently retains the old height.
  const targetFloor = targetFloorY ?? vrm.scene.getWorldPosition(new THREE.Vector3()).y;
  if (!Number.isFinite(targetFloor)) throw new Error('Invalid retarget floor');
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
  // VRM0's normalized rig uses the opposite X/Z basis. rotateVRM0 rotates
  // the scene for display but does not convert local animation tracks.
  // Match three-vrm's official loadMixamoAnimation conversion for VRM0.
  const legacyBasis = vrm.meta?.metaVersion === "0";
  const clips = {};
  for (const [name, sourceName] of Object.entries({
    idle: "Idle_Loop",
    walk: walkClip,
    jog: jogProfile.clip,
    talk: "Idle_Talking_Loop",
    sitTalk: "Sitting_Talking_Loop",
    dance: "Dance_Loop",
    sitEnter: "Sitting_Enter",
    sitExit: "Sitting_Exit",
    sitIdle: "Sitting_Idle_Loop",
    ...Object.fromEntries(danceLibraries.map(d => [d.key, d.entry.clip])),
  })) {
    const fitted=danceLibraries.find(d=>d.key===name)?.fitted;
    if(fitted){clips[name]=fitted;continue;}
    const library = name === "jog" ? jogSource : danceLibraries.find(d => d.key === name)?.library || source;
    const clip = THREE.AnimationClip.findByName(library.animations, sourceName);
    if (!clip) throw new Error(`Missing source clip ${sourceName}`);
    const tracks = [];
    for (const track of clip.tracks) {
      const dot = track.name.lastIndexOf("."),
        sourceName = track.name.slice(0, dot),
        property = track.name.slice(dot + 1);
      const mapped = rigMap[sourceName],
        target = mapped && vrm.humanoid.getNormalizedBoneNode(mapped);
      if (["talk", "sitTalk"].includes(name) && (mapped === "hips" || /(?:UpperLeg|LowerLeg|Foot|Toes)$/.test(mapped || ""))) continue;
      const sourceBone = library.scene.getObjectByName(sourceName);
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
          if (legacyBasis) {
            q.x = -q.x;
            q.z = -q.z;
          }
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
          ["walk", "jog"].includes(name) ? last.clone().sub(first) : new THREE.Vector3();
        rootTravel.y = 0;
        for (let i = 0; i < track.values.length; i += 3) {
          const v = new THREE.Vector3()
            .fromArray(track.values, i)
            .applyMatrix4(sourceBone.parent.matrixWorld)
            .sub(sourceRestHip)
            .addScaledVector(rootTravel, -track.times[i / 3] / clip.duration)
            .applyQuaternion(correction)
            .multiplyScalar(ratio);
          if (legacyBasis) {
            v.x = -v.x;
            v.z = -v.z;
          }
          v.add(target.position);
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
  for (const library of [source, jogSource, ...danceLibraries.map(d=>d.library)].filter(Boolean)) library.scene.traverse((object) => {
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
    walkClip,
    jogDistance: jogProfile.cycleDistance * ratio,
    jogProfile,
    dances: danceLibraries.map(d=>({...d.entry,key:d.key,radius:d.fitted?d.entry.space.radiusTargetM:d.entry.space.radiusSourceM*ratio})),
    unavailableDances,
    // Official companion Root Motion GLB, both clips: +Z 1.2999999523 m
    // over 1.3333333731 s. Verified by scripts/calibrate-root-motion.py.
    // Use authored travel, not ankle excursion or instantaneous sole velocity.
    walkDistance: ["Walk_Loop", "Walk_Formal_Loop"].includes(walkClip)
      ? 1.2999999523162842 * ratio
      : null,
  };
}
