# Turn contact regression

`scripts/qa-turn-chain.cjs` and old diagnostic evidence remain unchanged. New `qa-turn-contact-chain.cjs` records actual calibrated raw shoe-skin heel/toe patches after skeleton update, plus raw ankles, target, support anchors, contact kind, planner state, reset spatial receipts and lifecycle. `qa-turn-regression.cjs` reads those saved batches; it never opens a browser. Old ankle-only captures cannot pass the new schema check.

Thresholds reuse locomotion acceptance: support residual/stance travel <=30 mm, consecutive contact travel <=15 mm, raw ankle/target step <=60 mm per120Hz substep, continuous reach clamp <=100 ms, shoe floor >=−6 mm. Residual duration above6 mm is diagnostic, not a new invented pass threshold. Whole-shoe yaw is intentionally not locked: the physical toe contact point is tested. A stance is not silently restarted just because its anchor moved; contact loss or actual contact-kind change starts a new stance.

Reset checks compare target to raw ankle and actual support to anchor (30 mm), plus a loose1.2 m ankle/root distance bound for these measured candidates. They detect old world anchors after an explicit teleport, not a universal body-size limit. Normal recorder now accepts male outfit2 and rejects invalid female2/male1; a valid plan is not a recorded/accepted video.

Fixed `38ea4eda48aa` is **failed**, not a release. Fbase30/60Hz batches were captured under `output/playwright/m1/38ea4eda48aa/turn-contact-chain-1794692874662`. Root requested stop after concrete failures;120Hz and the planned male follow-up were not completed. The initial script persisted identity gates only at its end, so interrupted artifacts truthfully mark those receipts unavailable. The script now checkpoints reports before sampling and after each batch. No receipt was fabricated. Offline `contact-regression.json` explicitly fails incomplete collection as well as numeric violations.

Two independently established failures:

- Walk±180: right foot is airborne inside the same planner phrase. Raw ankle and target jump282.391/360.131 mm in one8.333 ms frame. `analyze-turn-arc.py` reconstructs the effective polar arc from actual root, previous raw swing-start point, target angle and emitted blend. The negative case changes−2.811914→+2.796041 rad, the positive+2.814295→−2.798058 rad. Both cross the source's `abs(arc)>2.8` sign branch. Source-mixer or IK errors are not needed to explain these target jumps. The next candidate must keep the arc branch continuous throughout each swing and satisfy the unchanged60 mm gate, not merely remove the visible worst screenshot.
- Run+90: right toe remains contact while IK is clamped for183.333 ms (`t7.341667..7.516667`). At `t7.425`, raw skin support error is30.113832768 mm; normalized metric slip is30.113833245 mm, agreeing within4.8e−10 m. `runMix=0`, walk phase.0507076, speed1.0932 m/s, actual toe y22.3256 mm against anchor y0. This is real unreachable support, not a raw/normalized measurement mismatch, and cannot be rounded below the30 mm gate.

Evidence: `evidence/turn-38ea-early-failures.json`, `turn-38ea-arc-reconstruction.json`, `turn-38ea-run90-support.json`. Other saved contact/anchor/clamp violations remain for diagnosis; no overall naturalness or ordinary-device performance claim follows from the numerical capture.

```powershell
node scripts/run-fixed-check.cjs experiments/turn-candidate-7/dist scripts/qa-turn-contact-chain.cjs 38ea4eda48aa --body=female --fps=30,60,120 --angles=1,15,45,90,180 --modes=idle,walk,run
node scripts/qa-turn-regression.cjs <capture-output-directory>
python scripts/analyze-turn-arc.py <capture-output-directory>/fps-30.json evidence/turn-38ea-arc-reconstruction.json
```
