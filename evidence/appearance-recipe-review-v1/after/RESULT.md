# Revised recipe transaction: independent CPU verification

Revised actual recipe SHA: `9da6b7902fb3ce1eb54a57bc60d588703ffd59a104b1d30dd46393dcf294f09c`. This includes the subsequent rollback-await ownership check. Exact files are preserved in `source-tested/`; hashes for all five touched components are in `report.json`. The original review/failure report in the parent directory remains unchanged.

**The three original counterexamples are fixed in the tested revision:**

- A newer outfit API selection remains selected when an earlier draft finishes. The workbench also now disables the actual outfit buttons during its busy interval.
- A newer same-actor appearance request supersedes a restore without the old restore rolling back the winner.
- If an outfit command assigns its state then throws, rollback includes the outfit. If the rollback's UI operation also throws, the returned error explicitly says outfit rollback was incomplete, rather than claiming the prior appearance is fully retained.

Additional tested ownership boundary: switch actors while awaiting rollback → cancelled result; no outfit command runs on the new actor. The second actor's chosen outfit remains unchanged. This verifies the newly added post-await actor/revision check.

**Saved version checks:** the fixture uses the actual `foundation-avatar.js` equipment getter and the installed male equipment manifest. Saved top/shoes/pants entries include their GLB identity and binding data and are independently cloned. JSON save/read roundtrip validates. Changed GLB SHA, changed inverse-bind entry, or missing resource snapshot each rejects before any appearance/geometry/outfit mutation. Wrong body identity and wrong geometric recipe version also reject and retain the tested state. Legacy drafts lacking the new resources field reject explicitly; this does not constitute automatic draft migration.

The revised workbench source now automatically calls `restoreDraft(true)` after successful page-local body selection, in addition to initial binding. Its actual UI behavior belongs to root/QA browser verification; this review only asserts the wiring and does not claim a browser click test.

Command: `node evidence/appearance-recipe-review-v1/after/check.mjs` — 12 recorded cases pass (11 function/fixture cases plus one source-wiring case). The script imports the actual recipe functions and executes the actual equipment getter; avatar/async transport/controller calls are bounded fixtures. No GPU, browser, full M1 or dance tests were run, and no product source was edited.

This result addresses transaction correctness, not editing latency or normal/shader quality. The separately measured mouth-width update stall remains a distinct performance issue owned by root.
