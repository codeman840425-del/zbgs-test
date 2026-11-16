# Bounded crew-sock shoe fit v1

This is one authored candidate with **failed source acceptance**. The female and male outputs remain available for root review. They are not registered in public equipment manifests or outfits.

The source inputs are the exact original flat shoes, original Body files and crew socks pinned in `spec.json`, on base commit `6153fd2bd0ae874d955eec5b906731f29f5c7fda`. Both feet are measured independently. Existing files are read-only inputs.

Run with Python 3.13 and the package versions in `scripts/m2-socks-shoe-fit-v1/requirements.txt`.

```powershell
python scripts/m2-socks-shoe-fit-v1/build.py
python scripts/m2-socks-shoe-fit-v1/qa.py
```

The QA command deliberately exits with code 1 for this retained candidate. Its six failed checks are recorded in `generated/qa-report.json`.

The builder samples shoe, sock and intact Body along each raw outer lateral axis. A heel contact sample is eligible when the intact Body is behind the original shoe with at most 2 mm of lateral clearance, below the ankle by at least 35 mm, and behind raw Z=20 mm. This excludes the natural open collar from the lower heel measurement.

A single constrained SLSQP solve per side moves a local graph neighborhood of shoe-upper vertices outward along raw X. A graph smoothness penalty provides the transition to fixed neighbors. Coincident UV-seam vertices receive the same displacement. The source target is a 0.5 mm signed normal clearance from the current sock surface. The 1.5 mm per-vertex bound and protected lower 12 mm of the shoe are fixed parameters. Position Y/Z, sole contact vertices, UVs, bone IDs, weights, inverse binds, bone node transforms, indices, material and embedded texture bytes remain intact. Normals receive the local minimal rotation between old and new incident-face normals. The whole shoe is not expanded.

The resulting female asset changes 44 vertices, with maximum displacement 0.658 mm. The male asset changes 44 vertices, with maximum displacement 1.359 mm. Both remain below the displacement bound. The 0.5 mm solve grid meets its own constraints.

The denser 0.25 mm check finds two insufficient-clearance samples on each foot. The female minimum is about 0.480 mm. The male minimum is about 0.0199 mm near raw Y=84.245 mm, Z=45 mm, on shoe triangles 117/369. A prescribed -0.35 rad ankle X rotation gives one negative corresponding-pair gap on each male foot, about -0.361 mm. The measurements transport fixed source surface pairs. They are not full continuous contact tests or a captured game pose. All sampled values are finite.

This failure comes from the sampled contact constraints missing narrow dense-grid boundary locations. The different shoe/sock skin fields also affect the posed relative gap. No second geometric candidate or parameter sweep was attempted. The first reporting attempt failed on a NumPy integer JSON value after the female GLB was written. The report-only conversion fix reproduced the same female GLB SHA. Its receipt is retained.

`female-entry.json` and `male-entry.json` carry new IDs and hashes with original bindings. Their `socksFit` field records the required exact sock SHA and original shoe identity. The root integration must select the new shoe only for its exact sock combination and update that combination's sock `pairedWith.shoes` declaration. Historical shoe/outfit/recipe selections continue to identify their old assets. This candidate has no integration or browser acceptance.

The QA records exact repeat output, original input hashes, UV/skin/IBM/image preservation, both-foot local movement, dense rest failure and finite prescribed ankle/toe cases. These are author self-checks. Root owns independent review and game acceptance. No GPU, browser, collision subsystem or runtime compensation is involved.

The material and geometry license chain follows the original CC0 source records identified in `provenance.json`. Full editable VRoid author files remain unavailable under the existing foundation provenance.
