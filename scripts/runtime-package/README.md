# Selected runtime transfer

This bounded CUSTOM-P03 subpackage inventories and exports the existing fixed room runtime. It supports the original male outer-and-shorts look with its registered cloth material recipe and the original female default look. It preserves the existing controller, body, model, animation and material bytes.

## Commands

Use Node 22 or newer and the repository's installed `prototype/node_modules` dependencies. The adapter is pinned to runtime build `801c7a9c9026`, source commit `58bc10748cc9fa618f8ecf58b54abbb7de12ffb8`. The exporter rechecks every build-id source input using the existing build-id algorithm. An unknown build, changed source input, changed bundle or changed public asset fails.

From the repository root, substitute the fixed dist and fresh output locations.

```powershell
node scripts/runtime-package/cli.mjs inventory --input scripts/runtime-package/fixtures/male-outer-shorts.json --dist FIXED_DIST --out NEW_MALE_INVENTORY.json
node scripts/runtime-package/cli.mjs export --inventory NEW_MALE_INVENTORY.json --dist FIXED_DIST --out NEW_MALE_PACKAGE

node scripts/runtime-package/cli.mjs inventory --input scripts/runtime-package/fixtures/female-default.json --dist FIXED_DIST --out NEW_FEMALE_INVENTORY.json
node scripts/runtime-package/cli.mjs export --inventory NEW_FEMALE_INVENTORY.json --dist FIXED_DIST --out NEW_FEMALE_PACKAGE

node scripts/runtime-package/qa.mjs --dist FIXED_DIST --out NEW_CPU_REPORT.json
```

`--source-root REPOSITORY` optionally selects the source checkout used for identity verification. It must reproduce the pinned source digest. The CLI writes JSON results to stdout, structured failures to stderr and exits nonzero on failure. Inputs and existing outputs are read only. Inventory output uses exclusive creation. Export regenerates the dependency inventory from its saved input, compares the complete manifest, checks every copied file, stages into a fresh sibling directory, then renames after success. Existing packages are rejected. Failures remove only that invocation's staging directory.

## Input and output

The input schema is `runtime-selected-look-v1`. `bodyType` is `male` or `female`, and `outfitIndex` must be 4 or 0 respectively. Omitted appearance fields use original hair/color/skin/iris/lips. Geometry uses mouth width 0 and `none` for brow/nose/eye. Nondefault appearance or geometry, other bodies/outfits, unknown fields, external resource URLs and path escapes fail explicitly. This adapter does not infer support for future resources.

`materialSelections` is a separate array of `{equipmentId, recipeId}`. This domain remains separate because appearance recipe v6 does not save equipment material selection. Only registered recipes on selected equipment are admitted, with their exact manifest pins. The reviewed cloth shader consumes the original model's embedded map and adds no external texture.

The exported directory contains these files at their existing origin-relative URL layout.

- `runtime-package.json` records relative runtime paths, SHA256, byte sizes, dependency reasons, source provenance, source/build identity, exported capabilities and limitations. This manifest describes itself through the export result's `manifestSha256`, avoiding a recursive self hash.
- `selected-appearance.recipe.json` contains the native v6 appearance recipe and exact selected equipment entries.
- `material-selections.json` contains `schema: runtime-material-selections-v1` and `selections` for the existing `setMaterialRecipe(equipmentId, recipeId)` API.
- Declared fixed HTML, JS, CSS, favicon, build identity and runtime resource files retain their original bytes. Source references are repository-relative paths at the recorded source commit. Source files and author tools are not runtime dependencies.

Serve the package directory as the HTTP origin root and open `runtime.entryUrl`. All existing `/assets/...` requests then resolve inside the package. Start with a fresh origin/context without saved local drafts. Read the recipe and material-selection files from this package, await the existing `__debug.importAppearanceRecipe(JSON.stringify(recipe))`, then await each existing `__debug.avatar().setMaterialRecipe(selection.equipmentId, selection.recipeId)`. Check the returned result before continuing. The package does not automatically import a record or introduce another preview app.

## Reviewed dependency boundary

The adapter follows source declarations, not a network trace.

- `foundation-profiles.js`, `foundation-avatar.js` and `outfit-selection.js` select the exact body, equipment manifest, outfit 0 startup assets and selected outfit assets. Body and garment coverage descriptors are included when their current load paths require them. Original binding/fit declarations remain in the pinned equipment manifest and v6 resources. No onePiece fit or skirt resources are needed for these two inputs.
- Original hair, palette and facial geometry require no additional fetch. Default values are checked through the existing admission modules. Nondefault resource selections need another reviewed export slice.
- `motion-source.js` eagerly loads UAL, jog and every dance entry compatible with the selected exact body. Those dependencies are included even if the immediate QA does not play each dance. Only this body's normalized-motion variants are copied. The greeting action includes its pinned source and provenance metadata.
- The fixed Vite room bundles include the shared equipment, geometry, fit, contact, motion and controller implementation. Every model's declared external buffer/image URI is resolved and included, or fails for an unsupported external/unsafe URL. Embedded buffers/images remain inside the unchanged GLB/VRM.

Source license records, `sourceSpec` links and each frozen motion's `licenseBoundary` are retained. The existing UAL CC0 declaration does not extend to the Rokoko/Pexels-derived entries. Their existing limitations remain attached to the copied assets. This transfer provides no new license or visual acceptance.

## Limits

The original equipment/dance catalogs retain metadata for unexported choices. `capabilities` identifies which body/outfits and selected appearance are exported. For example, the male package omits onePiece and its fit/shape dependencies, and the female package omits skirt. Selecting unexported assets fails through the existing loader while retaining the prior look. Replacement hair, nondefault palette/geometry, accessories and other bodies are outside this package.

The existing fixed room HTML and its DOM remain necessary. `unsupportedNavigation` explicitly records its historical foundation-preview and author-machine baseline navigation links. They remain unchanged HTML metadata, and the exported assets, records and command chain do not consume either address. The historical link is not a portable runtime dependency. This package does not establish DOM-independent game consumption or complete CUSTOM-P03.

CPU checks cover actual file identities, deterministic repeated export, modified/missing dependencies, edited inventory deletion/substitution, external/path escape refusal and output conflict. Browser network closure, clean-directory loading/reopening, motion/visual acceptance and target-device performance require root's separate fixed-runtime validation. No browser, GPU, Blender, model re-export or compression runs here.
