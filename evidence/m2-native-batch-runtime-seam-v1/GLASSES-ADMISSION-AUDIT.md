# Native glasses candidate to runtime admission audit

## Scope and decision

This is a static seam audit for the two native FaceContour glasses candidates. It covers the candidate result, `register_native_accessories.py`, `native_batch_gate.py`, the glasses fit registry, and the runtime record and presentation contracts. It does not operate 4196, change the model, or modify a runtime asset.

The existing evidence is sufficient to generate a **candidate-to-admission report with a blocked or candidate-only result**. It is not sufficient to issue a visual runtime admission. The current contracts deliberately preserve this distinction. The candidate captures are unfitted source measurements, the runtime identity remains `verified: false`, the batch gate leaves `headAttachments` unresolved, and the runtime budget audit is over budget.

## Pinned inputs

| Input | Finding |
| --- | --- |
| `evidence/m2-native-batch-runtime-seam-v1/native-glasses-candidate-v1/result.json` | Two `cpu-candidate-only` rows. Body SHA values are `825a82c944636971304ce50b7526b1410ea6f1c6b58bd36f166515295696a547` and `9592933507b3290100d82ac315e5ddac7b6e284f372a1368de9f424643846ddb`. |
| `evidence/m2-native-batch-runtime-seam-v1/native-glasses-candidate-v1/` | Candidate profile SHA values are `959ef0f7422ea9a246da010537edfcfd4dd6769b7c0be5684485b6e98bbeede8` and `0c6256ccc448c2d76e2568898eb3156ddfa0c1fe83c7b87fd75e2c1c2872e3ea`. Each profile is pinned to the candidate-v1 stand capture. |
| `evidence/m2-native-batch-runtime-seam-v1/native-glasses-capture-candidate-v1/report.json.gz` | Build `bda6fd250bb8`, scope explicitly says unfitted source glasses and not a capability pass. Both stand and sit captures use the explicit legacy fit identity. |
| `prototype/src/glasses-temple-fit-manifest.json` | The checked-in registry already has rows for both bodies. Its profile SHA values are `3f51bbac68e41110cd7955b8437ccdea62882a5128cc396a3e4b8e5332ccc3f9` and `5a2a2658c456a2aa25c33811d62dc4fa71cd433e6c1369235415d0bca7fb3bd9`, each pinned to the `evidence/m2-native-batch-glasses-input-v2` capture. |
| `evidence/m2-native-batch-runtime-seam-v1/runtime-record-budget-head-attachment-audit.json` | Head attachment contracts are present with `fitted-candidate` and `verified: false`. Required browser contact, record close/reopen identity, and ordinary-PC evidence remain listed. Budget status is `over-budget`. |
| `evidence/m2-native-batch-runtime-seam-v1/budget-classification-v1.json` | The two bodies have measured transport bytes, static decode estimates, and no GPU or ordinary-PC measurement. The report status is `blocked`. |

## Candidate and registry identity seam

`register_native_accessories.py` validates the candidate body SHA, the shared glasses asset SHA, the legacy unfitted capture identity, the capture filename, the profile schema, both temple meshes, all four rings per side, and the profile byte pin. It publishes fit resources and registry rows atomically and rolls back completed writes on failure. Its return status is `source-candidate-registered`, not runtime admission.

Running the existing candidate-v1 result against the current checkout stops with

```text
ValueError: Conflicting registration: /assets/native-accessory-batch-v1/native-contour-roundness-a-v1/glasses.json
```

This is the expected safety behavior. The current registry row uses the same body and URL but a different profile SHA and source-capture SHA. The two profile documents have identical fit controls and differ in `sourceCapture`, so the difference cannot be silently collapsed or relabeled. The cheek row has the same versioned mismatch. The candidate-v1 result therefore cannot be treated as the checked-in runtime profile.

## Runtime registry seam

`glasses-temple-fit.js` selects a profile by exact body SHA, fetches and hashes the registry resource, validates the profile schema and two temple meshes, then clones and deforms only the parsed accessory geometry. It returns an identity with `status: fitted-candidate`, `sourceGeometryUnmodified: true`, and `verified: false`.

`live-presentation.js` uses the same registry in the normal path. The `glassesFit=legacy` branch is a diagnostic path that creates `legacy-glasses-fit-v1` with no profile SHA. It is suitable for source measurement only. Production record admission rejects that legacy identity.

`live-accessory-record.js` requires the exact body and accessory SHA, the exact profile SHA, two changed temple meshes, `fitted-candidate`, `sourceGeometryUnmodified: true`, and `verified: false`. A valid record proves identity and recoverability of a candidate fit. It does not prove contact quality or visual acceptance. `getState().fit.verified` is also always false in this runtime path.

The candidate capture report is therefore useful as input to fitting, but it cannot be used as a fitted runtime capture. The checked-in v2 profile is the only exact registry identity currently available to the runtime.

## Batch gate seam

`native_batch_gate.py` verifies the package closure, body and equipment SHA values, coverage, authoring, cold readback, export, and dependency delta. It has a `microphone_report` input, but no glasses registration or glasses admission input. `accessory_index()` accepts only a source-candidate registration report and is currently used for the microphone lane. The runtime head audit is attached as diagnostic evidence and cannot clear a task.

The current gate report keeps `acceptedForRuntime` empty. For both native FaceContour items, `headAttachments`, `dynamicMotion`, `runtimeRecordAndBudget`, and `surfaceAndTexture` remain adapter tasks. The gate's `runtimeCatalog`, `record`, and `restore` lanes can be marked from a consumer QA report, but those lanes do not clear the per-body head fit task or grant visual admission.

This separation prevents a checked-in registry row, a source registration result, or a record restore from being interpreted as an accepted glasses appearance.

## Concrete gaps

1. The candidate-v1 profiles and the checked-in registry profiles are different byte identities because they reference different stand captures. There is no canonical selection or explicit versioned replacement report.
2. The candidate source captures intentionally use the legacy diagnostic identity. There is no normal-path fitted capture proving that the registry profile loads, deforms the intended geometry, and remains attached through stand and sit.
3. The available captures contain contact material for later review, but no completed normal-speed visual decision for glasses, face, hair, and ear clearance. The fit profile itself declares that normal-speed review is still required.
4. `native_batch_gate.py` has no glasses-specific report lane. A source registration result cannot resolve `headAttachments`, and the runtime/head audit cannot resolve it by design.
5. The runtime/head audit reports `verified: false` and the budget classification is `blocked` with over-budget bodies. GPU residency, release lifetime, and ordinary-PC performance are unmeasured.
6. The record contract can preserve and restore a candidate identity, but it has no field that means visual admission. Reusing `verified: false` as a success signal would be an incorrect upgrade of evidence.

## Reusable implementation

- `scripts/production/native_accessory_batch.py` provides deterministic candidate generation, exact body and accessory identity checks, and the existing four-ring solver. Its output remains candidate-only.
- `scripts/production/register_native_accessories.py` provides exact profile validation, conflict detection, atomic publication, and rollback. It is safe for a new versioned destination or an exact already-registered candidate.
- `scripts/production/qa-native-glasses-fit-input.cjs` provides unfitted stand and sit source capture. Its own scope excludes capability acceptance.
- `scripts/build-native-glasses-fit.py` reproduces the measured four-ring temple profile from the source capture. Its profile limits require normal-speed glasses, face, hair, and contact review.
- `prototype/src/glasses-temple-fit.js` and `prototype/src/live-accessory-record.js` are the runtime identity and restore contracts. They should remain the single consumer path for the profile SHA and body SHA checks.
- `scripts/production/native_batch_gate.py` remains the shared admission gate. It needs a separately typed glasses evidence input before it can clear `headAttachments`.

The targeted Python regressions pass without source edits. `test_register_native_accessories.py` passes 5 tests and `test_native_batch_gate.py` passes 10 tests when run from the repository root with `PYTHONPATH=scripts/production`.

## Minimum next step

1. Choose the canonical profile and capture pair. Re-run the candidate or publish it at a new explicit versioned URL so the candidate-v1 and checked-in v2 identities cannot collide. Record the exact body SHA, accessory SHA, profile SHA, bytes, and source-capture SHA in one registration receipt.
2. On the fixed build, run the normal path without `glassesFit=legacy` for both bodies. Capture fitted stand and sit states with the exact registry profile, then review normal-speed glasses, face, hair, and ear clearance. Preserve any failure as a candidate-specific report.
3. Add a glasses-specific admission report to the gate input contract. It must require the exact registry/profile identity, fitted runtime capture, contact review, record close/reopen identity readback, and a resolved budget status. It must clear only `headAttachments` for the matching body SHA. A source-candidate registration report alone must remain insufficient.
4. Keep the result blocked while the runtime budget is `over-budget` or ordinary-PC and GPU evidence is absent. No report from this audit should set `acceptedForRuntime` or claim visual acceptance.

## Audit conclusion

The current seam is safe for producing a truthful candidate-to-admission report that remains blocked. It is unsafe to generate an admission success from the existing candidate result, registration receipt, current registry row, source screenshots, or record restore evidence alone.
