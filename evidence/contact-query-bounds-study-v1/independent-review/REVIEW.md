# Independent review — 900efdf24c88

**Blocking result: the new AABB predicate can remove an old nonnull interval. Keep this candidate unmerged as a strict-equivalence optimization.** No candidate/source/runtime file was edited. No browser/GPU/Blender/performance run occurred.

Candidate helper SHA256: `87a533cb5f807815e7ee3d436989f01b13bfd0b461d5de72eeb1de6309e60201`, checked against both frozen `.mjs` and the isolated actual `.js`. QA's 8160 real rails/33626 old nonnull records remain valid evidence for that fixture; this review does not contradict those observed samples.

## Concrete counterexample

Independent deterministic direct predicate-versus-old-interval test stopped at check413, configuration206, with no parameter retry. `result.json` preserves exact doubles and generator seed. The projected triangle is thin and oblique but **passes all candidate guards**. The rail lies about2µm above triangle maxV; candidate margin is about1µm and rejects it.

Old prepared interval returns:

- lo = .09168085466425932
- hi = .0916808543905026
- lo−hi ≈2.73757e−10, so the existing `lo > hi + 1e−9` rejection does not fire.

The denominator is1.480546969203321e−8 and span≈.10834m; it is larger than the current span²×1e−6 threshold, so this is not routed to fallback. This is a numerical **semantic** gap: old tolerance retains a short inverted interval near a thin wedge tip. A strict geometric AABB plus constant1µm margin does not cover every interval accepted by the old algorithm. It is not justified to call the optimization equivalent merely because the old hit is geometrically outside the exact triangle.

`reproduce-failure.mjs` then confirms the exact witness through actual old/new workspace cell queries. Old candidate count1, new0. With triangle z=.02m, outward+Z, rail depth0 and opaque visibility, the unchanged five affine samples give clearance.02800000000014552m before,0 after. This is a synthetic reproducible behavioral difference, **not an observed character/frame failure or real penetration**.

The same geometry translated from near(99,−98) to the origin yields identical old interval and difference. Therefore merely restricting scene translations below100 does not explain away this witness. Thin 2D projections can occur from edge-on 3D faces, although this exact case has not been found in the real captured fixture.

## Cache / state review

The additions otherwise have a sensible lifecycle under the current caller:

- Triangle bounds are recomputed on every build after the same projection/interval constants; unsupported inputs first clear valid, so stale min/max values cannot be used.
- Rail bounds are recomputed per query in instance-local storage, likewise clear valid first.
- candidateStamp assignment still occurs before filtering; retained candidates preserve old discovery order and dedup semantics.
- Existing skin workspace and projected workspace are actor-local in createMotion. No new cached skin position, surface result, outward clearance or cross-frame acceptance was introduced.
- Nonfinite/oversized predicate fallback does **not** make the old cell-loop code safe for arbitrary Infinity geometry; it only preserves old behavior. This was already an old-path limitation, not a new bounds regression.
- Reusing triangle objects across independent projected workspaces could share candidateStamp; this is an existing ownership contract, not introduced here. Current caller has its own skin/projected workspace per actor.

I found no separate new repeated-build state defect in the added code. The independent executable's planned rebuild tests were intentionally **not executed** after the first blocking numeric counterexample; `rebuilds: []` must not be represented as passing independent state tests. QA's existing storage-invalidated checks were read, not relabelled as new independent execution.

## Decision / narrow next requirement

Stop this candidate as requested; no margin/condition threshold sweep, no interval change, no physical tolerance relaxation. To revive this direction later, a new guard would need an explicit conservative relationship to the old interval's lo/hi and barycentric tolerances, conditioning and rail length, or a proven fallback for unsupported thin projections. Changing old narrow-phase semantics would be a separate behavior fix, not this performance-only equivalence claim. No implementation proposal was applied.

Reproduce:

```powershell
node evidence/contact-query-bounds-study-v1/independent-review/reproduce-failure.mjs
```

This succeeds when the preserved failure is reproduced. `check.mjs` intentionally exits1 at the first discarded old nonnull; the report's `passed:false` is the actual review result, not a failed test harness. Original script, numerical witness, workspace witness and hashes are archived here. Shared runtime remains untouched; root owns integration/candidate disposition.
