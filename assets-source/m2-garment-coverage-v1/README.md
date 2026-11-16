# M2 garment coverage source candidate

This package records one inner-layer render mask candidate for the real male top and the real `m2-outer-panels-v2` author export. It stores source face identity and measurement data. It does not alter either GLB, change a runtime entry, or claim animation, contact, or browser acceptance.

Run from the repository root.

```powershell
python scripts/m2-garment-coverage-v1/build.py
python scripts/m2-garment-coverage-v1/qa.py
```

The builder compares the exact SHA-pinned top primitive 0 with the exact SHA-pinned outer export. It computes CPU point-to-triangle distances from every top triangle corner to the outer surface. A triangle is selected only when all three corners are within 6 mm and its centroid is in the conservative back region `z >= 0.015 m`, `1.15 <= y <= 1.38 m`, `|x| <= 0.13 m`. The front opening and tie primitive are excluded. The output contains exact top face IDs and triangle index triples, the top index accessor SHA, outer/top SHA values, selected area, distance range, and connected-component counts.

The current candidate has 56 covered top triangles covering 0.0408687921 m² across four back-region components. The maximum selected corner distance is 0.0057625437 m. These values describe rest-pose proximity to the outer surface. They do not establish continuous animation separation, material visibility in Three.js, or a valid runtime union/restore transaction. The later runtime package must preserve the complete original top geometry for contact and restore it on outer removal.

The package intentionally leaves the original top and outer GLBs untouched. It is bounded to this male source pair and does not claim automatic body-fit, female compatibility, arbitrary garments, or full clothing collision.
