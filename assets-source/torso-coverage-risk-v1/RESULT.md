# New central torso coverage fit — source candidate only

This is a newly authored reversible outfit coverage rule, not restoration of an original mask. Original Body and top bytes are untouched. It is disabled/pending until actual action and restoration checks; public152 and every runtime file remain unchanged.

## Geometric boundary and selection

The opaque original top is a closed shell after geometric welding: no open topological edges. Its known20-face lower fan identifies the actual20-point hem perimeter. Neck/cuff boundaries cannot be obtained from a nonexistent open edge loop; conservatively exclude the **entire** top region with Neck/Head/Shoulder/UpperArm weight above1%, including every touching triangle. Require25mm source distance to those full triangles and the actual lower-perimeter segments. The margin is a candidate authoring allowance, not an animation pass criterion.

Body vertices require99.9% total weighting in Hips/Spine/Chest/UpperChest/Bust1/2 only, excluding head/neck/arms/hands/legs by actual weights. Each face requires all three vertices, three edge midpoints and centroid to satisfy the boundary distances and cast an outward ray onto an outward-facing opaque non-boundary top triangle between.1 and30mm away. Keep the connected central component containing610/657. This does not select the whole body by Y; six other isolated source-admitted faces are not included. It selects a front-central torso band, not a guarantee of a complete wraparound mask.

Final candidate:252 faces/162 vertices; x−.104407…+.104918m, y.967648…1.179263m, z−.128162…+.018562m. All source samples and hit top face IDs are in source-selection-report.json; exact excluded top face IDs and real hem segments are in the fit. The finite seven-point rule is conservative sampled evidence, not a continuous containment/CCD proof.

Initial nearest-vertex boundary screening returned412 faces; this overestimated distance to large clothing triangles and is explicitly **not the candidate**. It is retained as initial-vertex-distance-screen.json. The final method uses exact point-to-triangle/segment distance with the same25mm threshold; no parameter tuning occurred.

## Identity and restore contract

Body027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95; original closed top27bcfe020828ad2603f618fabf7f21cf1b09f66035c8ecd740e78cfc3650b9d6. Body mesh0/primitive0 indices accessor SHA6b2375d019ac68783bf07f838077c7596471297afd0422ed299f02ca4f002d08 (little-endian original component bytes). Face list and exact original triples accompany the hash; no coordinate inference at runtime. An open-top or changed upper garment needs explicit revalidation, not silent hash substitution.

Proposed use is rendering-index selection only when this exact top is equipped; original complete Body geometry must remain recoverable on unequip/body-debug. Physics, hand/leg contact and full-body diagnostic surfaces must remain complete. Do not use coverage to excuse clothing-edge/skirt-leg/hand penetration. No implementation or toggle was added here.

## Required actual follow-up

Check standing/walk/run/turn/sit-rise/dance with final body/top matrices and normal material, front/side/back oblique views and changing neckline/cuffs/hem; ensure the coverage perimeter never becomes exposed. Check complete-body restoration, outfit change, independent second actor and disposal. Source25mm clearance does not imply movement25mm clearance. Parent owns runtime review and action validation; this file does not approve them.

Reproduce once in an empty isolated output directory with ordinary Python/NumPy/SciPy: scripts/m1-assets/simple-skirt/build-torso-coverage-risk-v1.py. Fixed body/top SHA assertions fail closed, existing candidate is not overwritten. Exact script snapshot and source evidence pins are in manifest.json. No Blender, browser, cloth or optimizer was run.
