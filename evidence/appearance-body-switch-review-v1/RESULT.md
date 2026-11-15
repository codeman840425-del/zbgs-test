# Hot body switch: independent bounded review

Reviewed `prototype/src/main.js` SHA256 `82fb3cc5624a91f047a3fdccfec2fdb40ff4f38efd4d0cab06d830f37c277884`. This is the source identity of the review, not a fixed browser build. Product files were not edited. No browser or GPU was used.

## Findings

1. **Initialization exception after premature commit splits displayed and controlled actor.** In the reviewed function, global `avatar`/`motion` are reassigned and `nextAvatar`/`nextMotion` cleared before `motion.update(0)`, `avatar.update(0)`, and `updateGarment`. A throw in any of these calls returns `applied:false`, but controls now reference the new actor, its root is not attached, and the old root remains visible. Neither object is disposed by this error path. CPU fault injection into each call reproduces the state. An exception later in UI synchronization instead returns failure after the old actor has already been disposed. These are error-path reproductions, not observed normal-render failures.

   Smallest correction: finish fallible new-actor pose/garment initialization off-scene before changing the globals; distinguish preparation failure from post-commit presentation failure. Preserve cleanup ownership until actual commit. Resetting the old controller before this preparation also changes the supposedly retained old actor, so ordering must account for that mutation.

2. **Actual outfit fallback does not update selected buttons.** A successful female-skirt to male-pants fallback assigns `controller.outfit = 0`, but `syncFoundationControls` only changes labels/visibility. The old skirt button retains `aria-pressed=true` while hidden; the pants button remains unselected. Existing `setOutfit` already implements the selected-state synchronization. This is a UI state defect, not a clothes loading defect.

## Checks without a new finding

- Primary `actor` and `rig` getters resolve the current globals; comparison instances retain their own explicit instance references.
- Accessory UI callbacks compare the captured actor with `controller.actor` before writing status, preventing old asynchronous completions from changing the new actor's buttons.
- Helper reconstruction removes and disposes previous geometries/materials and rebuilds normalized bone pairs from the current avatar.
- The current supported profiles use the same 0.47 m seat height. Absence of a chair-height reset is not reported as an observed defect for these profiles. Seated switches derive the new approach point from the new motion metrics and the chair transform.
- Workbench state reads the controller's dynamic actor getter. It does not keep using the originally supplied avatar after a switch.

## Evidence and reproduction

`source-tested/switch-and-sync.js` preserves the exact reviewed functions. `report.json` contains six CPU fixture executions: pre-commit load failure, three initialization failures, post-commit UI failure, and successful outfit fallback. `check.mjs` executes the extracted production functions in a VM with explicit scene/controller/DOM fixtures; it does not model rendering, actual resource allocation, or the full controller reset. The outfit fixture exposes selected state to detect the absence of writes; it is not a browser accessibility test.

Initial command: `node evidence/appearance-body-switch-review-v1/check.mjs` from `F:/gamemake`.

The script reads current source and rewrites its report/snapshot, so copy this evidence directory before running against a later revision. Later runtime fixes and actual interaction acceptance belong to their own source/build identity. This review does not claim end-to-end hot switching has passed.
