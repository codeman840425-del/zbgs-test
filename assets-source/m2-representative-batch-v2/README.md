# Representative batch v2 source experiment

This is one common structural correction of the eight fixed v1 parameter sets. Six presets exported complete candidates. Female-long-slender-v2 and male-long-lean-v2 failed the unchanged local determinant gate and have only `FAILED.json`. The batch is partial and is not ready for whole-batch runtime admission. V1 resources, parameters, original source VRMs, frozen skirt and dance remain immutable.

## Exact resource contract

`output-contract.json` describes `generated/manifest.json`, schema `character-representative-batch-v1`, version 2. Every new variant/bodyType is `<basePresetId>-v2`, profile ID is `m2-<basePresetId>-v2`, and all garment IDs and suggested public paths use the v2 identity. Each successful variant supplies the complete avatar VRM, independent top/bottom/shoes GLBs, equipment manifest, fit, profile draft and build report. Failure entries admit no resource. Original female/male source and six original garments retain the exact v1 pins in `spec.json`. Original licenses and embedded provenance continue to apply. The new code/configuration is project-authored, with no replacement source-model license or new Blender file.

Contact profiles, garment material/coverage recipes and replacement-hair fits are not inherited. Their fields remain null/omitted for root to measure and explicitly register. Body texture UV and encoded image bytes remain original, including female painted stockings. Publishing and runtime changes are outside this package.

## Common algorithm and changed semantics

All thirteen numerical values for all eight presets are unchanged and checked against the pinned v1 spec. Hip, waist and chest width/depth values now mean the relative target change at their anatomical section. Nonnegative smooth weights sum to one between actual rest landmarks and taper to neutral outside the support. A height receives a convex combination of those section targets. V1 instead added the overlapping displacement bases.

The face requests lower-front half-width growth using the original numerical jaw/cheek coefficients. V1 applied those coefficients to a lip-anchored lateral coordinate with separate support masks. V2 fits a single continuous cubic B-spline width curve to the requested section targets, constrained to a nonnegative derivative and nonpositive second derivative, with the protected upper eye boundary value and slope retained. A convex quadratic solve projects requests into this feasible curve family. `faceCurve` records source/requested/actual widths at 101 source heights, normalized domain, knots, degree, coefficients, active constraints, iterations and maximum difference. The request is partially realized. The six exported candidates differ from their requested half-width curve by up to 8.668–31.058 mm. These discrepancies are not hidden parameter reductions or evidence of full artistic intent realization.

Chin length/projection remain metre requests with a continuous lower-face height support ending before the lip envelope. Source semantic eye, mouth, brow/lash, hair and measured lip vertices keep their original indexed identity. Morph endpoints use the same map at `base + sourceDelta`, with fixed original protected rows. Positions use `F(base + delta) - F(base)` and normals use the actual endpoint inverse-transpose Jacobian. Bones, joint weights, topology, UVs, expression binding/order and source materials/images remain unchanged.

Independent and embedded original garments bind once to the immutable original Body_SKIN nearest triangle and barycentric point. New garment position equals original garment plus the mapped body triangle's interpolated displacement. The original metre-space offset vector remains intact. No source face is reselected while posing or by preset. Clothing normals use the inverse transpose of the actual piecewise donor-transfer Jacobian, including source nearest-edge/vertex cases. They do not reuse the old free-space body Jacobian. Reports retain source-point/binding hashes and offset/derivative measurements. Fixed rest offsets alone do not establish posed garment clearance.

## Failures and single correction budget

`numerical-preflight.json` retains the initial curve-only SLSQP refusal. Redundant sampled constraints were replaced by the equivalent knot-level concavity constraints and an exact-Hessian trust-constr quadratic solve. No parameter, geometric objective or feasible set was searched.

`attempt-1/` preserves the first complete export attempt, three successful resource sets, five failures and exact producer snapshots. Three female refusals were a shared audit mistake requiring a `textures` field on legitimate plain-material pants. Correct readback preserves absent textures. A shared morph implementation fix also keeps the protected base-vertex set fixed at every expression endpoint. Those correctness changes leave the constructed body/face field, constraints and determinant gate unchanged. The final rerun produces six candidates and preserves the two genuine geometry failures.

Female-long-slender-v2 fails at original Body vertex 702 with determinant 0.102261582. Male-long-lean-v2 fails at original Face vertex 913 with determinant -1.609811718. Source positions/material context remain in each failure. There is no v2 avatar or clothing for either failed preset. No threshold is lowered or parameter weakened. This establishes a limitation of the current mapping, not a proof that every possible continuous solution is impossible.

## Reproduce and interpret checks

Requires Python, NumPy, SciPy and Pillow. From the repository root run

```powershell
python -B scripts/m2-representative-batch-v2/build.py --out assets-source/m2-representative-batch-v2/rebuild
python -B scripts/m2-representative-batch-v2/qa.py
```

The actual run used CPython 3.13.11, NumPy 2.4.2, SciPy 1.18.1 and Pillow 12.1.0 on 64-bit Windows 11 build 26100. `requirements.txt` pins those three dependency versions and `toolchain.json` records the actual interpreter/platform/wheel tags. The recorded identical exports are repeated calculations in the same process/toolchain. Cross-platform byte determinism, another BLAS build and another Python version have not been established. Version locks document the observed environment without making that broader claim. This dependency receipt does not regenerate or relabel any fixed resource.

Use a new output directory to retain fixed run timing. Each candidate plan is computed twice and asset/report bytes must match. Differing existing files are refused. The manifest includes measured run timing and file/encoded-image costs, so it changes between invocations. The source-author QA verifies the fixed generated resources, all six exported curve constraints and actual facial cross-sections, garment identities/offset reports, finite attributes/morphs and explicit failed entries. It does not call failed entries successful or replace independent review.

CPU three-view comparison is generated separately with `scripts/m2-representative-batch-v2/preview.py`, showing original/v1/v2 in the same front/side/back views. Failed columns remain visibly blank with a failure label. These approximate neutral-pose CPU images do not establish game visual, motion/contact, dynamic-hair or ordinary-PC performance acceptance. Root owns those decisions after independent readback.
