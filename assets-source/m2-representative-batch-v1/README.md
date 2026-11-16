# Representative body/face batch v1

Eight source-only derivatives use one deterministic metre-space deformation field and the same thirteen editable parameters. Four female and four male presets change lower cheek/jaw/chin shape and regional torso, hip, shoulder, upper-arm and thigh volume. Joint rest positions and limb lengths remain original. The complete pinned original VRMs plus `spec.json` and the Python field are the editable representation. No new Blender file is supplied.

## Reproduction

Requires Python with NumPy and the repository `scripts/production/flow.py` GLB reader. From the repository root run

```powershell
python -B scripts/m2-representative-batch-v1/build.py --out assets-source/m2-representative-batch-v1/rebuild
```

Use a new output directory for comparison. Each variant is calculated twice before writing and requires identical avatar, clothing and report bytes. Differing existing per-variant files are refused. Manifest wall-clock timing is observational and changes on another invocation. The checked-in `generated/manifest.json` records the actual final run.

`spec.json` pins original female/male VRM and six independent clothing resources by repository-relative path and SHA-256. `output-contract.json` describes consumer references. Each successful variant supplies a full VRM, exact derived top/bottom/shoes, equipment manifest, fit record, profile draft and detailed build report. Profile URLs are proposed public destinations. Nothing here publishes them.

## Geometry and dependencies

The common field uses actual humanoid rest landmarks. Face deformation protects measured lip/eye envelopes and semantic mouth, eye, brow/lash and hair geometry. Normals follow the inverse-transpose field Jacobian. Morph positions use `F(base + delta) - F(base)` and appropriate normal targets are generated while retaining expression bindings and target order. Topology, UV presence/data, joints, weights, nodes, inverse binds, materials and embedded image payloads remain original.

The same field deforms the existing independent female top/training pants/shoes and male top/shorts/shoes. Shoes lie outside its supports and remain byte-identical. Fit records identify the exact derived body and actual exported clothes. Original clothing recipe/coverage dependencies are omitted from the new entries because they have not been adapted. Embedded full-VRM clothes also follow the field but receive no independent compatibility admission. The frozen independent skirt and dance assets are untouched. Original female painted stockings remain in the unchanged Body texture and are distinct from a new sock mesh.

Forearm collision, hand contact and seat contact remain ungenerated/null. Replacement hair needs its own exact fit. Parent integration measures those dependencies and performs runtime acceptance. Original skeleton identity alone does not establish volume-contact compatibility.

## Retained initial failure and common correction

`attempt-1/` retains the first complete batch result, its source snapshots and five failures. Its original manifest paths are preserved with the archival mapping documented in `history.json`. Female pants legitimately lack UVs. The initial audit wrongly required them. The two lean face fields also produced an excessive/negative local derivative around a narrow lip protection transition.

`common-correction.json` records one shared repair. Width now integrates a smooth lip transition instead of multiplying a shrinking coordinate by a steep protection window. The chin lower-support fade is wider. Source UV absence is preserved. All eight preset parameters remain unchanged. Final accounting is one initial batch, one common correction and zero per-case edits.

## Scope and cost

The fixed final run passed source checks for all eight variants and compared every asset with its repeated export. Reports contain actual geometric changes, per-resource hashes, bytes and measured timing. The texture ledger measures encoded image duplication across files, including repeated source payloads. It does not subtract independent texture objects or establish GPU memory use. Loading all eight simultaneously is not assumed.

Original VRM license/provenance metadata is retained in each output. Derivatives remain subject to the source asset terms. The new deformation scripts and parameter data are project-authored. This package does not grant a replacement license for the source models.

These results establish CPU source generation and identity checks. They do not establish pose/contact quality, game visual acceptance, arbitrary clothes/hair compatibility, or ordinary-PC performance.
