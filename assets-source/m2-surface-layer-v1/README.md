# Face surface layers v1

This source package contains two independent flat color layers for the exact original female and male VRM identities. Freckles cover conservative cheek and upper exterior nose regions. Blush covers the cheeks. Each layer has its own RGBA PNG and source parameters. The original model, image, geometry, weights, UVs and expressions remain intact.

Run from the repository root with Python 3.13, numpy 2.4.2 and Pillow 12.1.0.

```powershell
python -B scripts/m2-surface-layer-v1/build.py
python -B scripts/m2-surface-layer-v1/build.py --check
python -B scripts/m2-surface-layer-v1/qa.py
```

`spec.json` is the editable source for each layer's color, opacity, sides and freckles' seed/count/radius or blush falloff. The anatomical region definition is the one reviewed version and is enforced by the producer. The pipeline rejects wrong original identities, unknown parameters, invalid/nonfinite intensity and unsafe/missing source inputs before writing any generated output. All PNG and manifest bytes are computed before the first output write. Successful exports rewrite only this package's `generated/` directory. Invalid inputs exit 2 with structured JSON. No input values are clamped into a supported range.

The producer reads the actual Face_SKIN triangle POSITION, NORMAL, indices and TEXCOORD_0. It rasterizes UV triangles at source pixel centers with barycentric mesh positions. Cheek centers come from the actual iris/eye geometry, nasal limits from the foremost central skin vertex between the actual mouth and eye levels, and feature protection from the real eye, eyebrow, lash/line and mouth geometry bounds with a 3 mm margin. A conservative central region below the nose tip protects the nostril/lip area. Frontal normal and depth tests exclude rear skin and ears. The masks use these physical coordinates, with no guessed UV rectangles. Feature primitives have their own image atlases, so their unrelated UV rectangles are never used as face-skin coordinates.

`build-report.json` records actual region coordinates, protection bounds, source geometry/UV/index hashes and each source texture reference. Both original faces use a 1024×1024 map and the same image for PBR baseColor, MToon MainTex and ShadeTexture. Female references use texture index 19 and male references use 17. Encoded image SHA and decoded unpremultiplied RGBA8 row-major pixel SHA are recorded separately. Original images have no extra ICC/gamma metadata. The required image orientation is `imageYEqualsUVv=true` at pixel center `(x+0.5)/width,(y+0.5)/height`.

The left/right side convention is checked against actual raw humanoid eye positions. Both rasterized atlases have zero geometric alias pixels and distinct left/right coordinates. The left-only source export check produces zero alpha on the right, including the nose bridge. These two exact bases support independent side masks. This result supplies no inherited UV compatibility for another model or derived face.

`generated/manifest.json` uses `character-surface-layer-v1`. Each body variant pins the avatar SHA, Face_SKIN material name, source texture/pixel identities and map size. Each layer has a relative URL, file SHA, source parameters, order and runtime allowedOpacity `[0,1]`. The two region PNGs and protected PNG are grayscale masks with white meaning selected/protected. The two layer PNGs are RGBA8 with authored color in RGB and the actual per-pixel layer strength in alpha. Transparent pixels have zero RGB.

For runtime publication, copy the four layer PNGs and manifest to a common directory and resolve each layer URL relative to that manifest. Retain mask PNGs when validating the complete source manifest references. Apply only to the exact Face_SKIN material and its matching Outline. Preserve original source alpha and composite the selected independent layers over original source RGB in order 10 then 20. CPU evidence uses straight-alpha source-over on encoded RGB8 values. The map and shade source agreement is explicit for these inputs. A different source or texture transform requires a separate description and check.

`qa-report.json` proves repeat PNG/manifest bytes, zero protected changes, unchanged original alpha, actual two-layer overlap and order dependence, exact restoration from original pixels, and independent re-exports after reducing each layer's source opacity. It also records the left-only export and structured invalid/missing-input rejection. The variant PNGs are evaluated in memory, with their exact exported-byte hashes retained in the report. No permanent pre-composited endpoint is delivered.

This is source production and rest-geometry UV validation. Browser decoded pixels, shader/map/shade binding, layer removal, skin tones, facial expressions, actor isolation and visual appearance need the shared runtime checks. The existing expressions move the original UVs, with no new expression deformation proof in this package. The original third-party CC0 source records and new construction license are retained in `provenance.json`.
