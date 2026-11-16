# Parameterized safe torso coverage for the three new vest tops

Run from the repository root.

```powershell
python -B scripts/m2-vest-body-coverage-v1/build.py
python -B scripts/m2-vest-body-coverage-v1/qa.py
```

The default batch pins original female, round-full-v2 and soft-wide-v2 bodies, the three new layer-fit tops, their equipment entries and corrected fit identities. The layer manifest pin is `dd5d8d1286db65f63e9f9d4361464496e8d4244a17a004206b62d40af67cec28`. Corrected metadata from commit `4771fd58` is retained in `inputs/`; actual top geometry is unchanged. The original female fit pin is `d38d2460bd592756da0893c624952d33a84e416c1e8418e443c017349be55ddf`. Bottom metadata does not select coverage.

`build.py` parameterizes the exact pinned AST of `scripts/m1-assets/build-torso-coverage.py`, from its Body/top primitive assignment through its report assignment. The original load function is reused. The old hardcoded input paths and output identity are replaced by the checked case inputs. The geometric and numeric rules remain unchanged.

Body triangles retain at least .999 total weight on the original allowed torso bones. Neck/head/shoulder/upper-arm clothing weights above .01 exclude complete clothing triangles. The real 20-face bottom fan and its 20-point hem perimeter are recovered from each actual new top. Exact point-to-triangle and point-to-segment distances retain the 25 mm source margin. The original outward ray bounds remain .1–30 mm, normal dot greater than .15, with 3 vertices plus 4 interior samples per face. The original connected component landmarks remain 610 and 657. Each new Body must match original topology, joint order, UV and skin weights before generation.

The three source masks contain 252, 257 and 247 faces. Relative to the original 252-face mask, original female retains all faces, round adds 10 and drops 5, soft adds none and drops 5. All selections are recalculated from actual body/top geometry. The three original/new cap fans pass the unchanged recognition rule. No cap topology wiring correction was needed.

| Case | Selected faces | Source minimum neck/sleeve distance | Source minimum hem distance |
|---|---:|---:|---:|
| female | 252 | 25.903 mm | 81.776 mm |
| female-round-full-v2 | 257 | 25.123 mm | 64.041 mm |
| female-soft-wide-v2 | 247 | 25.906 mm | 82.490 mm |

Actual readback QA passes 32 checks. It verifies source/index identities, the original/derived Body relationships, every saved seven-point distance/ray gate, exact new top dependencies and a negative source-SHA case. Full Body and all top assets remain immutable. `provenance.json` records sources/tools and `cost-runs.jsonl` records actual generator invocations on this host. Timings cover that CLI only, with design, import wiring and QA excluded from complete production cost.

The root running capture is used only for review after source selection. The virtual new top uses the recorded live skin palette. The generated safe faces include the Body triangles behind all 272/272 round and 278/278 soft pale pixels previously attributed by root. No screenshot rectangle or pixel set selects hidden triangles. All 1764/1799/1729 selected-face samples fall within the new top's projection in that one supplied pose. Source boundary vertices have posed minimum neck/sleeve distances 24.593/21.877/20.171 mm and hem distances 81.440/63.994/82.041 mm. The 25 mm rule is a rest selection margin and does not establish an animated threshold. Continuous motions and exposed neck/sleeve/hem boundaries remain pending.

`generated/manifest.json` uses `vest-body-coverage-batch-v1`. Each case has `id`, `status`, `bodySha256`, `topId`, `topSha256`, `selectedFaces`, `descriptor {url,sha256}` and exact `files.fit`/`files.report` references with `path`, `sha256`, `bytes`. The prospective URL prefix is `/assets/m2-vest-body-coverage-v1/`.

`coverage-fit.json` directly uses existing `zbgs-outfit-body-coverage-candidate.1` fields and is compatible with `createBodyCoverageSet`. It binds exact Body SHA, top ID/SHA, Body material, Uint32 source index SHA/count, selected face IDs and original triangle indices. `topFitIdentity` records the independently versioned new top fit. The full per-face 7-point data, old-mask differences and boundaries are in `source-selection-report.json`, whose SHA is also recorded in the fit.

Root may copy only the candidate fit/report files and register their descriptors against the new `fitTop` entry in the pants-only extra outfit. Existing top IDs, old masks, original pants/skirt choices and old recipes retain their existing consumers. No public, catalog or runtime file is changed by this package. A failed source identity, original rule assertion or changed output identity is retained/refused, with no threshold fallback.

This is source-safe candidate coverage. Full-speed walk/run/turn/sit/rise, switching tops, body-preview/full-index restoration and visible boundary acceptance still require root's fixed-build validation. The original unexplained edge pixel remains outside this source decision. Initial wrapper imports and QA sample-arithmetic errors are preserved in `initial-wiring-error.txt`; neither changed the source rule, thresholds or generated masks.
