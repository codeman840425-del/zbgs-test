# C1 camera-mount collection

`parameters.json` is the editable input for four project-authored static camera mounts. The package covers a desk clamp, articulated arm, floor tripod and wall arm. Each resource records its parent and mounting boundary in `resource.json` and keeps the camera cradle facing local `+Z`.

Run `node scripts/company-platform/build-camera-mount-collection.mjs` to generate GLB models, sidecars and CPU readback evidence. Run the same command with `--check` to verify a deterministic rebuild. Browser mounting, parent-transform integration and human visual acceptance remain parent work.
