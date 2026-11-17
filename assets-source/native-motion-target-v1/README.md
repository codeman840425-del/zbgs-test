# Native motion target candidates

`build.mjs` converts the pinned Rokoko FBX source into one normalized motion candidate per native VRM1 target. It derives the target rest world skeleton from the actual VRM with the installed three-vrm 3.5.5 loader, computes a source-rest to target-rest quaternion conversion including the measured facing correction, and writes the normalized-local-absolute clip expected by `parseNormalizedMotion`.

Run `node scripts/native-motion-target-v1/build.mjs --out <new-directory>` in a fresh output directory. The current corrected output is `generated-v2`; `generated-v1` is retained as a pre-review attempt and is not the recommended input. Run `node scripts/native-motion-target-v1/qa.mjs` for VRM loader, exact SHA, clip-shape and repeat-byte checks. The QA creates and removes only its own repeat directory.

The four outputs are source candidates only. They do not add `dance-imports.json` variants or change runtime admission. Browser playback, floor alignment, contact, clothing, expressions and visual quality remain unverified. The old 30-second normalized clips and their old avatar identities are preserved.
