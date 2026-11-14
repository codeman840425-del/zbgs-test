# Cleanup regression: a3f0c319f4f6

The earlier fixed build `1791ba8f0563` failed peer equipment-load cleanup. The new fixed build was tested on fresh temporary servers, with actual primary VRM and runtime/served build hashes checked before and after every run. All Chrome instances and temporary servers were closed after testing.

Actual fixed-runtime results:

- Injected female peer equipment-manifest HTTP503: the promise rejects, scene avatar-root count remains one, and the primary male stays attached. Removing the fault permits a successful peer retry; removing that peer returns to one root. All five cleanup checks pass. This tests one failure point, not every possible loader/driver failure or GPU memory reclamation.
- The 19 actual room task/seat checks pass again: stable request results, queued execution, one terminal event, contention, cancellation/timeout, occupied-seat retention at sit completion, physical exit release and peer destruction.
- Male+female and male+male isolation pass again: resource references and per-instance configuration are separate; face/action/visibility changes remain local; peer disposal does not dispose primary resources. These are real room checks, not a source-only result.

Reproduce from this immutable candidate, one command at a time:

```powershell
node scripts/run-fixed-check.cjs experiments/m1-a3f0c319f4f6/dist scripts/qa-m1-load-failure.cjs a3f0c319f4f6
node scripts/run-fixed-check.cjs experiments/m1-a3f0c319f4f6/dist scripts/qa-room-behavior-tasks.cjs a3f0c319f4f6
node scripts/run-fixed-check.cjs experiments/m1-a3f0c319f4f6/dist scripts/qa-m1b-isolation.cjs a3f0c319f4f6
```

Each script requires an explicit URL/build, verifies live identity, writes a new output directory and exits nonzero on a failed check. `run-fixed-check.cjs` supplies an OS-assigned loopback port and closes it with the child script; no persistent QA server is required. `provenance.json` pins the QA scripts and independently compares frozen model/GLB/JSON asset bytes between these two candidates.

Full face/gaze and variant three-chair collection was **not repeated** on this cleanup candidate. Those observations remain labeled `1791ba8f0563` in `evidence/unified-fixed-1791ba8f0563`. The chief scoped this patch to loader-failure cleanup; recorded workspace-source differences provide context, not proof of the served JavaScript source. Frozen asset comparison does not by itself transfer visual acceptance. Performance, full normal-speed playback and broader product acceptance remain separate checks owned by the chief.
