# Rejected source preparation A: nominal1.6mm hem gap

Candidate SHA256 e265abb0066b51db293a7133227990fee2b6e5f987554e7ac89e32844c37002f, parent02950240c98021c63ae78be5058d248709e7a12a4449782ecb03dd43663f9bc7. This is one authorized source change, not a parameter sweep.

Only lower inner-return121positions move from original surface−.8mm normal to surface−1.6mm normal. Maximum actual float32 displacement .800016mm. Normals on adjacent affected faces recomputed; external positions, all skin weights, UV, topology, source upper120 and20seam points unchanged. Editable Blend saved and reopened.

Actual58394 private-palette standing all nonadjacent triangle minimum1.181115mm;0 pairs below1mm, including unpinned native-eligible pairs. Broadphase conservatively excludes only AABB distances≥2mm; exact point-triangle/edge-edge minimum resolves all3997candidate pairs. Shared welded vertices excluded as true adjacency. This solves initial separation eligibility, not a solver/material approval.

Original four-pose gate: standing/sit-in all body/top/chair/self0; seated body192/top0/chair102/self95 (parent chair100); rise body2/top0/chair0/self0 (parent body0). New rise pairs current2395(parent2375 inner-return)×Body3279/3287. New seated chair pairs2296/2297(parent2276/2277 inner-return)×chairSeat7. The rise regression violates the explicit no-new-crossing preparation condition. STOP: no A native trial, no object-distance B comparison, no second offset value. Sitting LBS was already uncorrected and failed; not a proof that all authoring approaches are impossible.

Rebuild once in an isolated worktree with an absent output directory: `python scripts/m1-assets/simple-skirt/build-hem-gap16-v1.py`. Full gate/save/reopen: Blender4.5.9 `--background --factory-startup --threads 2 --python-exit-code 1 --python scripts/m1-assets/simple-skirt/gate-hem-gap16-v1.py`. Actual distance and parent difference: `python scripts/m1-assets/simple-skirt/check-hem-gap16-clearance.py`. No game/controller/default source changed. Derived asset retains original source license, not newlyCC0.
