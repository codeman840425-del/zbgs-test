# New grip fits require a new QA record fixture version

Read-only follow-up after the 0df63 integration; no runtime, resource or version1 fixture was changed.

The historical v1 contract was measured on ca72. Its microphone GLB remains SHA `4c236a9b58ae2736fdd5a69ed040db1d9434935b0b7548e3c75452a4aad4964c`, and `accessories.json` remains SHA `d8380d1a105bff48e1cf8ed9ec92efaac54318e767a6df5836d587152e11c2b1`. However, current `live-presentation.js` now loads a separate `/assets/m1c/grips/manifest.json` and a body-specific fit before attaching that same microphone. Therefore unchanged body/GLB/accessory-manifest hashes alone no longer identify the complete fitted appearance. Reusing v1 unmodified on a newer build must not be labeled exact attachment-fit restoration.

Actual fit identities:

| Fit ID | Profile SHA256 | Compatible body |
|---|---|---|
| female-source-grip-v1 | `0d145faa31461db369c3da644e42ef3818b92a6241b82784590f5ba30ff08a4c` | Exact current female SHA |
| male-source-grip-v1 | `23843bc3450fa0838241543a1fc30c88226fba7c99c1c34b705ac62a76ab099d` | Exact current male SHA |

Current loader checks profile bytes/SHA, schema, exact avatar and microphone identities, finite raw-hand transform/finger quaternions and quaternion normalization. `livePresentation.getState().fit.gripProfile` exposes id, SHA, compatibleAvatarSha256, compatibleAccessorySha256, fitVersion and method. These are concrete available values for a new QA adapter; the old accessory manifest's null mount fields must not be relabeled as newly fitted data.

Suggested bounded v2 change when authorized:

1. Preserve v1 fixture and ca72 records unchanged. Add a v2 schema/fixture with body-specific mic attachmentFit identity, content SHA, fitVersion, compatible body/accessory hashes, and the separate grip-manifest content version.
2. Capture actual `getState().fit.gripProfile` after mic loading. Validate that the loaded fit and fetched profile match the v2 catalog; validate the whole stored record before changing a compatible avatar.
3. Add wrong/missing grip ID/SHA, opposite-body grip, incompatible microphone version and changed grip-manifest negative cases. Their rejection must preserve visible appearance and not silently use the new fit for an old pinned record.
4. Repeat the same bounded localStorage close/new-page workflow on a newly fixed candidate. An explicit v1→v2 migration policy can be designed separately; do not silently rewrite v1 history or pretend the original test covered a resource that did not exist then.

Glasses currently retain runtime-derived fit and no separate fitted profile resource; pin the relevant algorithm/build identity or explicitly describe that scope rather than inventing a production glasses-fit version. This remains QA contract validation, not production saves, business actor identity or complete appearance editing.
