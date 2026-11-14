# Base_Male candidate, not a runtime asset

This directory is the recoverable candidate record for M1B. The female M1A runtime is unchanged. Source provenance/hash is in `source.json`; conditions are in `LICENSE.md`; tool versions are in `toolchain.json`.

Files retained: original VRM, packed editable Blender reconstruction, fetch/audit scripts, compact provenance and publisher-page evidence. The 14.8 MB download ZIP is verified in memory by the fetch script and is not duplicated in Git.

Run from any current directory by supplying the script path; scripts resolve their project root from their own location. From the repository root:

```powershell
python assets-source/foundation-male/fetch-candidate.py
python scripts/setup-foundation-tools.py
experiments/tools/blender-4.5.9-windows-x64/blender.exe --background --factory-startup --python assets-source/foundation-male/audit-candidate.py
```

The first command validates the existing VRM or restores the exact pinned download. It refuses changed content. The last command **rebuilds the candidate blend and regenerates** `evidence/m1b-selection/` from the original VRM; do not use it to overwrite a manually edited candidate. It does not touch the product asset or runtime code. The female source is read only as a pinned measurement comparison.

The reconstructed blend is saved before diagnostic material changes, so it retains original clothes, hair, weights, textures and facial shapes. The dark surface renders are temporary diagnostics of the actual skin geometry, not a new costume export.

Blender reconstruction and static previews do not establish browser roundtrip, compatible clothing, locomotion, seated contact or dual-instance isolation. See `docs/M1B-CANDIDATE.md` before promoting this candidate.
