# Three exact v2 head-reference ponytail fits

This package reuses exact original rootjoin-v2 hair GLB SHA `1b785f9d54107818cee39eda2de7263ad0720ce90968fbaa7cc32c2465e3c385` and source `female-ponytail-headref-v3` fit. No source geometry, auxiliary bones, inverse binds, spring force/radius/gravity/drag, raw-head reference or attachment transform is changed. Three successful v2 female targets receive new fit IDs/version 2. Failed lean bodies receive no fit. Original v1 fits and source remain fixed.

`spec.json` pins the successful v2 source batch, exact old source spec/VRM/asset/fit/manifest and helpers. `generated/manifest.json` uses schema `preset-ponytail-fit-batch-v2` and contains the three canonical `results`. Publish only those results. Archived failures are not candidate entries.

For each actual target, the original `scripts/m2-long-hair-v1/build.py::proxies` function regenerates the head sphere, head/neck capsule and chest capsule. Original proxy output must first reproduce the source v3 fit exactly. `proxy-report.json` records source/target vertex-selection hashes, counts, radii/endpoints/differences and every rest spring-child sphere margin. The head/neck/chest raw nodes and inverse binds, original cap indexed geometry/normals/UV/weights, materials and image payloads also match. This does not claim every side-head surface point is unchanged.

Each target is checked against every original authored morph endpoint plus neutral, giving 57 actual female states. The shared v2 auditor reuses the old strict-interior and original ponytail inclusive tests, and measures their union of new pairs in the correct source coordinates. Any new contact must have nonempty conservative positive-depth texel footprints, with maximum alpha exactly zero in both V orientations. Data is recomputed for the current target and source texture. No v1 contact judgment is inherited.

All three current fits are explicitly `source-contact-candidate-measured-v2`. The old strict static gate's two new Body pairs are preserved in the attempt history. Current evidence measures their approximately 0.21 mm positive depth and transparent footprints. Additional authored endpoint occurrences, if present, remain individually measured in the contact report. A numerical zero or an empty report is not substituted for these contacts.

Per-target outputs are `fit.json`, `manifest.json`, `evidence.json`, `geometry-report.json`, `contact-report.json` and `proxy-report.json`. Fit schema remains `character-hair-fit-v2`, version 2, logical style ID remains `female-ponytail-headref-v3`, and source manifest version remains 3. Public prefix is `/assets/m2-preset-ponytail-fits-v2/`. Original GLB URL remains shared. `fit.fitEvidence` pins evidence by URL/SHA, which in turn pins geometry/contact/proxy reports. A publisher must verify and publish the whole referenced chain and retain the conditional status.

## Reproduction and retained failures

```powershell
python -B scripts/m2-preset-ponytail-fits-v2/build.py
python -B scripts/m2-preset-short-hair-fits-v2/qa.py
```

The plan is calculated twice and byte equality is required. Existing conflicting files are refused. The shared short-hair-v2 numerical module is a declared source dependency. Toolchain versions and limits match its package. Original source-model/hair licensing remains unchanged. No new GLB is exported.

`endpoint-count-attempt/` preserves the incorrect female-count metadata refusal. `strict-metric-attempt/` and `coordinate-attempt/` preserve the static-pair coverage guard's intermediate refusals. `inclusive-key-attempt/` preserves a list-versus-tuple pair-key identity bug that rejected already measured pairs. It is fixed by canonical tuple keys. These changes do not modify geometry, solver parameters, hit radii, UVs, texture pixels or contact thresholds. Input pin metadata updates retain previous receipts separately.

These are source-author measurements and conditional technical candidates. The v2 face parameter intent remains projected. Combined/continuous expressions, posed clothing/body clearance and actual side-head/ear/root behavior need root's game review. Existing head-reference ponytail chair-top tail bending and dynamic-naturalness limitations remain. No browser/GPU/visual approval is claimed.
