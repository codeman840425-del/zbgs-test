# Canonical Face source / official compact render candidate

Status: CPU passed; no GPU/build/performance/visual acceptance. Independent branch `codex/face-render-compaction`, baseline `6e4801f6f69c13af44adf7e7ceb014868cbc6631` (public460). Shadow preparation and context guard retained exactly. No NORMAL reservation, no source/motion/cloth/material/bone/recipe changes. Shared main tree and public460 untouched.

## Mechanism and ownership

Only exact original female027bed… and male62b44… are admitted. The complete VRM SHA is verified in the existing loader before this helper. Exact Face scope is the nine morph-bearing meshes and their common parent containing no other meshes. No material-name-driven geometry selection is used. The official installed `VRMUtils.removeUnnecessaryVertices` (three-vrm3.5.5 / Three0.187) receives a detached working-clone Mesh; it never receives/disposes a canonical source geometry or moves a live scene node. The utility's sorted unique old-index mapping is explicitly retained as new→old, and every remapped index is verified.

`face-render-compaction.js` keeps sourceGeometry/renderGeometry/newToOld for each mesh. `facial-geometry.js` keeps all old identity/count/index/normal/morph checks and complete-source operators on canonical geometry, and compacts each completed edited working clone with the same official utility before `prepareRender`. It does not change the normal algorithm or its full-face incident ordering. Reset returns the initial compact geometry. Source/recipe identity in getState is unchanged, not a claim of compact byte identity.

Official compaction disposes each working clone once. Editor owns/disposes edited compact geometries, including failed/cancelled staging; helper owns initial compact geometries. Actor teardown first calls editor.dispose, then helper.dispose (release compact, restore canonical), and finally the existing VRM deepDispose releases canonical. Original source geometry is never disposed during setup/edit/reset. Unknown bodies and derived jaw/waist remain on the old path.

An important initialization dependency: existing livePresentation/eye-blink compatibility must inspect canonical full-source indices and source target counts **before** compaction. Its strict source admission, protected-set checks and attachment calibration run unchanged first; compact replacement follows, then editor construction. Existing expression binding keeps the same meshes, morph dictionary/index and independent influence arrays. Runtime expression update does not re-read source index coordinates.

## Actual CPU evidence

`cpu-4/report.json` is the final executed report; its three product hashes match this candidate. `prototype/scripts/qa-face-render-compaction.mjs <NEW_OUTPUT>` is runnable from this checkout with installed dependencies; output cannot already exist. It uses actual GLTFLoader/VRMLoaderPlugin with texture placeholders, not a handmade face fixture.

- F/M each11 edit states: original, legacy mouth.025, new−.12/+.12, reset, new brow/nose/eye, all-new four-domain combination, all-legacy combination, reset.
- Every actual referenced component of all attributes and every source/edited morph is Object.is-equal after mapping, including normals, UV, skin indices/weights, normalized/gpuType metadata. All triangle entries, groups/drawRange, morphTargetsRelative and bounds match. Canonical original full buffers retain exact hashes.
- Complete registered expression sets plus mixed happy/blink/aa on the new combination: F16 and M15 cases combined31. Other edit states check happy/blink/aa/mixed. In total F56/M55 expression configurations; actual mesh.getVertexPosition (morph+skin) differences <1e-12m. Existing blink compensation targets the same real meshes and indices.
- Body/cloth/hair geometry objects, material objects, skeleton/bind matrices, dictionaries and influence arrays unchanged.
- Five rejection cases: bad canonical position/UV/index/independent morph, and wrong expected recipe SHA. No commit of rejected edits.
- Six lifecycle cases: pending reset cancellation, warm rejection, full actor disposal while pending, failed replacement preserving already-edited stable geometry, two-actor isolation, unknown/derived no-compaction path.
- All497 tracked canonical, initial compact, working clone and edited compact geometry objects disposed exactly once by test end.

Male EyeExtra's50 referenced vertices have all54 morphs numerically zero (including−0). The official utility omits those attributes. Tests require all omitted contributions=0 and actual expression/skinned output equality; this is explicitly **semantic zero equivalence, not byte equality of absent morph buffers**. Female/all other retained morph components are exact.

## Size, not measured performance

Canonical CPU originals remain for verified author operations. Face render vertices change F9×2055→2055 total, M9×2056→2056 total. At MAX_TEXTURE_SIZE>=4096, position-morph texture capacity is F16,571,520→1,841,280B, M15,987,456→1,733,184B (male all-zero EyeExtra has no texture). Each figure applies separately to theoretical texture CPU backing and GPU base allocation, not total JS heap/VRAM. Compact edit still computes canonical operators and creates working clones; no promise of shader first-use or initialization speed is made. Actual GPU complete-material/expressions, first edit, reset and hot-switch cost remain required.

## Preserved preparation failures

cpu-1/cpu-2 reject both baseline and candidate on the same legacy brow recipe SHA. The new sparse worktree had been populated before its root .gitattributes was restored;19 public text files had CRLF checkout bytes. `checkout-byte-repair.json` records before/after hashes. They were restored byte-for-byte from the unchanged6e Git blobs, not repinned or reformatted by a new source recipe. Public assets have no Git diff. cpu-3 passed the initial matrix; cpu-4 adds full-actor teardown and failure-after-success. Historical files are not relabelled.
