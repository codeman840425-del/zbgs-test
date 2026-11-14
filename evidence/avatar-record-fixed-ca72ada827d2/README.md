# Local avatar record contract — fixed ca72ada827d2

Actual fixed-room browser verification passed for the final female and male body resources. This is a **QA contract adapter**, not an implemented game save feature or permanent business actor registry. No production source was changed.

`report.json` contains the original record, localStorage-read record, applied-result record, actual appearance states, fixed-build guards and resource receipts for both bodies. Each page was closed, then a new page opened in the same browser context and same temporary origin. The new page first loaded the compatible body normally; the adapter validated the complete saved record and pinned assets before applying the existing avatar outfit/accessory APIs.

Observed results:

- Both records and restored appearances matched exactly: female skirt outfit, male pants outfit, microphone and glasses. Actual visible fit IDs, body IDs and resource SHA256 values were compared, not just outfit labels. All 9 female / 8 male resources (body, manifests, fits, accessories) were hash checked on both openings.
- Each QA UUID remained unchanged; appearanceRevision was explicitly advanced from 1 to 2 and restored as 2. The actual runtime owner remained `room-primary`; the adapter does not relabel it as a permanent business identity.
- The save-time transient expression was `happy`; the reopened and restored character remained `neutral`. No expression, blink, vowel weight, gaze or motion state was saved as appearance.
- Twenty browser rejection cases passed, ten per body: unknown body ID, body SHA, fit ID, fit SHA, style ID, accessory SHA, manifest SHA, schema version, expression leak and opposite-body record. All were rejected before applying appearance, and the visible/loaded appearance snapshot stayed unchanged.
- Zero page errors. Pure Node contract checks also passed 28 cases, including invalid revision, duplicate equipment and unknown root fields. See `../avatar-record-contract-node.json`.

The final F/M body SHA values are respectively `027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95` and `62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff`.

`female-record.json` and `male-record.json` are the actual captured records, not invented templates. The style mapping and precise fit identities live in `schemas/fixtures/avatar-record-catalog-v1.json`; hash pins for the executed scripts and fixture are preserved here. Current body/appearance parameters are empty because no runtime parameter editor is claimed; the final resource itself carries the current baked result. Fit/profile identity is pinned, not inferred from identity gender.

Screenshots were inspected and show the restored actual skirt/pants and both accessories. The QA adapter deliberately uses the existing avatar API, without adding UI integration: the female page's outfit selection highlight remains the default pants highlight even though the actual avatar and bottom scene status show skirt. This is a known harness/UI separation, **not** proof of a complete product save/restore user flow. A future product integration must synchronize controller/UI selection as well.

Reproduce from the project root:

```powershell
node scripts/qa-avatar-record-contract.mjs
node scripts/run-fixed-check.cjs experiments/m1-ca72ada827d2/dist scripts/qa-avatar-record.cjs ca72ada827d2
```

The temporary server and browser were closed after the run. This test does not establish browser-process restart persistence, a production save button/auto-save, account storage, business state, cross-version migration, arbitrary outfits/parameters, generated identity assignment or compatibility with untested bodies.
