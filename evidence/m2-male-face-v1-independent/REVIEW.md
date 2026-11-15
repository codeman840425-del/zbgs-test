# Independent review: one male jaw specimen

**No blocking source/fit defect found for controlled game readback. Not game/visual acceptance.** Reviewed avatar SHA256: `25ac8a8174110d7b0a6bb290ac8cab66ad6939ea522f80cdef62571d2ab24153`, parent male `62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff`. This review only wrote this evidence directory. No candidate/spec/source edit, Blender execution, browser, GPU or performance measurement occurred.

## Geometry and expression meaning

Independent GLB decoding, without importing the producer's decoder, confirms 98 referenced face-skin points move by at most 2.305881 mm. Every other material's referenced positions are unchanged. All Body attributes and indices, skin weights/joints, UV, nodes/transforms, inverse binds, humanoid definitions, materials and embedded image bytes match the parent. Default morph weights are unchanged. This is a changed Basis surface, not a scale transform or expression setting.

The spec's positive `widthIncrease=.06` **broadens** the lower jaw, with a tapered chin displacement. It must not be described as a narrowing specimen. This is one discrete source candidate; no request to change its parameters is made by this review.

All 54 face target names/counts and VRM preset/bind mappings match the parent. Each exported morph POSITION delta was independently compared; maximum component error is `7.450580596923828e-9 m`. The generation script adds the same per-Basis-vertex displacement to each of 54 expressions plus Basis, preserving relative deformation, within floating storage error. This maintains expression data semantics, not proof of anatomically correct new expression combinations. New surface normals legitimately change. On the neutral skin mesh, independent triangle checks find no new flips/degeneracy and a maximum normal change of 8.574578 degrees. The producer's separate edge-ratio report reaches 1.22721; this is a reason to inspect the transition visually, not by itself a failed or passed aesthetic criterion.

## Protection checked independently

- Source changed IDs match the stored 98-point delta and are exclusively face-skin vertices. None overlaps a non-skin material or the influence IDs of any source `EYE_*` expression.
- All 116 declared seam-neighbor protected source points have zero displacement. The stored original source positions exactly match the prior inspection dump.
- The fully protected mouth core, derived from the spec's full-strength coordinate region, contains 460 source points; all have zero displacement. This count includes any source material in that region and is not a count of lip-only points.
- Independent nearest-point checks on exported parent meshes find 50 face-skin points within 100 μm of Body skin; all remain exactly unchanged in the candidate. Export mesh nodes have no local transforms, so those coordinates share a frame.
- Another 32 face-skin points lie within 100 μm of the mouth material; all remain exactly unchanged. Mouth/teeth material itself, eye materials, brows, lashes and eyeline referenced positions are unchanged.

The 100 μm cutoff reuses the source seam correspondence criterion; it is not a new contact tolerance or collision guarantee. These checks support eye/mouth/seam protection at the source and exported neutral surface. They do not establish every expression combination's eyelid closure, lip/teeth relationship, jaw silhouette or posed neck shading.

## Equipment fit requalification

All four existing male equipment entries retain resource ID/style ID where present, URL, byte count, resource SHA and binding maps. Their actual GLBs were decoded independently: each equipment inverse bind equals its target candidate bone's inverse bind; manifest matrices agree within the stored decimal precision. Candidate equipment entries bind the exact new avatar SHA and carry new fit IDs. URL resolution remains based at `/assets/m1b/` under the proposed install mapping.

The exact unchanged Body geometry, weights, rest rig and clothing bytes provide a concrete basis for these four fit requalifications; this is stronger than copying a new hash onto unexamined clothes. Forearm profile radii remain identical to the parent, with the new exact body identity and provenance. Reusing the male seat constants is a candidate initialization supported by unchanged body/trouser geometry; own posed runtime checks remain required, not inherited acceptance. Old optional shorts material-recipe references are removed. Microphone fit, glasses fit and avatar-SHA-specific normalized dance remain unadapted and must not be silently enabled for the new identity.

Actual saved generated/rebuild avatar and repeat-export files all have the same candidate SHA; the original male source blend and roundtrip hashes still match their pins. This independently verifies the present bytes, not a new Blender rerun. Exporter restart/rebuild execution is producer evidence.

## Scope and reproduction

`check.py` performs the bounded read-only decode and writes `result.json`. First execution stopped on the review harness's assumption that the exported mesh was named exactly `Face`; the actual exporter names it `Face.baked`. The harness was corrected to require exactly one `Face`-prefixed mesh; subsequent execution exited 0. This was not a candidate geometry failure, and no source/parameter was changed to make the check pass.

```powershell
python evidence/m2-male-face-v1-independent/check.py
```

The script uses existing NumPy with one BLAS thread; no installation or model inference is involved. `manifest.json` binds the input/source/fit identities and review results. Next acceptance should be the same-game original/new male comparison: neutral/front/side, blink, mouth presets, smile and gaze, then representative normal-speed locomotion/seating with the requalified clothing. This review does not expand the candidate to a general face editor, new garments, body-shape system or automatic accessory/motion compatibility.
