# Local re-tailoring v1 — rejected and frozen

One complete paired source was constructed, standard-Blender exported/read back and shown in the real room with normal materials. No main source, public asset, controller or cloth settings changed. This is not a passed outfit, source style selection or motion.

Top e3d552af… derives from isolated open-hem7f266f, not public closed27bcfe. Exact paths [550,548,564,570,607] and [581,578,586,591,597] split the two side seams. Source is1628 vertices/2260 triangles; all changes remain in original85-point lower domain and fixed boundary is exact. A measurement-derived49.10-degree radial hinge moves the front flap; rear flap stays unchanged. This author control choice produces unacceptable wings.

Skirt b4c32449… retains original120 yoke faces/20-point interface, uses40 columns ×10 new connected panel rows and full10mm/.8mm return. Source622 vertices/980 triangles. Upper original weights stay; new panel points use Hips plus one standard editable seated shape. New panels have explicit UVs and source materials. This is deterministic source geometry construction followed by native Blender import/save/export, not a claimed manual artist-quality sculpt. POSITION/NORMAL channels exist and actual rendered replay is checked. Original uniform derivative permission applies, not CC0.

## Measurements and failures

Fixed top interface: sampled nearest body distances8.979/12.576/9.519/5.623mm for standing/29/35/60, no interface segment hits. This is not a full-space proof. Original20-point hem circumference888.262mm; seated vertical exit rays require up to31.019mm, compared with historical full-face samples35.289mm. Neither is a global minimum tailoring change.

Standing skirt: body/top/chair0, inner self6. Seated: body142/top106/chair0/self0, max edge1.478. Of142body pairs,116 are frozen old hands/arms,26 actual left thigh. All71 top local/body pairs involve old hands/arms. Full gates retain them; no post-shape hand fitting occurred, so this is not a claim new character motions have broken.

Top new local edge538–540 grows54.977→80.065mm (1.456). Global top2.636 maximum is an unchanged sleeve; it is not the new hem strain. Original complete Body is retained. Intermediate29/35 use a labelled linear shape-weight diagnostic, not an authored transition.

Skirt371→372 is same circumferential row5, columns29→30, not cross-row. It grows31.477→46.524mm. Same target needs37.219mm rest length to satisfy1.25:5.742mm more locally. All complete-ring ratios≤1.2264; total width is not proven insufficient. All individual edges still apply.

All six self pairs join the last outer band and neighboring return face, e.g893/973. Signed plane samples straddle−.786/+2.496mm; not the original yoke. Plane signs are not finite penetration depth. Side front copies move outward up to46.261mm and up36.284mm because the front radial hinge is reused on unsupported sides. The26 non-hand skirt hits are left-front rows8–10 and their return: a symmetric author canopy misses actual unequal thigh supports.

## Actual complete-material views

See gpu-preview/{parent,candidate}-{front,side,room}.png. Full original body/face/hair/shoes, two garments/inner surfaces, chair and room remain. Runtime58394 is immutable; only source bytes and exact SHA/byte counts are diagnostically routed. Each garment has2actual primitives; each skin/morph replay is checked. All view camera/projection/time arrays match. No page/console/HTTP errors.

Viewed front/side: side skirt arc is more coherent than the old pointed/torn shape; old large rear seat-crossing hole is not visible. Front vest ends make horizontal wings, skin cuts the front skirt and its edge is rigid. Candidate rejected. Static pictures do not establish motion/contact/naturalness. Hand pose stays original after toggle.

## Reproduction

Blender4.5.9/2 threads: measure-retailor-v1.py, measure-retailor-contour-v1.py, build-retailor-v1.py, gate-retailor-v1.py under scripts/m1-assets/simple-skirt. Source/gate refuse existing frozen outputs; use an isolated empty output location for regeneration. inspect-retailor-failure-v1.py only analyzes existing arrays. Snapshots are included. The initial contour serializer needed bool conversion; export gate needed duplicate seam mapping via basis+target+actual pose instead of a one-to-one nearest-point assumption. These reader fixes did not alter authored parameters or asset bytes.

GPU: main scripts/run-fixed-check.cjs plus immutable experiments/m1-layer-review/dist-layer1-linked and qa-retailor-v1.cjs, QA_RUNTIME_ROOT=F:/gamemake, QA_M1_BUILD=58394ce674e4, QA_M1_ASSET_SHA=027bed60… . The harness closes browser/server. Current runtime acceptance is not inherited from this historic capture.

This version stays frozen. Root authorized one separate evidence-led layout correction; this record does not change to passed if a child improves.
