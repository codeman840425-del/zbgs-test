# Face render compaction final fixed evidence

Final source `422a23911784c0b7448841eb97839973901b0be5`, build `0fb420e5b124`. Remote `origin/codex/face-render-compaction` was verified equal. Independent build inputs: all 171 Git blobs exact, root .gitattributes exact, complete input list and build digest exact (../face-render-compaction-build-422a/postbuild-inputs.json). Public 460 was not modified.

## Outcome and limits

Actual initial morph texture upload dropped from 16,571,520 to 1,841,280 bytes for female. Male current visible morph texture base estimate dropped from 15,987,456 to 1,733,184 bytes. Each number describes one CPU texture backing / one GPU base texture estimate, not combined memory or total VRAM. Canonical CPU source remains available for exact recipe validation and deformation. No canonical Face upload preceded initial compact upload in final initialization. Initial renderer counters: 460 geometry89/texture44; 0fb geometry84/texture40. Actor switching ends geometry84/texture40 in both final F/M states.

First editing stalls are not solved. Both bodies still cause four linkProgram and four getProgramInfoLog calls. This is a capacity reduction candidate, not a general responsiveness fix. Single samples, same-script sequence, driver cache not cleared; final male→female timing regressed and must remain visible in the decision.

| milliseconds | 460 baseline | final 0fb |
|---|---:|---:|
| Female navigation→ready | 2066.7 | 1908.6 |
| Initialization max rAF | 952.5 | 952.6 |
| Female first-mouth set | 201.6 | 201.8 |
| Female first-mouth max rAF | 84.9 | 78.8 |
| Male first-mouth set | 180.7 | 187.7 |
| Male first-mouth max rAF | 78.9 | 72.8 |
| Female→male request→firstdraw return | 897.0 | 847.4 |
| Female→male max rAF | 364.0 | 273.1 |
| Male→female request→firstdraw return | 571.5 | 622.8 |
| Male→female max rAF | 133.5 | 157.6 |

Raw runs/executed scripts: baseline-460/, compact-d718/ (historical failed sort), compact-0fb/. comparison-final.json provides exact values. Actor commit timing is an observation interval, not an injected internal assignment timestamp. rAF and GL return timing do not prove screen presentation or GPU completion.

## Correctness

The original d718 eye difference is preserved. QA diagnosed transparent order from the SkinnedMesh object sphere, not geometry bounds: compact per-primitive point sets changed sort z. Final lazy canonical sphere calculation uses the original first-use pose/timing, restores geometry/method in finally, and leaves existing nonnull sphere references intact. EyeExtra zero morph omission remains unchanged.

QA final two decisive male images equal 460 exactly and transparent order/z restored. Full24:18 images exactly equal; six images differ at most1/255 in at most28pixels. Do not label all pixels byte-identical. Metadata/actual expression bindings, bad source refusal/retry, v5 ten recipe cases and actual body-context recovery passed; see ../face-compact-bridge-review/ for independent evidence. CPU22 edit states/111 expression configs, five bad identities/nine lifecycle cases and533 geometry disposals are tied to final source in the source-branch cpu-object-sphere-lazy-1 report.

## Actual normal-speed live recordings

Final-only files in live-0fb/: female-live-1x.webm and male-live-1x.webm. Both preserve full recording including loading/setup; trace defines the approximately12.25s normal live interval. UI selects all four admitted visible-v2 endpoints, then happy, speaking, automatic blinking and gaze camera/declared side targets. No performance run overlaps recording. Actual native document visible/focus assertions hold, no page errors. Female sim/wall1.0000163201; male1.0000979696.

Female video SHA256 e1fe5466236a17748d4e4b5852abf56a519fa7bc019a2c3ba8363fbb22d3b186.
Male video SHA256 68cd1c95581bbcfc69f8d9975891939fa2ff4e00dacf61a44d77764960bd344d.

Inspected four full gaze PNGs plus both25-frame2fps tail sheets. Eye outline/lashes remain visible through observed close/open and side gaze; mouth changes are visible without observed disappearing face pieces or large new discontinuities. This sampled inspection is not continuous perceptual or art acceptance. Full recordings remain for root review; source happy+speech styling is not changed by compaction.

All temporary browsers and OS-assigned servers closed. d718 recordings remain historical and are not relabelled. Root owns integration/rebuild/publication; no new geometry/performance variant was added.
