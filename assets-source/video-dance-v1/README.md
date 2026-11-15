# 30s dance: bounded body/root/contact trial, stopped before full export

**Not a usable dance animation.** Two short-segment hypotheses were tested and retained; neither establishes reliable3D body motion/root/support. No720-frame target animation, runtime modification, or public asset was produced.

Raw input: `evidence/dance-video-pose-v1/sequence.raw.json.gz`, decompressed SHA `ee975632bbd9d8913df5fda88d58762b88ec75d5f17618b7fbe7068364b57cec`. Source is Pexels5359146 by Sergey Makashin, Pexels License (not CC0); exact source/rights record remains `evidence/dance-video-pose-v1/source.json`. Original video/contact sheets stay local in `analysis/dance-reference-v1/`, not redistributed here. No model training.

## Fixed scope and evidence

Frames138–210 inclusive, original PTS5.75575–8.75875s,73 samples at24000/1001fps. Pose agent independently inspected original frames169–175: performer remains back-facing continuously. Frame172/173 model front-facing classification is inconsistent with the images. See `evidence/dance-video-pose-v1/turn-source-observation.json` and `critical-turn-pairing.json`.

Body point labels and hip-centered predicted depth were retained raw. Candidate corrections, low confidence, root-estimation sources and support uncertainty have per-frame records. We did not rotate every frame into a fixed facing, mirror the good arm, or use stationary squat anchors for this dance.

### Trial1: bilateral swap plus predicted-Z reflection, only172/173

Saved in `turn-study/`. It reduces heading discontinuity at171→172 from−173.24° to−.41°, but maximum landmark jump at that boundary worsens.597→.612m; whole difficult segment reaches.750m. A global sign reflection is not adequate for individually inconsistent limb depth. **Rejected as a correction.**

### Trial2: bilateral swap plus two-frame depth gap fill

Saved in `turn-depth-bridge-study/`. Only172/173 are re-labelled; correctedXY remain those model outputs. Z is explicitly **imputed**, linear at original PTS from171 and174, not measured or recovered. It reduces the critical boundary maximum.597→.186m and heading jump to+9.31°. Whole-segment heading still progresses401.4°, preserving the real full turn and subsequent rotation rather than locking forward.

However, a separate146→147 left-wrist jump remains.53530m with visibility.947/.941. Its raw delta is `[+.12867,+.00531,+.51958]m`; image displacement is22.66×16.45 inference pixels. Elbow delta is.28812m, almost entirely depth, despite only1.49×5.22px image movement. Index jump.58266m is not the sole reason for failure; the forearm/wrist body motion itself is unsupported. High confidence is not3D accuracy. Without metric depth truth this cannot prove the exact physical error, but is too strong an unverified discontinuity to qualify the motion. **No third local repair or full-clip export was attempted.**

## Root/contact outputs and limits

`root-contact-states.json` provides original PTS and per-foot `support-inferred` / `swing-or-uncertain`, not binary measured contact. Candidate support combines image foot speed proxy<.18m/s, height within.04m of the lowest predicted foot, point confidence≥.5 and a three-sample stability condition. These conservative engineering thresholds are fixed for this trial, not tuned until all feet become planted.

- Left9/73 inferred support samples; right15/73; **55/73 have neither foot reliably supported**.
- RootX is weak-perspective image hip-center displacement using median predicted-torso/image-torso scale (~351.90px/m).
- RootY uses lowest predicted support-foot height; when support is unknown, previous height is held and explicitly marked unknown. This loses real vertical motion and is not a valid jump reconstruction.
- RootZ is support-anchor continuity while support is inferred and held otherwise; it is not camera-calibrated forward travel. Root frame step reaches28.20mm.
- No skeleton foot locking was applied at this stage. Predicted body points and inferred root remain separate so unsupported depth/contact is visible.

The three-second movie compares raw versus the depth-bridge candidate using the **same inferred root** in both panels to isolate pose changes. All73 original samples are shown at1×24/1.001fps. It uses unsmoothed candidate body positions; no interpolation conceals jumps. The final frame starts at3.003s relative and its display exposure makes encoded duration~3.0447s. It is a skeleton diagnostic, not a complete character or game visual pass.

## Reproduce

```powershell
python scripts/video-motion/dance-turn-study.py --depth reflect
python scripts/video-motion/dance-turn-study.py --depth bridge
python scripts/video-motion/render-dance-study.py
```

Requires the pinned raw sequence, NumPy/SciPy, matplotlib and imageio-ffmpeg. Source movie is not needed for these point-based replay scripts. Numerical `.npz`, full per-frame provenance, exact input hash and scripts are retained. No native cloth or previous skirt branch was restarted.

## Bounded next-method recommendation, not an installation claim

Stop point-by-point patching this MediaPipe world sequence. Reuse the already verified normalized target-clip loader **after** a temporal whole-body/root recovery stage supplies a coherent source motion. An established candidate to evaluate on the same3s before any30s run is [WHAM's official video pipeline](https://github.com/yohanshin/WHAM): it supports global/camera-coordinate reconstruction and optional temporal SMPLify refinement. Its installation is documented for Ubuntu20.04/22.04 and Python3.9, with CUDA dependencies; this is a separate environment, not a package to drop into the current Python3.13 capture environment. [Official installation](https://github.com/yohanshin/WHAM/blob/main/docs/INSTALL.md).

WHAM code is [MIT](https://github.com/yohanshin/WHAM/blob/main/LICENSE), but its [official setup](https://github.com/yohanshin/WHAM#registration) requires separately registered SMPL/SMPLify body assets. Those asset/checkpoint terms must be verified for the intended production use; code MIT is not permission for every dependency. No registration, download, credential use or inference was performed in this task. GVHMR also directly targets world-grounded recovery, but its [official license](https://github.com/zju3dv/GVHMR/blob/main/LICENSE) restricts use to educational/research/non-profit purposes and requires separate commercial permission; it is not an unqualified commercial fallback.

For actual metric validation, synchronized calibrated additional views/depth—or a licensed finished BVH/FBX mocap source—provide information this single-view hip-centered output lacks. Whole-body visibility, limited blur and a fixed/known camera help but do not make depth ground truth. The minimum next gate remains this same difficult turn: coherent root/orientation/contact, no large unsupported limb jumps, then actual F/M1×visual replay through the existing shared loader. No promised success or new controller platform follows from selecting another model.
