# B: exact male-jaw hairstyle fit runtime candidate

Base runtime: `026ab2013ee94a6eb72cbe5f5e8c347c49b65431`. No shared main/public pointer or motion-controller change.

The canonical male short-hair GLB is unchanged (`fb5fd49352b7bab0e6d2c0ec3f6e565f0004062e4a8975f1afcd93fb24dd48fd`). The new jaw body uses an independently pinned `character-hair-fit-v1` file and raw-head-bind-local TRS. Original female/male attachments retain their historical implicit head-local semantics, identified honestly by their exact manifest hash rather than a fabricated fit hash. Source re-export normal difference remains in the source report; the re-export does not replace the canonical GLB.

## Contract

`appearance.set({hairStyle, expectedHairFit?, expectedHairAssetSha256?, ...colors})` validates optional expectations before revision/color changes, including cache hits. Omitted expectations are ordinary UI selection; explicit null is strict. Replacement requests validate fetched manifest, fit and GLB bytes before committing their requested colors. A newer independent color request wins over an older pending request. Style generation continues to protect reset and newer style choices.

State exposes `hairFit`: null for original/none; `{kind:'legacy-head-local-v1',manifestSha256}` for historical attachments; `{kind:'explicit-fit-v1',id,version,sha256}` for the new jaw fit. v6 captures this identity. v1–v5 retain previous geometry/palette behavior and admit only historical implicit attachments; they reject a smuggled hairFit or a jaw replacement lacking explicit fit. v6 requires hairFit and validates its exact field set. Restoration and rollback pass both actual asset and fit identities.

Only exact target entries are selectable. The loader checks head attachment, single rigid mesh, source material and independent hair-mesh hiding scope. It never hides Body or facial meshes. Fit TRS is applied to the loaded attachment root before parenting to the raw head. MToon surface and legitimate generated outline materials are cloned per instance. Reset/none retain originals and cached replacement ownership; dispose releases the owned replacement and restores original visibility/material references.

## CPU evidence

`cpu-3/report.json`: 39 passing checks using production appearance/recipe modules and exact source bytes. Real GLB arrays and real MToon materials are used; image decoding/WebGL are explicitly not tested. Recipe geometry/equipment are declared transaction fixtures. The legacy v1–v5 cases are neutral-geometry legal fixtures, not a replay of all historical four-domain expressions. QA will separately read existing real v5 files in the browser.

Cases cover pinned source, exact body/fit/version/hash/TRS/hiding, wrong requests before state mutation, corrupt fetched bytes and retry, shared GLB with separate instance materials/fit, cancellation/reset/new color, delayed dispose, fresh-instance v6 roundtrip, old formats, invalid identity, file-read cancellation and rollback.

`cpu-1` is the initial 37-case snapshot. `cpu-2/failure.json` preserves the outline test's fixture mistake: MeshBasicMaterial does not copy an ad-hoc isOutline property. The fixture was corrected to the actual MToonMaterial type; product code was not changed to compensate for that assertion. Both original source HAIR materials declare outline mode 0; the normal MToon outline path is nevertheless checked.

Run from a checkout with locked dependencies installed:

```
node scripts/m2-male-jaw-hair-runtime-v1/check.mjs <new-evidence-directory>
```

The output directory must not already exist. Runtime product files and the executed script are captured with exact SHA. GPU/files/normal-speed observations remain separate and pending; these CPU results are not visual acceptance.
