# DVIDS squat v2 — bounded wrist/palm reconstruction

This is an **isolated candidate**, not accepted avatar motion or calibrated capture. It fixes one missing processing stage of v1: hand orientation. Original v1 remains unchanged.

## Exact scope

GLB: `video-squat-dvids-wrists-v2.glb`, SHA `57cf1c8e2120341f30987c4032db1c633c46393f52ffc29de78d120da40267d4`.
Clip: `Video_Squat_DVIDS_Wrists_Once_v2`, 240 original key times / 7.974633333 seconds. Existing `dance-imports.entry.json` interface, once then idle, local hip displacement, no props/path travel.

The source is v1 SHA `c459ea7a1a5a8f89d162143c80e53843e7cdd19db97e87f8c33c5da6fc8a8845`. All **199 other stored animation channels are exactly unchanged**; only `hand_l` and `hand_r` quaternion tracks differ. Root, legs, upper/lower arms, head, reference local fingers and all translations remain v1. Sampled body joint origins differ by zero. The source squat's narrow-target stance and unresolved upper-body/body-proportion issues are not corrected by this wrist-only version.

## Matching and reconstruction

Original Hands detections contain1–2 hands:169 frames have two,71 have one. Each frame uses the minimum total 2D pixel wrist distance for a **unique assignment** to the two Pose wrists. Handedness labels are recorded; they do not choose left/right. A match is rejected when wrist distance exceeds25px, its advantage over the opposite wrist is below10px, Pose wrist visibility/presence is below.5, classification score is below.8, worldXY and image palm direction disagree by over45°, the palm frame is degenerate, predicted scale is implausible, or inferred wrist flexion exceeds65°. These are declared engineering guards, not empirically calibrated positional confidence.

Hands API provides **no per-point visibility/presence** here. A valid match means usable model prediction under these guards, never measured hand pose. Wrist/MCP9 define the palm longitudinal direction; indexMCP5→pinkyMCP17 defines the transverse plane. Hand-centered predicted world coordinates only supply relative vectors, never absolute placement. The same camera-axis conversion and fixed yaw as v1 maps them to UAL. An explicit orthonormal palm frame transforms the UAL reference hand frame. No mirrored opposite-arm data is used.

Missing/rejected frames use a declared neutral wrist: forward along the actual v1 forearm; reference palm twist parallel-transported from the reference forearm. It does not retain the Idle hand's local flexion. Candidate and fallback quaternions then use the same short symmetric weights `[1,2,3,2,1]`; original key times and body motion remain unchanged. This is processing/interpolation, not an observation. `frame-provenance.json` lists every original PTS, detection index, matching distances, classification, unavailable point confidence, rejection reasons and filter contributor indices.

- Left:169 matched model-prediction frames,71 fallback frames.
- Right:233 matched,7 fallback.
- First trough PTS545545: left uses independent hand index1 at7.56px from left wrist vs85.44px from right; right uses index0 at5.60px vs77.38px. Both pass guards and their five-frame filters contain no fallback.
- Maximum adjacent hand-world orientation step remains17.51° left/20.79° right at~30Hz (P95 7.78°/8.67°). This is a visible-jitter risk, **not a passed smoothness criterion**. No extra parameter sweep was applied.
- Fingers retain v1 reference local poses; observed fists/open fingers are not reconstructed. Do not interpret the `.blend` as full hand capture.

## Build / checks / recovery

From the repository root:

```powershell
python scripts/video-motion/build-wrists-v2.py
node scripts/video-motion/check-v2.mjs
& experiments/tools/blender-4.5.9-windows-x64/blender.exe --background --factory-startup --threads 2 --python-exit-code 1 --python scripts/video-motion/save-editable-v2.py
```

Inputs are the unchanged v1 GLB, raw-sequence gzip and axis report. Their source/rights records remain in `assets-source/video-motion-v1/`: DVIDS item public-domain statement with non-endorsement/likeness limitations, MediaPipe model/version hashes, and CC0 UAL1 skeleton. This new processing does not change those conditions or claim that the DVIDS person endorses the game. No fresh video/model inference is needed to rebuild.

Actual checks: pinned input hash; 199 exact unchanged channels; all body origins unchanged; actual Three0.187 GLTFLoader/AnimationMixer 240-frame evaluation; Blender4.5.9 saved and reopened the editable Action. `report.json`, `three-readback.json`, `editable-readback.json` retain results. A second deterministic build matched the GLB SHA. The artist-editable Blend is a checkpoint; arbitrary later edits require a separately versioned export and validation.

Game integration, normal-speed F/M wrists/props/cloth, contact and functional plausibility remain the integrator's tests. No runtime or served manifest was changed by this package. If game appearance is still implausible, retain this failed candidate; source-prediction guards are not grounds to call it accepted.

## Optional offline stance adaptation (not implemented)

For a future explicit per-target derivative, retain original root timing and use each target's real thigh/calf lengths plus the source support-foot footprint, scaled by a declared reference leg-length ratio. Solve the target legs offline at the original PTS with observed knee poles, preserve the original source clip alongside the fitted clip, and reject unreachable legs or knee reversals. Pin exact target avatar SHA and report resulting foot/body/garment contact; do not feed a target-fitted clip back through the generic UAL retargeter a second time. This needs a supported target-clip asset contract, so it is **only a proposal**, not hidden v2 behavior or a new controller. A common pelvis translation cannot widen left-right foot separation.
