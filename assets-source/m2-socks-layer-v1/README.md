# Plain crew socks v1

One new independent thin sock style has separate fits for the exact original female and male Body identities in `spec.json`. Each GLB contains two connected, closed skinned shells, one per foot. They extend from the toes to a cuff 120 mm above the higher ankle bind position. Both knees remain above the cuffs.

Run from the repository root with Python 3.13 and the pinned packages in `scripts/m2-socks-layer-v1/requirements.txt`.

```powershell
python scripts/m2-socks-layer-v1/build.py
python scripts/m2-socks-layer-v1/qa.py
```

The builder reads only the exact source Body files and the pinned shoe/pants candidates. It writes this package's `generated/` directory. Units are metres in the original glTF right-handed mesh-local space, +Y up and avatar front -Z. The raw rest hierarchy, six lower-leg/foot/toe joints and their original inverse bind matrices are preserved. The mesh rest matrix is identity.

`spec.json` is the editable source. The generator clips each Body's actual foot/calf triangles at the crew plane, interpolates skin weights, welds coincident UV seams, and constructs a new 0.5 mm shell from 0.3 to 0.8 mm outside that surface. The plain material has no texture. The male original Body has separate calf and foot boundaries with equal weights and about 31 micrometres separation. A measured one-to-one seam join is confined to the new sock within a fixed 50 micrometre bound. `source-screening.json` preserves this finding and the earlier numerical seam-opening failure.

The original Body geometry and textures remain intact. In particular the female source already paints a long dark stocking above this new crew cuff. `qa-report.json` records the actual embedded texture hash and original UV color samples. The new mesh cannot make that painted upper calf bare. The male source also paints the foot/ankle dark.

`generated/female-entry.json` and `male-entry.json` are items for the existing `zbgs-equipment-v1` manifest. They carry exact bytes/SHA, six bindings, identity restMatrix and dimensions. Merge the relevant entry into its original body's manifest and publish its GLB alongside it. The recommended slot is `socks`. `pairedWith.shoes` requires a listed exact shoe ID/SHA, and every selected lower garment must appear in `pairedWith.lower`. The matching fit JSON and build report retain source geometry hashes, cuff, thickness and candidate dependencies. These fit JSON files are source evidence and require no new runtime fit-resource schema.

The original female training pants, male shorts and male long pants are declared candidate lower garments. Male long pants extend below the cuff. The static rest diagnostics record shoe crossings and several male long-pants crossings. No Body mask is provided. Runtime movement, shoe visibility/contact, layering, removal and restore require the shared game checks before accepting these combinations.

`generated/parameter-variant/` demonstrates one source edit from 120 to 130 mm above the ankle. QA verifies a different actual GLB SHA and a 10 mm exported cuff movement, then checks exact repeat bytes for both fits and both variants. The variant is an export proof for this same style.

`qa-report.json` records source identity/skin checks, topology and diagnostic noncoplanar triangle crossings. Coplanar contacts and continuous collision/depth are outside this CPU test. Minimum distances use sampled vertices. Diagnostic crossing counts have no zero-count admission threshold. No browser, GPU or Blender validation is claimed. `package-files.json` identifies all source and generated files except itself.

The source license chain is recorded in `provenance.json` and the existing female/male foundation records. The mesh is derived from those CC0 bases and the new construction and plain material use CC0-1.0. The original editable VRoid source is unavailable, as recorded by the foundation provenance.
