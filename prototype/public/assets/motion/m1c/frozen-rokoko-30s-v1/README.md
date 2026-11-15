# Frozen 30-second target dance

These four files are exact copies of the already archived target animation data. They are not a new export, retarget, optimization, or validation of arbitrary characters.

The workbench default is `rokoko-5359146-30s-v1` (original). `rokoko-5359146-30s-arm-local-v1` is the sole permitted, frozen arm adjustment and remains a comparison, not an automatically accepted replacement. The prior two UAL dance entries remain available and unchanged as data. `workbenchDefaultDanceId` is manifest metadata for the workbench UI; the existing runtime loader does not independently change the selected dance from this field.

Only original female SHA `027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95` and original male SHA `62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff` have variants. The normalized loader selects exact identity, checks file SHA and the embedded avatar identity, and does not perform another source-rig conversion. Existing female body variants and the new male jaw are deliberately unsupported. Full-body playback requires props stowed, local reserved space, and ends at 30 seconds before the existing idle transition.

## Rebuild / verify

From the repository root, after `npm ci --prefix prototype`:

```powershell
node scripts/install-frozen-dance-workbench.mjs
node scripts/install-frozen-dance-workbench.mjs --verify
```

The installer only decompresses the committed original target JSON gzip and copies the committed arm-adjusted target JSON. All four whole-file SHA values are pinned before any output is written. Existing outputs with different bytes are rejected. `install-receipt.json` records compressed input hashes, uncompressed target/output hashes, track hashes, preserved entry identities and actual normalized-loader checks. Verification is read-only. No private archive, raw FBX, source video, cloud call or re-optimization is required for this installation.

## Source / permission boundary

Reference: Pexels / Sergey Makashin / 5359146, Pexels License **not CC0**. Provider: the already authorized single Rokoko Studio 2.6.2 trial. The repository's `evidence/rokoko-30s-advisor-v1/PUBLIC-SOURCE-NOTE.md` and `USER-REVIEW.json` preserve the provenance and narrow acceptance. This package uses already committed project target results; it does not add a new purchase or service call, nor establish formal commercial asset clearance, permission for a batch API, or ownership of the referenced motion. The manifest's historical top-level CC0 text belongs to the UAL entries only.

No original real-person footage, reference stills, original FBX, private provider archive or account record is included here. Do not add those to public resources. Future commercial distribution still follows source/provider rights; copying these files is not a new licensing determination.

## Validation scope

Four files are byte-identical to their frozen counterparts; actual `parseNormalizedMotion` accepts their tracks, rejects wrong avatar identity, and gives all four clips distinct runtime UUIDs. Derived bodies have no matching variants. This is an asset/install check, not new browser playback or visual acceptance. The original user approval applies to its recorded 30-second example; arm contact, cloth, feet and ordinary-PC performance limitations remain. The optimized result retains recorded residual contact defects and must not be adjusted again in this task.
