# V2 CPU comparison and remaining failures

The sixteen PNG files show the same original, fixed v1 and projected v2 surfaces in three columns. Rows are front, side and back, using identical orthographic metre scales and neutral source pose. Each of the eight intents has full-body and head sheets. The two failed lean variants have a blank v2 column carrying a failure label. Their old v1 resources remain visible for comparison and are not relabelled as v2.

The source author inspected the female-round-full full/head and male-round-stocky head sheets. The broad female garment edge is smaller in the new source preview. The v2 jaw is visibly broader and has different corner/shading shapes, so monotonic width is not equivalent to a natural-looking or artistically accepted face. Independent actual resource readback and root's room/visual decision remain pending. The preview retains original embedded hair; new replacement-hair compatibility has not been granted.

## Actual source-section measurements

Each row uses one original physical rest height for that sex and intersects actual triangles, rather than comparing bounding boxes. Width differences are whole cross-section widths. The new donor method preserves every original offset vector relative to its fixed body anchor. The section-width difference can vary slightly because the extreme point can move to another triangle.

| Preset | Original top width mm | V1 top width mm | V2 top width mm | Original top minus body mm | V1 top minus body mm | V2 top minus body mm |
|---|---:|---:|---:|---:|---:|---:|
| female-round-full | 319.16 | 459.41 | 404.23 | 49.20 | 66.24 | 51.05 |
| female-square-athletic | 319.16 | 330.71 | 329.95 | 49.20 | 50.53 | 51.61 |
| female-soft-wide | 319.16 | 403.26 | 374.32 | 49.20 | 59.41 | 51.80 |
| male-wide-muscular | 304.35 | 354.58 | 346.17 | 20.90 | 23.85 | 20.76 |
| male-round-stocky | 304.35 | 399.69 | 377.03 | 20.90 | 26.37 | 19.92 |
| male-angular-athletic | 304.35 | 309.18 | 312.69 | 20.90 | 21.27 | 21.35 |

Actual lower Face SKIN half-widths sampled at the same 101 heights have zero backward step in the six v2 meshes. Corresponding v1 round/full, soft/wide and stocky maximum steps are 0.18592, 0.22136 and 0.21574 mm per sample. This local metric quantifies removal of the measured inward reversal. It does not establish overall curvature quality, expression posing or artistic shape intent. The source curve request is explicitly projected with remaining 8.668–31.058 mm maximum half-width discrepancy for these six candidates.

Female-long-slender-v2 remains rejected at Body vertex 702, determinant 0.102261582. Male-long-lean-v2 remains rejected at Face vertex 913, determinant -1.609811718. Their original parameters and the gate remain unchanged. No v2 source file, clothes or fit is admitted for either failure. The result is six source candidates and two failures, not an eight-preset acceptance.

## Reproduction and scope

```powershell
python -B scripts/m2-representative-batch-v2/preview.py
python -B evidence/m2-representative-batch-v2-preview/compare.py
```

Python, NumPy, Pillow and the pinned v1 renderer are required. These scripts write only this evidence directory. Preview generation took 80.82 seconds on this source workstation. Approximate base-colour textures, interpolated source normals, simple lighting and alpha thresholding replace game MToon/outline. No browser, GPU, motion or runtime resource is modified. `report.json` pins actual avatar identities and camera scales. `measurements.json` pins original/v1/v2 body/top hashes and stores every section curve. The existing root diagnosis probe supplies the read-only source-plane intersection function.

The final v2 source run including deterministic per-asset repeats took 34.40 seconds. Six file sets total 130,148,794 bytes. Repeated encoded image payloads sum to 99,954,168 bytes, with 26,923,646 unique bytes over 42 hashes. Those file measurements do not imply renderer deduplication, ordinary-PC performance or simultaneous residency of all candidates.
