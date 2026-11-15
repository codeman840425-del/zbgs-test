# Appearance recipe and hot-switch wiring review

Read-only product review; no GPU/browser and no product edits. Exact source snapshots/hashes are in `source-tested/` and `report.json`. The tested recipe module SHA is `5cab157e70329123026b490d1b5b9d16d75cd44c201e52ef272763de9cc43b45`.

## Confirmed issues

1. **A later user outfit selection is overwritten by pending draft restore.** `appearance-workbench.js:53` disables only `fields` and `identityFields`; line 85 moves `.outfits` outside those fields. While the draft restore awaits a hair/palette request, the still-enabled outfit buttons can apply another outfit. `appearance-recipe.js:50` then unconditionally applies the older saved outfit. CPU reproduction: start restore of pants, select outfit 2 while waiting, finish restore → outfit 0, `applied:true`. The UI reachability is established by the actual DOM placement/source; the fixture reproduces the actual recipe orchestration, not browser pointer events.

   Minimal remedy: make the outfit controls part of the restore busy boundary, or use a request/revision token so a later outfit command wins. Do not silently describe the result as the user's latest choice.

2. **Superseded same-actor async work rolls back a newer edit.** An appearance component can return `{applied:false,cancelled:true}` after a later request. The recipe treats it as a failure and unconditionally restores the old snapshot. Reproduction: restoring black pauses; an independent appearance API sets brown; old restore resumes cancelled; catch restores original and overwrites brown. The normal workbench color fields are disabled during restore, so this is an API/concurrent-callback risk rather than an alleged current color-button path. Actor identity checks alone do not solve same-actor generations.

   Minimal remedy: distinguish cancellation from failure and only roll back fields still owned by this restore. A cancelled restore must not create a newer rollback request against the winner.

3. **Outfit partial failure is absent from rollback.** Fault injection after the outfit command assigns the new value makes the catch restore only appearance and geometry, then report “先前外观已保留”; the outfit remains changed. Current ordinary outfit selection is synchronous and preloaded, so this is an injected lifecycle/error-path defect, not a reported normal clothing-load failure. Either include outfit in owned rollback or return an honest partial-failure result when a commit has occurred.

## Additional behavior gap

`restoreDraft(true)` runs only at initial workbench binding. `selectBody()` success does not call it. Therefore a saved female mouth-width draft does not automatically return after switching female → male → female in the same page: the newly created female starts at zero geometry and inherits the last actor's colors. Manual “恢复已保存草稿” works. This needs an explicit intended UX decision against the current “重新打开此基模时自动恢复” promise; it is not a corrupt storage key or identity bypass.

## Positive checks / boundaries

- Wrong schema/base body type or SHA rejects before mutation. Wrong geometry recipe SHA rejects in the geometry module before deformation; the tested recipe then retains the prior state.
- When the controller changes actor while restoring, old completion does not apply clothes or rollback to the new actor. This was exercised.
- Draft keys are separate by body type; stored exact base SHA additionally rejects an updated resource at the same body type. No automatic cross-body compatibility is created.
- The recipe keeps original base identity separately from the geometry recipe SHA and parameter. The facial geometry module reports their composition; it does not claim deformed vertices have the original geometry identity.
- Factory disposal restores/disposes facial geometry before VRM deep disposal. Existing expression controllers remain bound to the same meshes.
- Outfit persistence presently records index/role/manifest URL, not a manifest content SHA. This is weaker than an immutable equipment-version snapshot; no specific changed-manifest failure is claimed here.

## Evidence

`node evidence/appearance-recipe-review-v1/check.mjs` executes the actual recipe module with explicit asynchronous actor/controller fixtures, no rendering. Six cases preserve the success checks and defect reproductions in `report.json`. The script refuses a changed recipe source identity so a later fix cannot overwrite this report under the old source label. A subsequent fix needs a separate after result.
