# One bounded equivalent-alpha experiment

Status: isolated, not integrated or accepted. The rejected `83accb29be4b` fixed build and its timings remain unchanged.

Measured reason to try: original exact-hand candidate spends about 5.876 ms/substep in rail/alpha queries, with roughly 109,398 triangle candidates. The seated normal-playback rAF P95 was 58.6 ms, six substeps/frame. Geometry improvement does not justify this regression.

This experiment retains all source poses, 80 forearm rails, 164–212 exact hand rails, five solver rounds, the same contact margins, per-substep actual skin refresh, and reference alpha lookup on a proof miss. It does not simplify contours or reduce detection frequency.

## Conservative proof

- A controller-local immutable alpha snapshot is scanned completely once. An integer summed-area table counts every pixel rejected by the exact old `alphaByte / 255 >= cutoff` predicate. No sampled opacity guess.
- Each freshly skinned triangle gets a world AABB. Outward intervals propagate that box through the same arithmetic order as reference barycentrics and UV evaluation. Pixel floor/clamp/flip uses the resulting conservative interval.
- Only a rectangle containing zero rejected pixels is eligible. The actual hit must also lie inside the exact proven world box. Floating-point hits even slightly outside that box fall back.
- Exact degeneracy, nonfinite inputs and ill-conditioned geometry remain on the original path. The conditioning guard only disables optimization; it never changes collision/alpha acceptance.
- Texture alpha snapshot bytes are immutable, matching the existing `fitSeatHands.alphaCache` lifetime. This is not a general cache for mutable images. Pose-dependent bounds are rebuilt every substep.
- False-negative proof failures are allowed and may make this experiment unhelpful. Runtime preparation/scanning costs must be included, not hidden under original skin sampling.

`source/opaque-alpha-proof.mjs` is the helper; `scripts/make-alpha-patch.py` emits a local patch from exact saved 83 motion bytes. The baseline package and its original manifest are preserved. Query `handAlpha=legacy` is intended to switch only this proof off inside the same build, not to change body identity or hand geometry.

## Validation sequence

1. Independent review of interval arithmetic, degenerate behavior and cache lifetime.
2. `python assets-source/hand-contact-v1/scripts/extract-alpha-fixture.py`
3. `node assets-source/hand-contact-v1/scripts/qa-alpha-proof.mjs assets-source/hand-contact-v1/evidence/alpha-texture.json`
4. `python assets-source/hand-contact-v1/scripts/make-alpha-patch.py`; install only into the isolated worktree after exact 83 raw hash verification. Never overwrite its fixed dist.
5. Same-build 270-pose lap/authored optimization-off/on comparison; independent final raw skin × displayed skirt gate. Query equivalence is not enough.
6. Serial no-recording cost on the development PC, including preparation and long-frame/substep feedback. If it still fails, stop this branch rather than adding another cache/solver layer.

No continuous visual or target-device pass is implied by these checks.
