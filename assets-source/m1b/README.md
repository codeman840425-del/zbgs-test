# M1B male source and independent trousers outfit

This production input uses the actual old-beta **Base_Male**, not renamed/scaled female geometry. The original VRM and packed reconstructed source blend remain in `assets-source/foundation-male/`; their exact hashes are pinned by this directory's `spec.json`. Provenance and conditions remain in `assets-source/foundation-male/LICENSE.md` and `source.json`. The reconstruction is not the original `.vroid`.

## Rebuild

From the repository root, with the already pinned Blender/addon and `numpy==2.4.2`:

```powershell
experiments/tools/blender-4.5.9-windows-x64/blender.exe --background --factory-startup --python scripts/m1b-assets/export-body.py
python scripts/m1b-assets/build.py
python scripts/m1b-assets/audit.py
experiments/tools/blender-4.5.9-windows-x64/blender.exe --background --factory-startup --python scripts/m1b-assets/save-editable.py
```

`export-body.py` reopens the preserved male blend, checks the original VRM/blend pins and tool versions, exports to a temporary ignored location, validates the expected output SHA, then installs `prototype/public/assets/foundation/base-male-roundtrip.vrm`. It does not rewrite the original blend. `build.py` extracts only male clothing primitives, preserves source UVs/textures/raw weights and inverse binds, and produces independent GLBs plus a `zbgs-equipment-v1` manifest. It does not alter the complete body.

Two separate Blender export processes and two equipment builds produced **byte-identical** VRM, three GLBs and manifest: see `reproducibility.json`. This checks the current pinned pipeline; intentionally changing source geometry requires a reviewed new source/compatibility pin, not skipping the hash check.

`save-editable.py` creates three packed garment `.blend` checkpoints, then reopens each and verifies mesh count, rig modifier and packed images. The importer's Icosphere bone-widget helper is recorded separately; it is absent from the generated runtime GLBs. Canonical runtime output currently comes from the pinned body plus deterministic exporter. Arbitrary manual edits to garment blends are not automatically approved for compatibility or export.

## Actual assets

| ID | Role | Vertices / triangles | Weighted joints |
| --- | --- | --- | --- |
| m1b-uniform-top | Original male short-sleeve uniform/vest surface and tie | 1476 / 2096 | 10 |
| m1b-uniform-pants | Original male long trousers, independent bottom | 1096 / 1624 | 9 |
| m1b-uniform-shoes | Original male flat shoes | 566 / 540 | 6 |

This is one male outfit split into replaceable resources, **not a newly designed garment or expanded clothing library**. The top's shirt/vest appearance is partly texture design; they are not separate garment layers. No female garment, dimensions, shoe patches or seat-fitting constants were copied. There is no male skirt in this package.

Runtime resources:

- `/assets/foundation/base-male-roundtrip.vrm`, SHA `62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff`.
- `/assets/m1b/equipment.json`; URLs inside resolve to the same directory. Each entry carries its own SHA/bytes, the exact male avatar SHA, original raw bone names/semantics and inverse-bind matrices. Identity mismatch must fail rather than silently fitting female geometry.
- `/assets/m1b/m1b-uniform-top.glb`, `/assets/m1b/m1b-uniform-pants.glb`, `/assets/m1b/m1b-uniform-shoes.glb`.

## Source/fit evidence

`body-export-report.json` records source and tool identities, packed images, geometry and 54 face shapes. Roundtrip retains 7,340 complete-body skin triangles. `audit-report.json` independently reads all exported GLBs and verifies actual skin bindings, normalized weights, texture bytes and rest-pose skin positions. Maximum rest skin position error is below 0.2 micrometers and maximum weight sum error is about 1.2e-7; these are structural checks, not proof of motion fitting.

`profile-measurements.json` supplies material-role patterns and measured male rest coordinates. Measurements: hips height 1.008256 m; shoulder span 0.295550 m; ankle separation 0.099137 m; left upper/lower leg 0.388112 / 0.456844 m; ankle height 0.121321 m. The raw VRM0 left leg is negative X; after `rotateVRM0`, root-space X/Z signs reverse. The report includes both conventions explicitly and selects shoe patches by actual side-specific bone weights.

Suggested source-role rules: body `^M00_001_01_Body_00_SKIN$`; duplicate original clothes `_(Tops|Bottoms|Shoes)_|_Accessory_Tie_`; hair `_HAIR$`; face `^M00_000_00_(Face|Eye)`. The runtime should hide only duplicate source clothing after equipping the matching independent clothes; keep real body skin and independent shoes in diagnostic mode.

Seat/hand/trouser clearance is deliberately **not a copied female number**. The room chair is environmental data; body/garment seating offsets must be sampled on this male body in its actual source poses. Rest measurements cannot approve those offsets. Dynamic foot contact, posture, clothing interaction, facial behavior, roundtrip rendering and two-instance isolation require real integration and fixed-candidate QA. The source/asset pipeline alone does not pass M1B.

Subsequent developer diagnostics are recorded in `evidence/m1b-dev-contacts-20261114.json` and `evidence/m1b-dev-isolation-20261114.json`: the actual male loaded, sat and stood, while initial tests identified a 1.975 mm trouser/seat penetration and 12.59 mm stop-transition shoe penetration. These are preserved as initial failure evidence, not current acceptance claims. The separate male seat derivative measured offset0→gap−1.975 mm and offset.01→gap+6.314 mm (response .82894), so the female fit factor was not reused. Actual male+female and male+male resources/action/face/equipment/disposal isolation passed the stated developer checks. Later fixes and fixed-candidate results belong to the root-owned capability/milestone record; these exports alone still do not approve M1B.
