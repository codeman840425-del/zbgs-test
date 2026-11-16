# Ponytail local root revision v2

The original fixed-room side image `evidence/m2-long-hair-room-363-v1/side-idle.png` showed a visible gap between the retained cap and offset ponytail root. The source author inspected that image. This revision constructs a welded surface from the actual cap boundary to the existing second tail ring. Style ID remains `female-ponytail-v1`, with manifest version 2 and fit resource version 2. The three ready resources use `/assets/m2-long-hair-rootjoin-v2/` URLs.

`spec.json` is the editable local construction source. It pins the original 26-file inventory and all three v1 resources. `rootjoin-v2.py` reads the original generator and geometry helpers. Python requires numpy and Pillow. The Node check uses the installed Three 187 and VRM 3.5.5 through the existing prototype dependencies.

```powershell
python -B scripts/m2-long-hair-v1/rootjoin-v2.py
node scripts/m2-long-hair-v1/qa-rootjoin-v2.mjs --modules-root F:/gamemake/prototype/node_modules
```

The producer computes identical plans twice, checks every existing output before writing, and preserves identical files. A fresh repo-relative `--out assets-source/m2-long-hair-v1/revisions/rootjoin-v2/exports/<name>` permits an independent export. A differing destination requires a fresh output. The Node check refreshes this revision's inventory only. The frozen v1 `qa.py` enumerates its source directory recursively, so use these revision commands to retain the original v1 inventory identity.

The two failed bridge exports remain under `attempt-1/` and `attempt-2/`. Both connected to the first tube ring and produced three connector/tube crossing pairs. In attempt 2, retained tube face 412 intersects connector faces 1191 through 1193. Its plane places the lower cap point at +10.338 mm and the other bridge points at -8.320 through -25.450 mm. `correction-evidence.json` records the exact points, plane and image identity. The resulting correction replaces the actual intersected first tube span, with no additional angular search.

The final construction removes six cap fan triangles around original source vertex 7619, the first tube span's 32 side triangles, the 16-triangle tube base and the separate 128-triangle tie. Twenty-two annular faces join the six original cap boundary vertices to the existing sixteen-vertex second tube ring. Common vertex indices weld both boundaries. The output has 609 vertices and 1162 triangles in one connected component. Its 54 outer boundary edges exactly match the original cap boundaries. The first three retained tail rings blend HairAnchor/Pony0 at Pony0 weights .25, .5 and .75. Boundary normals are recomputed from incident triangles.

Every retained position and UV is copied exactly from v1. The original Body/head skin file, tail length, sweep, outward root placement, auxiliary rest transforms, inverse binds and complete spring/proxy settings retain their identities. Newly authored connection geometry is CC0-1.0 and the retained source material/geometry keep the original package provenance and license. The original female SHA is `027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95`. The material remains `F00_000_HairBack_00_HAIR` with actor-local MToon/Outline cloning expected by the existing appearance path.

Static diagnostics find zero connector crossing pairs against original Body_SKIN, Face_SKIN and top, and zero new connector self-crossing pairs under the existing noncoplanar segment/triangle test. The 110 connector vertex, centroid and edge-midpoint samples have minimum Body distance 2.503 mm and source texture alpha 255. These sampled unsigned distances and noncoplanar counts do not establish continuous clearance or inside/outside containment.

Actual GLTFLoader skinning under the original female raw head agrees with v1 rest positions within 4.31 nanometres. A direct Pony0 rotation of 0.2 radians moves the blended root by 1.896 mm, keeps cap displacement below numerical tolerance, and gives exactly equal distal vertex positions to v1 under the same pose. The head matrix is unchanged. This uses a 1x1 texture fixture and records CPU deformation only. Fresh game side and seated views, furniture contact, large tail swings, spring stability and saved-version restoration remain runtime review work. `runtimeAccepted` remains false throughout this source package.
