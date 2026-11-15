# Zero-time pose refresh at completed action boundaries

Candidate `ae6b9ed914f9`, independent worktree `experiments/motion-refresh-boundary`, parent source `e9ab37c`. Only product diff: `prototype/src/main.js` removes eager `rig.setAction` from `setMode`; the existing next `rig.update(dt,{action})` is now the sole normal simulation submission. Explicit reset remains intact. No motion/contact-release implementation changed, no shared main edits, no public deployment.

## Confirmed cause

The completed stand frame evaluates and displays stand at its terminal time. The controller then calls `setMode(idle)`, formerly immediately calling `rig.setAction(idle)` and clearing actionTime without evaluating that pose. `refreshPose()` replays lastInput.action=stand at dt0, re-enters stand with time zero and displays the beginning of rising. Baseline7a86 first refresh moves raw elbows/wrists up to0.5168157214m; second refresh is stable. This is independent of the hand release trial.

The correction keeps intent (`controller.mode`) separate from the last actually evaluated motion pose until the next simulation tick. Normal action admission remains immediate at task level; its first animation evaluation remains next tick. No extra time or animation update is introduced.

## Actual browser evidence

`evidence/refresh-boundary-ae6b9ed914f9-tasks-safe/summary.json` links the original baseline report SHA and actual candidate results. Raw candidate report and gzipped baseline are adjacent. Approach, seated, first idle after rising, and once-dance-end each compare normal frame → refresh0 → refresh0: raw left/right wrist/elbow position and quaternion deltas all exactly0; simulation time, actionTime and gait phase unchanged. At rise/dance endpoints raw→full returns to the identical pose. The dedicated dance clock was not independently serialized; no audio/music synchronization claim.

Ten affected task checks pass: sit accepted/completed; stand accepted without changing displayed action clock; duplicate keeps the running task; first tick consumes stand without completing prematurely; existing transitionComplete completes standing; following actual walk reaches safe dance location; dance admission/first tick/once completion after fade each behave correctly, with one terminal completion event.

Earlier extended QA reports are retained: initial test incorrectly expected `admission=duplicate` (actual contract is `duplicate:true`), required sitProgress exactly0 instead of the existing transitionComplete threshold, and requested a dance without its required free radius. Corrected QA uses actual task fields, existing completion contract, and a real walk to(0,1). These failures are not runtime changes or suppressed product regressions.

No runtime/browser errors. Temporary browser and HTTP server close in finally/child-exit paths; all stopped after tests. No visual full-animation acceptance, general state-machine audit, combined contact-release verification or performance claim.

## Replay

From repository root, after `npm ci` and `npm run build -- --outDir ../dist` within prototype:

```
node scripts/run-fixed-check.cjs dist scripts/qa-refresh-boundary.cjs <actual-build-id> evidence/refresh-boundary-rerun
```

The test uses the existing room task/debug API and actual raw bones. Fixed identity is verified before sampling. It preserves run→sit→stand, repeated zero-time refresh, correction disable/enable and explicit reset, then once-dance in sufficient space. Use the candidate source or apply only its main.js hunk; do not copy a whole older runtime over the root agent's independent hand release changes.
