# M1C source grip diagnostic

These files are offline pose candidates, **not production equipment or accepted animation**.

`scripts/m1c/fit-source-grip.py` reads the fixed female/male roundtrip VRMs without modifying them. It preserves original skin weights, inverse binds and geometry. It fits a finite 13 mm handle cylinder outside an actual palm skin cross-section, then fits four finger curls and an independently opposing thumb using bounded least squares. All parameters, limits, exact avatar SHA and normalized/raw finger quaternions are readable in each `grip.json`. `posed-hand.obj` is a diagnostic extract of the original posed hand, not a replacement hand or changed skin topology. Original source permission remains the current foundation asset provenance (CC0 declaration; see `assets-source/foundation/source.json`).

VRM0 thumb semantics are explicitly remapped to the normalized VRM1 names used by three-vrm. Quaternion conversion follows the installed three-vrm humanoid rule: raw = inverse(parentRestWorld) × normalized × parentRestWorld × rawRest. `skin-reference.json` stores the actual source vertex IDs and offline points in raw-hand local space for a runtime equivalence check; offline results alone cannot validate that conversion in the running game.

```powershell
python -m pip install -r scripts/m1c/requirements-grip.txt
python scripts/m1c/fit-source-grip.py --seconds 40
$env:QA_BUILD='ca72ada827d2'
$env:GRIP_SOURCE_POSE='1'
node scripts/run-fixed-check.cjs experiments/m1-ca72ada827d2/dist scripts/m1c/qa-grip-candidates.cjs
python scripts/m1c/summarize-grip-candidates.py output/playwright/m1c-grip/ca72ada827d2-source-pose
```

The runtime check is a temporary per-instance diagnostic override; it does not install pose data into product source. Baseline and candidate use the same loaded body, source action time and hand geometry. The finite cylinder vertex probe is not triangle CCD. Fingers near a surface do not prove a supported natural grip. Palm contact, thumb opposition, floating gap and actual full-size pictures remain acceptance conditions. Female fitting can hit the iteration bound: retain that status rather than claiming convergence.

Current source includes thumb pad height constrained to the actual index proximal row, preventing contact optimization from extending the thumb toward the microphone head. The earlier source remains in `before-thumb-height/`. The final representative actual VRM diagnostic has zero vertices more than 1 mm inside the bounded handle cylinder and 63 near-surface points per body; palm near-surface count remains zero. Fully hand-weighted points match offline skin within 1.3e-7m. Wrist points also weighted to the forearm vary with the source arm pose, as expected. This remains representative diagnostics, not full-chain product acceptance; see `docs/M1C-SOURCE-GRIP.md`. No additional body reweighting has been justified by the present evidence.

Published profiles bind exact avatar SHA, microphone GLB SHA and grip profile SHA/fitVersion. Old ca72 save catalogs record only the accessory and need an explicit grip-version migration; they are not proof of restoring the new fit. Variants without their own compatible profile reject microphone equipment rather than silently inheriting the female pose.
