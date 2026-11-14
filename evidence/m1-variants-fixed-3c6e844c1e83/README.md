# Fixed variant checks: 3c6e844c1e83

Two local geometry specimens were measured separately on the immutable build, not inferred from original-female acceptance. Runtime/served build digests and actual primary VRM hashes were checked before and after every profile. No page errors were recorded. No running action or performance benchmark was included.

Reproduce on the existing immutable dist (temporary server closes with each test):

```powershell
node scripts/run-fixed-check.cjs experiments/m1-3c6e844c1e83/dist scripts/qa-m1-variant-contacts.cjs 3c6e844c1e83
node scripts/run-fixed-check.cjs experiments/m1-3c6e844c1e83/dist scripts/qa-m1-variant-faces.cjs 3c6e844c1e83
```

The contact script intentionally exits nonzero for this build because real trouser vertices penetrate the seat. Twelve base/pants × default/rotated/corner sit/stand paths completed. Base body had no interior chair vertices; seated body gap was approximately +0.780 mm (jaw) and +1.025 mm (waist/hip). With each variant's initial seat thickness zero, trousers penetrated by up to 5.148 mm and 4.905 mm respectively. Sampled shoe minimum was approximately −1.384 mm; this is not zero penetration.

Independent default-chair offset0/.01 experiments measured trouser-gap response .54815 for jaw and .53429 for waist/hip. Estimated next candidates for roughly 1 mm clearance are .01121 and .01105 meters of profile offset. These are recommendations for a new fit candidate, **not changes or acceptance of this fixed build**. All three chairs and transition frames must be retested after applying a fit. A female or male fit constant was not copied.

The actual neutral rendered jaw specimen changes 589 of 2055 referenced face points versus original female; maximum head-local displacement is 4.472 mm. Mesh/material/index identity was checked before per-index comparison. The waist/hip specimen's neutral face positions are unchanged. These measurements align with an actual local jaw change rather than uniform avatar scaling.

The close screenshots share the same camera parameters. Reviewed front/side neutral, AA, happy and natural blink maxima show the narrower/lower jaw silhouette, opening mouth and closing eyelids with the original rendered skin/materials. AA/happy weights are .65; natural blink reaches over .98; actual morph arrays change. The screenshots establish functioning sampled expressions, **not a full blink-cycle recording, speech synchronization or view-target quality**. Gaze remains untested here. No new face seam was evident in these selected views; full action-loop review remains separate.

Waist/hip pants and skirt have separate front/side/back standing previews. No obvious exposed body patch appeared in the inspected static skirt views. They do not approve seated skirt contact, gait/cloth motion, arbitrary body sizes or a general morph/garment library. The seated pants screenshot is preserved alongside the failed numeric evidence; small penetration must not be dismissed because it is hard to see at room scale.

Full continuous sampled vertex/frame data stays in `output/playwright/m1/3c6e844c1e83/variant-contacts-1794686644886`; per-expression actual face points stay in `variant-faces-1794686710693`. This directory retains compact reports, identities, fit derivatives and selected reviewed screenshots for version control. The probes test actual vertices against named local boxes; they do not prove absence of triangle/swept-volume intersection.
