# Offline normalized target adaptation — stationary squat sample

Two **candidate** clips, one exact current female and one exact current male. This package proves an asset-level fitting/data-loading mechanism; it does not establish natural squat motion or general dance reconstruction. The source movie, video-motion-v1/v2, character runtime and served assets are untouched.

## Input defect addressed

The v1/v2 UAL clip fixed ankles at the UAL rest width178mm, not the video's inferred stance. Existing rotation-only retargeting then produced ~84/87mm target foot separation. Both stages contributed to the narrow stance. Original predicted world points over initial30 frames imply median ankle width376.023mm / median thigh+calf length772.258mm = **.48691354**. This ratio is a single-view model estimate, not camera-calibrated truth. `squat-input-config.json` stores input window, range, assumptions and exact target hashes.

The first target attempt only averaged roots proposed by each target leg chain. It failed by30/33mm leg reach and27/29mm hovering shoe. It is frozen in `initial-average-root-rejected/` with its code snapshot and results, never relabelled accepted. The implemented joint root constraint projects that desired pelvis position to the nearest position reachable by **both** actual target chains. It changes root by at most30.03/33.03mm; no speed reduction or clip endpoint fabrication is applied.

## Exact skeleton/basis

`export-target-rigs.mjs` loads the actual pinned VRMs using the installed Three0.187 / three-vrm3.5.5 `VRMLoaderPlugin` and calls the same `VRMUtils.rotateVRM0` as the game. All54 normalized bones per target retain local/rest world/parent transforms and raw mapping. Actual equipped shoe GLBs are independently hash checked, inverse-bind checked and attached to the same raw bones using the existing equipment convention. Material/texture descriptors alone are omitted in memory to allow Node execution; no asset bytes are changed.

For these VRM0 bodies, normalized local rest quaternion is identity, while the actual parent of normalized hips has Yπ world rotation. The exported **local absolute values already account for this**. No second X/Z sign flip, source-rest conversion, UAL scaling or quaternion offset may be applied by the loader. Two nonzero test poses also verify raw/normalized origin agreement.

## Loader contract

`dance-imports.entry.json` is a single entry for the existing list:

- ID `video-squat-target-v1`, format `normalized-vrm-motion.1`.
- `variants[{avatarSha256,file,sha256,bytes}]`, exact body match only.
- `coordinateSpace` inside each asset: `three-vrm-3.5.5-normalized-local-absolute`.
- `sourceClipSha256`, `normalizedRigSha256`, `footwearSha256` remain pinned for traceability and footwear-fit checks.
- `clip` is standard Three AnimationClip JSON. Track names use semantic names, e.g. `hips.position`, `leftUpperLeg.quaternion`.
- Loader validates and replaces only the semantic name with `vrm.humanoid.getNormalizedBoneNode(semantic).name`, then calls `AnimationClip.parse`. Same Mixer, no new controller. Only hips has position tracks;54 quaternion tracks +1 position track.
- `rootPolicy: local-displacement`; `space.radiusTargetM:1.1` is conservative reserved target metres, **not source-ratio scaled**. Clothing envelope not certified.
- `once-then-idle`, original240 PTS/7.974633333s. Existing entry/exit blend and game ground lift remain separate runtime operations to record in the actual test.
- A body SHA without a fitted variant must be unavailable. Different shoes invalidate the floor assumptions even if the body is identical.

## Offline fit

1. Use the v2 upper-body source rest-delta retarget once to obtain target normalized local channels. Do not run this conversion again at playback.
2. Set support ankle separation to observed relative stance × target mean actual leg length: female374.019mm, male411.421mm. Initial predicted heel→toe yaw is preserved as an estimated constant support orientation (left~23.12°, right~-3.48°); this asymmetry is not claimed measured truth.
3. Sample actual same-foot shoe skin vertices to derive ankle height for flat support. No fixed generic ankle height or opposite-foot samples.
4. Original per-frame predicted thigh/calf directions and target segment lengths propose left/right roots; their mean preserves inferred local X/Z/height. A3-variable SLSQP closest-point projection enforces both leg reach spheres (40iteration bound, strict success). This is offline data fitting, not a runtime solver.
5. Solve the two legs analytically using observed knee poles, fixed support ankle goals and target lengths; keep foot/toe orientations aligned to their initial supports. Save final **absolute normalized local** tracks.
6. Evaluate full240 frames and actual footwear skin from raw/rest transforms; keep all source/fit trajectories and deviations.

`contactSchedule` explicitly assumes both feet planted throughout **this stationary squat only**. It is supported by watching this source, not an automatic measured-contact detector. Do not reuse it for the30s dance. That clip requires independently recorded planted/swing/unknown windows, changing anchors at actual landing, heading trajectory and estimated root travel; cross-steps must not be erased by constant anchors. Contact estimation uncertainty belongs in source metadata.

## Results and limitations

| Quantity | Female | Male |
|---|---:|---:|
| Actual shoe minimum Y |−0.482mm|−0.576mm|
| Highest per-frame lowest shoe Y |+0.137mm|0mm|
| Maximum ankle target residual |<1e−12m|<1e−12m|
| Three/Mixer world position vs offline |0.337µm|0.376µm|
| Raw vs normalized origins |0|0|
| Blender editable replay sampled bone-head error |0.246µm|0.193µm|

The contact/numeric gates pass (<2mm floor penetration/hover, finite, reachable). They **do not qualify the pose**. `female-fit-contact.png` / `male-fit-contact.png` show the original two squat cycles. Root is visibly biased to one side; female hips X ranges−154…−19mm, inherited from the single-view directional estimate rather than forced centered. Left knee reaches~.59° extension and changes up to19.1° in one30Hz frame; right remains at least32.83° flexed. No adjacent knee-pole hemisphere flip occurs, but the asymmetry/near-extension transition is a real risk. Female shoe skin has up to2.5mm single-frame bottom-sample movement despite exact ankle anchors. Existing v2 hand jitter/occlusion limitations remain. No body/clothing intersection or final human-action visual acceptance is claimed.

The actual renderer/game must judge weight balance, knee direction, root trajectory, original stance resemblance, normal-speed entry/exit and clothes/contact. Root will perform that integration; these files do not change public assets.

## Rebuild and editable source

From repository root, Python NumPy/SciPy and installed Node dependencies:

```powershell
node scripts/video-motion/export-target-rigs.mjs
python scripts/video-motion/target-input-config.py
python scripts/video-motion/bake-target-squat.py
node scripts/video-motion/check-target-clips.mjs
python scripts/video-motion/plot-target-fit.py
& experiments/tools/blender-4.5.9-windows-x64/blender.exe --background --factory-startup --threads 2 --python-exit-code 1 --python scripts/video-motion/save-target-editable.py
```

The Blender files contain an editable target Action on a semantic skeleton. Blender display bone axes are converted through their saved rest matrix; this is why copying raw Blender quaternions back to normalized tracks would be wrong. The authoritative repeatable export is the Python-generated normalized JSON, with Blender-head replay checks. Artist modifications require the inverse rest-frame conversion and a new asset/version; that arbitrary roundtrip is not yet qualified.

The original DVIDS/MediaPipe/UAL source provenance and conditions remain those in `assets-source/video-motion-v1/README.md`. New target assets add the exact female/male VRoid-derived body and footwear identities; no relicensing of those source models is implied. `manifest.json` pins this package and scripts. No browser or game controller was used to generate these clips.
