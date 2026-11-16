# Two-mouth-primitive reservation: single session measurement

Both runs completed, `status=measured`, zero page errors. All browser/temporary random-port servers closed. No product edits or delivery changes; public460 retained. Do not adopt based only on faster first mouth edit.

## Exact scope

Baseline `460b72813f68`, source `6e4801f`, immutable `experiments/body-context-guard-build-v1/dist`. Candidate `81ce13e85831`, source `6497e29767668d6483c8e6eaff9f917c84e1d527`, built from a fresh sparse independent checkout at `experiments/face-normal-mouth-reserve-measure-source` with its own npm ci; original junction untouched. Candidate's base is13526ff/0137: **no shadow preparation and no new context guard**, unlike460. This is a useful bounded alternative comparison, not a sole-hunk final-integrated A/B. Source CPU evidence is `evidence/face-normal-mouth-reserve-v1`; no CPU equivalence claims are inferred from browser speed.

One fresh headful Chrome process per build, 460 then81ce. Same document sequence: female ready → actual UI mouth−12% → actual UI reset0 → actual UI male → male first mouth−12% → actual UI female. Native primary-CDP focus emulation cleared, background-throttling default overrides removed. Initialization and all measured frames actually visible/focused. 1600×1000, pause=true/outfit0 control fixture, no video/profiler/forcedGC. OS/driver cache not cleared. No extra runs or tuning.

## Results (milliseconds)

| Metric |460|Two-block81ce|
|---|---:|---:|
| Female navigation→ready |2053.8|2148.2|
| Female initialization max rAF |903.9|1086.0|
| Observed initial max render CPU |895.3|1077.3|
| Female first mouth set promise |197.7|55.8|
| Female first mouth max rAF |103.1|36.4|
| Female first mouth max render |101.2|10.7|
| Female first mouth link/infoLog count |4/4|0/0|
| Female reset max rAF |6.2|6.3|
| Female→male request→observed actor commit |558.4|599.0|
| Female→male request→first render return |887.0|1037.3|
| Female→male request→UI settled |890.4|1040.9|
| Female→male max rAF |327.5|436.9|
| Female→male first render CPU |328.6|438.3|
| Male first mouth set promise |180.2|38.7|
| Male first mouth max rAF |78.8|30.3|
| Male first mouth max render |81.7|6.3|
| Male first mouth link/infoLog count |4/4|0/0|
| Male→female request→observed actor commit |482.7|481.3|
| Male→female request→first render return |563.6|598.6|
| Male→female request→UI settled |565.8|605.2|
| Male→female max rAF |139.5|127.5|
| Male→female first render CPU |80.9|117.3|

First-mouth improvement is concrete, but the candidate worsened initial peak+182ms and first switch peak+109ms; switch request through first render+150ms. Return-switch peak decreased12ms while its first render increased36ms. Single sequence/order cannot establish stable population effects, and missing baseline mechanisms confound exact attribution. Evidence does not support directly replacing460 with this branch.

## Capacity and resource accounting

Actual MAX_TEXTURE_SIZE=16384. From each real geometry layout and Three storage formula, initial/unenlarged-source morph texture backing:

| Body |460|81ce|Extra per CPU backing and GPU base estimate|
|---|---:|---:|---:|
| Female |16,571,520B|20,254,080B|3,682,560B (3.51MiB)|
| Male |15,987,456B|19,540,224B|3,552,768B (3.39MiB)|

Each amount applies separately to CPU backing and estimated GPU base storage, **not actual heap/VRAM measurements**. Initial female observed texSubImage3D bytes equal the estimates. First edit uploads remain; reservation does not eliminate that data cost. During edit the cached original plus new mouth clones give female23,936,640→27,619,200B / male23,092,992→26,645,760B estimated peak backing. Visible-geometry sums alone omit the retained original and would undercount. At MAX_TEXTURE_SIZE4096 padding would change costs; not measured here.

Renderer geometry/texture counts matched between versions at corresponding states: female initial89/44, female edit91/46, reset89/44, male switched84/41, male edit86/43, female returned84/40. Program count / summed usedTimes:

| State |460|81ce|
|---|---|---|
| Female initial |22/106|24/107|
| Female edited |26/116|24/110|
| Female reset |26/116|24/110|
| Male switched |24/103|26/104|
| Male edited |28/113|26/107|
| Female returned |26/103|27/103|

Cache retention after reset is not by itself a leak. This single cycle is not a long-term lifecycle test. All per-program identity/cacheKey/usedTimes, actual layout arrays and returned mouth values are preserved.

## State and measurement limits

Both switch requests were trusted UI events and kept the same document, pause/simulation time/position/outfit, correction/body-mode/dynamics/flags, selected camera mode and appearance selections. World camera coordinates are intentionally not equated across bodies; inspection.asset must change. Female returned mouth0 (no saved drafts), male first edit−.12. Default colors used; speed not independently changed. All set results applied, UI error flags false.

Actor commit time is an observation at render/rAF entry, not internal assignment; preceding old-actor observation brackets it. UI settle includes polling. rAF is not actual screen presentation; render and GL return time are not GPU-completion or isolated compilation costs. Init render hook begins only when debug renderer is exposed, so earlier renderer calls may be unobserved. Baseline and candidate use identical instrumentation.

## Recovery

`scripts/qa-face-mouth-reserve-session-cost.cjs --plan` is read-only. To reproduce intentionally into a NEW output leaf: `node scripts/run-fixed-check.cjs <fixed-dist> scripts/qa-face-mouth-reserve-session-cost.cjs <build> <new-output>`.

`baseline-460/` and `candidate-81ce/` retain executed script, report, raw full frame/event arrays and initialization arrays. `comparison.json` includes exact evidence and JS bundle hashes; `analyze.py` rebuilds the compact comparison without browser use. `plan.json` preserves the pre-run plan; final candidate identity is in this result and comparison. No repeat is requested.
