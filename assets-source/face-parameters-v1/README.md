# Mouth width source parameters v1

Four independent source candidates: original female/male, mouth width −4% and +4%. This is the first limited geometry parameter sample, **not** the whole facial-feature platform and not game/visual approval. Original sources, public resources and runtime are unchanged.

## Inputs and outputs

`spec.json` pins original editable Blend and original VRM identities, Blender 4.5.9 and VRM addon 4.10.5. Original VRM metadata/permissions are retained (the title alone identifies the candidate); these remain derivatives of the existing VRoid bases. See the preserved original provenance; this package does not claim a newly authored human mesh.

`generated/<id>/` contains editable.blend, avatar.vrm, an identical repeat export, exact per-source-point mapping, build report, full expression map and audit. `rebuild/<id>/` independently recreates from the original source and confirms the same VRM bytes. `manifest.json` pins all four endpoints and the two runtime recipes. No garment, accessory or avatar-specific animation compatibility is automatically inherited.

The source has duplicated material-seam vertices. Actual coordinates pair the 32 external lip vertices with 32 mouth-interior vertices; no cross-gender point numbers are reused. All mouth interior components use full weight; skin falls off by Basis geodesic distance over 8 mm. Other materials and the head/neck seam are protected. The mouth interior is retained whole; connected components have not been arbitrarily labelled teeth/tongue by name.

For a fixed source weight w and parameter p, `x' = centerX + (x-centerX)*(1+p*w)`; y/z remain unchanged. Apply this to every absolute source shape. Equivalent relative morph delta is `deltaX' = deltaX*(1+p*w)`, not an unchanged delta or a second Basis translation. Fixed coefficients commute with linear expression blending. Normals are recalculated by the source exporter. Actual exported targets contain POSITION only, as the originals do; do not claim exported morph NORMAL data exists.

## Actual numerical results

| Endpoint | Changed Basis points | Maximum Basis displacement | Worst edge ratio over all expressions |
|---|---:|---:|---:|
| Female −4% | 410 | 0.932 mm | 1.188 |
| Female +4% | 410 | 0.932 mm | 1.098 |
| Male −4% | 410 | 1.115 mm | 1.210 |
| Male +4% | 410 | 1.115 mm | 1.109 |

All 56 female / 54 male targets plus Basis were checked. No new reversed-normal or degenerate triangle was measured against each corresponding original shape. Mouth seam pair gaps remain zero in all stored shapes. Body attributes, indices, skeleton, binds, UV, weights, textures, material and expression mappings are unchanged. Protected positions are unchanged within the audit float tolerance. Independent rebuild and saved-Blend re-export hashes all agree per endpoint.

These numbers do not certify visual naturalness: maximum per-face normal change reaches 13.87° in male +4% Fun, and the smallest edge ratio reaches 0.7976. The broad Joy/Fun expressions deserve close review, not only neutral lips. Existing tiny/degenerate triangles are recorded separately. No renders or browser tests were performed for this package.

## Runtime recipe contract (data only)

`female-mouth-width.recipe.json` and `male-mouth-width.recipe.json` pin the exact **original** base SHA, Face mesh/primitive indices and hashes, vertex count, coefficients and source mapping. Every actual Face primitive shares the verified full vertex/morph buffer values, although each has its own used indices. Do not assume loaded geometry names or silently apply the recipe to a different base.

Source-to-export nearest matches are within 0.120 µm, not zero; all matching duplicates within 1 µm must have equal coefficients. Runtime recipe endpoint POSITION matches the independent Blender output within **3.73e−9 m**; all relative morph POSITION checks pass. Runtime normals must use the actual geometry and be checked separately. Recompute on the combined original Face topology if preserving cross-primitive smoothing, then distribute to the actual cloned primitives; do not count point matching as lighting matching.

Runtime state should be `(originalBaseSHA, recipeSHA, mouthWidth)` with p limited to [−.04,.04], never a falsified original geometry identity. Clone mutable geometry/attributes per actor. Each change derives from preserved original Basis/morph data; reset restores original arrays and bounds. Repeated slider changes must not accumulate deformation. An actual exported endpoint has its own separate VRM SHA.

Eye/brow/nose/mouth-height controls are not generated. Current mouths stay centred; this does not automatically accept mic/glasses fits. UV-stable color masks can be revalidated against the preserved attributes; new avatar SHA registration remains explicit. No compatibility with earlier jaw/waist variants is implied.

## Minimal runtime module and CPU regression

`prototype/src/facial-geometry.js` is the separately authorized minimal module; it does not load a new character or copy its controller. API: `createFacialGeometry({vrm,avatarSha256})`, asynchronous `set({mouthWidth,expectedRecipeSha256?})`, `getState()`, `dispose()`. Parameter zero restores original geometry references without loading a recipe. The optional expected recipe SHA is checked before any deformation. Unknown/derived bodies are explicitly unavailable, even when their Face topology resembles a supported original.

Actual material names and per-primitive position/index/UV hashes are verified. Meshes, skeletons, materials and `morphTargetInfluences` references remain intact; each actor owns cloned geometries. A combined index list counts each source primitive once, excluding duplicate outline copies. Normals are computed across this full Face topology, and only points belonging to changed triangles receive new normals; untouched normals retain original values. Every absolute morph is treated the same way, then converted to relative normal deltas. This is a runtime recalculation, not an assertion of bit-identical Blender normals.

`node scripts/face-parameters-v1/runtime-check.mjs` passed actual-source CPU checks for both bodies: all expression POSITION endpoints, repeated changes without accumulation, originals shared by a second instance unchanged, expression references unchanged, finite full-face normals, unaffected normal preservation, bounds, wrong expected version rejection, range rejection and exact reference reset/disposal. Seven additional scenarios cover pending reset/disposal/latest request, HTTP503, tampered recipe bytes, unknown body and mutated original attributes. `runtime-check.json` binds the tested module SHA. It uses actual VRM buffer data in Three objects and mocked file HTTP, **not** a WebGL/VRMLoader/visual test.

## Reproduction

From `F:/gamemake`, use the pinned executable (no rendering):

```powershell
& 'F:/gamemake/experiments/tools/blender-4.5.9-windows-x64/blender.exe' --background --factory-startup --disable-autoexec --threads 2 --python-exit-code 1 --python scripts/face-parameters-v1/build.py -- --out fresh-check
python scripts/face-parameters-v1/audit.py
```

The builder refuses any existing output folder. Any non-`generated` output checks against saved `generated` endpoint hashes. Original creation used `--out generated`, followed by `--out rebuild`; audit reads those two fixed outputs. It writes only this source package. Never overwrite originals to make identity checks pass.

Two initial tooling assertions failed before any export (Blender version string includes “LTS”; source seam IDs are duplicated, not shared). Their logs are retained. The final generator fixes detection only; amplitude, selection rule and affine method were not tuned to audit output.
