# Four exact ponytail fits

This package fits the existing `female-ponytail-headref-v3` technical candidate to the four fixed female representative batch VRMs. It reuses the exact rootjoin-v2 GLB with SHA-256 `1b785f9d54107818cee39eda2de7263ad0720ce90968fbaa7cc32c2465e3c385`. No hair/body geometry or spring force, joint hit radius, reference frame, attachment transform or source material is changed.

`spec.json` pins the original female, v3 source fit/manifest, hair GLB, fixed batch manifest, four target VRMs and actual helper scripts. Each generated directory supplies `fit.json`, `manifest.json` and `report.json`. Style ID remains `female-ponytail-headref-v3`, manifest resource version remains 3, and each exact target receives its own fit ID/version 1. Suggested fit URLs are `/assets/m2-preset-ponytail-fits-v1/<preset>/fit.json`. Manifest GLB URL remains the original existing rootjoin-v2 URL. Parent publishing only needs the eight fit/manifest JSON files alongside that existing exact GLB.

## Actual dependency checks

All original raw nodes and skins match exactly. The head, neck and chest semantic mapping, names and inverse binds match. Original HAIR indexed positions, normals, UV, joints, weights and indices match. Material/texture object definitions and every encoded image payload match. Reports retain per-attribute and image hashes. Changed lower face/torso geometry is measured directly rather than inferred from those preserved dependencies.

Each target runs the unchanged `scripts/m2-long-hair-v1/build.py::proxies` algorithm over its actual Body, embedded top and Face vertices. This generates the head sphere, head/neck capsule and chest capsule, retaining the algorithm's 2 mm selected-point enclosure margin. Original v3 proxy values must first be reproduced exactly. Reports retain original and target selected-position hashes, counts, endpoints, radii and differences. All twelve target selections differ from their original position hash.

| Target | Chest radius m | Chest radius change mm | Smallest spring-child sphere margin mm |
|---|---:|---:|---:|
| female-round-full | 0.144982505 | +2.693 | 33.877 |
| female-long-slender | 0.140597640 | -1.692 | 26.828 |
| female-square-athletic | 0.144459100 | +2.170 | 30.096 |
| female-soft-wide | 0.144852442 | +2.563 | 34.171 |

The long-slender head sphere radius increases by 6.635 mm. Its actual rest spring-child spheres remain outside the recomputed proxies. No proxy dimensions are copied by changing only a body hash.

The entire static hair mesh is checked against actual Body, Face and embedded top triangles in raw-head-local bind space. Baseline crossings are retained truthfully, with 10 Body, 56 Face and 44 embedded-top pairs. Each target retains the exact same pairs and adds zero pairs. Baseline near-coincident cap contacts yield very small unsigned distances. This is not a claim of zero contact or a complete signed containment proof. Full geometry bounds, sampled distances and pair identities remain in each report.

## Reproduction and failure

Requires Python, NumPy and Pillow. From the repository root run

```powershell
python -B scripts/m2-preset-ponytail-fits-v1/build.py
python -B scripts/m2-preset-ponytail-fits-v1/qa.py
```

The producer computes the full plan twice and requires identical bytes. Per-target failures are retained as `FAILED.json` and do not admit a fit. Before writing, every existing destination is compared, permitting same-byte repeats and rejecting conflicts before any write. `--out assets-source/m2-preset-ponytail-fits-v1/exports/<new-name>` supports a new output directory. The author QA recomputes the real plan, verifies installed JSON identities and unchanged spring/attachment fields, and checks source/target SHA refusal, unknown schema and the actual writer's conflict preflight. QA is explicitly source-author validation.

The existing source model/geometry license and provenance remain applicable. This package authors exact fit/configuration data and no new hairstyle geometry. It establishes source/rest compatibility for these four exact bodies only. Proxies cover selected rest vertices. Posed body/clothes, expressions, room collision, dynamic naturalness and game visual acceptance remain unverified here. The existing v3 chair-top tail bending limitation remains. Root owns publication, runtime integration and actual same-path room checks.
