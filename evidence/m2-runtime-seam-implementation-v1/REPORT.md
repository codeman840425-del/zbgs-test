# M2 runtime seam implementation review

## Scope

This bounded change covers `scripts/production/native_batch_gate.py` and its regression tests. It does not modify the runtime controller, the 4196 workbench, or `docs/CAPABILITIES.md`.

## Changes

- The gate now verifies every file listed by an import spec, then checks the coverage manifest, body SHA, equipment rows, compatible-avatar SHA, and extracted garment file pins. A package receives `bodyPackage: verified` and `coverage: verified` only after those checks pass. These lanes describe package integrity. Runtime admission still requires the separate runtime lanes and all adapter work.
- Adapter reports must declare supported checks through `checks`, or use the known `native-eye-blink-adapter-regression-v1` compatibility schema. An unknown schema is rejected and cannot clear a task.
- The gate records completed checks in `resolvedChecks` with their exact report reference. The shared expression adapter clears only `facialExpressions`. The microphone registration clears only `handAndMicrophone` for its exact body type.
- Every pending adapter task carries a pinned provenance reference with role `dependency-follow-up`, so its source and SHA are inspectable.
- The pending-adapter blocker is rebuilt after shared evidence is applied, so it names only unresolved checks and does not continue to list expression or microphone work after those checks pass.

## Reproducible result

The regenerated [report.json](report.json) contains two batch items. Both items have verified package and coverage lanes, verified runtime catalog, record, and restore lanes, and an empty `acceptedForRuntime` list. Each item retains four pending tasks for `dynamicMotion`, `headAttachments`, `runtimeRecordAndBudget`, and `surfaceAndTexture`. `facialExpressions` and `handAndMicrophone` appear under `resolvedChecks` with their respective evidence references.

## Validation

- `python -m unittest scripts/production/test_native_batch_gate.py` passed 8 tests.
- `python -m unittest discover -s scripts/production -p 'test_native_*.py'` passed 31 tests.
- The unknown adapter schema regression confirms that a passed report without a declared supported check is rejected before it can remove the expression task.

## Configuration

Dispatch configuration was `difficulty=standard` with high reasoning effort. The child runtime did not expose the inherited model name, so no model name is asserted here.
