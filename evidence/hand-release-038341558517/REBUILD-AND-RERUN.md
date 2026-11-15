# Rebuild and recording entry points

Runtime source commit: `5f4250a3ce5d958de16d31ba3ce9a8724cea28a8`.
Fresh sparse checkout, `npm ci` and `npm run build` passed; all 65 output files match the fixed 038341558517 build byte for byte. Evidence: `evidence/rebuild-038-5f4250a/report.json`.

After installing locked dependencies in prototype, from repository root:

```powershell
node scripts/run-fixed-check.cjs prototype/dist scripts/qa-hand-release-snap-video.cjs 038341558517 evidence/NEW-SNAP
node scripts/run-fixed-check.cjs prototype/dist scripts/qa-hand-release-related-video.cjs 038341558517 evidence/NEW-RELATED
```

Use new output paths. These portable copies replace only the two module-resolution paths in the originally executed, archived scripts; identity hashes and the transformation are in portable-recording-scripts.json. Historical VIDEO-RESULT.md and archive-video.py retain the original experiment paths as provenance; they are not the portable entry points. Do not require the ignored experiment worktree to reproduce the recording.

Build reproducibility does not rerun garment authoring, establish visual acceptance, or promote the public candidate.
