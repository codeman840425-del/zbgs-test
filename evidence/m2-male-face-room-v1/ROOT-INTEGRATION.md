# Root integration receipt

M1 release remains **77e46efb5441 / 4195**. This M2 specimen is a separate fixed candidate **3016fadd5864**, source commit **149f2d3b6084fd0cf3d9bb53a9a8a9b9d437d85f**. It is not a new release or an accepted art style.

The only runtime-source change is a profile entry in `prototype/src/foundation-profiles.js`. Three new assets supply the real derived male VRM, a body-specific forearm bundle and an equipment compatibility manifest. No walking, sitting, expression or clothing solver was changed. `scripts/install-m2-male-face.mjs` validates the source receipts before installation; executing it again left the profile bytes unchanged.

Equipment admission follows independently verified unchanged Body geometry, skeleton and bindings, with new fit identities. It is not a substituted parent avatar hash. The actual room loads the new hash, uses the existing male clothes, and rejects unadapted microphone/glasses fits. The original male and M1 fixed dist remain unchanged.

Fresh checkout of 149f2d3, npm ci and build produced **68 identical files**, including the exact recorded build identity. See `evidence/rebuild-3016-149f2d3/report.json`. Build command from prototype:

```powershell
npm ci
npm run build -- --outDir ../experiments/m2-male-face-v1/dist
```

This can be served on a free loopback port from that dist; query `?body=male` for the original and `?body=m2-male-jaw-v1` for the specimen. No additional permanent server was started for M2; the review page and videos use the existing evidence server on 4174.

Root additionally viewed the paired neutral front, AA side and closed-eye front renders. The local jaw change is subtle; no new visible eye/mouth separation was identified in those six images. QA viewed all 24 expression images and the full-duration 2fps action samples. These are scoped engineering observations, not continuous human aesthetic acceptance. Source geometry audit, task completion, recorded 1x video and ordinary-PC performance remain distinct conclusions.

Source/rebuild inputs and scripts are retained under `assets-source/m2-male-face-v1` and `scripts/m2-male-face-v1`; production tool versions and source licensing are recorded there. This proves one small male geometry-edit/export/load workflow, not a complete face editor or arbitrary character compatibility.
