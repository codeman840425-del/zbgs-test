# Shared local vest layer fit

The three outputs use one common rule and one solved amplitude. The source and controller assets stay pinned. This package writes only to its own source directory.

Run from the repository root.

```powershell
python -B scripts/m2-vest-layer-fit-v1/build.py
python -B scripts/m2-vest-layer-fit-v1/qa.py
```

`spec.json` is the editable processing recipe. It pins original female top/pants, both exact v2 top/pants/body sets and copied root paused-pose inputs. `inputs/pose-receipt.json` retains the original ed2 build receipt. `provenance.json` pins input/tool bytes, and `toolchain.json` records the actual CPU environment.

The source top triangles are 894, 901, 903 and 904. Their six source vertices receive weight 1. Twelve one-ring vertices receive weight 0.5, with all other vertices fixed. Coincident position aliases share displacement. These are samples of `smoothstep(1 - graphDistance/2)` across graph distances 0, 1 and 2. The local model direction is `[0,0,-1]`.

One amplitude is solved for the whole batch. The fixed cap is 4 mm. The requested clearance is 0.5 mm with a 2 micrometre Float32 export reserve. A bounded bisection in `[0,cap]` chooses the minimum common feasible amplitude, with 0.1 micrometre amplitude tolerance. It produced **2.25213623046875 mm**. There is no case-name branch or manual case adjustment.

The solve constrains all projected overlaps of the four core top faces and the bounded front-waist pants candidates. Polygon vertices, edge midpoints and polygon centers are evaluated. Source bind coordinates use negative-Z rays. Recorded paused and virtual original-palette states use their exact camera and live skin transforms. These are nine static states. The actual exported Float32 GLB is then read back over all 52 affected top faces, with a measured minimum clearance of **0.502039 mm**.

Original, round and soft minimum bind gaps change from -0.793716/-1.750092/-1.222072 mm to 1.458423/0.502039/1.030059 mm. The independently read static QA passes 77 checks, including actual byte identities, geometry gaps, split normals, no new position-alias cracks and negative source-SHA rejection. Maximum edge ratios are 0.98654–1.02273, maximum dihedral change is 3.01994 degrees, and the modified faces retain positive orientation.

Positions are updated at 18 vertices and actual angle-weighted geometry normals at 36 related vertices. Smoothing groups use original POSITION plus original split NORMAL. UV aliases with the same source normal share accumulation. Different source normal splits retain separate groups. Topology, UV, joints, weights, inverse binds, materials, textures, alpha and the bow primitive remain unchanged. Every changed vertex and the normal method are recorded in each output report.

`generated/manifest.json` uses `vest-layer-fit-batch-v1`. Each case has `sourceTopId`, `newTopId`, exact body/bottom identities and SHA/byte references to four files.

- `top.glb` is the new resource.
- `equipment-entry.json` is a new independently named equipment entry with the original binding contract and exact compatible body.
- `fit.json` uses `vest-layer-fit-v1`, with exact source top/body/bottom dependencies, the additional layer shift, rule and pending runtime status.
- `report.json` records changed vertices, shape/edge checks and split-normal recomputation.

The future URL prefix is `/assets/m2-vest-layer-fit-v1/`. This source package has no public catalog. Root may copy these candidate files and register a pants-only `extraOutfit` with a `fitTop` equipment role and separately generated torso coverage, consuming `newTopId` with its exact body SHA, pants entry and shared controller. The original female top ID also serves the frozen skirt. Keep that profile and its original recipes intact. The new dependency sidecar currently requires root integration enforcement.

The current v2 world-offset contract is retained as historical input. These new resources declare a separate added layer displacement and new top/fit IDs. A rerun refuses to silently overwrite differing output bytes. A source mismatch, insufficient cap, folded face or excess edge change produces an explicit `generated/FAILED.json` and no admitted batch.

This is the first planned source batch with one setup. One evidence-based common correction remains available after a confirmed runtime failure. Walking, running, transitions, turns, sit/rise and technical dance remain pending. Root will collect actual full-speed front and oblique waist views plus posed meshes before publication. Individual paused states do not establish continuous motion or visual acceptance.

The prior unexplained pixel at `[482,454]` is retained. Root separately attributed running pale exposures to Body/derived torso coverage. That independent gap has no clearance correction in this package and does not consume the reserved layer-fit correction budget.

Two QA authoring errors were corrected before the 77-check pass and are preserved in `qa-initial-error.txt`. Neither changed the produced asset bytes or source fit parameters.
