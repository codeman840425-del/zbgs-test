# Source-skinned fixed anchors: bounded offline regression

Run from repository root: `node scripts/qa-skirt-skinned-anchors.mjs`.
Requires the locked dependencies installed under `prototype/node_modules`.
The JSON records exact current source, fit configuration, script and actual GLB hashes.
It is not a build-332 browser result: the parent added explicit fit and fail-closed weld/morph validation during this check.

## Executed result

- Original female, jaw and waist/hip skirts: each 742 source vertices, 381 welded particles, 281 duplicate groups and 182 fixed-band vertices. No extra groups arise from six-decimal rounding. Every welded group has identical effective joint weights; no morph targets exist in these three files.
- Direct calls to the real `createM1Skirt`: hips/spine mixed skinning remains accurate after spine rotation and hips yaw. Maximum world error is 0.00003985 mm; with a translated, rotated, non-uniformly scaled parent and non-identity bind it is 0.00004264 mm. These tiny residuals are from the render Float32 position buffer.
- Former pure-hips transformation gives 12.673 mm and 13.144 mm error for the same source poses, so the positive fixtures would catch the original fixed-band defect.
- Equivalent skin slots in a different order, including unused joint slots, remain accepted. Different effective weights at the same point, distinct positions rounded to the same key, morph geometry and missing fit are rejected before a replacement mesh is attached or the source is hidden. Disposal restores the original mesh.
- The actual `selectSkirtFit` was bundled unchanged with the installed esbuild and called using all three real equipment manifest entries. Three exact identities pass; twelve bad garment-hash/body/id/declared-compatibility cases reject.

## Equipment integration read-only review

`equipment.js` checks actual fetched byte length and SHA before GLTF parsing, and body compatibility before fetch. `m1-equipment.js` checks the body's foundation identity, loads equipment, then selects the exact fit inside a try/catch that disposes the adapter on failure. This check happens before existing source-clothing visibility is changed. The same selected fit is explicitly supplied to `createM1Skirt`. Consequently, unknown ids or hashes do not silently inherit the old one-skirt guide. This is a source review plus real selector calls, not a simulated network-loading browser test.

One existing boundary remains: failures later in the corrective constructor, after the integration hides original clothing, do not have a general integration rollback wrapper. The four tested constructor validation failures are atomic inside `createM1Skirt`, and actual three pinned assets satisfy the contract; this observation does not invalidate the current exact-identity path, but future approved assets still need their own constructor admission test.

## Boundary

This validates the three current asset weld contracts plus targeted synthetic coordinate/skin cases. It does not approve arbitrary garment inputs, cloth dynamics, contact, visual quality, other skeletons, or browser update ordering. The parent independently owns the actual fixed-band dynamic browser check. No browser, GPU, rendering, product edits or fixed-build changes were performed here.
