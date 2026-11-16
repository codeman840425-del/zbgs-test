# Same-document body-switch follow-up — one sequence per build

No product files changed. Baseline a7efd61c61c8 (0137d7e) and reserve 4f33a4f72f21 (13526ff) each ran one fresh-process female → male → female UI sequence, in that order. Browser and OS-assigned server closed. No video, profiler, GC, or shader-cache clearing. Native primary CDP focus emulation disabled; every measured switch frame was visible and focused. These are hardware Chrome main-thread/rAF observations, not actual presentation or GPU-completion timings.

## Result

The candidate should **not be adopted directly on this evidence**. First edit improves in the preceding experiment, but initialization costs more and this required same-page switch shows a large first male-render regression. No further tuning/test loop was performed.

| Metric (ms) | a7 F→M | reserve F→M | a7 M→F | reserve M→F |
|---|---:|---:|---:|---:|
| UI request→actor commit observed |610.5|586.1|533.7|550.1|
| UI request→first new actor render return |937.2|1153.7|608.9|661.6|
| UI request→UI settled observed |940.4|1157.5|613.3|664.7|
| Maximum complete rAF interval |327.6|570.2|139.5|121.4|
| First new actor render CPU return |326.7|567.6|75.2|111.5|
| getProgramInfoLog total CPU return |228.4|460.7|14.4|30.9|
| link / infoLog calls |11 / 10|15 / 14|11 / 10|12 / 11|

Commit is the first observed changed actor reference at render/rAF entry, **not instrumented internal assignment**. Raw observations save preceding old-actor observation and new observation as its interval. UI settled includes polling delay. GL infoLog wait includes driver synchronization; not pure compilation cost. Single run/order and uncontrolled driver cache preclude precise causal attribution or statistics, but do not justify ignoring the measured regression.

## Resource counts (geometries / textures / programs / summed usedTimes)

| State | a7 | reserve |
|---|---|---|
| Initial female |89 / 44 / 22 / 106|89 / 44 / 25 / 108|
| Male after switch |84 / 41 / 23 / 102|84 / 41 / 29 / 107|
| Female after return |84 / 40 / 24 / 101|84 / 40 / 30 / 106|

All individual program IDs, native GL identities, cacheKeys and usedTimes are in raw/report snapshots. Texture count is **not capacity**: the prior RESULT.md separately records +10.54/+10.16 MiB per actor estimated CPU texture backing and GPU base storage, plus initial cost. One round is not long-term leak proof. Starting and subsequent resource counts need not match: initial default equipment is realized before fixture sets outfit0; the returning actor begins outfit0.

## State and QA failures retained

Both actual two-switch sequences completed without page errors. Same document, pause, simulation time, position, outfit, camera **mode**, correction/body-mode/dynamics/flags and appearance selections all remained unchanged, as checked offline from complete raw snapshots. Default colors were used; speed was not independently changed/asserted in this small measurement.

Original report statuses remain `failed-preserved`: baseline's final QA assertion incorrectly demanded equal camera world coordinates across sexes; candidate's final assertion incorrectly demanded equal `inspection.asset` across different bodies. The camera keeps the chosen framing mode while adapting world target to the body's height, and asset identity must change. Neither assertion interrupted either switch or its measured frames. No browser rerun occurred. `analyze-body-switch.py` rechecks only actual invariants, leaves original raw/reports/executed scripts untouched, and writes `body-switch-comparison.json` (all four postchecks pass). Current reusable script corrects these two postconditions; its revised form has not been rerun. Both captured script snapshots remain the true executed versions.

Reproduction: `node scripts/run-fixed-check.cjs <fixed-dist> scripts/qa-face-normal-reserve-switch.cjs <build> <new-output>`; output leaf must not exist. Dist paths and exact bundle/evidence SHA256 are recorded in `body-switch-comparison.json`. All rAF, render, longtask and GL records are preserved in each `raw.json`.
