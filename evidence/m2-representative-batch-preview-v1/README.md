# Eight-preset CPU source preview

The four PNG sheets show the fixed final resources using the same orthographic cameras and metre scales. Each sheet has front view above and a 0.45-radian three-quarter view below. Separate female/male full-body and head sheets retain the same scales across sexes. The full-body preview uses Body/Face/original embedded hair plus the actual independent matching top, bottom and shoes. Baked original clothing primitives are omitted from this preview.

The author personally inspected all four sheets. They show differences in cheek/jaw/chin outline and clothed torso/hip volume. The preset names describe parameter intent. Muscular and athletic names have no separate anatomical muscle sculpt or artistic acceptance. Clothes and a neutral source pose conceal some regional changes. This is a source-screening preview, with original UV texture sampling and simple CPU lighting. MToon, outline, runtime expressions, deformation in motion and game lighting remain outside this renderer.

Reproduce with Python, NumPy and Pillow from the repository root

```powershell
python -B scripts/m2-representative-batch-v1/preview.py
```

The script reads fixed generated resources and writes only this evidence directory. `report.json` pins the source manifest and every viewed avatar/equipment file, camera scale, method, limits and measured changed-primitive bounds. Runtime acceptance remains false.

## Fixed source measurements

The values below are maximum per-vertex displacement from the exact original source, measured separately for skin face/body and independent top. Export time includes the deterministic repeated asset calculation.

| Preset | Face mm | Body mm | Top mm | Output bytes | Export + repeat seconds |
|---|---:|---:|---:|---:|---:|
| female-round-full | 9.51 | 65.58 | 70.15 | 20,503,815 | 1.463 |
| female-long-slender | 12.37 | 34.30 | 38.39 | 20,503,828 | 1.428 |
| female-square-athletic | 6.61 | 15.85 | 15.22 | 20,503,903 | 1.472 |
| female-soft-wide | 10.30 | 37.84 | 42.44 | 20,503,755 | 1.477 |
| male-wide-muscular | 8.11 | 41.22 | 45.93 | 23,000,833 | 1.663 |
| male-long-lean | 14.56 | 30.81 | 37.12 | 23,000,830 | 1.836 |
| male-round-stocky | 10.87 | 54.77 | 65.78 | 23,000,863 | 1.615 |
| male-angular-athletic | 7.81 | 22.42 | 25.48 | 23,000,948 | 1.490 |

The final complete batch took 12.5596 seconds and wrote 174,018,775 bytes across the eight variant file sets. Encoded image payloads sum to 133,272,224 bytes, with 26,923,646 bytes of unique payload content over 42 hashes. This is file-content duplication. Independent texture objects and renderer allocations are not subtracted. Timing describes this CPU source run, without ordinary-PC runtime performance claims.

One initial batch and one common field/audit correction produced all eight passing source exports. Preset parameter edits after the initial batch were zero. First-round failed resources and exact producer snapshots remain under the source package `attempt-1/` directory. Parent owns the independent CPU audit and actual room checks. No contact profile, replacement-hair compatibility or runtime acceptance is inferred from these previews.
