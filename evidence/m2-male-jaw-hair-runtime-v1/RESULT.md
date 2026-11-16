# B: exact male-jaw hairstyle fit runtime candidate

Base runtime: `026ab2013ee94a6eb72cbe5f5e8c347c49b65431`. No shared main/public pointer or motion-controller change.

The canonical male short-hair GLB is unchanged (`fb5fd49352b7bab0e6d2c0ec3f6e565f0004062e4a8975f1afcd93fb24dd48fd`). The new jaw body uses an independently pinned `character-hair-fit-v1` file and raw-head-bind-local TRS. Original female/male attachments retain their historical implicit head-local semantics, identified honestly by their exact manifest hash rather than a fabricated fit hash. Source re-export normal difference remains in the source report; the re-export does not replace the canonical GLB.

## Contract

`appearance.set({hairStyle, expectedHairFit?, expectedHairAssetSha256?, ...colors})` validates optional expectations before revision/color changes, including cache hits. Omitted expectations are ordinary UI selection; explicit null is strict. Replacement requests validate fetched manifest, fit and GLB bytes before committing their requested colors. A newer independent color request wins over an older pending request. Style generation continues to protect reset and newer style choices.

State exposes `hairFit`: null for original/none; `{kind:'legacy-head-local-v1',manifestSha256}` for historical attachments; `{kind:'explicit-fit-v1',id,version,sha256}` for the new jaw fit. v6 captures this identity. v1–v5 retain previous geometry/palette behavior and admit only historical implicit attachments; they reject a smuggled hairFit or a jaw replacement lacking explicit fit. v6 requires hairFit and validates its exact field set. Restoration and rollback pass both actual asset and fit identities.

Only exact target entries are selectable. The loader checks head attachment, single rigid mesh, source material and independent hair-mesh hiding scope. It never hides Body or facial meshes. Fit TRS is applied to the loaded attachment root before parenting to the raw head. MToon surface and legitimate generated outline materials are cloned per instance. Reset/none retain originals and cached replacement ownership; dispose releases the owned replacement and restores original visibility/material references.

## CPU evidence

`cpu-3/report.json`: 39 passing checks using production appearance/recipe modules and exact source bytes. Real GLB arrays and real MToon materials are used; image decoding/WebGL are explicitly not tested. Recipe geometry/equipment are declared transaction fixtures. The legacy v1–v5 cases are neutral-geometry legal fixtures, not a replay of all historical four-domain expressions. QA will separately read existing real v5 files in the browser.

Cases cover pinned source, exact body/fit/version/hash/TRS/hiding, wrong requests before state mutation, corrupt fetched bytes and retry, shared GLB with separate instance materials/fit, cancellation/reset/new color, delayed dispose, fresh-instance v6 roundtrip, old formats, invalid identity, file-read cancellation and rollback.

`cpu-1` is the initial 37-case snapshot. `cpu-2/failure.json` preserves the outline test's fixture mistake: MeshBasicMaterial does not copy an ad-hoc isOutline property. The fixture was corrected to the actual MToonMaterial type; product code was not changed to compensate for that assertion. Both original source HAIR materials declare outline mode 0; the normal MToon outline path is nevertheless checked.

Run from a checkout with locked dependencies installed:

```
node scripts/m2-male-jaw-hair-runtime-v1/check.mjs <new-evidence-directory>
```

The output directory must not already exist. Runtime product files and the executed script are captured with exact SHA. GPU/files/normal-speed observations remain separate and pending; these CPU results are not visual acceptance.


## Fixed build and actual browser result

Runtime commit `5dfffaee86bbc82a18e24088ecf45a8b9bbc7f74`, build `fe5c528d9437` (full `fe5c528d9437c59b6ba73beade52e0c8502a309133b08517229ffeb4f9efa71e`). Fresh sparse checkout writes root attributes before materializing prototype; every build input matched its Git blob byte for byte, followed by locked npm ci/build and clean status. See `build-5dfffae/report.json` and exact executed script/logs. Parent independently reproduced all 126 outputs from integrated source `937df9f`.

Independent QA's actual 11 browser checks pass: same-pose original male/jaw none/original/sidepart front/side/back, true UI v6 download and fresh-context file chooser restore, four bad files preserving prior state, cached bad-fit refusal, actual two-actor isolation, and existing real female/male v5 files. `browser-review/` contains exact copies of the original PNGs/downloads and report; provenance is in `browser-review-origin.json`. Independent source review is copied under `independent-review/`. The recipe uses the shared actor/equipment/animation implementation. It is an appearance file, not an actor ID or account save. There is no new business-state or library framework.

## Complete normal-speed clips and observation

`live-1/male-live-1x.webm`: 29.5754 s active interval, simulation/wall 0.9999797129.
`live-1/m2-male-jaw-v1-live-1x.webm`: 29.5329 s active interval, simulation/wall 0.9999830697.

Both clips include initial page/recipe setup before the measured active interval. The original male briefly displays its original blue hair during setup; the actual comparison is black on both bodies. Both are the same canonical `male-sidepart-v1` GLB, with distinct historical versus explicit fit identities. Traces assert visible + focused, unpaused 1x, original document/actor, unchanged final appearance recipe, head-local attachment matrix and parent/visibility throughout. Neutral blink, aa=.65, happy speech and gaze precede actual walk/run/sit/stand tasks. Peak speed exceeds 1.85 m/s; sit reaches 1; all four real tasks complete. No simulation stepping or playback acceleration was used. Browser/server closed after the two clips; no repeated recording or product repair was necessary.

The implementation agent viewed both full-interval 2fps contact sheets plus original close views: no new obvious root detachment, floating attachment or eye coverage; ears and back/neck silhouette remain coherent in this limited sample. This is sampled engineering review, not a claim of every-frame collision freedom or blanket style approval. Existing source internal intersections are retained in source evidence. Short rigid hair has no secondary hair physics. Original clothing/motion is not re-certified by this task. Render images, strict identity/function tests and visual judgement remain distinct.

`index.html` provides two body buttons, front/side/back controls, click-to-enlarge originals and two full-width videos with native controls/fullscreen, no autoplay/loop. Downloads reproduce actual v6 bytes even when opened as a local file. `gallery-check.json` covers all 18 images, keyboard Escape/focus restoration, exact downloaded bytes, and pause-on-body-switch. No new game UI framework was added.

## Reproduction

From a repository checkout containing the committed scripts and source, install locked `prototype` dependencies for CPU/browser tools. No temporary folder is a required input.

```
python scripts/m2-male-jaw-hair-runtime-v1/build-fixed.py --commit 5dfffaee86bbc82a18e24088ecf45a8b9bbc7f74 --worktree <new-checkout> --out <new-build-report>
node scripts/m2-male-jaw-hair-runtime-v1/check.mjs <new-cpu-report>
node scripts/run-fixed-check.cjs <fixed-dist> scripts/m2-male-jaw-hair-runtime-v1/live.cjs fe5c528d9437 <new-live-output> evidence/m2-male-jaw-hair-runtime-v1/live-input
python scripts/m2-male-jaw-hair-runtime-v1/inspect-live.py <evidence-root-with-live-1>
python scripts/m2-male-jaw-hair-runtime-v1/gallery.py <evidence-root> <independent-browser-evidence>
node scripts/m2-male-jaw-hair-runtime-v1/check-gallery.cjs <evidence-root>
```

The live script's optional recipe directory contains `male.v6.json` and `m2-male-jaw-v1.v6.json`; this package retains those exact QA downloads. `GAMEMAKE_ROOT` can explicitly select an installed dependency root; the default is the script's project root. Native browser focus/visibility and time remain measured, not inferred from a filename. Generated full video duplicates under Playwright's raw filenames are not added twice; `raw-video-duplicates.json` maps each byte-identical raw copy to its retained canonical video. CPU/live/build outputs refuse overwrite. The gallery generator is a reproducible view over retained artifacts and can replace its generated HTML without modifying those artifacts.
