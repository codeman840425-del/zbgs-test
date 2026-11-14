# Unified fixed checks: 1791ba8f0563

Each browser check used a temporary server over `experiments/m1-1791ba8f0563/dist`, closed at completion. Runtime and served build digests and actual primary model bytes were verified before/after. These are actual room/VRM observations, not source-only approvals. No hardware performance benchmark was performed.

## Confirmed within tested scope

- Real room task chain and seat lifecycle: 19 checks pass, including accepted/queued execution, completion exactly once, same-chair contention, approach cancellation, cancellation while sitting, simulation timeout, physical exit release, and destruction of the seated peer. A completed sit task retains its occupied lease.
- Male+female and male+male instance checks: no shared bone, skeleton, geometry, material, texture or morph-array references; changing one instance's action/face/visibility does not change the other. Config objects are distinct, and changing one fit offset does not affect its peer. Disposal leaves the primary resources intact. These are two-instance checks, not a crowd-performance result.
- Twelve local-variant base/pants × three-chair sit/stand cases complete without observed interior chair vertices. New jaw pants seat gap is approximately +0.654 mm; waist/hip pants +0.717 mm. They improve on the prior fixed build's 5 mm penetrations. The response is not perfectly linear: initial two-point estimates targeted 1 mm, but actual final margins are smaller. Sampled shoe minimum remains about −1.418 mm and is not reported as perfect grounding.
- The jaw specimen still differs from the original female at 589 of 2055 referenced face points, maximum 4.472 mm; the waist/hip specimen's face points remain identical. AA/happy weights .65 drive actual morphs; naturally advancing blink reaches over .98. Reviewed close screenshots show mouth opening, smile and closed eyelids without a newly evident face split in these views.
- Static world-left/center/right gaze targets change actual raw eye rotations and produce small visible pupil movement in the close front images. This is static eye tracking only: full gaze-transition smoothness, head aiming, arbitrary target ranges and synchronized speech are not passed by these screenshots.

## Confirmed failure: partial peer load cleanup

`qa-m1-load-failure.cjs` injected HTTP503 only for the female peer's equipment manifest after the primary male was ready. The promise rejected and the primary remained usable, but scene avatar roots changed from one to two. Removing a later successfully loaded peer still left the failed partial root. This is a reproducible lifecycle defect, so the unified build is not globally approved.

The factory adds its root to the scene before awaiting equipment. If that await fails, `loadFoundationAvatar` never returns its avatar handle; the caller's catch cannot dispose that root. Factory-owned partial resources need cleanup on failure. The evidence here must remain marked failed even when a later build fixes it. Only one failure-injection site was exercised; this does not prove all network/parse/resource errors are handled.

## Geometry-method reuse for a male specimen

The reusable part is the pipeline: preserve original source; apply a bounded spatial displacement to the Basis and the same displacement to every relevant expression target; retain topology/UV/weights/rest skeleton; export exact identity and bindings; rebuild matching garments; measure real posed skin/shoe/seat surfaces; then render neutral/expression/gaze and complete motions. The current male source is real Base_Male and already has its own body, shoes, leg proportions and independently measured trouser-seat fit.

Female jaw and waist/hip parameters cannot be declared male-ready. Their masks use female-specific coordinates, landmarks and face/body topology. Male has a different face target inventory (54 original targets), clothing geometry and dimensions. A male local edit needs its own selected landmarks/masks, preservation checks across all male targets, regenerated matching equipment IDs/inverse-bind pins, per-body seat/foot/hand clearances and actual room views. The two female variants and the existing unedited male runtime do not count as a male geometry-edit acceptance. Likewise, the current small edits are not a continuous body-slider library or universal clothing adaptation.

## Reproduction

Run each with the same immutable dist and build ID:

```powershell
node scripts/run-fixed-check.cjs experiments/m1-1791ba8f0563/dist scripts/qa-room-behavior-tasks.cjs 1791ba8f0563
node scripts/run-fixed-check.cjs experiments/m1-1791ba8f0563/dist scripts/qa-m1b-isolation.cjs 1791ba8f0563
node scripts/run-fixed-check.cjs experiments/m1-1791ba8f0563/dist scripts/qa-m1-load-failure.cjs 1791ba8f0563
node scripts/run-fixed-check.cjs experiments/m1-1791ba8f0563/dist scripts/qa-m1-variant-contacts.cjs 1791ba8f0563
node scripts/run-fixed-check.cjs experiments/m1-1791ba8f0563/dist scripts/qa-m1-variant-faces.cjs 1791ba8f0563
```

The failure-injection script is expected to exit nonzero on this build. Reports here retain exact identities and compact evidence; full frame/face data remains under `output/playwright/m1/1791ba8f0563`. CPU vertex-to-box probes do not establish absence of triangle or swept collisions. Selected static images do not replace complete normal-speed action recordings.
