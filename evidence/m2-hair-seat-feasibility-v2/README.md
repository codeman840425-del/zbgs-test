# Actual seated collision queries

The root's real existing-browser capture used fixed build `e9bd472be0f8`, original female body `027bed60…`, rootjoin-v2 hair `1b785f9d…` and official springbone 3.5.5. Its 521 frames cover the seat transition, with all wrappers restored. The input is the immutable 29,015,451-byte `evidence/m2-hair-seat-collision-e9b-v1/collision-observer/report.json`, SHA `dc4e4d321db63e5ffefb9e394a5d5813df95017ae4912f44f6a56afb22bbe8b0`, committed by root in `523511c`.

| Actual shape | Queries | Negative distance | Minimum signed gap |
|---|---:|---:|---:|
| Head sphere | 3126 | 0 | +25.365mm |
| Head capsule | 3126 | 0 | +48.220mm |
| Chest capsule | 3126 | 0 | +29.296mm |
| Room boxes, all joints | 6252 | 299 | See per-shape result |

All 9378 body queries leave their input point unchanged. The official joint applies correction only for negative signed distance. Therefore the direct body collision correction contribution to this recorded upward flip is exactly zero. Positive-distance output target vectors are ignored by that branch.

The highest tail tip occurs at frame228, page9593.4ms, +261.120mm relative to Pony1, with sitProgress0.8941. Neither body nor room correction occurs in that frame or during the rising onset. The first environment correction is chairBack/Pony5 at frame322, page10163.7ms, 570.3ms after the peak. It has signed distance -0.203mm. The later room queries include 299 eligible corrections, with maximum returned correction magnitude9.004mm.

`analyse.py` applies the installed official correction and fixed-length normalization formula to each actual query. Every following query point agrees exactly, with maximum sequential discrepancy0. The inferred final segment direction agrees with the actual child-origin direction within `2.16e-14`. This checks actual call ordering and correction semantics without building a replacement physics model. Input point mutation is zero for both body and room shapes.

The current avatar-scene center excludes global actor movement while retaining animated head/hips movement relative to that center. The v1 report already reconstructs a roughly301mm head descent and43-degree pitch during the same kind of flip. This new direct record closes the body-proxy ambiguity for the observed seat transition. The observed unconstrained spring motion still produces the upward episode. It does not establish behavior for other motions, captures or bodies.

Two full-hierarchy CPU replay attempts are retained under `replay-attempt-1/` and `replay-attempt-2/`. Neither matches the real run. Their maximum child-origin errors are47.49mm and526.14mm, respectively, and both have `exactReplayAdmitted=false`. They are historical algorithm snapshots from the original top-level script location, with failure summaries and hashes. Their reference-frame counterfactual numbers supply no accepted prediction.

The failed replay exposed a relevant input distinction. The actual normalized first-query length ranges from0.9132 to1.2294 times the subsequently observed child-origin distance. Official private tail history and sampled child origins therefore cannot be substituted directly. The simplified hierarchy also failed to reproduce the exact world-matrix update order. No additional full-graph reconstruction or parameter search is attempted in this package. The direct per-query body=0 and room-after-peak conclusions remain independent of those failed replays.

The single proposed next candidate is an explicitly authored raw-head reference option for this exact hairstyle, preserving the historical avatar-scene default and all existing collision shapes, radii, stiffness, gravity, drag and geometry. Its reason is the confirmed local-head/history coupling during unconstrained motion. A new version must receive one fixed seated/walk/run/reset visual and query check. Head reference has not been demonstrated to resolve the actual game behavior. The current implementation's recorded seated flip remains a capability limit until that bounded candidate is checked. This package changes no runtime or source configuration.

```powershell
python -B evidence/m2-hair-seat-feasibility-v2/analyse.py --input-root F:/gamemake
```

The script requires numpy and the pinned existing capture plus fixed-v4 official module. It runs on CPU and writes only this evidence directory. `result.json` contains exact counts, source identities and limits. `selected-timeline.json` contains frames around the rise peak and first chair correction. The observer itself adds CPU/allocation overhead, so this record supplies no performance qualification. No browser or GPU was started by this analysis task.
