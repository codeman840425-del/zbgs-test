# Local top hem weight candidate v1 — REJECTED

This isolated source candidate is **not installed in the public game**. It is not a cloth run.

## Identity and scope

Public closed top: `27bcfe020828ad2603f618fabf7f21cf1b09f66035c8ecd740e78cfc3650b9d6`. Existing isolated open-hem parent: `7f266ff135096f16a6db067cceddee0cd610a886833218b1cb6531dd43721c89`. These are two separate changes: prior cap removal, then this weight-only candidate `44638b28664dfa44a9cb1c33e13060034bfc9d4d538650f76ca68d63cecfeafa`. Only female body `027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95` is targeted. Original VRoid uniform permissions apply; this derivative is not CC0.

The 85-vertex Y<0.98m preparation band has 74 changed skin-weight entries. Source positions, UV, normals, indices, materials/textures, tie primitive and inverse binds remain exact. Upper Y>=0.975m weights stay original. Joint weights are max four; pruning/float error across 60 frames <=0.334 micrometre. The exported GLB and editable Blender file retain the full top, not only the repair patch.

## Actual outcome

One bounded minimum-transfer solve converged in 28 iterations with zero deficit on its local nearest-body normal planes. Maximum transfer was 0.9445. This did **not** produce an acceptable garment. The full unfiltered body triangles, original pants and fixed skirt band were checked against exported float32 LBS at all 60 actual captured poses plus four historical samples.

Affected Body pairs: frame1 0→0, frame19 0→5, frame29 32→23, seated60 38→37, rise 0→5. New pairs predominantly hit Hips/Spine abdomen faces, not a hand-correspondence artifact. Old-pants intersections also increase. The fixed skirt band has no newly introduced pair. Full pair arrays, including original remote torso/sleeve defects, are retained in `actual-60-gate.json`.

Bind geometry is unchanged, but actual standing geometry is **not** unchanged: max point delta5.508mm; seated delta137.551mm. In seated pose, edge559–565 grows from6.160mm to76.957mm (12.492×); local face area reaches12.382× its same-pose parent value. Frame19 max neighboring-normal-angle change103.623degrees. `failure-witness.json` records exact positions and endpoint weights: adjacent points acquire0.914 vs0.386 RightUpperLeg weights. A graph smoothness penalty was insufficient to constrain material shape or changing finite-body support.

Viewed the same-camera frame1/19/60/rise front/side diagnostic renders. The candidate adds a pointed lower-front band while entering the seat; seated lower-front fabric turns/recedes into the body instead of forming a supported smooth hem. Side views show shortening/uneven contour. The images use solid diagnostic colors, all recorded body skin/top/pants faces, and captured chair boxes; hair/face primitives/textures are absent. They are **not** game/GPU/alpha acceptance. Existing small torso holes are present in the parent too. `views/report.json` pins every image and camera.

No positive local2.4mm corridor was established. No walk test, continuous game driver, new hand fit or native cloth followed this failure. No further weight or clearance sweep was performed.

## Reproduce from this worktree root

1. Blender4.5.9: `--background --factory-startup --threads 2 --python-exit-code 1 --python scripts/m1-assets/simple-skirt/inspect-top-fit-v1.py` — verify source identity and actual source replay; cached audit summary is attribution only. Numerical inputs are pinned source/capture.
2. Python3 + NumPy/SciPy1.18.1: `python scripts/m1-assets/simple-skirt/plan-top-fit-v1.py` — the one fixed author solve. Frozen `weight-fit-plan.json` also permits deterministic export without refitting.
3. `python scripts/m1-assets/simple-skirt/build-top-fit-v1.py` — export weight-only GLB from frozen plan.
4. Blender as step1 with `gate-top-fit-v1.py` — full60+4-pose gate, then save/reopen editable `.blend`.
5. Blender as step1 with `review-top-fit-v1.py` — same-pose local shape metrics and16 diagnostic images.

Run in a copied isolated worktree when replaying; these commands overwrite this candidate's local generated outputs. Never run them against public runtime paths. Blend/render container hashes can vary by Blender metadata/GPU; numerical/source identities are explicit. Geometry gates reuse checked-in helpers; all input paths are relative to the worktree and listed in `manifest.json`.

The next authorized preparation is a local authored pose shape with **original weights**, not an expansion of this rejected leg-transfer solve. Its surface/shape must pass a real target-pose full triangle/shape check before any continuous corrective or runtime integration.
