# Independent recovery v2 retest

No new blocker was found in this bounded CPU retest. Tested main.js SHA256 `cd075d9a683cf1828782f7b6aea0e1bcf6adb4c79d5f6a9e57cabe063e08e7c3`.

The original shallow-wall counterexample was replayed unchanged for both direct go and behavior walk. Each now performs one collision recovery, uses the existing pivot, then reaches its destination within the existing 18mm arrival tolerance. The task completes at 2.7666666666666595 simulation seconds. Every simulated movement segment is unblocked and lineClear. The preserved v1 source still performs 1200 stationary recoveries in ten seconds with exactly the same input.

The recovery-only turn condition uses `dist > .10 && abs(angle) > .06`, exactly matching the along-facing movement condition. The ordinary stationary-turn threshold remains .27. A test-only removal of the recovery pivot confirms that the second stationary collision terminates the real simulation loop with failed task reason `path-recovery-no-progress`.

Explicit branch checks verify same-goal net motion of 0 and .49mm terminates, while .51mm and 10mm permits another recovery. The guard intentionally treats sub-.5mm net movement as no progress. These tests establish the specified threshold behavior, and do not prove that every mathematically viable path will succeed. Explicit go resets the old recovery record. A no-progress sit clears target/afterWalk, fails the task and releases its reserved seat. A new sit request then follows the actual controller route to completed/occupied within twenty simulation seconds.

An open-space route was compared against the independent v1 snapshot for all 960 simulation substeps. Position, yaw and speed are exactly equal, with trace SHA256 `47da32f7b04a9baa4b008bfa9655eacf15e79dda800d96ae43fb65d3ffec87c8`.

The six checks execute actual main.js navigation and CharacterScene plus real task, turn and lease modules. The motion implementation remains the author's minimal CPU fixture. The progress-threshold and reserved-seat branch tests call recovery explicitly, while the original counterexample and injected missing-pivot case reach recovery through real collision vetoes. This is not VRM gait, foot contact, visual acceptance or a proof of arbitrary dynamic-obstacle liveness. No browser, GPU, desktop or runtime edits were used.

The old independent v1 failure and the author's v2 results were preserved. `result.json` records input hashes and observations, `main.snapshot.js` preserves the tested runtime bytes, and `probe.mjs` is the executed independent test. Requested gpt-6.1-sol/high was retained. Actual provider configuration and Hook interception were not independently observable.
