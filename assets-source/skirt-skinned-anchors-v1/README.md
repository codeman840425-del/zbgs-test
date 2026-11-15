# Skinned attachment-band correction

Apply the four source files in this directory to prototype/src at the recorded
base commit, then `npm ci` and `npm run build` in prototype. Expected source build:
7e24e01556ad. These are snapshots of the executed candidate, not an original art
project. Existing source GLBs and editable art remain unchanged.

`node scripts/qa-skirt-skinned-anchors.mjs` checks actual factory skinning and
known/unknown fits. `qa-skirt-anchor-chain.cjs` compares all fixed render points
against source skin over the actual room controller chain. Use
`node scripts/run-fixed-check.cjs <dist> <script> <build> <output>`.

The fit JSON explicitly records the three existing garment/body hash pairs and
their attachment/guide regions. This is a bounded prototype corrective, not a
general garment solver. New clothing must supply a tested fit; ordinary clothing
must not require editing the movement/sitting controller. Morphs or non-equivalent
position welds are rejected instead of losing their data silently.

The old fixed band was driven entirely by hips, discarding its authored weights.
The 259-pose full-surface follow-up still fails complete clothing acceptance.
New body pairs are entirely the original fixed waist-cap faces 0–19; this source
topology issue is separate from the corrected runtime semantics. Free hem folds,
shirt/body intersections, and ordinary-PC performance remain unapproved.
