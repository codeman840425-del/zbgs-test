# M1A skirt checkpoints

- `m1-skirt-66.js`: frozen solver source from candidate 66a09d34d8fe, used as a diagnostic reference. Does not duplicate or replace the fixed dist/evidence.
- `m1-skirt-equivalent-optimized.js`: geometry-preserving optimized checkpoint. CPU360 + real browser720 paired frames were numerically identical to66 solver. Actual source SHA and CPU timings are in `docs/M1-SKIRT-OPTIMIZATION.md` and generated probe reports.
- `m1-skirt-continuous-drape-experiment.js`: isolated geometric experiment. Not loaded by the product. Replaces the binary thigh support silhouette with continuous support blending; must be accepted visually and by contacts before integration.

All retain the source topology/UV and fitted current-body collision dimensions. They are diagnostics, not a second production runtime or general garment generator. Probe imports replace the bare `three` import with the installed project's Three module; these files are not standalone Node entrypoints.

The second shape experiment, `m1-skirt-bending-experiment.js`, smooths collision displacement over source mesh connectivity while preserving the posed guide's authored pleats. Both geometric experiments were actually recorded and rejected: continuous drape had little visible benefit; bending worsened walking stretch and capsule clearance. Neither is loaded by the product. See `docs/M1-SKIRT-OPTIMIZATION.md` for full-condition comparison and limitations.
