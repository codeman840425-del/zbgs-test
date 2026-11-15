# Independent review — 6fb6c051aacd

No blocking defect found in the new guarded half-plane short circuit under the current product call contract. This supports proceeding to root's actual state-equivalence and adjacent performance checks; it is not a measured speedup, visual acceptance, or permission to change clipping tolerances. The rejected 900efdf24c88 AABB candidate remains rejected. This review changed no candidate, runtime, baseline or existing evidence, and used no browser/GPU/performance run.

Reviewed helper SHA256: `7323344102f54dc6248e57a233e7e50e316febefeb0d1911f74ba1ec99d4a2c8`, identical between isolated actual source and frozen candidate module. Base helper SHA256: `e33830b3aebdad8ddec33fe43b7daef4e698f1d6684a6ff730092918e69bead7` (038). The fallback body was compared with the original prepared-interval body. The surrounding grid construction/query, triangle ordering and alpha helpers are unchanged.

## Finite-domain reasoning

Let `L = 2^100`. A true prepared guard means all seven cached constants are finite and have absolute value at most L. The per-query comparisons also reject NaN/Infinity and bound all four endpoints by L. Before division, the unchanged denominator check returns null when `abs(den) < 1e-12`; on the remaining guarded path, `abs(den) >= 1e-12 > 2^-40`.

- Each endpoint-minus-origin difference is at most `2^101`; each product is at most `2^201`; each two-product sum is at most `2^202`.
- Each first/second barycentric coordinate is below `2^242`. A conservative rounding-inclusive bound of `2^244` covers the third coordinate, and `2^245` covers the endpoint delta.
- The clip ratio is evaluated only when `abs(delta) >= 1e-12 > 2^-40`; a conservative `2^285` bound covers it. These values are far below binary64 overflow. Underflow to signed zero does not create NaN or violate the branches.

Thus future constraints cannot introduce NaN. Each update is the original `Math.max(lo, ratio)` or `Math.min(hi, ratio)`, so lo is nondecreasing and hi is nonincreasing. Floating-point addition by the fixed `1e-9` is monotone on these finite values, so an already true `lo > hi + 1e-9` cannot become false later. Retaining this exact predicate is essential: the old algorithm deliberately retains some tiny inverted intervals. A later parallel-outside test also only returns null; it cannot restore a rejected interval.

These are bounds on the **prepared constants**, which is sufficient: the original vertices themselves need not pass a new geometry tolerance. Constants may overflow during prepare; in that case the guard is false and the exact old path runs. The new guard is not a new intersection/contact tolerance.

## Floating semantics and fallback

On the finite path each scalar formula preserves its original subtraction, multiplication, addition and division order. Endpoint scalar evaluations move relative to other independent scalar evaluations, with no changed reciprocal or fused expression. Nonnull paths compute all six barycentric entries and apply the same three clipping steps, final clamp and returned object identity. Independent checks use strict deep equality, including NaN and signed-zero semantics, not numerical tolerances.

Missing guard, false guard, nonfinite endpoints and out-of-domain endpoints call the original fallback for the **whole query**. This preserves even old NaN-valued nonnull behavior and null-path scratch writes. It is not a repair of unsupported geometry. An external caller that passes old seven-value arrays without the new property stays on that path. The claimed contract does not cover a caller fraudulently setting a stale `finiteClipArithmetic=true` after mutating constants, nor exotic accessor/aliased arrays with evaluation side effects; the current factory supplies ordinary independent arrays and only prepare writes these constants.

## Lifecycle and scratch boundary

`prepareProjectedInterval` first clears `out.finiteClipArithmetic`, overwrites all seven numeric entries, then recomputes the guard. Current build calls it for every projected triangle on every build, using that build's fresh projection. No rail result, clearance or cross-frame acceptance is cached. Repeated prepare was exercised on the same array through valid → oversized → NaN → degenerate → valid. Degenerate finite constants may have a true arithmetic guard, but the unchanged denominator test still returns null. A separate actual workspace build mutated points, deliberately falsified the cached guard, rebuilt the same triangle/array, and verified newly prepared values and a successful query.

**Null scratch is intentionally not identical.** For a miss after the first half-plane, the new code leaves later scratch slots from a prior query; the old code computed them first. `result.json` records an actual difference. Current `motion.js:1037` obtains the interval and immediately executes `if (!interval) continue`; the six barycentric values are read only afterward. The actor-local scratch is created at line 868, and there is only this one product call. A miss followed by a hit on the same scratch was independently checked: the hit fully rewrites and exactly matches old output. This is observational equivalence for that caller, not an exported function guarantee that all null-path side effects are identical. A future consumer reading scratch after null requires a new review.

## Executed bounded checks

`check.mjs` performed 30 independent direct checks, not a repeat of the large captured-fixture matrix: ordinary hit/crossing, first/second-plane rejection, parallel and zero-length rails, signed zero, edge/near-edge, reversed winding, denominator below/at cutoff, degeneracy, two synthetic maximum finite-domain constant cases, missing guard, NaN/Infinity, one-ULP-outside limit, overflowed prepare and guard invalidation/recovery. Unsupported cases compare full scratch as well as returned status/output. All passed.

The saved thin-wedge witness and its origin-rebased equivalent were additionally run through actual old/new projected workspaces and the original five affine depth samples. Both retain one candidate, the exact nonnull interval `lo=.09168085466425932`, `hi=.0916808543905026`, and clearance `.02800000000014552` m. The previous AABB failure is therefore not reproduced by this new predicate. This is a synthetic numerical regression check, not an observed avatar/frame contact.

No additional whole-state or runtime cost conclusion follows from these checks. The endpoint bound checks, new per-plane branches and guard bookkeeping have a cost that only the arranged matched run can assess. Root's actual actor-state equality and performance acceptance remain outstanding.

Reproduce from the repository root:

```powershell
node evidence/contact-query-shortcircuit-study-v1/independent-review/check.mjs
```

The script checks the actual candidate source hash before importing its byte-identical frozen module. It requires the already locked Three module for the two synthetic workspace cases. Results and their hashes are stored beside this report; no candidate source is rewritten.
