# M1C layer/state review and regression

Read-only review found two concrete state-order errors on `a3f0c319f4f6`; both were reproduced in the actual fixed room, then independently retested on `ca72ada827d2` after the chief's fixes. This folder preserves both results rather than overwriting the failures.

## Reproduced and repaired

1. **Immediate replay of a completed once-dance.** `motion.setAction('dance')` originally kept the previous dance clock during its fade. At 0.1 seconds after the 7.2-second clip finished, the new request was accepted/running, but the next tick still read 7.308 seconds and immediately returned to idle. The repaired build starts at .008333 seconds and stays in dance; the replay completes once after 8.067 simulation seconds including fade, then returns to idle. The first 31 120Hz transition samples show maximum raw-bone frame displacement: hips1.254 mm, head1.259 mm, hands1.256 mm, left foot3.965 mm and right foot4.743 mm. No large transition jump was observed in these samples. This is a bounded numerical continuity check, not a full visual-choreography approval.
2. **Same-tick dance then microphone command.** The controller had already entered dance while presentation still reported idle until its next update. A microphone could load and reach full held-arm weight despite `canPerform('dance')` later reporting false. With synchronous action intent, the same ordering returns `applied:false`, leaves the microphone unloaded and keeps the dance running. The actual task/seat 19-check suite also passes on the repaired fixed build.

## Hand/garment ordering: stage matters

The actual execution order is `main.simulate → motion.update → fitSeatHands → avatar.update → livePresentation.preUpdate → vrm.update → postUpdate → updateGarment`. Held-microphone arm solving therefore follows the skirt-hand clearance pass and can move the right wrist away from its recorded `handContacts.actual` value. The fixed-room maximum difference in the tested seated-load/rise segment was 445.7 mm. This confirms that those metrics describe the **pre-accessory stage**, not final held-arm collision. The chief added that stage label; the audit did not repair runtime by pretending those coordinates were final.

The independent final-pose test uses actual raw forearm/palm centerlines plus four parallel rails at12/16 mm against the displayed skirt's UV/alpha-filtered triangles. Loading the microphone while seated and then rising produced zero intersections in 60 samples at30Hz on both tested builds. This is evidence for that segment only. It is not full hand-skin volume CCD, all garment poses or a guarantee about motion between samples. Skipping the duplicate skirt pass is not itself a confirmed geometry error: the skirt solver currently depends on hips/legs/chair, not the overwritten arm bones.

## Walk/run review

No new definite double-root-displacement or left/right-remapping error was found. Main owns path/root travel; the adapter consumes `distanceDelta` for separate walk/jog clocks, uses a0.30-second blend and1.85/1.55 m/s hysteresis. Actual gait quality still needs the chief's full normal-speed recordings and surface measurements. One diagnostic field is misleading: `motion.getMetrics().sourceTime` remains walk-phase×walk-duration during pure jog; consumers must use `jogPhase` and the actual jog duration rather than treating `sourceTime` as the currently weighted clip clock.

## Skirt hard-fold decision

The production skirt remains a pose-guided corrective over the original topology: every frame begins from hips-space reference points, then thigh/seat projection and eight iterations of soft edge-length constraints. It has no material bending energy, inertia or self-collision. The prior continuous-drape and collision-displacement smoothing experiments in `docs/M1-SKIRT-OPTIMIZATION.md` do not establish a small common fix. Continuous drape gave insufficient visible improvement; smoothing worsened walking edge stretch to3.21 and introduced up to5.79 mm safety-envelope penetration. The reference seated edge ratio itself reaches3.65 despite its1.25 soft target, so treating that target as a hard physical guarantee is incorrect.

No new source-topology defect was proved by this read-only review, and it would be equally incorrect to promise that remeshing alone fixes everything. The supported next step is one bounded front/side skirt specimen in editable source: inspect longitudinal/pleat connectivity, author an explicit rest-bending or pose-corrective construction, re-export on the same rig, and compare complete sit/rise/walk under the same collision and visual probes. Keep the current skirt as the control. Do not continue stacking pose offsets, increase character count, or rewrite the whole game on the strength of failed local smoothing experiments.

## Reproduce

```powershell
node scripts/run-fixed-check.cjs experiments/m1-ca72ada827d2/dist scripts/qa-m1c-layer-order.cjs ca72ada827d2
node scripts/run-fixed-check.cjs experiments/m1-ca72ada827d2/dist scripts/qa-room-behavior-tasks.cjs ca72ada827d2
```

The layer-order script requires explicit fixed build and actual primary avatar identity, performs no product edits, and closes its Chrome instance. The wrapper closes its temporary server. Exact raw-bone samples, lifecycle outcomes and final-pose hand observations are retained in the JSON reports. No frame-time or target-hardware performance claim is made here.
