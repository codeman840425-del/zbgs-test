# Independent QA review and bounded browser plan

Preparation only: no browser, GPU, performance run or product modification was performed for this review. Candidate source is not yet frozen; record final module hashes with the fixed build before execution.

## Findings

The selective primitive commit includes both changed position vertices and recomputed-normal neighborhoods, then tests actual primitive indices. Unselected primitives restore their original geometry; selected primitives keep the existing attribute/morph calculations. A generation check precedes the synchronous mesh assignment and old-owned geometry disposal. The intended comparison is equality of referenced/renderable components, not equality of unused full-face buffer entries. The existing CPU report explicitly covers this difference rather than silently relaxing a full-buffer assertion.

CPU evidence reviewed: `cpu-1/report.json`, `lifecycle-cpu/report.json`, `warm-cpu-2/report.json`, `warm-final/report.json`, and their scripts/source. The numerical geometry check uses actual source face buffers; warmup uses actual Three objects with a controlled compileAsync mock. Those tests do not prove GPU shader readiness, first-frame cost or visual equivalence. Factory failure and actor disposal both call the warmup release function; pending batches are released after settlement and disposed-before-microtask stops compilation.

**Concrete lifetime risk reported to root/prototype:** successful warm entries key material UUID/version but are retained until actor disposal. `facial-palette.applyPart` increments material.version when lip/iris palette changes; `character-appearance.tintHair` increments it for hair and FaceBrow materials. Repeated lip color plus mouth edits or hair color plus brow edits therefore accumulate stale warm material clones/program references. Skin-tone uniform changes alone do not increment the version in the inspected path, so the risk must not be generalized to every palette operation. This finding is being fixed by the implementation owner before freeze.

The smallest appropriate correction retains material-version invalidation but retires entries for obsolete material signatures. Cleanup must cover every stale layout for the same mesh, not just the newly requested layout. Retain all necessary layouts for the current material version. Pending old/new batch settlement order, failure, retry, same-color round trips (new version), material identity replacement and two actors need explicit CPU coverage. Releasing pending material references before compile settles is unsafe.

The warm key intentionally omits geometry UUID. That is valid for identical shader layouts and materials, but not a general guarantee across arbitrary scene lighting, custom shader mutation without material invalidation, or custom render passes. The current task keeps the admitted fixed scene/material contract; no new general-purpose cache is proposed.

## Minimal fixed-build browser execution

Reuse the identity guard and actual UI patterns from `qa-m2-male-jaw-mouth-final.cjs`, `qa-m2-eye-sample.cjs`, recipe-file checks and `qa-aa6-network-source.cjs`; use a fresh output and the new explicit build ID. Do not relabel aa6 images or CPU mock timing as new GPU evidence.

1. Original female, original male, male jaw: actual same-page body selection and exact identity check; load each body's existing legal exported recipe through the file input and compare actual re-export. Preserve male-jaw's discrete 0/+4 restriction and disabled unsupported fields. Keep body/document and task identities in the log.
2. Original F/M: actual mouth -> eye -> brow -> overlap -> reset. Check selected primitive counts, actual referenced position/normal changes, source geometry reference restoration and no mutation of protected primitives. No unsupported jaw eye/brow request should be made into a fake success; jaw tests only its permitted mouth endpoint.
3. In a fixed paused pose/camera, capture original and edited neutral/aa/happy+blink representatives. Then run one short real live speech/blink segment per original body with the warmed domain transitions; static expression-manager diagnostics remain separately labeled. Inspect black patches, missing eye/eyelash/brow surfaces and resets. No dance re-recording.
4. Bounded palette/geometry round trip and reset, then body switch/dispose: check renderer resource counts before/after a warm repeat and actual source geometry restoration. Resource trends are not proof of absence of all leaks; CPU material lifecycle tests remain the primary targeted disposal evidence. No extensive lifetime soak.
5. Same build female/male independent buttons, group selection and three existing tabs: check current controls still reachable and do not cause room input. One layout representative suffices; no redesign or repeated full UI movie.
6. Both public document entry points request the new favicon: capture actual CDP Network response URL/status/MIME and page-ready outcome. A link tag or local file alone does not prove successful browser loading. Preserve console errors and page errors independently.

Root will first measure the fixed candidate against the existing adjacent baseline. QA waits for that window and the frozen build; it will not run competing GPU work or claim performance benefit from fewer cloned geometries.

## Prepared entry points (not executed)

`node scripts/qa-face-selective-browser.cjs --base=http://127.0.0.1:PORT/ --build=FIXED12HEX --out=evidence/NEW_FIXED_OUTPUT`

The script uses actual file chooser/download and palette controls, two lip-color/mouth round trips per body, same-page female/male/jaw selection, same-pose diagnostics, short real live speech, original geometry reference restoration, resource counts, three tabs and CDP favicon responses. It refuses an existing output directory. `node --check` and `--plan` were run without creating a browser.

`python scripts/package-face-selective-review.py --out=evidence/NEW_FIXED_OUTPUT`

This creates a large native-video gallery, same-pose image pairs and sequential 2 fps whole-file sheets. Its review status is explicitly pending until the images are actually inspected. It never writes a pre-emptive pass report.

## Warmup follow-up review

The new helper recorded by `warm-version-lifecycle/report.json` (foundation SHA `0a4d63fdce0175e230cd964e7fc6344f1f02f59899948c698ff5bf597b43fef0`) addresses the reported stale-version issue: a successful current entry retires all settled obsolete material signatures for that mesh across layouts; pending obsolete batches release only themselves on settlement. New batch failure preserves earlier stable entries, and disposal-before-compile remains guarded. Seven CPU cases, including 20 changing versions and reversed pending order, were reviewed. No remaining blocker was identified in that bounded source review; actual GPU/readback remains outstanding.
