# Transaction-local snapshot reuse: partial improvement

One paired 3-body developer-PC short run; Chrome157/RTX4090/1600x1000, paused, no video/profiler. Forced GC outside timing windows. Backing storage is CDP JS-process observation, not VRAM/full process memory; no target-PC pass. Pre-compile includes recipe retrieval/validation/copy/calculation; it is not an isolated CPU timer.

| Body | Preparation before compile old / new ms | First edit command old / new ms | Retained backing-storage growth old / new MB | First-edit max frame old / new ms |
|---|---:|---:|---:|---:|
| female | 75.5 / 32.1 | 152.4 / 109.2 | 12.69 / 1.44 | 103.2 / 109.2 |
| male | 80.9 / 29.5 | 162.8 / 96.0 | 12.25 / 1.40 | 115.3 / 103.2 |
| m2-male-jaw-v1 | 90.1 / 44.0 | 158.9 / 109.2 | 12.25 / 1.40 | 103.2 / 103.1 |

The previous preparation phase had 72/77/88 ms long tasks. The corresponding phase has no >=50 ms task in this short candidate run. First draw remains approximately 100 ms; this is a preparation and retained-data reduction, not a complete stutter fix. No driver checks were disabled, no source validation removed, and no GPU first-use internal API from rejected 01a remains.

CPU full-buffer equivalence and rejected-input/lifecycle gates: ../face-prepare-snapshots-v1. Actual source sharing was observed in the loaded VRM, not inferred from file names: ../face-source-sharing-1fff. Browser regressions and independent rebuild are separate.
