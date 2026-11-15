# Hand clearance release and evaluated-pose boundary

Base source commit: `e9ab37c5eb1509aa3bcca0a63d02aa69e0d4a099` (runtime 7a86). Overlay the two saved `prototype/src` files onto that checkout; locked `npm ci`, then `npm run build` in prototype produces **038341558517**. The release-only intermediate **0b749501e377** uses this motion.js with the original main.js from the base commit. Public 4194 remains 152; neither this README nor a successful build promotes the candidate.

No body, garment, weight, source animation, movement path or camera asset changed. The correction applies to existing calibrated hand/forearm profiles, not a garment-name branch. Unknown garment/body fit identity still follows the existing admission checks.

## Two confirmed runtime faults

1. `fitSeatHands` returned outside idle/sitting, dropping approximately34mm of right-hand clearance at walk entry. Enabling the existing solve for walk/dance removed the measured actual-skin crossings, but exposed a second discontinuity: a finite thumb rail leaves the projected skirt polygon while clearance remains nonzero. Space-grid and exhaustive680-face queries matched exactly over880 local queries. No source wrist change, alpha rejection or IK clamp caused those two jumps. Exact diagnostic and original normal-speed recordings are in `evidence/hand-scope-c182f9e4368f`.
2. Scene `setMode` called rig.setAction after the frame pose had already been evaluated. It reset the animation clock without evaluating the new pose; a zero-time refresh then replayed the previous input as the beginning of stand. Old7a86 and release-only0b both reproduced approximately0.517m wrist/elbow displacement. The isolated main-only ae6 change removes this eager call; normal rig.update consumes the scene request on the next tick. Explicit reset stays explicit. Independent source checkpoint9d738ac and evidence are recorded in `evidence/motion-refresh-boundary-independent`.

## One release rule, not a parameter sweep

Per instance/hand, keep the achieved outward displacement relative to the current authored hand. When contact decreases, seed the next full solve with that displacement decayed by `exp(-dt / 0.06)`. Newly required clearance is still applied by the original five iterations, and the final arm is checked with the original thresholds. Wrist orientation is preserved. Stored state never locks a world-space target.

The60ms time constant is a fixed trial choice, not a measured physiological constant or general naturalness guarantee. It is not tuned separately for each garment. Pre-test code review restricted the feature to calibrated paths and added re-evaluation from the same pre-solve seed at dt0; those were implementation corrections, not alternative time-constant trials.

Changed visible surface keys, explicit reset, disabling corrections and missing source clear history. Ordinary paused refresh reuses the same pre-solve seed and does not accumulate or decay. State is not cleared by ordinary dance/contact reset. Same-tick outfit away/back without an intervening solve sees the same final surface key; it does not simulate a vanished intermediate outfit. This is recorded separately from actual cross-frame switching.

## Evidence and limits

- 0b exact2441-step sequence retains root/jog phase exactly. The two left-hand step spikes15.048/13.488mm become7.444/7.886mm; the original uncorrected source steps were6.033/7.022mm.
- Four specified full hand-skin/final-skirt checks remain0 crossings. These are finite checks, not continuous whole-body collision proof.
- New maximum local seated-step increase relative to7a86 is approximately4.1mm; full normal-speed footage remains necessary. The skirt's visible sitting folds are still failed.
- 038 ordinary paused refresh at approach/sit/rise and once-dance boundaries is unchanged; affected task lifecycle checks pass under the stated scope. Explicit correction-off discards history: its64µm warm-to-cold difference is retained. Cold re-solve determinism and unchanged clocks are distinct from ordinary pause invariance; the original overly broad equality failure is preserved, not hidden by raising its threshold.
- Release-only footage is labeled0b. Final038 footage is separately recorded. No naturalness or ordinary-PC performance acceptance is inferred from these checks.

Tests use existing fixed-build wrappers and explicit identities:

```powershell
node scripts/run-fixed-check.cjs experiments/m1-hand-release-integrated-v1/dist scripts/qa-hand-release-state.cjs 038341558517 evidence/NEW-STATE-RUN
node scripts/run-fixed-check.cjs experiments/m1-hand-release-integrated-v1/dist scripts/qa-refresh-boundary.cjs 038341558517 evidence/NEW-TASK-RUN
```

This increment fixes shared runtime errors. It does not establish sustainable arbitrary skirt production, replace the failed source-fitting alternatives, or complete M1.
