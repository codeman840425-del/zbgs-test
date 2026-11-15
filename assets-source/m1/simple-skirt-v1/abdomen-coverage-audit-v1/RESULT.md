# Abdomen skin dots: read-only source/export audit

No runtime, asset, mask, geometry or weight was changed. Original and later ray reports have exactly equal two-sample hits: Body657 precedes top957 by0.3216046mm; Body610 precedes top956 by1.2024986mm in a491,332fb0568604 and7e24e01556ad. These are ray-depth differences, not general penetration depth. Thus the corrected skirt waist has not changed these two source skin/top occlusion samples.

## Original coverage facts

Original1995f174 Base_Female has7732 skin triangles in four primitives; roundtrip027bed60 keeps7732 in one material primitive. Original body and top base-color alpha are255 everywhere. Original firstPerson.meshAnnotations is empty and there are no Body-bound blend shapes; no recovered garment body-coverage mask declaration was found. This establishes the VRM file facts, not the behavior of an unrecovered original .vroid editor project.

Both body faces map to the original model within0.120 micrometre. Original weights at these points differ by at most5.96e-8. These are genuine original skin under the garment, not newly filled holes. Body657/610 centres: x+.009/−.026m,y1.069/1.070m,z−.1126/−.1117m. Top957/956 centres arex±.023m,y1.08668m,z−.11713m. They lie centrally in the front torso cloth, not neckline, sleeve opening or lower hem. In the original rest layout, forward rays from the two body face centres meet opaque top946/945 with6.400/4.137mm outward separation. This confirms intended cloth coverage in rest; the posed ray samples are different points/triangles and cannot be subtracted as a single exact displacement.

## Independent export facts

Original top2066 triangles and tie214 remain2066/214 in roundtrip and independent top27bcfe. Used vertex counts1425/215. Index remap, POSITION, NORMAL, UV and inverse bind matrices are exact relative to roundtrip. Semantic weights differ by at most1.192e-7 due normalization. No torso bones or vertices were lost. Original matching top957/956 weights match exactly. This differs from the already-fixed display-skirt omitted spine/chest inheritance bug.

Top and body use different original torso weighting near these points. The sampled top hasUpperChest .113–.324 while body .066–.103; spine/chest/bust terms also differ. Their rest clearance may therefore invert with torso articulation. This is a supported source-compatibility hypothesis, not a measured decomposition proving one bone is the cause. The read-only test does not independently replay every actual runtime matrix.

## Minimal executable next boundary

First use the already captured same raw pose to CPU-LBS the exact embedded source top and independent top together; expect matching surfaces from the verified attributes/bindings. If that equality holds, scope the repair to this covered front-torso top neighbourhood and its original weights/clearance, not the skirt solver or a global body/controller fix. Build any correction as a versioned top-only fit for exact027bed60, preserving original, body, openings, UV and full-body contact evidence. Validate the whole local patch across known torso articulations and actual pants/skirt combinations, not two rays alone. No correction has been authored here.

Do not describe an invented body coverage mask as restoration of original data: none was found. If product later adopts outfit-specific body rendering masks, that is a new explicit reversible coverage contract, requiring proof that every masked face stays under the selected top and automatic restoration on unequip/body preview. It must not silently erase actual contact failures or affect exposed skin. This task recommends no mask implementation and performs no optimizer/source scan.
