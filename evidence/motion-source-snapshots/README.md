# Gait patch recovery inputs

These are exact UTF-8 source checkpoints, named by SHA-256. They are evidence, never imported by the game. `manifest.json` records the three historical roles. Report fields containing `analysis/...` or `output/...` are historical capture locations; they are not required input paths for the receipt checks below.

From the repository root, standard Node alone can validate the archived receipts:

```powershell
node scripts/check-female-acceleration-patch.mjs
node scripts/check-stop-gather-patch.mjs
```

`evidence/gait-receipt-portability.json` records both checks running in an input-only temporary tree without `analysis`, `output`, `prototype`, or `node_modules`. This rechecks source identity and historical numerical gates; it does not rerun geometry or a browser. The original report hashes and failed cases were retained.

For fresh geometry calculations, first run `npm ci` in `prototype` and restore the versioned public assets. Use a new output directory; do not replace historical reports:

```powershell
New-Item -ItemType Directory -Force output/gait-recheck
$gaitSource = 'evidence/motion-source-snapshots/2413410e856e6122eb6ff0ae01aa10d7968a568bd21ac87c01e10a88f64027d3.js'
node scripts/qa-gait-phase-source-review.mjs
node scripts/qa-gait-phase-sweep-node.mjs $gaitSource output/gait-recheck/original-sweep.json
node scripts/qa-gait-transition-node.mjs $gaitSource evidence/female-acceleration-fix/male-run-exit-input.json output/gait-recheck/male-exit.json
$env:ACCEL_PHASES = '.05,.15,.25,.35,.45,.55,.65,.70,.71,.72,.73,.74,.75,.76,.77,.78,.79,.80,.81,.82,.85,.95'
node scripts/qa-female-acceleration-node.mjs $gaitSource output/gait-recheck/female-acceleration.json
$env:ACCEL_PHASES = '.05,.75,.78,.8'
node scripts/qa-stop-gather-node.mjs $gaitSource output/gait-recheck/stop-baseline.json
node scripts/qa-stop-gather-node.mjs evidence/motion-source-snapshots/c9a3208e0fe4be62b6cb18097d404be1f9afdf0babb337a5e3d9a6ca1d9eeea0.js output/gait-recheck/stop-candidate.json
Remove-Item Env:ACCEL_PHASES
```

The male input fixture preserves only the two captured root/control trajectories and initial feet required by the replay script, with the original capture build/hash. Warmup is reconstructed, not the full original controller history. The geometry adapter uses the checked-out avatar loader, source clips, profile and geometry: archive the checkout identity with new results if these dependencies change. No texture decoding, frame-time, scene-controller or naturalness acceptance is implied by the Node tests.

Browser regressions use `scripts/run-fixed-check.cjs`, an immutable dist and exact build ID. Their fresh results belong under that build's output directory. See `docs/FEMALE-ACCELERATION-REACHABILITY.md` for historical failures and subsequent fixed-room results. Normal wall-clock visual review remains a separate step.
