# Bounded conversion root-cause audit

This audit supersedes the initial README/commentary's broad attribution of the arm defect to occlusion. It does **not** change the first asset or relabel the fixed game result as accepted. No v2 has been generated: the suspected left/right or direction conversion error was not found.

## First trough: no interpolation at this time

Exact original PTS545545 / 30000 = **18.184833333 s**, relative3.169833333s. `trough-comparison.png` decodes that actual video frame and overlays original normalized points. Adjacent plots show raw predicted world points, filtered canonical points and exported UAL bones with the same shoulder origin. Different segment lengths are expected; the plot is not a calibrated 3D reprojection.

- Left shoulder/elbow/wrist confidence .99995/.96800/.98275. These are likelihoods, not positional accuracy guarantees.
- Low-confidence left arm intervals are **19.285933–20.253567s** (30frames) and **22.288933–22.989633s** (22frames), not the first trough. The terminal gap uses nearest available endpoint because `np.interp` cannot infer future motion.
- At the trough, raw→filtered direction differences are left upper arm **.30215°**, left forearm **.12003°**; right **.10875°/.27674°**.
- Across all240 frames, filtered→actual exported bone direction error is <**.000041°** for all four arm segments. Anatomical left/right source labels map to corresponding UAL names; fixed initial heading matrix is proper rotation (determinant1), not a reflection.
- High-confidence raw2D pixel direction versus raw-world cameraXY has median/P95 angle differences: left upper4.38°/8.19°, left lower6.82°/9.24°; right upper2.67°/4.18°, lower2.81°/6.26°. This excludes a gross axis flip at those times; it does **not** validate depth or camera calibration.

The original image shows both arms directed forward/down, and the processed UAL segments retain that pattern. The earlier claim that the first-trough left arm was brought toward the head by low-confidence interpolation was inaccurate. Raw world data at high confidence cannot be called metrically correct from a single image, but there is no evidence here that the first-trough arm defect is caused by missing samples or reversed coordinates.

## Wrist/hand limitation is separate

V1 deliberately left hand/finger local rotations at the UAL reference values. It reconstructs upper/lower arm directions but does not recover forearm axial twist or palm orientation. At this trough, predicted wrist→index versus UAL wrist→middle-base direction differs2.09° left/8.89° right, while the unsigned palm-plane normals differ **26.97° left /55.83° right**. The pose33 index/pinky points are themselves coarse predictions, so these angles diagnose an omitted orientation input, not a validated replacement grip.

Consequently, high-confidence arm origins can coexist with visibly wrong palms/wrists. It would be misleading to repair this by mirroring the other arm or to attribute all wrist errors to the50-frame gap. A subsequent explicitly labelled hand-orientation reconstruction would need independently checked hand landmarks/twist and complete normal-speed viewing. This audit does not silently add it or claim recovery of fingers.

## Target ankle width: expected rotation-only retarget result

The existing importer keeps each VRM's actual rest joint offsets, applies UAL rest-world quaternion deltas, and retargets the single pelvis translation. It does not impose the UAL's support-foot separation on the target. Shared pelvis translation cancels from left-minus-right ankle distance; adding a missing common hip X component cannot fix stance width.

The audit loaded the actual female/male VRM rest skeletons and independently reconstructed each target chain using `sourcePoseWorldRotation × inverse(sourceRestWorldRotation)` applied to each target rest link (including target hip offsets). Compared to the recorded fixed-build raw bones at the same dance clock:

| First trough | UAL ankle X separation | predicted target | actual game | 3D prediction error |
|---|---:|---:|---:|---:|
| Female |178.000mm|84.262783mm|84.262821mm|0.039µm|
| Male |178.000mm|87.280156mm|87.280197mm|0.043µm|

Source hip width178.000mm, female154.245mm, male169.669mm. The full difference is **not one uniform scale factor**: target thigh/calf rest directions and lengths also matter. Second-trough agreement is again <.03µm. At .7s, ~1.4–1.6mm mismatch remains during the existing entry crossfade (`danceMix≈.9962`), so that sample is not claimed exact.

This proves the narrow target stance is explained by the current retarget contract, not a missing root coordinate. It does not mean a narrow squat stance is acceptable. Preserving source contact footprint across different bodies would require explicit offline target adaptation or an existing supported contact constraint, with actual knees/feet/body checks—not arbitrary widening or claiming source accuracy.

## Practical capture boundary

For trustworthy continuation, use a fixed camera with whole body and both hands continuously visible, sufficient resolution, no forearm/torso occlusion, and a view that exposes palm orientation. A second synchronized calibrated viewpoint or depth capture is needed to validate metric depth/twist rather than relying on monocular confidence. The present high-confidence points do not supply that evidence; terminal occluded motion and finger pose are not uniquely recoverable. The legal source remains useful as a squat reference, not demonstrated automated dance capture.

## Reproduction / unchanged outputs

```powershell
python scripts/video-motion/audit-conversion.py
python scripts/video-motion/plot-audit.py
```

Inputs: pinned `raw-sequence.json.gz`, `processed.npz`, original DVIDS MP4, unchanged GLB `c459ea7a…`, exact F/M VRMs referenced by `evidence/mic-mouth-target/source-anchors.json`, fixed-game traces under `evidence/video-motion-room-5d848494cce5/`. The scripts are read-only with respect to all motion assets and game files. `root-cause.json` retains vectors, confidence, actual game comparison and exact sample times. No browser, controller changes, mirrored data or parameter tuning were used.
