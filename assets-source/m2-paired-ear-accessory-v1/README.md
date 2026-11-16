# Paired compact stud source candidate

This package supplies one new compact gold stud style. Its editable source is `spec.json` plus the readable CPU generator. The base accessory is a closed ellipsoid, 5.2 mm wide and 3.2 mm deep, with its back 0.6 mm outward from the measured ear surface. It has one material and no texture, skin, animation, or negative scale.

Run these commands from the repository root with Python and numpy available. The source receipt records Python 3.13.11 and numpy 2.4.2. The numpy pin is in `scripts/m2-paired-ear-accessory-v1/requirements.txt`.

```powershell
python scripts/m2-paired-ear-accessory-v1/build.py
python scripts/m2-paired-ear-accessory-v1/qa.py
```

`generated/stud.glb` is the common style geometry in right-handed glTF metres. Local +Z points away from the ear and local +Y points upward. Two independently identified side instances use this common geometry with distinct positive-determinant rotations and positive scales. `female-pair-head-local.glb` and `male-pair-head-local.glb` contain the two actual side nodes in the corresponding raw-head bind-local coordinate system. They are source fixtures without an embedded avatar.

The original female and male VRMs are SHA-pinned inputs. Their actual Face skin primitives contain detached 53-vertex ear surface components. The four selected lower-ear triangles are recorded in the spec and every fit trace. The generator uses each triangle centroid and its source smooth normal, verifies full head skin weight, obtains the raw head transform from the glTF parent hierarchy, and computes the attachment in raw-head bind-local metres. Its up axis is head-up projected into the tangent plane. Side identity is checked against that avatar's semantic leftEye or rightEye raw node. The male and female fits are computed from their own input files.

`generated/female-fit.json` and `male-fit.json` preserve each source material, primitive, face/vertex identity, original positions, ear component bounds, normal, head matrix, source accessor hashes, head weights and resulting positive-scale transform. No original ear, face, body or avatar bytes are changed. Style identity and each base-fit identity remain separate.

`stud-repeat.glb` is a repeat export from the same source. `variant-spec.json` changes only `radiusM` from 0.0026 to 0.003, and `stud-parameter-variant.glb` proves that source edit changes the exported geometry. This is one parameter variant of the same style. The QA re-exports all source outputs and requires unchanged bytes, checks closed topology and normal winding, and samples stud vertices and triangle centroids against the original face surfaces at rest. Sampling does not establish complete triangle collision or action acceptance.

Runtime integration needs to load the common GLB once, create independent left and right object/material instances, and apply the selected base fit to the actual raw head node. Socket IDs are `ear.left` and `ear.right`. Selecting the pair occupies both sockets, while each instance retains its own ID and side. Loader/dispose, source identity rejection, head/face changes, hair occlusion, glasses coexistence, normal-speed movement, expressions, repeated toggles and independent actors still require runtime tests. This source package does not claim runtime or visual acceptance.
