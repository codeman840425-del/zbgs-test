# M1A local re-tailoring: decision proposal only

Prepared 2026-11-15. No source mesh, solver, runtime or public asset was changed. Existing failed trials stay frozen. This document proposes one complete seated outfit sample, not a claim of feasibility or a second capability list.

## Confirmed starting problem

The actual 60-frame capture (58394, e494fa…) contains a local conflict between the Hips-bound top hem and rising UpperLeg-bound body. At frame29, 17/19 top faces contacted by the failed skirt already intersect Body. These are surviving opaque side faces, not the removed cap. See main-project docs/SKIRT-LAYER-CORRIDOR-DYNAMIC.md.

The rejected weight transfer moves some top points 137.55 mm and gives extreme local strain. The separate top seated shape improves local body intersections 38→0 but only leaves 2.015219 mm against its declared 2.4 mm reserve, and creates 21 new pants intersections. It is not a reusable successful top.

The standard Bend/Shrinkwrap skirt attempt exports and replays correctly, yet gives Body115/top46/seat60/self27 pairs and max edge6.855×. Actual source axial lengths mostly remain near 235.6–251.8 mm: this failure does not establish a need for a longer skirt. Uncontrolled neighboring-sheet continuity is a demonstrated problem. References: assets-source/m1/simple-skirt-v1/{top-hem-corrective-v1,blender-seated-author-v1}/RESULT.md.

## One different production boundary

Re-tailor the lower vest and skirt as one paired outfit variant. Keep original assets and default outfit. This is a visible pattern change requiring comparison, not an invisible equivalent fix.

1. Keep original upper top, sleeves, tie, body, skeleton and actions. The maximum initially authorized editable top domain is the existing source Y<0.98 m band (85 vertices plus its incident faces). The fixed upper interface remains unchanged. Rebuild the hem/side contour with standard Blender Edit Mode loops, edge slides, Bridge Edge Loops and explicitly stored vertex edits. Do not repeat UpperLeg weight transfer. Establish the new lower edge from actual standing/sitting body space; no unmeasured “raise it 40 mm” promise. If a safe connected hem and skirt overlap cannot be built inside this domain, stop and quantify the required larger source change.
2. Reuse the original safe skirt yoke/120 faces and 20-point boundary where it remains compatible with the new hem. Recheck it; do not inherit success for the new combination. Below that boundary, build coherent front, back and left/right side quad panels with shared seam vertices. Put additional circumference into intentional side folds/gussets in the standing pattern, instead of stretching old rigid circumferential rows over the thighs. The design can remain navy and similar in length, but fewer/larger folds and a revised vest hem are genuine silhouette changes.
3. Author one seated shape on this new topology with explicit front/thigh, side transition and rear/seat selection sets. Use Blender proportional editing/local transforms and curve references for artist construction, not global Bend plus nearest-surface projection. Curves are editable source guides; they are not runtime per-point constraints. Both front thighs remain separately represented; the skirt does not bridge through the crotch or aim automatically for the knees. Rear cloth must occupy measured body/seat clearance or drape around the actual seat edge, never be projected through the seat.
4. Preserve a real render hem return and original inner garment. Construct the return coherently from the final panel boundary and keep it in the exported geometry/gate. Do not simulate a free unsewn strip, hide the inner faces, or use body masking. Reuse source materials where their UVs remain valid; new panel UVs are explicitly unwrapped and checked for seam/texture distortion. Source license remains the original uniform derivative terms, not CC0.

This differs from all frozen trials: it changes the garment's standing pattern and topological directions before creating the seated target; it does not force the old narrow band/ring mesh to supply missing circumferential freedom. It is still an unproven authoring method, not an automatic garment solver.

## Inputs and first measurable stop

- Female VRM exact SHA027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95, unmasked actual body.
- Original editable assets-source/m1/m1-uniform-{top,skirt}.blend; public closed top27bcfe… and isolated open-top7f266f… remain separate identities. Existing top correctivee0e75… is a failed comparison, not silently used as a passed parent.
- Existing continuous capture e494fa798bd954554b430635f43d4aa4417d346aac6391511c08502daebc6d58 and four-pose capture4fd19faa… contain real skin/bone/chair inputs. Start from actual frame60 plus worst local layer-conflict frames29/35 and standing. These old inputs are source construction references; current runtime acceptance needs a fresh matching build/body/action capture after a positive sample exists.
- Source02950240… and frozen GPU original/candidate front/side show the old failed silhouette. Preserve identical cameras/materials for comparison.

Before authoring the seated shape, record actual new hem height/overlap, available body-to-top space, front/side/back panel longitudinal path lengths, circumferences, and the new standing panel outline against the original. A lack of space may require a wider/re-cut pattern or a different vest hem; it is not solved by relaxed contact tolerances. No new numerical minimum pattern extension is claimed until measured. New standing Basis must be a credible independent garment, not a flattened copy of the stretched seated failure chosen to improve ratios.

## Falsifiable sample acceptance and exit

- New standing Basis and one fully seated target on the same new topology; manifold connected seams, intentional openings only, unchanged body/pose and upper fixed boundary. Maximum source displacement, changed topology and fixed-boundary residual reported explicitly.
- Full visible outfit/body/top/skirt/inner/seat/back strict intersections and self-intersections reported. Previously known remote source intersections are separately localized, never silently excluded. Local new/remade region requires no strict crossings. Original 2 mm geometric clearance and previously declared 2.4 mm author reserve are reported separately; a reserve failure remains a failure.
- New Basis→seated full edge ratio≤1.25, no flipped/degenerate faces, full area/normal/seam distributions and pattern lengths. Ratio uses the disclosed new pattern, with original→new pattern change reported independently. This does not certify real textile mechanics.
- Whole person, original face/hair/shoes, real chair and normal materials in matching front/side/room views. No pure-color or hidden-body screenshot substitutes. Check actual posterior seating, front/side coverage, hem thickness and ugly rigid creases; geometry zero alone is not acceptance.
- If this single author sample has comparable exposed intersections, hard folds or cannot satisfy its material/boundary constraints, stop this bounded method. Preserve the editable failure and quantify the necessary pattern/interface change; do not scan offsets, enlarge the domain or start another cloth trial automatically.

## Delivery after technical boundary approval

One editable Blend with named source/reference/standing/seated objects, selection sets and Basis+seated shape; a readable construction/export script or recorded explicit edit data; new paired top/skirt IDs and exact female compatibility; standard GLB POSITION/NORMAL morphs, bind/UV/source maps and hash manifest. Existing Blender glTF export/readback already proves this transport, not the proposed shape.

No controller changes are required for the static diagnostic. A positive seated sample would only authorize later shared-equipment data adaptation and intermediate/cancel/walk/run/dance validation. Live hand fitting must then be recomputed from the actual final two garments; old frozen hand state cannot be reused as contact acceptance. Pants compatibility is separately tested, or the paired top is explicitly skirt-only. No production compatibility is currently claimed.
