/** In-place step planner. Pure scheduling: no root translation or bone mutation.
 * Consumer MUST plant both foot position AND world orientation during contact.
 * This is a procedural candidate, not an authored/passed visual turn animation.
 */
const TAU = Math.PI * 2;
const EPS = 1e-8;
export const turnAngleDelta = (to, from) =>
  Math.atan2(Math.sin(to - from), Math.cos(to - from));
const ease = (t) => t * t * (3 - 2 * t);
const finite = (v, label) => {
  if (!Number.isFinite(v)) throw new TypeError(`${label} must be finite`);
  return v;
};

export function createTurnPolicy({
  stepAngle = Math.PI / 6,
  stepDuration = 0.18,
  gatherDuration = 0.16,
} = {}) {
  if (!(
    stepAngle > 0 &&
    stepAngle <= Math.PI / 4 &&
    stepDuration >= 0.12 &&
    gatherDuration >= 0.12
  ))
    throw new RangeError(
      "Turn steps require <=45 degrees and >=120 ms per landing",
    );
  let yaw = 0,
    goal = 0,
    footYaws = [0, 0],
    nextFoot = 0;
  let step = null,
    serial = 0,
    elapsed = 0,
    mode = "idle",
    stopped = false;
  let headingRequest = null;

  function reset(at = 0, { preferredSwing = 0 } = {}) {
    yaw = goal = finite(at, "yaw");
    footYaws = [yaw, yaw];
    nextFoot = preferredSwing === 1 ? 1 : 0;
    // Step ids stay unique across sessions: consecutive short turns can have
    // no intervening idle frame in the consumer's contact state.
    step = null;
    elapsed = 0;
    mode = "idle";
    stopped = false;
    headingRequest = null;
    return sample();
  }
  function requestHeading(heading) {
    finite(heading, "heading");
    // A path controller may submit its unchanged heading on every substep.
    if (
      mode === "heading" &&
      headingRequest !== null &&
      Math.abs(turnAngleDelta(heading, headingRequest)) < EPS
    )
      return sample();
    goal = yaw + turnAngleDelta(heading, yaw);
    headingRequest = heading;
    mode = "heading";
    stopped = false;
    return sample();
  }
  function requestRotation(radians) {
    goal = yaw + finite(radians, "rotation");
    headingRequest = null;
    mode = "rotation";
    stopped = false;
    return sample();
  }
  function stop() {
    // Finish this <=180 ms committed step; no midair teleport or phase reset.
    goal = step ? step.toYaw : yaw;
    headingRequest = null;
    mode = "stop";
    stopped = true;
    return sample();
  }
  function beginStep() {
    const remaining = goal - yaw;
    if (Math.abs(remaining) > EPS) {
      const delta =
        Math.sign(remaining) * Math.min(stepAngle, Math.abs(remaining));
      const toYaw = yaw + delta;
      // Lead by one step so the planted shoe never needs to rotate with root.
      const lead =
        Math.sign(remaining) * Math.min(stepAngle, Math.abs(goal - toYaw));
      step = {
        id: ++serial,
        kind: "turn",
        foot: nextFoot,
        fromYaw: yaw,
        toYaw,
        footFromYaw: footYaws[nextFoot],
        footToYaw: toYaw + lead,
        duration: stepDuration,
        time: 0,
      };
      nextFoot = 1 - nextFoot;
      return true;
    }
    // Re-selection/stop may leave a previous forward placement ahead of root.
    // Gather it with a real airborne step, never rotate a planted foot in place.
    const foot = footYaws.findIndex((v) => Math.abs(v - yaw) > EPS);
    if (foot >= 0) {
      step = {
        id: ++serial,
        kind: "gather",
        foot,
        fromYaw: yaw,
        toYaw: yaw,
        footFromYaw: footYaws[foot],
        footToYaw: yaw,
        duration: gatherDuration,
        time: 0,
      };
      nextFoot = 1 - foot;
      return true;
    }
    mode = "idle";
    headingRequest = null;
    return false;
  }
  function sample() {
    const progress = step ? Math.min(1, step.time / step.duration) : 1;
    const blend = ease(progress);
    return {
      active:
        Boolean(step) ||
        Math.abs(goal - yaw) > EPS ||
        footYaws.some((v) => Math.abs(v - yaw) > EPS),
      yaw,
      targetYaw: goal,
      remaining: goal - yaw,
      elapsed,
      stopped,
      mode,
      angularVelocity: step
        ? ((step.toYaw - step.fromYaw) * 6 * progress * (1 - progress)) /
          step.duration
        : 0,
      stepId: step?.id ?? serial,
      kind: step?.kind ?? "idle",
      progress,
      stepEndYaw: step?.toYaw ?? yaw,
      feet: footYaws.map((angle, index) => {
        const swing = Boolean(step && step.foot === index);
        return {
          index,
          swing,
          contact: !swing,
          progress: swing ? progress : 1,
          blend: swing ? blend : 1,
          yaw: swing
            ? step.footFromYaw + (step.footToYaw - step.footFromYaw) * blend
            : angle,
          landingYaw: swing ? step.footToYaw : angle,
          // metres are assigned by the adapter; minimum-jerk endpoint lift.
          lift: swing ? Math.sin(Math.PI * progress) ** 2 : 0,
        };
      }),
    };
  }
  function update(dt) {
    finite(dt, "dt");
    if (dt < 0 || dt > 0.05 + EPS)
      throw new RangeError("Turn policy requires simulation substeps <=50 ms");
    let left = dt;
    if (!step) beginStep();
    while (step && left > EPS) {
      const used = Math.min(left, step.duration - step.time);
      step.time += used;
      elapsed += used;
      left -= used;
      yaw =
        step.fromYaw +
        (step.toYaw - step.fromYaw) *
          ease(Math.min(1, step.time / step.duration));
      if (step.time >= step.duration - EPS) {
        yaw = step.toYaw;
        footYaws[step.foot] = step.footToYaw;
        step = null;
        beginStep();
      }
    }
    return sample();
  }
  return { reset, requestHeading, requestRotation, stop, update, sample };
}

export const TURN_FULL_ROTATION = TAU;
