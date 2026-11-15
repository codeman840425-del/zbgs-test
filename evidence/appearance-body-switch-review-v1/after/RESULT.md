# Transaction repair regression

Product edit: only `prototype/src/main.js`. Reviewed/tested full-file SHA256: `a060354811ff76d1136b04b6370794ec1f616945781db86696e943f445719672`.

The original failure evidence remains unchanged in the parent directory. `check-after.mjs` records this revision separately in `after/`.

The next actor now finishes motion reset, zero-time pose evaluation, avatar update, world matrices, secondary reset, garment update and dance selection before changing the current actor or any controller state. Attachment remains owned by preparation locals until it succeeds. No `controller.reset()` runs during body selection.

After ownership transfer, controller command state is cleared explicitly: active execution/deferred request, path/target/afterWalk/seat alignment/path turn, sequence/index/time, mode/action/time, turn state, speed/distance, seat token and pending pointer click. The old behavior tasks are cancelled with `body-replaced`, after clearing their executing identity so their cancellation callbacks cannot pose the new actor. Seat leases are released. Old motion and avatar disposal run independently. Simulation clock, desired speed/locomotion intent, pause, playback rate, camera and background state remain preserved. The new root uses the saved location/yaw, or the new actor's chair-approach position for a seated switch.

Post-commit cleanup and presentation failures produce an applied result with a warning notice and do not prevent the remaining cleanup steps. They do not claim the old character was retained. Outfit visibility/labels and `aria-pressed` now synchronize together.

## Executed checks

`node evidence/appearance-body-switch-review-v1/check-after.mjs`: **15 scenarios passed**.

- Load, motion update, avatar update, garment, secondary reset, dance selection and attachment exceptions retain the old visible actor, old path/task and cleanup the prepared actor.
- UI, helper and old-motion disposal exceptions retain the successfully committed new actor and continue other cleanup, reporting applied-with-notice.
- Successful fallback changes the selected outfit button; colors, camera, desired speed, pause, multiplier and simulation clock are preserved.
- Seated replacement uses the new approach position and clears its old seat lease.
- A newer selection of the current actor cancels pending load at each of the three asynchronous preparation boundaries; stale prepared objects are disposed and old active tasks remain intact.

`node --check prototype/src/main.js` passed.

Tests execute the actual extracted production switch/sync functions and real behavior-tasks module. Scene, avatar/motion, controller fields and DOM are explicit fixtures. These are transaction/state regressions, not a browser or animation acceptance result. Actual GPU hot switching and UI interaction remain for root/QA. No browser, build or GPU work was started here.
