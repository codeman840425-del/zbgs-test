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
    const local = root.worldToLocal(ankle.clone());
    const restWorldQuaternion = rootQuaternion()
      .invert()
      .multiply(foot.getWorldQuaternion(new Q()));
    const toe = nodes[side + "Toes"];
    const toeLength = toe
      ? clamp(
          root.worldToLocal(worldPoint(toe)).z - local.z + 0.025,
          0.08,
          0.22,
        )
      : 0.14;
    // Contact landmarks in the FOOT frame. The rest sole lies on y=0.
    // Unlike locking the ankle, locking heel/toe permits authored foot roll.
    const soleOffsets = {
      heel: new V(0, -local.y, -0.045).applyQuaternion(
        restWorldQuaternion.clone().invert(),
      ),
      toe: new V(0, -local.y, toeLength).applyQuaternion(
        restWorldQuaternion.clone().invert(),
      ),
    };
    const toeOffset = toe
      ? new V(0, -root.worldToLocal(worldPoint(toe)).y, 0.025).applyQuaternion(
          rootQuaternion()
            .invert()
            .multiply(toe.getWorldQuaternion(new Q()))
            .invert(),
        )
      : null;
    return {
      side,
      index,
      upper,
      lower,
      foot,
      first: hip.distanceTo(knee),
      second: knee.distanceTo(ankle),
      local,
      restWorldQuaternion,
      soleOffsets,
      toe,
      toeOffset,
      anchorKind: null,
      supportWeight: 0,
      releaseOffset: new V(),
      lastCorrection: new V(),
      releasePhase: 1,
      lastSupport: ankle.clone(),
      lastSupportKind: null,
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
  // Calibrate against the loaded, CPU-deformed outsole, not an ankle-height
  // assumption. That assumption put the mathematical pivot on y=0 while the
  // real shoe still floated about 2 cm above it on this avatar.
  const shoeVertices = [];
  const normalizedForRaw = new Map();
  for (const [name, node] of Object.entries(nodes)) {
    const raw = vrm.humanoid.getRawBoneNode?.(name);
    if (raw)
      normalizedForRaw.set(raw, {
        node,
        inverseRest: node.matrixWorld.clone().invert(),
      });
  }
  vrm.scene.traverse((mesh) => {
    if (
      !mesh.isSkinnedMesh ||
      !(Array.isArray(mesh.material) ? mesh.material : [mesh.material]).some(
        (m) => /Shoes/i.test(m?.name),
      )
    )
      return;
    mesh.skeleton.update();
    const indices = mesh.geometry.attributes.skinIndex,
      weights = mesh.geometry.attributes.skinWeight;
    for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
      const world = mesh
        .getVertexPosition(i, new V())
        .applyMatrix4(mesh.matrixWorld);
      const influences = [];
      for (let k = 0; k < 4; k++) {
        const weight = weights.getComponent(i, k),
          source = normalizedForRaw.get(
            mesh.skeleton.bones[indices.getComponent(i, k)],
          );
        if (weight > 1e-6 && source) influences.push({ ...source, weight });
      }
      const local = root.worldToLocal(world.clone());
      shoeVertices.push({ local, world, influences });
    }
  });
  for (const foot of feet) {
    const sameFoot = shoeVertices.filter(
      (p) =>
        Math.abs(p.local.x - foot.local.x) < 0.07 &&
        p.influences.reduce((s, x) => s + x.weight, 0) > 0.999,
    );
    if (sameFoot.length < 8) continue;
    const toeAt = foot.toe
      ? root.worldToLocal(worldPoint(foot.toe))
      : foot.local.clone().add(new V(0, 0, 0.1));
    for (const kind of ["heel", "toe"]) {
      const region = sameFoot.filter((p) =>
        kind === "heel"
          ? p.local.z <= foot.local.z + 0.015
          : p.local.z >= foot.local.z + 0.015,
      );
      if (!region.length) continue;
      const bottom = Math.min(...region.map((p) => p.local.y));
      const low = region.filter((p) => p.local.y < bottom + 0.012);
      const center = low
        .reduce((sum, p) => sum.add(p.local), new V())
        .divideScalar(low.length);
      const owner = kind === "toe" && foot.toe ? foot.toe : foot.foot;
      const offset = point(center)
        .sub(worldPoint(owner))
        .applyQuaternion(owner.getWorldQuaternion(new Q()).invert());
      if (kind === "toe" && foot.toe) foot.toeOffset.copy(offset);
      else foot.soleOffsets[kind].copy(offset);
      foot.soleSamples ??= {};
      foot.soleSamples[kind] = () => {
        const points = low.map((vertex) =>
          vertex.influences.reduce(
            (sum, { node, inverseRest, weight }) =>
              sum.addScaledVector(
                vertex.world
                  .clone()
                  .applyMatrix4(inverseRest)
                  .applyMatrix4(node.matrixWorld),
                weight,
              ),
            new V(),
          ),
        );
        const minY = Math.min(...points.map((p) => p.y));
        let total = 0;
        const result = new V();
        // Soft minimum avoids a discontinuity when adjacent outsole vertices
        // exchange the lowest point during foot roll (1 mm smoothing width).
        for (const p of points) {
          const w = Math.exp(-(p.y - minY) / 0.001);
          total += w;
          result.addScaledVector(p, w);
        }
        result.divideScalar(total);
        // Horizontal lock follows a fixed patch of material. Do not move it
        // to whichever vertex happens to be lowest, which would itself slide
        // the shoe when the sole becomes flat. Only floor clearance uses minY.
        result.x = points.reduce((s, p) => s + p.x, 0) / points.length;
        result.z = points.reduce((s, p) => s + p.z, 0) / points.length;
        return result;
      };
      foot.landmarkMethod =
        "weighted Shoes patch XZ + outsole soft-min Y (1 mm)";
    }
  }
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
    sourceSitHip = null,
    sourceGroundLift = 0;
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
        minSoleY: Infinity,
        samples: [],
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
        const q = foot.foot.getWorldQuaternion(new Q());
        const sole = Object.fromEntries(
          Object.entries(foot.soleOffsets).map(([kind, offset]) => [
            kind,
            root.worldToLocal(
              worldPoint(foot.foot).add(offset.clone().applyQuaternion(q)),
            ),
          ]),
        );
        if (foot.toe)
          sole.toe.copy(
            root.worldToLocal(
              worldPoint(foot.toe).add(
                foot.toeOffset
                  .clone()
                  .applyQuaternion(foot.toe.getWorldQuaternion(new Q())),
              ),
            ),
          );
        if (foot.soleSamples)
          for (const kind of ["heel", "toe"])
            sole[kind].copy(root.worldToLocal(foot.soleSamples[kind]()));
        b.minSoleY = Math.min(b.minSoleY, sole.heel.y, sole.toe.y);
        b.samples.push(sole);
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
    // Fallback for clips without a verified Root Motion counterpart. Sole
    // velocity varies during heel roll and is not an authoritative stride.
    const supportSpeeds = [];
    for (const foot of feet) {
      const b = foot.sourceBounds;
      for (let i = 1; i < b.samples.length; i++)
        for (const kind of ["heel", "toe"]) {
          const previous = b.samples[i - 1][kind],
            current = b.samples[i][kind];
          const speed = (previous.z - current.z) * 120;
          if (
            previous.y < b.minSoleY + 0.009 &&
            current.y < b.minSoleY + 0.009 &&
            speed > legLength * 0.4 &&
            speed < legLength * 2.5
          )
            supportSpeeds.push(speed);
        }
      delete b.samples;
    }
    if (supportSpeeds.length >= 8) {
      supportSpeeds.sort((a, b) => a - b);
      stride = supportSpeeds[Math.floor(supportSpeeds.length / 2)];
    }
    if (Number.isFinite(motions.walkDistance) && motions.walkDistance > 0)
      stride = motions.walkDistance;
    sourceGroundLift = -Math.min(
      ...feet.map((foot) => foot.sourceBounds.minSoleY),
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
  const corrections = { footIK: true, pelvis: true };
  let lastInput = {};
  let stopTime = 1;
  let interruptionPose = null,
    interruptionAge = 1;
  let lastFrameDt = 0,
    lastPhaseDelta = 0,
    authoredHipWorld = worldPoint(nodes.hips);
  const supportSurfaceDelta = new V();

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
      foot.anchorKind = foot.lastSupportKind = null;
      foot.supportWeight = 0;
      foot.releaseOffset.set(0, 0, 0);
      foot.lastCorrection.set(0, 0, 0);
      foot.releasePhase = 1;
    }
  }
  function setAction(action) {
    if (!["idle", "walk", "sit", "stand", "dance", "turn"].includes(action))
      throw new Error(`Unknown motion action: ${action}`);
    if (requested === action) return;
    previousAction = requested;
    requested = action;
    actionTime = 0;
    if (
      (action === "stand" && previousAction === "sit") ||
      (action === "sit" && previousAction === "stand")
    ) {
      const target = action === "stand" ? 1 - sitProgress : sitProgress;
      let lo = 0,
        hi = 1;
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        if (smooth(mid) < target) lo = mid;
        else hi = mid;
      }
      const duration =
        action === "stand"
          ? motions?.clips.sitExit?.duration
          : motions?.clips.sitEnter?.duration;
      if (duration) actionTime = ((lo + hi) / 2) * duration;
      interruptionPose = new Map(
        [...authoredPose].map(([node, p]) => [
          node,
          {
            position: p.position.clone(),
            quaternion: p.quaternion.clone(),
            scale: p.scale.clone(),
          },
        ]),
      );
      interruptionAge = 0;
    }
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
    const refreshing = state.refresh === true;
    lastFrameDt = dt;
    if (!refreshing) lastInput = { ...state };
    if (state.action && state.action !== requested) setAction(state.action);
    const step = Math.max(
      0,
      !refreshing && Number.isFinite(state.distanceDelta)
        ? state.distanceDelta
        : 0,
    );
    const moving = refreshing
      ? wasMoving
      : Boolean(state.moving) &&
        step > 1e-7 &&
        requested !== "sit" &&
        requested !== "dance";
    // Explicit in-place diagnostic uses a treadmill: the support surface moves
    // backward by virtual travel. Freezing root AND a world support anchor is
    // a different physical task and artificially stretches every planted leg.
    supportSurfaceDelta.copy(
      vector(new V(0, 0, state.treadmill && moving ? -step : 0)),
    );
    const yawDelta = Math.atan2(
      Math.sin(root.rotation.y - previousYaw),
      Math.cos(root.rotation.y - previousYaw),
    );
    turning = refreshing
      ? turning
      : !moving && (Boolean(state.turning) || Math.abs(yawDelta) > 0.005);
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
    interruptionAge += dt;
    frame++;
    distance += step;
    if (!moving && wasMoving && requested !== "sit" && requested !== "dance") {
      stopTime = 0;
      const order = [...feet].sort(
        (a, b) => Number(a.contact) - Number(b.contact),
      );
      order.forEach((foot, index) => {
        foot.stopOrder = index;
        foot.stopFrom = foot.lastActual.clone();
        foot.stopQuaternion = foot.foot.getWorldQuaternion(new Q());
        foot.stopWasContact = foot.contact;
      });
    }
    if (!moving) stopTime += dt;
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
    lastPhaseDelta = moving ? step / stride : 0;
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
      if (interruptionPose && interruptionAge < 0.16) {
        const blend = smooth(clamp(interruptionAge / 0.16, 0, 1));
        for (const [node, p] of interruptionPose) {
          node.position.lerpVectors(p.position, node.position, blend);
          node.quaternion.copy(
            p.quaternion.clone().slerp(node.quaternion, blend),
          );
        }
      } else interruptionPose = null;
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
        foot.sourceToeOffset = foot.toe
          ? worldPoint(foot.toe)
              .add(
                foot.toeOffset
                  .clone()
                  .applyQuaternion(foot.toe.getWorldQuaternion(new Q())),
              )
              .sub(worldPoint(foot.foot))
          : null;
        foot.sourceSoleOffsets = foot.soleSamples
          ? Object.fromEntries(
              ["heel", "toe"].map((kind) => [
                kind,
                foot.soleSamples[kind]().sub(worldPoint(foot.foot)),
              ]),
            )
          : null;
      }
    }

    authoredHipWorld = worldPoint(nodes.hips);
    const hipOffset = new V(
      0,
      sourceActive
        ? 0
        : (-legLength * (0.01 + 0.06 * gait) -
            0.008 * gait * (1 - Math.cos(phase * TAU * 2))) *
            (1 - sitProgress),
      0,
    );
    // Ground calibration translates the authored pelvis AND feet together.
    // Raising only ankle targets shortened both legs and introduced a crouch.
    if (sourceActive)
      hipOffset.y +=
        sourceGroundLift * gait * (1 - sitProgress) * (1 - danceMix);
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
    if (!corrections.pelvis) hipOffset.set(0, 0, 0);
    const uprightMix =
      sourceActive && corrections.pelvis
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
      if (state.treadmill && moving) foot.anchor.add(supportSurfaceDelta);
      const footPhase = (phase + foot.index * 0.5) % 1;
      const desiredRest = point(foot.local);
      foot.previousContact = foot.contact;
      if (!(moving && sourceActive)) {
        foot.anchorKind = null;
        foot.supportWeight = 0;
      }
      if (moving && sourceActive) {
        // Use the authored swing trajectory and contact interval. Only the
        // planted endpoint is corrected; hip, shoulder, arm and knee motion
        // comes from the retargeted animation rather than a sine-wave gait.
        const p = foot.sourceLocal.clone();
        p.y += sourceGroundLift;
        const authored = desiredRest.clone().lerp(point(p), gait);
        const offsets = Object.fromEntries(
          Object.entries(foot.soleOffsets).map(([kind, offset]) => [
            kind,
            offset.clone().applyQuaternion(foot.sourceQuaternion),
          ]),
        );
        if (foot.sourceToeOffset) offsets.toe.copy(foot.sourceToeOffset);
        if (foot.sourceSoleOffsets)
          for (const kind of ["heel", "toe"])
            offsets[kind].copy(foot.sourceSoleOffsets[kind]);
        const ground = root.getWorldPosition(new V()).y;
        const heights = {
          heel: authored.y + offsets.heel.y - ground,
          toe: authored.y + offsets.toe.y - ground,
        };
        foot.soleHeights = heights;
        let kind = heights.heel <= heights.toe ? "heel" : "toe";
        if (
          foot.anchorKind &&
          heights[foot.anchorKind] < heights[kind] + 0.0005
        )
          kind = foot.anchorKind;
        // Land near the floor rather than catching the still-forward-moving
        // heel at 8 mm. Use hysteresis while planted. On lift, carry the final
        // correction into swing and decay it over .16 cycle; returning directly
        // to the source trajectory caused the measured 4.2 cm one-frame jump.
        // The retargeted toe rises 1–2.5 cm through native mid/late support
        // because the target shoe/toe proportions differ. Preserve the already
        // established pivot through that roll; the authored toe-off exceeds
        // 3.5 cm near phase .59. A 12 mm cutoff released it in mid-stance.
        const releaseHeight = kind === "toe" ? 0.035 : 0.02;
        const active =
          heights[kind] < (foot.anchorKind ? releaseHeight : 0.003);
        if (!active) {
          if (foot.anchorKind) {
            foot.releaseOffset.copy(foot.lastCorrection);
            foot.releasePhase = 0;
          }
          foot.releasePhase = Math.min(
            1,
            foot.releasePhase + lastPhaseDelta / 0.16,
          );
          foot.target.copy(authored);
          foot.target.addScaledVector(
            foot.releaseOffset,
            1 - smooth(foot.releasePhase),
          );
          foot.contact = false;
          foot.anchorKind = null;
        } else {
          if (foot.anchorKind !== kind) {
            // Heel-to-toe transfer establishes a new sole anchor; the ankle
            // remains free to roll around that point with the source rotation.
            // Preserve the corrected ankle on transfer, not the uncorrected
            // source endpoint, or its accumulated correction snaps to zero.
            if (foot.anchorKind)
              foot.anchor.sub(offsets[foot.anchorKind]).add(offsets[kind]);
            else foot.anchor.copy(authored).add(offsets[kind]);
            foot.anchor.y = ground;
            foot.previousContact = false;
          }
          foot.anchorKind = kind;
          foot.target.copy(foot.anchor).sub(offsets[kind]);
          foot.contact = true;
        }
        foot.lastCorrection.copy(foot.target).sub(authored);
        foot.supportWeight = active ? 1 : 0;
        foot.swing = !active;
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
        // Finish the free leg first, then gather the other leg with a visible
        // short step. The old lerp dragged both shoes along the ground at stop.
        const t = clamp((stopTime - (foot.stopOrder ?? 0) * 0.24) / 0.24, 0, 1);
        foot.stopBlend = smooth(t);
        if (foot.stopFrom && t < 1) {
          foot.target.copy(foot.stopFrom).lerp(desiredRest, foot.stopBlend);
          const needsStep = foot.stopFrom.distanceTo(desiredRest) > 0.008;
          if (needsStep) foot.target.y += Math.sin(Math.PI * t) * 0.045;
          foot.contact = t === 0 && foot.stopWasContact;
        } else {
          foot.target.copy(desiredRest);
          foot.contact = true;
        }
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
    if (corrections.pelvis && adaptiveHipDrop > 1e-7 && sitProgress < 0.01) {
      const at = worldPoint(nodes.hips);
      at.y -= adaptiveHipDrop;
      nodes.hips.position.copy(nodes.hips.parent.worldToLocal(at));
      root.updateWorldMatrix(true, true);
    }
    for (const foot of feet) {
      const solved = corrections.footIK
        ? solveChain(
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
          )
        : { clamped: false };
      foot.clamped = solved.clamped;
      const parentQ = foot.foot.parent.getWorldQuaternion(new Q()).invert();
      if (!corrections.footIK) {
        // Diagnostic raw-retarget path: retain the mixer leg AND foot pose.
      } else if (
        !moving &&
        !turning &&
        sitProgress < 0.01 &&
        requested !== "dance" &&
        foot.stopQuaternion &&
        stopTime < 0.5
      )
        foot.foot.quaternion.copy(
          parentQ.multiply(
            foot.stopQuaternion
              .clone()
              .slerp(
                rootQuaternion().multiply(foot.restWorldQuaternion),
                foot.stopBlend ?? 0,
              ),
          ),
        );
      else if (sourceActive && (moving || requested === "dance"))
        foot.foot.quaternion.copy(parentQ.multiply(foot.sourceQuaternion));
      else
        foot.foot.quaternion.copy(
          parentQ.multiply(rootQuaternion()).multiply(foot.restWorldQuaternion),
        );
      foot.foot.updateWorldMatrix(true, true);
      const actual = worldPoint(foot.foot);
      const support =
        foot.anchorKind && foot.soleSamples
          ? foot.soleSamples[foot.anchorKind]()
          : foot.anchorKind === "toe" && foot.toe
            ? worldPoint(foot.toe).add(
                foot.toeOffset
                  .clone()
                  .applyQuaternion(foot.toe.getWorldQuaternion(new Q())),
              )
            : foot.anchorKind
              ? actual
                  .clone()
                  .add(
                    foot.soleOffsets[foot.anchorKind]
                      .clone()
                      .applyQuaternion(foot.foot.getWorldQuaternion(new Q())),
                  )
              : actual;
      foot.slip = foot.contact
        ? foot.anchorKind
          ? support.distanceTo(foot.anchor)
          : actual.distanceTo(foot.target)
        : 0;
      // Consecutive contact travel detects world-space sliding, independently
      // of reaching the target. Contact transitions are intentionally excluded.
      foot.contactTravel =
        foot.contact &&
        foot.previousContact &&
        foot.anchorKind === foot.lastSupportKind &&
        (moving || turning)
          ? support.distanceTo(
              foot.lastSupport.clone().add(supportSurfaceDelta),
            )
          : 0;
      peakSlip = Math.max(peakSlip, foot.slip);
      foot.lastActual.copy(actual);
      foot.lastSupport.copy(support);
      foot.lastSupportKind = foot.anchorKind;
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
      sourceGroundLift,
      stopTime,
      frameDt: lastFrameDt,
      phaseDelta: lastPhaseDelta,
      sourceTime: motions ? phase * motions.clips.walk.duration : null,
      rootWorld: root.getWorldPosition(new V()).toArray(),
      hipWorld: worldPoint(nodes.hips).toArray(),
      authoredHipWorld: authoredHipWorld.toArray(),
      hipCorrection: worldPoint(nodes.hips).sub(authoredHipWorld).toArray(),
      corrections: { ...corrections },
      treadmill: Boolean(lastInput.treadmill),
      supportSurfaceDelta: supportSurfaceDelta.toArray(),
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
        supportWeight: foot.supportWeight,
        authoredSoleHeights: foot.soleHeights ? { ...foot.soleHeights } : null,
        swingCorrection: foot.lastCorrection.toArray(),
        slip: foot.slip,
        contactTravel: foot.contactTravel,
        reachClamp: foot.clamped,
        contactPoint: foot.anchorKind ?? "ankle",
        landmarkMethod:
          foot.landmarkMethod ?? "anatomical estimate (no shoe mesh found)",
        supportActual: foot.lastSupport.toArray(),
        supportAnchor: foot.anchorKind
          ? foot.anchor.toArray()
          : foot.target.toArray(),
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
    stopTime = 1;
    interruptionPose = null;
    interruptionAge = 1;
    for (const foot of feet) {
      foot.stopFrom = null;
      foot.stopQuaternion = null;
    }
    turnPhase = stance / 2;
    previousYaw = root.rotation.y;
    restore();
    resetContacts();
  }
  function setCorrections(next = {}) {
    for (const key of ["footIK", "pelvis"])
      if (typeof next[key] === "boolean") corrections[key] = next[key];
    // Re-evaluate the same authored time, root and support history. The main
    // scene still owns vrm.update(0), just as it owns vrm.update(dt) normally.
    refreshPose();
  }
  function refreshPose() {
    update(0, { ...lastInput, refresh: true });
  }
  return {
    update,
    setAction,
    getMetrics,
    snapshot: getMetrics,
    getSeatHeight: () => seatHeight,
    getSeatApproach: () => seatApproach,
    setCorrections,
    refreshPose,
    reset,
  };
}

export const createMotionController = createMotion;
