# Blender standard seated author v1 — rejected, frozen

One bounded same-topology artist-shape attempt was actually produced, exported and shown in the full room. It failed both geometry/material checks and visible appearance. No second set of angles, supports or distances was tried. Main runtime and public1a are unchanged.

## Assets and actual editing

Parent02950240c98021c63ae78be5058d248709e7a12a4449782ecb03dd43663f9bc7 (1402vertices/2440faces) is retained. Output m1-sixfold-skirt-seated-author-v1.glb SHA e9a384f918f79612eaa6720c84ae9951c847393bb56b1092992fc19f042ed280. Source is seated-author-v1.blend: original skinned mesh with Basis/seated_author_v1 shape, named source-edit object, named selection weight groups and modifier-origin empties. Original uniform derivation/permission applies, not automatic CC0. Body exact027bed60; actual seated input frame60 of capturee494fa…/runtime58394.

The single edit starts from rigid-hips cloth reference with safe upper boundary copied exactly from actual seated LBS. Blender native Simple Deform Bend opens the front over a60mm near-waist hinge (angle−1.4188rad derived from actual thigh slope), then a rear50mm return bend. Native Shrinkwrap, nearest surface/outside mode, applies to anatomically selected actual thigh-upper and seat-side body supports. Outer/inner offsets3.2/2.4mm are author input, not acceptance. Complete Body remains in the final gate. Original inner return121points/240faces, fixed120 retainedfaces and original seam remain; no cloth solver runs.

All operation parameters, source-to-import mapping, selection arrays and after-each-operation geometry are preserved in author-result.json, selection-groups.npz and author-stages.npz. This is a documented native modifier author pass, **not** hand-sculpted production quality. It does not establish that native modifiers automatically produce natural clothing.

The world target is mapped back through original weighted bind transforms solely to store the editable shape. Blender's standard glTF exporter writes POSITION and NORMAL morph channels. It uses uint8 joint accessors and sparse normal targets; the initial limited diagnostic parser rejected those, then gained the required standard-accessor reader without changing asset or target. Those first parser errors are retained. Exact source face lineage and standard export readback are in export-lineage.json/actual-export-replay.npz. Exported target error0.428micrometre, Basis replay0.423micrometre and fixed boundary0.424micrometre; this isolates actual shape failure from encoding/binding failure.

## Failure, not a positive sitting example

Full original rendered topology: Body115pairs, experimental top46, seat60, back0, self27. All115Body and46top pairs occur on outer skirt, not merely hidden hem thickness. Seat50outer+10inner/fold. Edge ratio max6.855, area7.323, hard material gate1.25 failed. Inner edge1300–1301 grows9.956→68.255mm; it stays9.956mm through both bends and front support, then jumps during rear-inner nearest-surface Shrinkwrap. Outer edge1179–1180 grows10.085→67.467mm (6.690×), so fixing only inner mapping would not solve this sample. Already after front weighted Bend, some outer edge reaches4.964×: regional weighted bends do not maintain sheet material across selection transitions.

Selected source axial paths235.6–251.8mm become196.2–262.2mm, most close to source length. The worst problem is circumferential/neighbor continuity and unsupported side transition, not demonstrated shortage of whole skirt length. A bad target demands58.299mm extra on one inner edge, but **this is not proof that the physical pattern needs that extension**. No honest minimum pattern-length change can be inferred from this failed author shape; do not prescribe a longer skirt from these numbers.

## Complete room preview

See gpu-preview/{parent,candidate}-{front,side,room}.png. Both views use the experimental top shapee0e75…at1, which still fails2.4mm author reserve and pants compatibility; this is not a general top fix. Skirt0 is the029Basis, skirt1 this authored shape. Full original body, face/hair, shoes, both real skirt primitives/inner surfaces, chair and room remain, with ordinary game textures/materials. Frozen58394 files are untouched; QA routes only two exact assetSHA/bytecounts under existing diagnostic equipment IDs. No controller or live code patch. The loaded shape is checked against exported actual vertices; two primitives have POSITION/NORMAL morph channels. Camera/projection and simulation time are identical between0/1 per view. No console/page/HTTP failures.

Viewed front and side. Front now covers more thigh but hem is scalloped/jagged and visible skin pierces the side/front near hands. Side has a large skin hole and a pointed rigid fold, with rear cloth crossing the seat. These are normally visible defects, not only internal triangle pairs. Same-pose body and frozen hand state are retained; no newhand response after static toggle. This is a rejected single-pose source preview, not a new fixed build or any continuous motion pass.

## Reproduce without inventing another attempt

In an isolated copy with no existing author-result.json, Blender4.5.9 background,threads2,python-exit-code1 executes scripts/m1-assets/simple-skirt/build-blender-seated-author-v1.py. It saves editable Blend and standard GLB. gate-blender-seated-author-v1.py reads byte/sparse accessors and runs full target/body/top/chair/self/material checks. It refuses an existing geometry report. Use frozen source and full input hashes in manifest. The editable asset is already preserved; no regeneration is required for viewing.

For static GPU use existing scripts/run-fixed-check.cjs with immutable experiments/m1-layer-review/dist-layer1-linked and scripts/m1-assets/simple-skirt/qa-blender-seated-author-v1.cjs. Set QA_RUNTIME_ROOT to installed main tools; QA_M1_BUILD58394ce674e4 and QA_M1_ASSET_SHA027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95. Existing output reports are not overwritten. Script closes browser; wrapper closes temporaryserver. The exact target reference is included. Archive shows diagnostic routing; no newsource digest is claimed.

This production attempt stops. Remaining need is a deliberately constructed coherent side/seat cloth surface or a known-good editable garment asset, not another automatic Bend/Shrinkwrap parameter pass. Root chooses the next route. No runtime driver, intermediate pose, walking, run, dance or cancellation test was added to this failed shape.
