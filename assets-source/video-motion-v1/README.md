# Real video squat / first offline conversion

This is a **candidate with a visible left-arm reconstruction defect**, not accepted game motion, dance extraction, or measured motion capture. The primary game/runtime/public asset directories are unchanged.

## Inputs and legal scope

- DVIDS [Body Weight Squat](https://www.dvidshub.net/video/517502/body-weight-squat), U.S. Marine Corps / Cpl. Amber Jennings (item description), posted by Joshua Pena. Source item states public domain; archived item/copyright pages and `dvids-squat-source.json` retain conditions and non-endorsement notice. Do not imply endorsement or unrestricted likeness rights.
- Original MP4 SHA `05b5870da6ebc66abcfd5715a2864e21299d176dc2c87524d3f5904c37450f66`.
- Pose extraction: 240 frames, original PTS from 15.015 to 22.989633333 s, MediaPipe 1.2.3 CPU VIDEO mode. `raw-sequence.json.gz` decompresses byte-for-byte to sequence SHA `b8f1e070ee5b0eb3da8033174322d484590095923907fe084e4b1d20708268cc`; model hashes/thresholds are in its metadata. Extraction was not rerun.
- UAL1 Standard mannequin/reference skeleton, Quaternius CC0. Source SHA `69591853d817488edaa8fd9bf8fc1d821eaeaf789f8627b3cd23b41c4ed67997`. Nodes, inverse binds, original rest transform and mesh remain unchanged. New motion channels are derived from video predictions and explicit processing; they are not original UAL choreography.

## Production and recovery

Run from `F:/gamemake` (or the repository root):

```powershell
python scripts/video-motion/build.py
node scripts/video-motion/check.mjs
python scripts/video-motion/plot.py
& experiments/tools/blender-4.5.9-windows-x64/blender.exe --background --factory-startup --threads 2 --python-exit-code 1 --python scripts/video-motion/save-editable.py
```

Python requires NumPy/SciPy and matplotlib for plotting. Node uses the project's locked Three 0.187.0. Blender 4.5.9 LTS was used. `build.py` fails on wrong skeleton hash, missing pose frames, insufficient confidence samples or invalid timing. It outputs GLB, exact raw snapshot, editable processed arrays and import entry. No controller or served manifest is modified. Re-running rebuilds this isolated candidate; preserve a new ID/directory for authored improvements. `.blend` is an editable Action checkpoint, not an assertion that arbitrary Blender edit/re-export has been qualified.

The two GLB helper modules are frozen local copies of existing `qa-m1c-source.py` and `qa-m1c-glb-pack.py`; no dependency on a temporary output path. The original UAL GLB and original sequence input must exist as pinned above. Source bytes are also recoverable from gzip for the pose input.

## Existing runtime interface

`dance-imports.entry.json` is **one entry**, to be merged by the integrator into the existing `m1.motion-import-list.1` list; it is not a replacement list. Copying the GLB to the declared motion directory is a separate integration action.

- ID `video-squat-dvids-v1`
- Clip `Video_Squat_DVIDS_Once_v1`
- 7.974633333 s, original 240 key times, once then idle. No forced closing pose or time rescaling.
- `local-displacement`: clip hips owns the local squat displacement. No path movement, no held props.
- Existing UAL rig semantic names/rest and `motion-source.js` retarget conversion apply directly. No new character controller is needed.

## Processing rules and known failure

World landmarks are hip-centered neural predictions in metres, **not camera-calibrated root travel**. Coordinates are converted with `[x,-y,-z]`, followed by one initial hip-line yaw alignment. Each landmark below 0.5 visibility/presence is interpolated against valid original timestamps; a symmetric Gaussian sigma-one-frame filter reduces noise without shifting/rescaling time. Raw samples are retained.

This video visibly depicts a stationary squat. Both source-rig ankles therefore use fixed planted targets; source bone lengths and observed thigh/calf directions reconstruct the mean pelvis height and backward movement. A two-bone analytic constraint preserves those ankle targets and uses the measured knee plane. Foot orientation remains the original grounded rest orientation. This is a **task-specific support assumption**, not measured contact and not appropriate for jumps or travelling dances. Small skin surface motion remains despite locked ankle bones.

Torso tilt and upper/lower arm directions come from the predicted points. Axial twist, face, head and fingers are not recovered; reference pose components remain. Left elbow has 52 low-confidence frames, left wrist 50. The resulting left arm visibly approaches the head/chest instead of matching the source's two forward arms (`skeleton-contact.png`). No symmetric arm invention or manual pose replacement was silently applied. Long occlusion interpolation is a material failure. Monocular depth and knee plane estimates also require real target visual checks.

## Actual checks and boundary

- Actual `GLTFLoader` / `AnimationMixer`: 201 tracks parse/validate and seven source times sampled (`three-readback.json`). This is not the full avatar import test.
- Blender imported, saved and reopened the Action (`editable-readback.json`).
- Float32 PTS error <0.24 microseconds; pelvis movement .4748–.8829 m. No leg reach excess; source ankle target error <0.12 micrometres.
- Skeleton image reviewed across both squat cycles: root/legs show descent, left-arm reconstruction fails. `conversion-report.json` separates foot-surface metrics from bone targets.
- Female/male avatar retargeting, full normal-speed room playback, clothes/contact, actual functional pose and transition behavior are **not tested here**. Root performs those checks. No claim of full pipeline acceptance follows from this export.

Raw video/overlay contact sheets remain under `evidence/real-video-pose-v1/`; this package does not duplicate the entire legal source movie. It stores the exact pose source and archived source/rights metadata.
