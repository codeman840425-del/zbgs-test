# Blender-chan native pressure sample v1 — frozen reference, not fitted game asset

## Actual result

The original author's armature and skirt modifier chain produce a continuous seated skirt arc in this one native FK sample. Front/side images do not show the previous candidate's horizontal rigid wings. This is a **different front-opening petal silhouette and translucent plastic material**, over the original leotard. It is not evidence that our current opaque closed skirt, female VRM, or full action set is repaired.

The source is worth retaining as an editable example of ordinary continuous waist/butt/thigh skinning plus Corrective Smooth and subdivision. It is **not a seated-ready replacement**: no target-body fit, closed-skirt equivalence, glTF bake, game adapter or whole-motion validation was performed. No additional adjustment or pose-angle search follows this sample.

## Reproduction / exact scope

1. Start from original `../BlenderChan-Free.blend`, SHA `f2e6cf2ccc7799bb614a0b6ef982a2b9bbd446884c358796d5ba5eba5f2c22ad`.
2. Blender 4.5.9: `--background --factory-startup --disable-autoexec <original> --threads 2 --python-exit-code 1 --python ../native-pressure.py`.
3. Open derived `BlenderChan-Native-Pressure-v1.blend` with the same safety flags and run `../native-review-display.py` for the reviewed images/derived review file.
4. Open original with the same flags and run `../verify-native-source.py`. It compares all 166 original mesh objects against both derived files: position/topology/UV/weights/material slot names/modifier type order match. Files are never saved over the original.

No package addon or embedded code executed. The source contains no Text datablocks. Existing rig drivers/constraints evaluate natively; no constraint is deleted. Leg/hand controllers use their existing `ik_fk_switch=1` FK control path. Actual bone world endpoints verify front=-Y/up=+Z, seated thighs horizontal and shins vertical. Hip drop is .38m, hip height .515262m, knees .515262m, ankles .095912m. These values describe the new pressure pose, not a captured or author-supplied sitting action.

A new editable `Native_Standing_To_Seated_Pressure_v1` action has keys at 1/16/31/46/61, 30fps, 2seconds, linear interpolation between the defined poses. Arms are posed for space reference; finger grasp, hand contact, floor footwear clearance and seating furniture fit are not accepted. No mesh, vertex weights, original garment material graph, or modifier parameters were edited. Rig widgets/staging helpers are hidden from render; original body and clothes remain present.

## Images and display correction

Use `01-front-review.png`, `01-side-review.png`, `61-front-review.png`, `61-side-review.png`. Same cameras and geometry. First `*-front.png`/`*-side.png` outputs were overexposed due to the inherited compositor/display pipeline and are retained as failed display evidence. Review only disables compositor, switches to AgX, exposure0/gamma1. It does not change lights, garment material or pose. The source's `Plastic Transparent` uses BLENDED rendering; `Cloth Shiny` provides opaque trim. Visible thighs/seat through the translucent panel are not automatically mesh holes.

The seated side silhouette is a rounded continuous sheet from waist toward the open front, not a convincing cloth drape proof. Front remains strongly flared/open. Rear cloth extends below the reference seat. Reference seat/back are uncalibrated spatial markers; their intersection cannot alone reject the source or count as seating fit. Neither marker was moved to hide contact.

## Computation and limits

Original full modifier display: Armature → CorrectiveSmooth(factor.5/8iterations/original vertex group) → Subdivision(level2) → Solidify(thickness.01m/offset−1).

At seat, same-index edge ratios to standing:

| Measured surface | Maximum | P95 | Maximum edge length standing → seated |
|---|---:|---:|---:|
| All modifiers | 6.98741 | 1.42250 |1.906 →13.319mm|
| Before Solidify |3.33519|1.39000|.821→2.738mm|
|298-point control cage after Armature+CorrectiveSmooth|3.20536|1.55221|3.782→12.124mm|

The cage maximum is edge147–146 at rear center (seated x≈0, y .246–.249, z .397–.409m). The worst all-modifier value includes generated thickness geometry; it must not be represented as the entire cloth stretching sevenfold. Nevertheless the cage P95 and rear local elongation remain significant, so the current project's 1.25 author-material bound is not established. These are geometric edge measurements, not a textile strain model.

`report.json` records five evaluated poses and all overlap pair IDs. Body Bottom standing402→seated419, Body Top244→368, original leotard1132→1024; the author already overlaps original garments and underlying body. These counts are not visible-hole counts. `contact-summary.json` records new/removed IDs but does not turn internal layering into visual failures. No penetration depth or per-pixel opacity gate was run. In reviewed front/side images there is no unmistakable new opaque-trim skin puncture at this resolution; transparent coverage prevents using that observation as a strict no-intersection acceptance.

Seat overlap0→500 and back376→132 relate to the new uncalibrated reference geometry. Original standing back already overlaps: this is not an original garment defect. Full body remained in all tests.

Only two endpoints were visually reviewed, five poses numerically sampled. No complete real-time movie, middle-frame visual acceptance, low-end performance, arbitrary directions, running or asymmetric thigh test. Modifier evaluation cost here is not a browser benchmark. Blender source modifier stack is not presumed available as runtime glTF deformation.

## Method decision

Retain the licensed source and this failed/limited pressure sample as a concrete topology/modifier reference. It demonstrates a different useful surface behavior but does not deliver the required closed-skirt seated production solution. No additional source tuning or mainline replacement is authorized by these measurements. A later fitting/baking task would be a distinct scope and style choice.
