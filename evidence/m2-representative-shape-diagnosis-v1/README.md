# Fixed batch v1 shape diagnosis

The source author viewed all six requested fixed-build-374 screenshots for female-round-full and female-long-slender, covering base, dressed front and seated side. The fuller upper garment has a wide flared lower edge. Its source body also has substantially increased lower torso volume. The round-face cheek outline develops a local change of direction. Runtime task completion remains separate from visual acceptance.

## Confirmed lower-hem cause

At actual original top vertex 552, rest position is `[-0.159322426, 0.912199259, -0.011686079]` m. The fixed round/full output moves it laterally 70.125 mm. Isolating the existing unchanged parameter groups gives hip 44.127 mm, waist 23.599 mm and chest 2.399 mm. Arm, thigh, shoulder and face contributions there are zero. The lateral multiplier is 1.43944. All three torso bands overlap at this height and their displacements add without normalized blending. Positive Jacobian checks do not constrain the resulting profile or amount of accumulated volume.

Exact source-height triangle cross-sections at `y = 0.912199259` m give

| Surface | Original width mm | Fixed round/full width mm |
|---|---:|---:|
| Body SKIN | 269.959 | 393.170 |
| Independent top | 319.156 | 459.405 |
| Top-minus-body width | 49.197 | 66.235 |

The field enlarges both the body and the original garment's extra space. That extra width grows by 17.038 mm. At the source side, larger absolute x produces a larger radial displacement, so running the body field directly on garment points does not preserve the source garment's ease. It also produces a disproportionately broad lower garment relative to the chest. This is a shared field/transfer limitation. The top material JSON and triangle indices remain identical, and the same flare exists in neutral source geometry. Cloth motion or a material outline is unnecessary to produce it. Runtime shading can accentuate its edge.

## Confirmed cheek cause and topology contribution

Front Face SKIN sections in raw-head-local space show the original width increasing monotonically through the relevant cheek band. Around head-local heights 20, 25 and 30 mm, original widths are 141.6, 145.2 and 148.4 mm. The fixed round/full mesh instead measures 150.8, 151.1 and 149.3 mm. The positive cheek/jaw expansion fades into the unchanged upper-face/eye region fast enough to introduce a local inward turn.

To distinguish field shape from tessellation, the probe samples each original face triangle's exact y-plane section at 41 points per segment and applies the same continuous field to those samples. At these heights the field has zero y displacement, so the section comparison is direct. This continuous deformation gives 151.449, 151.174 and 149.533 mm. The reversal therefore already exists in the mathematical field. Original triangulation alone did not create it. Existing mesh spacing makes the smooth displacement variation resolve as visibly straighter segments. For example, symmetric edges 1369–1385 and 1265–1270 rotate by 20.681 degrees under the field, with 4.072 mm relative displacement change across an original 11.526 mm edge. That is a geometric change before toon shading.

The local field is C1 and its sampled Jacobian remains positive. Neither condition preserves a desired facial silhouette or bounds curvature changes. Integrated lip protection fixed the earlier fold failure, but did not establish a globally smooth-looking cheek-to-upper-face contour. The shorter central chin also retains the protected mouth-centered width anchor, so a preset label such as round does not enforce a rounded chin contour. The screenshots alone cannot assign each shading line to an individual triangle or expression. The new source-side contour reversal is independently measurable.

## One common replacement method

Use constrained cage-based deformation of the body and face, with explicit target cross-section/contour controls and a single normalized blend of regional targets. Treat eye, lip, hand, foot and skeletal attachment regions as protected constraints with a continuous transition. Preserve source expression motion by evaluating the same final map at base and morph endpoints. Fit existing garments through correspondences to the original body/cage and transfer the body displacement while retaining each garment's source offset/ease, instead of independently multiplying that offset by the body volume field. The same shared construction can serve all eight parameter sets. It needs measured contour, smoothness and garment-clearance checks in addition to positive determinants.

This recommendation defines a next structural experiment, without claiming an implemented or visually accepted solution. No source, parameter, resource, runtime, QA harness or shared document is modified by this diagnosis. All eight v1 candidates and their visible failure evidence remain fixed.

## Reproduction

Requires Python, NumPy and Matplotlib. From the repository root run

```powershell
python -B evidence/m2-representative-shape-diagnosis-v1/probe.py --room-root evidence/m2-representative-room-374-v1
```

The probe writes only its own measurements/chart. `measurements.json` pins the original resources, fixed candidates, field source, parameters and six viewed image identities, and retains section curves and edge-level attribution. `source-contours.png` plots actual source/exported contours plus the continuous-field diagnostic. The diagnostic changes no field parameters and exports no candidate assets.
