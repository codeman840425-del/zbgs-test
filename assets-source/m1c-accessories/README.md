# M1C bounded accessory candidates

Two original procedural resources: a 22.6 cm handheld microphone and thin rounded rectangular glasses. No downloaded mesh, texture or font is used. The project-generated geometry and source are provided under CC0-1.0; this statement covers these original files only, not the avatar, Blender, or unrelated assets.

Rebuild using the existing pinned Blender install:

```powershell
experiments/tools/blender-4.5.9-windows-x64/blender.exe --background --factory-startup --python scripts/m1c-assets/build-accessories.py
python scripts/m1c-assets/audit-accessories.py
# Optional repeat check that leaves public/source files unchanged:
experiments/tools/blender-4.5.9-windows-x64/blender.exe --background --factory-startup --python scripts/m1c-assets/build-accessories.py -- --output output/m1c-repeat --no-preview
python scripts/m1c-assets/audit-accessories.py --compare-dir output/m1c-repeat
```

`parameters.json` is the editable dimensional source. The two saved `.blend` files retain curves, materials, geometry and semantic socket empties. Runtime GLBs contain real exported meshes, opaque materials and those socket nodes; no runtime code was changed. `build-report.json` and the runtime `accessories.json` include SHA-256 identities, units, counts and separate female/male fit records. An initial repeat exposed nondeterministic sphere triangle order in Blender export: JSON, vertex attributes and the complete oriented triangle multiset were identical. The exporter now cyclically normalizes and sorts **opaque triangle indices only**, retaining winding, vertices, attributes, materials and sockets. Three subsequent independent exports match byte-for-byte. `reproducibility.json` records the comparison and exact preservation checks; no geometry was smoothed, hidden or replaced to get this result.

Runtime paths are `/assets/m1c/studio-microphone-v1.glb` and `/assets/m1c/studio-glasses-v1.glb`. Runtime units are meters, +Y up, +Z front. Microphone grip is at its origin, handle axis +Y; `socket_capsule` is [0, .113, 0]. Glasses bridge is the origin, front +Z, temples extend toward -Z. Glasses use opaque frames only: there are no transparent lenses to sort.

The female/male mount offsets and rotations are intentionally `null` and `verified:false`. They must be fitted to the actual respective normalized/raw-bone convention at integration, rather than applying guessed hand/head offsets. Suggested references are the right-hand palm for the microphone, and eye midpoint plus head orientation for the glasses. Scale/offset/rotation may differ by body. Retain source grip and bridge anchors when changing these values.

`evidence/m1c-accessories/*.png` are rendered source-object previews, **not proof of attachment fit or motion quality**. Holding animation, grip/finger closure, face clearance, head turning, appearance during blink/talk and independent two-instance ownership still need runtime tests. No generated-audio or speech feature is implied.
