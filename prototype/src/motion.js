import * as THREE from "three";

const V = THREE.Vector3;
const Q = THREE.Quaternion;
const clamp = THREE.MathUtils.clamp;
const smooth = (x) => x * x * (3 - 2 * x);
const TAU = Math.PI * 2;

/** Analytic two-bone IK. A separate pole controls the knee/elbow plane.
 * Exported for regression tests. Returns a reachable target and bend point;
 * no engine-specific decomposition or non-uniform-scale multiplication.
 */
export function solveLimb(hip, target, first, second, pole) {
  const direction = target.clone().sub(hip);
  const wantedDistance = direction.length();
  if (wantedDistance < 1e-8) direction.set(0, -1, 0);
  else direction.divideScalar(wantedDistance);
  const length = clamp(
    wantedDistance,
    Math.abs(first - second) + 1e-5,
    first + second - 1e-5,
  );
  const along =
    (first * first - second * second + length * length) / (2 * length);
  const height = Math.sqrt(Math.max(0, first * first - along * along));
  const bend = pole.clone().addScaledVector(direction, -pole.dot(direction));
  if (bend.lengthSq() < 1e-10) {
    bend.set(
      Math.abs(direction.x) < 0.8 ? 1 : 0,
      Math.abs(direction.x) < 0.8 ? 0 : 1,
      0,
    );
    bend.addScaledVector(direction, -bend.dot(direction));
  }
  bend.normalize();
  return {
    knee: hip
      .clone()
      .addScaledVector(direction, along)
      .addScaledVector(bend, height),
    target: hip.clone().addScaledVector(direction, length),
    clamped: Math.abs(wantedDistance - length) > 0.001,
  };
}

function worldPoint(node) {
  return node.getWorldPosition(new V());
}

// A knee pole is a bend-plane direction, not the upper-leg vector. Project
// against the ORIGINAL hip-to-ankle axis before changing the ankle target.
export function kneeBendDirection(hip, knee, ankle, fallback) {
  const axis = ankle.clone().sub(hip).normalize();
  const bend = knee.clone().sub(hip);
  bend.addScaledVector(axis, -bend.dot(axis));
  return bend.lengthSq() > 0.000025
    ? bend.normalize()
    : fallback.clone().normalize();
}
function rotateSegment(bone, child, point) {
  const at = worldPoint(bone);
  const current = worldPoint(child).sub(at).normalize();
  const desired = point.clone().sub(at).normalize();
  const delta = new Q().setFromUnitVectors(current, desired);
  const world = bone.getWorldQuaternion(new Q());
  const parent = bone.parent?.getWorldQuaternion(new Q()) ?? new Q();
  bone.quaternion.copy(parent.invert().multiply(delta).multiply(world));
  bone.updateWorldMatrix(true, true);
}

/** Root translation/yaw belongs to the path controller. This module only poses
 * normalized VRM humanoid bones. Call vrm.update(dt) AFTER update().
 * +Z is forward, Y is up, floor is y=0, VRM scene must already have unit scale.
 */
export function createMotion(vrm, suppliedRoot, motions = null) {
  const root = suppliedRoot ?? vrm.scene.parent ?? vrm.scene;
  const bone = (name) => vrm.humanoid.getNormalizedBoneNode(name);
  const names = [
    "hips",
    "spine",
    "chest",
    "upperChest",
    "neck",
    "head",
    ...["left", "right"].flatMap((side) =>
      [
        "UpperLeg",
        "LowerLeg",
        "Foot",
        "Toes",
        "Shoulder",
        "UpperArm",
        "LowerArm",
        "Hand",
      ].map((part) => side + part),
    ),
  ];
  const nodes = Object.fromEntries(
    names.map((name) => [name, bone(name)]).filter(([, node]) => node),
  );
  for (const name of [
    "hips",
    "leftUpperLeg",
    "leftLowerLeg",
    "leftFoot",
    "rightUpperLeg",
    "rightLowerLeg",
    "rightFoot",
  ]) {
    if (!nodes[name])
      throw new Error(`VRM normalized humanoid missing required bone: ${name}`);
  }
  root.updateWorldMatrix(true, true);
  const rest = new Map(
    Object.values(nodes).map((node) => [
      node,
      {
        position: node.position.clone(),
        quaternion: node.quaternion.clone(),
        scale: node.scale.clone(),
      },
    ]),
  );
  const authoredPose = new Map();
  function saveAuthoredPose() {
    for (const node of rest.keys()) {
      authoredPose.set(node, {
        position: node.position.clone(),
        quaternion: node.quaternion.clone(),
        scale: node.scale.clone(),
      });
    }
  }
  const restHip = root.worldToLocal(worldPoint(nodes.hips));
  const rootQuaternion = () => root.getWorldQuaternion(new Q());
  const vector = (value) => value.clone().applyQuaternion(rootQuaternion());
  const point = (value) => root.localToWorld(value.clone());
  const feet = ["left", "right"].map((side, index) => {
    const upper = nodes[side + "UpperLeg"],
      lower = nodes[side + "LowerLeg"],
      foot = nodes[side + "Foot"];
    const ankle = worldPoint(foot),
      knee = worldPoint(lower),
      hip = worldPoint(upper);
    return {
      side,
      index,
      upper,
      lower,
      foot,
      first: hip.distanceTo(knee),
      second: knee.distanceTo(ankle),
      local: root.worldToLocal(ankle.clone()),
      restWorldQuaternion: rootQuaternion()
        .invert()
        .multiply(foot.getWorldQuaternion(new Q())),
      target: ankle.clone(),
      anchor: ankle.clone(),
      swingFrom: ankle.clone(),
      contact: true,
      slip: 0,
      clamped: false,
      swing: false,
      swingStartPhase: 0.6,
      lastActual: ankle.clone(),
      contactTravel: 0,
    };
  });
  const legLength =
    (feet[0].first + feet[0].second + feet[1].first + feet[1].second) / 2;
  let stride = legLength * 1.15;
  const stance = 0.6;
  const ankleHeight = (feet[0].local.y + feet[1].local.y) / 2;
  const seatHeight =
    (feet[0].second + feet[1].second) / 2 + ankleHeight - 0.025;
  const seatBack = legLength * 0.23;
  // Root/ankles stay in front of the seat throughout entry and exit. Only the
  // pelvis reaches backward. Sharing the seated root with an upright pose put
  // the standing shins inside the seat slab.
  const seatApproach = legLength * 0.31;
  const arms = ["left", "right"]
    .map((side, index) => {
      const upper = nodes[side + "UpperArm"],
        lower = nodes[side + "LowerArm"],
        hand = nodes[side + "Hand"];
      if (!upper || !lower || !hand) return null;
      return {
        side,
        sign: index === 0 ? 1 : -1,
        upper,
        lower,
        hand,
        first: worldPoint(upper).distanceTo(worldPoint(lower)),
        second: worldPoint(lower).distanceTo(worldPoint(hand)),
      };
    })
    .filter(Boolean);
  let sourceMixer = null,
    sourceWalk = null,
    sourceIdle = null,
    sourceActions = {},
    sourceSitHip = null;
  if (motions?.clips?.walk && motions?.clips?.idle) {
    sourceMixer = new THREE.AnimationMixer(vrm.scene);
    for (const [name, clip] of Object.entries(motions.clips)) {
      const a = sourceMixer.clipAction(clip);
      a.play();
      a.paused = true;
      a.setEffectiveWeight(0);
      sourceActions[name] = a;
    }
    sourceWalk = sourceActions.walk;
    sourceIdle = sourceActions.idle;
    sourceIdle.setEffectiveWeight(0);
    sourceWalk.setEffectiveWeight(1);
    for (const foot of feet)
      foot.sourceBounds = {
        minY: Infinity,
        maxY: -Infinity,
        minZ: Infinity,
        maxZ: -Infinity,
      };
    for (let i = 0; i < 120; i++) {
      sourceWalk.time = (i / 120) * motions.clips.walk.duration;
      sourceMixer.update(0);
      root.updateWorldMatrix(true, true);
      for (const foot of feet) {
        const p = root.worldToLocal(worldPoint(foot.foot)),
          b = foot.sourceBounds;
        b.minY = Math.min(b.minY, p.y);
        b.maxY = Math.max(b.maxY, p.y);
        b.minZ = Math.min(b.minZ, p.z);
        b.maxZ = Math.max(b.maxZ, p.z);
      }
    }
    stride = clamp(
      feet.reduce(
        (sum, foot) =>
          sum + 2 * (foot.sourceBounds.maxZ - foot.sourceBounds.minZ),
        0,
      ) / 2,
      legLength * 0.7,
      legLength * 1.7,
    );
    if (sourceActions.sitIdle) {
      sourceWalk.setEffectiveWeight(0);
      sourceActions.sitIdle.setEffectiveWeight(1);
      sourceActions.sitIdle.time = 0;
      sourceMixer.update(0);
      root.updateWorldMatrix(true, true);
      sourceSitHip = root.worldToLocal(worldPoint(nodes.hips));
      sourceActions.sitIdle.setEffectiveWeight(0);
    }
    saveAuthoredPose();
    for (const [node, pose] of rest) {
      node.position.copy(pose.position);
      node.quaternion.copy(pose.quaternion);
    }
    root.updateWorldMatrix(true, true);
  }
  let requested = "idle",
    previousAction = "idle",
    clock = 0,
    actionTime = 0,
    phase = stance / 2,
    distance = 0;
  let sitProgress = 0,
    gait = 0,
    danceMix = 0,
    danceClock = 0,
    wasMoving = false,
    previousYaw = root.rotation.y;
  let peakSlip = 0,
    frame = 0,
    turning = false,
    wasTurning = false,
    turnPhase = stance / 2,
    adaptiveHipDrop = 0;

  function restore(poses = rest) {
    for (const [node, pose] of poses) {
      node.position.copy(pose.position);
      node.quaternion.copy(pose.quaternion);
      node.scale.copy(pose.scale);
    }
    root.updateWorldMatrix(true, true);
  }
  function resetContacts() {
    for (const foot of feet) {
      foot.target.copy(point(foot.local));
      foot.anchor.copy(foot.target);
      foot.swingFrom.copy(foot.target);
      foot.lastActual.copy(foot.target);
      foot.contact = true;
      foot.swing = false;
      foot.slip = 0;
      foot.contactTravel = 0;
    }
  }
  function setAction(action) {
    if (!["idle", "walk", "sit", "stand", "dance", "turn"].includes(action))
      throw new Error(`Unknown motion action: ${action}`);
    if (requested === action) return;
    previousAction = requested;
    requested = action;
    actionTime = 0;
    if (action === "dance" || previousAction === "dance") resetContacts();
  }
  function solveChain(upper, lower, end, target, first, second, pole) {
    const solved = solveLimb(worldPoint(upper), target, first, second, pole);
    rotateSegment(upper, lower, solved.knee);
    rotateSegment(lower, end, solved.target);
    return solved;
  }
  function poseArms() {
    for (const arm of arms) {
      const length = arm.first + arm.second;
      let offset = new V(
        arm.sign * length * 0.13,
        -length * 0.91,
        length * 0.08,
      );
      if (danceMix > 0.001) {
        const wave = Math.sin(
          (danceClock * TAU) / 4 + (arm.sign < 0 ? Math.PI : 0),
        );
        offset.lerp(
          new V(
            arm.sign * length * (0.35 + 0.2 * wave),
            length * (0.15 + 0.6 * wave),
            length * 0.32,
          ),
          danceMix,
        );
      } else if (sitProgress > 0.001) {
        offset.lerp(
          new V(arm.sign * length * 0.05, -length * 0.57, length * 0.5),
          sitProgress,
        );
      } else {
        const swing =
          Math.sin(phase * TAU + (arm.sign > 0 ? Math.PI : 0)) * gait;
        offset.z += length * 0.36 * swing;
        offset.y += length * 0.08 * Math.abs(swing);
      }
      const target = worldPoint(arm.upper).add(vector(offset));
      // With +Z forward, relaxed elbows lie behind the wrist, not in front of
      // it. A forward pole produced visibly reversed elbows when arms lowered.
      solveChain(
        arm.upper,
        arm.lower,
        arm.hand,
        target,
        arm.first,
        arm.second,
        vector(new V(arm.sign * 0.25, 0, -1)),
      );
    }
  }
  function update(dt, state = {}) {
    dt = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.05);
    if (state.action && state.action !== requested) setAction(state.action);
    const step = Math.max(
      0,
      Number.isFinite(state.distanceDelta) ? state.distanceDelta : 0,
    );
    const moving =
      Boolean(state.moving) &&
      step > 1e-7 &&
      requested !== "sit" &&
      requested !== "dance";
    const yawDelta = Math.atan2(
      Math.sin(root.rotation.y - previousYaw),
      Math.cos(root.rotation.y - previousYaw),
    );
    turning = !moving && (Boolean(state.turning) || Math.abs(yawDelta) > 0.005);
    if (turning && !wasTurning) {
      turnPhase = stance / 2;
      for (const foot of feet) {
        foot.anchor.copy(foot.lastActual);
        foot.swingFrom.copy(foot.lastActual);
        foot.target.copy(foot.lastActual);
        foot.swing = false;
      }
    }
    if (turning) turnPhase = (turnPhase + Math.abs(yawDelta) / 1.0) % 1;
    previousYaw = root.rotation.y;
    clock += dt;
    actionTime += dt;
    frame++;
    distance += step;
    if (moving && !wasMoving) {
      // A new stride starts at mid-support, because idle feet are underneath
      // the pelvis. Reusing an arbitrary old phase could hold that foot for a
      // whole stance and drag it beyond reach after restarting or reversing.
      phase = stance / 2;
      for (const foot of feet) {
        foot.anchor.copy(foot.lastActual);
        foot.anchor.y = point(foot.local).y;
        foot.target.copy(foot.anchor);
        foot.swingFrom.copy(foot.target);
        foot.swing = false;
      }
    }
    if (moving) phase = (phase + step / stride) % 1;
    gait = THREE.MathUtils.damp(gait, moving ? 1 : 0, moving ? 10 : 13, dt);
    danceMix = THREE.MathUtils.damp(
      danceMix,
      requested === "dance" ? 1 : 0,
      8,
      dt,
    );
    if (danceMix > 0.001) danceClock += dt;
    else danceClock = 0;
    const sitTarget = requested === "sit" ? 1 : 0;
    if (sourceActions.sitEnter && requested === "sit")
      sitProgress = smooth(
        clamp(actionTime / motions.clips.sitEnter.duration, 0, 1),
      );
    else if (sourceActions.sitExit && requested === "stand")
      sitProgress =
        1 - smooth(clamp(actionTime / motions.clips.sitExit.duration, 0, 1));
    else sitProgress = THREE.MathUtils.damp(sitProgress, sitTarget, 4.5, dt);
    if (Math.abs(sitProgress - sitTarget) < 0.001) sitProgress = sitTarget;
    const sourceActive = !!sourceMixer;
    // Three's mixer skips writing unchanged tracks. Restore its last output,
    // not the bind pose or last frame's IK result, before evaluating again.
    restore(sourceActive ? authoredPose : rest);
    if (sourceActive) {
      for (const a of Object.values(sourceActions)) a.setEffectiveWeight(0);
      sourceWalk.time = phase * motions.clips.walk.duration;
      sourceIdle.time = clock % motions.clips.idle.duration;
      if (requested === "sit" && sourceActions.sitEnter) {
        const enter = actionTime < motions.clips.sitEnter.duration,
          a = enter ? sourceActions.sitEnter : sourceActions.sitIdle;
        a.time = enter
          ? Math.min(actionTime, motions.clips.sitEnter.duration - 1e-5)
          : (actionTime - motions.clips.sitEnter.duration) %
            motions.clips.sitIdle.duration;
        a.setEffectiveWeight(1);
      } else if (requested === "stand" && sourceActions.sitExit) {
        sourceActions.sitExit.time = Math.min(
          actionTime,
          motions.clips.sitExit.duration - 1e-5,
        );
        sourceActions.sitExit.setEffectiveWeight(1);
      } else if (danceMix > 0.001 && sourceActions.dance) {
        sourceActions.dance.time = danceClock % motions.clips.dance.duration;
        sourceActions.dance.setEffectiveWeight(danceMix);
        sourceIdle.setEffectiveWeight(1 - danceMix);
      } else {
        sourceWalk.setEffectiveWeight(gait);
        sourceIdle.setEffectiveWeight(1 - gait);
      }
      sourceMixer.update(0);
      saveAuthoredPose();
      root.updateWorldMatrix(true, true);
      for (const foot of feet) {
        foot.sourceLocal = root.worldToLocal(worldPoint(foot.foot));
        foot.sourcePole = kneeBendDirection(
          worldPoint(foot.upper),
          worldPoint(foot.lower),
          worldPoint(foot.foot),
          vector(new V(0, 0, 1)),
        );
        foot.sourceQuaternion = foot.foot.getWorldQuaternion(new Q());
      }
    }

    const hipOffset = new V(
      0,
      sourceActive
        ? 0
        : (-legLength * (0.01 + 0.06 * gait) -
            0.008 * gait * (1 - Math.cos(phase * TAU * 2))) *
            (1 - sitProgress),
      0,
    );
    // The hip bone is inside the pelvis, not its underside. Reserve 20 cm
    // above the seat plane for the avatar's pelvis/cloth volume. Keep ankles
    // on the floor and solve the knees; never lower the chair to hide contact.
    if (sourceActive && sourceSitHip) {
      hipOffset.y += (seatHeight + 0.2 - sourceSitHip.y) * sitProgress;
      hipOffset.z += (-seatBack - seatApproach - sourceSitHip.z) * sitProgress;
    } else {
      hipOffset.y -= (restHip.y - seatHeight - 0.2) * sitProgress;
      hipOffset.z -= (seatBack + seatApproach) * sitProgress;
    }
    if (danceMix > 0.001 && !sourceActive) {
      hipOffset.y += 0.012 * Math.sin(danceClock * TAU) * danceMix;
      nodes.spine?.rotateZ(0.16 * Math.sin((danceClock * TAU) / 4) * danceMix);
      nodes.chest?.rotateY(0.12 * Math.sin((danceClock * TAU) / 4) * danceMix);
      nodes.head?.rotateZ(-0.08 * Math.sin((danceClock * TAU) / 4) * danceMix);
    } else if (!sourceActive) {
      nodes.spine?.rotateY(0.045 * gait * Math.sin(phase * TAU));
      nodes.head?.rotateY(0.025 * Math.sin(clock * 0.7));
    }
    // The library idle is a staggered, crouched stance. Gathering its feet to
    // the neutral stance while retaining its low pelvis forced the knees out.
    // Adapt the pelvis AND bend planes together to an upright relaxed idle.
    // Authored walk, seated and dance poses retain full weight in their states.
    const uprightMix = sourceActive
      ? (1 - gait) * (1 - sitProgress) * (1 - danceMix)
      : 0;
    const hipLocal = root.worldToLocal(worldPoint(nodes.hips));
    const uprightHip = new V(
      restHip.x + (hipLocal.x - restHip.x) * 0.15,
      restHip.y - 0.004,
      restHip.z + (hipLocal.z - restHip.z) * 0.15,
    );
    hipLocal.lerp(uprightHip, uprightMix);
    const hipWorld = point(hipLocal).add(vector(hipOffset));
    nodes.hips.position.copy(nodes.hips.parent.worldToLocal(hipWorld));
    root.updateWorldMatrix(true, true);

    for (const foot of feet) {
      const footPhase = (phase + foot.index * 0.5) % 1;
      const desiredRest = point(foot.local);
      foot.previousContact = foot.contact;
      if (moving && sourceActive) {
        // Use the authored swing trajectory and contact interval. Only the
        // planted endpoint is corrected; hip, shoulder, arm and knee motion
        // comes from the retargeted animation rather than a sine-wave gait.
        const p = foot.sourceLocal.clone(),
          b = foot.sourceBounds;
        const lifted = (p.y - b.minY) * gait > 0.024;
        p.y += foot.local.y - b.minY;
        const authored = desiredRest.clone().lerp(point(p), gait);
        if (lifted) {
          foot.target.copy(authored);
          foot.contact = false;
        } else {
          if (!foot.contact) foot.anchor.copy(authored);
          foot.target.copy(foot.anchor);
          foot.contact = true;
        }
        foot.swing = lifted;
      } else if (moving && !turning) {
        const inSwing = footPhase >= stance;
        if (inSwing) {
          if (!foot.swing) {
            foot.swingFrom.copy(foot.target);
            foot.swingStartPhase = footPhase;
          }
          const t = clamp(
            (footPhase - foot.swingStartPhase) / (1 - foot.swingStartPhase),
            0,
            1,
          );
          const ahead = stride * (1 - footPhase + stance * 0.5);
          const landing = point(
            new V(foot.local.x, foot.local.y, foot.local.z + ahead),
          );
          foot.target.copy(foot.swingFrom).lerp(landing, smooth(t));
          foot.target.y += Math.sin(Math.PI * t) * legLength * 0.12;
          foot.contact = false;
        } else {
          if (foot.swing) {
            foot.anchor.copy(
              point(
                new V(
                  foot.local.x,
                  foot.local.y,
                  foot.local.z + stride * stance * 0.5,
                ),
              ),
            );
          }
          foot.target.copy(foot.anchor);
          foot.contact = true;
        }
        foot.swing = inSwing;
      } else if (turning) {
        // Turn by small alternating steps. A planted foot retains its WORLD
        // anchor while the pelvis rotates; the free foot lands toward the new
        // heading. This must not be represented as two sliding idle feet.
        const p = (turnPhase + foot.index * 0.5) % 1;
        const inSwing = p >= stance;
        if (inSwing) {
          if (!foot.swing) {
            foot.swingFrom.copy(foot.target);
            foot.swingStartPhase = p;
          }
          const t = clamp(
            (p - foot.swingStartPhase) / (1 - foot.swingStartPhase),
            0,
            1,
          );
          const futureYaw = Math.sign(yawDelta) * (1 - p) * 1.0;
          const landing = point(
            foot.local.clone().applyAxisAngle(new V(0, 1, 0), futureYaw),
          );
          foot.target.copy(foot.swingFrom).lerp(landing, smooth(t));
          foot.target.y += Math.sin(Math.PI * t) * legLength * 0.07;
          foot.contact = false;
        } else {
          if (foot.swing) foot.anchor.copy(desiredRest);
          foot.target.copy(foot.anchor);
          foot.contact = true;
        }
        foot.swing = inSwing;
      } else if (requested === "dance" && sourceActive) {
        foot.target.copy(point(foot.sourceLocal));
        foot.contact = false;
        foot.swing = true;
      } else if (requested === "dance") {
        const wave = Math.sin((danceClock * TAU) / 4 + foot.index * Math.PI);
        const lift = Math.max(0, wave) ** 2 * danceMix;
        foot.target
          .copy(desiredRest)
          .add(
            vector(new V(0, legLength * 0.34 * lift, legLength * 0.22 * lift)),
          );
        foot.contact = lift < 0.002;
        foot.swing = !foot.contact;
        foot.anchor.copy(desiredRest);
      } else if (sitProgress > 0.01) {
        // The approach root is already outside the chair. Keep the soles here
        // for BOTH sit and stand instead of retracting them through the seat.
        foot.target.copy(desiredRest);
        foot.contact = true;
        foot.swing = false;
        foot.anchor.copy(foot.target);
      } else {
        // A stopped character gathers its feet over time; do not claim those
        // repositioning frames as a planted contact. Turn-in-place also releases.
        const blend = 1 - Math.exp(-dt * (turning ? 16 : 9));
        foot.target.lerp(desiredRest, blend);
        foot.contact = foot.target.distanceTo(desiredRest) < 0.004 && !turning;
        foot.swing = false;
        foot.anchor.copy(foot.target);
      }
    }
    // At a corner, the pelvis-to-planted-foot diagonal can grow. Lower the
    // pelvis by the geometric reach requirement instead of moving a planted
    // foot or silently declaring it airborne. Recovery is damped after lift.
    let requiredDrop = 0;
    if (moving || turning)
      for (const foot of feet)
        if (foot.contact) {
          const hip = worldPoint(foot.upper),
            reach = foot.first + foot.second - 0.001;
          const horizontal = Math.hypot(
            hip.x - foot.target.x,
            hip.z - foot.target.z,
          );
          if (horizontal < reach)
            requiredDrop = Math.max(
              requiredDrop,
              hip.y -
                foot.target.y -
                Math.sqrt(reach * reach - horizontal * horizontal),
            );
        }
    adaptiveHipDrop = Math.max(
      clamp(requiredDrop, 0, legLength * 0.12),
      THREE.MathUtils.damp(adaptiveHipDrop, 0, 12, dt),
    );
    if (adaptiveHipDrop > 1e-7 && sitProgress < 0.01) {
      const at = worldPoint(nodes.hips);
      at.y -= adaptiveHipDrop;
      nodes.hips.position.copy(nodes.hips.parent.worldToLocal(at));
      root.updateWorldMatrix(true, true);
    }
    for (const foot of feet) {
      const solved = solveChain(
        foot.upper,
        foot.lower,
        foot.foot,
        foot.target,
        foot.first,
        foot.second,
        sourceActive
          ? foot.sourcePole
              .clone()
              .lerp(vector(new V(0, 0, 1)), uprightMix)
              .normalize()
          : vector(new V(0, 0, 1)),
      );
      foot.clamped = solved.clamped;
      const parentQ = foot.foot.parent.getWorldQuaternion(new Q()).invert();
      if (sourceActive && (moving || requested === "dance"))
        foot.foot.quaternion.copy(parentQ.multiply(foot.sourceQuaternion));
      else
        foot.foot.quaternion.copy(
          parentQ.multiply(rootQuaternion()).multiply(foot.restWorldQuaternion),
        );
      foot.foot.updateWorldMatrix(true, true);
      const actual = worldPoint(foot.foot);
      foot.slip = foot.contact ? actual.distanceTo(foot.target) : 0;
      // Consecutive contact travel detects world-space sliding, independently
      // of reaching the target. Contact transitions are intentionally excluded.
      foot.contactTravel =
        foot.contact && foot.previousContact && (moving || turning)
          ? actual.distanceTo(foot.lastActual)
          : 0;
      peakSlip = Math.max(peakSlip, foot.slip);
      foot.lastActual.copy(actual);
    }
    if (!sourceActive) poseArms();
    wasMoving = moving;
    wasTurning = turning;
  }
  function getMetrics() {
    return {
      action: requested,
      actionTime,
      phase,
      distance,
      stride,
      gait,
      danceMix,
      sitProgress,
      seatHeight,
      seatBack,
      seatApproach,
      transitionComplete:
        requested === "sit" ? sitProgress > 0.995 : sitProgress < 0.005,
      moving: wasMoving,
      turning,
      turnPhase,
      adaptiveHipDrop,
      peakSlip,
      frame,
      motionSource: motions?.source ?? "procedural validation",
      sourceRetarget: motions?.retarget ?? null,
      sourceClips: motions
        ? {
            walkDuration: motions.clips.walk.duration,
            idleDuration: motions.clips.idle.duration,
            walkTracks: motions.clips.walk.tracks.length,
          }
        : null,
      feet: feet.map((foot) => ({
        side: foot.side,
        target: foot.target.toArray(),
        actual: worldPoint(foot.foot).toArray(),
        contact: foot.contact,
        slip: foot.slip,
        contactTravel: foot.contactTravel,
        reachClamp: foot.clamped,
      })),
      boneLengths: feet.map((foot) => ({
        side: foot.side,
        upper: foot.first,
        lower: foot.second,
      })),
    };
  }
  function reset() {
    requested = previousAction = "idle";
    clock =
      actionTime =
      distance =
      sitProgress =
      gait =
      danceMix =
      danceClock =
      peakSlip =
      frame =
        0;
    phase = stance / 2;
    wasMoving = wasTurning = false;
    adaptiveHipDrop = 0;
    turnPhase = stance / 2;
    previousYaw = root.rotation.y;
    restore();
    resetContacts();
  }
  return {
    update,
    setAction,
    getMetrics,
    snapshot: getMetrics,
    getSeatHeight: () => seatHeight,
    getSeatApproach: () => seatApproach,
    reset,
  };
}

export const createMotionController = createMotion;
