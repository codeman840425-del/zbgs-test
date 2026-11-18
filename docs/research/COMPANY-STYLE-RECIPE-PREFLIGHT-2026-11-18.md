# 整屋风格配方预检报告

日期：2026-11-18  
工作树：`F:/gamemake-company-platform-c1`  
范围：只读审查现有整面饰材入口、公司布局、资源候选、事务变更、保存恢复和批量发布链路。本文提出后续 agent 可使用的最小整屋风格配方合同，不代表该合同已经实现，也不宣称当前整屋配方能力已完成。

## 结论

现有工程已经具备组合整屋风格所需的低层事务和持久化部件。

- `scripts/company-platform/apply-surface-recipe.mjs` 可以把一个 v1 饰面配方展开为每个 `room` 或 `area` 的 `set-surface-finish` 操作，再交给 `prepareCompanyChange`。它只改变 `finishes`，不会移动或移除家具。
- `prototype/src/company/document.js` 的 `prepareCompanyChange` 在副本上执行完整操作，成功后递增 `revision` 并重新运行 `deriveCompany`、占用点忙碌检查、阻挡检查和移动部件检查。任一步失败，输入文档不变。
- `replace-resource` 通过 `compareFacilityFunction` 比较安装、承载、使用点、阻挡、状态和其他固定功能字段。兼容替换保留实例 ID、父子关系、局部变换和已有状态。功能不兼容时返回 `incompatible-replacement` 并保留旧文档。
- `appearanceCandidates(catalog, branch)` 可以按现有外观分支解析最新的已登记资源。它是候选查询，不是几何导入或视觉验收。配方必须把解析出的稳定 `id@version` 交给现有替换事务。
- `persistence.js` 的 `company-save@1` 已经为文档引用的设施资源、饰面资源和模板生成内容 SHA pin。恢复时 pin 不匹配会拒绝读取，不会静默采用新内容。
- `authoring.js` 和预览层已有异步资源准备、过期请求丢弃、当前楼层资源保留、保存、恢复、导入和失败保旧入口，可作为整屋配方的运行入口，不应另建一套编辑器或存档格式。

当前没有一个可直接接受整屋风格配方、解析区域选择器、组合设施替换和批量发布的上层入口。后续最小实现应新增一个薄的配方适配器，复用上述接口，再按需要让 `batch.mjs` 接受配方字段。无需改写 `document.js` 的事务模型或 `persistence.js` 的存档信封。

## 现有接口核对

### 整面饰材

`applySurfaceRecipe` 当前合同如下。

```json
{
  "version": 1,
  "name": "暖木叶纹",
  "default": {
    "wall": {"resource": {"id": "wall-leaf-damask", "version": 1}},
    "floor": {"resource": {"id": "floor-herringbone", "version": 1}}
  },
  "purposes": {
    "streaming": {
      "wall": {"resource": {"id": "wall-fine-stripes", "version": 1}}
    }
  }
}
```

代码会遍历文档中所有 `room` 和 `area`。`wall` 展开为 `north`、`south`、`west`、`east`，`floor` 和 `ceiling` 保持单面键。每个选择都变成一个 `set-surface-finish` 操作。饰面值允许资源引用、可选 `tileMeters` 和 `quarterTurns`，最终由 `document.js` 校验资源类型、允许面、米制重复尺度和 0 到 3 的四分之一转角。

该入口的边界需要保留。

- `default` 是必需对象，未知顶层键会拒绝。
- 现有入口按所有区域展开，不能只选择某个楼层、某个房间或显式房间 ID。
- 现有入口不处理设施资源、局部变换、状态、父子关系、组合依赖或替换顺序。
- 现有入口使用自身导入的 `library-catalog.json` 和 `templates-extended.json`。配方批处理应固定同一目录版本，不能把 `facility-catalog.json` 与 `library-catalog.json` 混用。

### 设施外观与候选

`appearanceCandidates` 按 `productionBranch` 或 `mountRole` 过滤资源，并对同一资源 ID 取最新版本。工位组合分支返回四个预置组合名，其余分支返回已登记的资源定义和 `displayName`。`replace-resource` 不直接相信 branch 名称，实际兼容性由 `compareFacilityFunction` 决定。

兼容比较包含以下固定功能。

- `mountRole`、坐标约定和安装方式
- 阻挡 footprint、承载面、支撑面和移动部件
- 使用点 ID、容量、座高、接近点、离开点、clearance 及实际状态字段类型
- 电缆、窗口、时钟、镜面、图文面和其他资源声明的专用功能
- 资源默认状态的字段和状态语义

网格、材质槽、显示节点映射和描述性文本属于显示数据，不由 `compareFacilityFunction` 证明。它们需要在既有 GLB 导入、浏览器预览和视觉证据中单独检查。配方不能以相同名字、相同 branch 或相同座位数推断几何适配成功。

### 变更事务

`prepareCompanyChange(document, operations, context)` 支持下列配方所需操作。

| 需求 | 现有操作 | 保留语义 |
| --- | --- | --- |
| 替换兼容设施资源 | `replace-resource` | 保留设施 ID、父节点、局部变换和现有状态 |
| 选定表面饰材 | `set-surface-finish` | 保留所有设施、使用点、通路和状态 |
| 显式改变设施局部位置 | `move` | 必须提供完整 `position[3]` 和四分之一转角 `yaw` |
| 显式改变设备状态 | `set-state` | 与资源声明的状态字段和值范围合并并校验 |
| 增加或删除物件 | `add-facility`、`remove` | 属于布置变化，不应隐含在普通换肤步骤中 |
| 修改父子关系 | `attach-surface`、`attach-window-cover`、分组/拆组操作 | 属于安装或结构变化，需要单独的兼容检查 |

调用方需要在提交前继续执行 `inspectCompanyPlacement`。`prepareCompanyChange` 能保证文档数据和 `deriveCompany` 合法，但 README 已明确它本身不是完整摆放准入。配方适配器不得跳过门户、房间边界、接近点和移动部件扫描。

### 保存、恢复和资源生命周期

`encodeCompanySave` 扫描节点上的 `resource`、模板和 `finishes[*].resource`，生成排序后的内容 SHA pin。`decodeCompanySave` 会对每个 pin 重新计算摘要，并在 ID、版本或内容不一致时抛出 `dependency-content-mismatch`。这使整屋风格可以沿现有 `company-save@1` 保存，不需要新信封版本。

`createCompanyAuthoring` 会从 `deriveCompany` 的设施和 `surfaceFinishes` 汇总当前楼层资源，用于 preload 和 `retainOnly`。整屋配方的资源准备必须沿这个入口进行，失败或过期时不能先改文档再补加载。切层时旧楼层资源应按现有 generation 和 prune 规则释放，角色接触句柄仍由 C3 共享链单独持有。

## 两种已审查布局

### `c2-small-home`

- 身份为 `small-home-company`，`scale` 为 `small-home`，包含一个楼层和一个直播房间。该样件没有额外的公共区域节点。
- 当前文档含 11 个节点、8 个设施和 1 个工位，`revision` 为 1。
- 运行暖木配方后得到 `revision` 2，1 个区域生成 5 个饰面选择，设施仍为 8 个。
- 该布局适合作为最小 CPU 配方回归、单房间资源替换和保存恢复样本。

### `c2-mixed-company`

- 身份为 `mixed-company-c2`，`scale` 为 `building`，包含 2 个楼层、10 个 `room` 或 `area` 区域、4 个工位和 86 个设施。
- 二层有意交换工作间与休息间用途，并改变部分工位、沙发和软装资源。它可验证选择器不能只依赖数组顺序或房间名称。
- 运行暖木配方后得到 `revision` 3，10 个区域生成 50 个饰面选择，设施仍为 86 个。
- 该布局适合作为第二布局、跨楼层身份隔离、切层资源释放和整档关闭恢复样本。

两次 CPU 试验均确认 `applySurfaceRecipe` 不修改输入文档，坏表面资源会在 `prepareCompanyChange` 的派生校验阶段失败，失败后输入文档仍保持原始 JSON 字节。试验只证明数据事务，未证明 GLB 解码、纹理连续性、浏览器呈现或角色使用。

## 最小整屋风格配方合同建议

建议新增一个薄适配器，例如 `scripts/company-platform/apply-style-recipe.mjs`。它的职责是验证配方、把选择器解析成现有操作数组、调用 `prepareCompanyChange`，然后交给已有摆放、资源准备和保存入口。它不应直接改节点对象，也不应绕过 `appearanceCandidates`、`compareFacilityFunction`、`deriveCompany` 或 `encodeCompanySave`。

建议的最小 envelope 如下。

```json
{
  "schema": "company-style-recipe",
  "version": 1,
  "id": "warm-streaming-home-v1",
  "name": "暖木直播民房",
  "catalog": {"id": "company-facilities", "version": 1},
  "regions": [
    {
      "selector": {"purpose": "streaming"},
      "surfaces": {
        "wall": {"resource": {"id": "wall-leaf-damask", "version": 1}},
        "floor": {"resource": {"id": "floor-herringbone", "version": 1}}
      }
    },
    {
      "selector": {"ids": ["mixed-company-c2/floor-2/living"]},
      "surfaces": {
        "ceiling": {"resource": {"id": "ceiling-linear", "version": 1}}
      }
    }
  ],
  "facilities": [
    {
      "selector": {"ids": ["mixed-company-c2/floor-1/room-1/station-1/monitor"]},
      "resource": {"branch": "monitor", "candidate": {"id": "monitor-ribbon", "version": 1}},
      "preserve": {"transform": true, "state": true}
    }
  ],
  "localChanges": [
    {
      "id": "mixed-company-c2/floor-1/room-1/station-1",
      "transform": {"position": [-1.35, 0, 0.2], "yaw": 1.5707963267948966}
    }
  ],
  "stateChanges": [],
  "preserve": {"unselectedRegions": true, "unselectedFacilities": true},
  "metadata": {"designId": "warm-streaming-home", "sourceVersion": "v1"}
}
```

The JSON is illustrative. The implementation should use a JSON schema or explicit field checks, not accept arbitrary operations from a recipe file.

### Required fields and semantics

1. `schema`, `version`, `id`, `name` and `catalog` are required. The catalog pin must equal the catalog used for `appearanceCandidates`, `prepareCompanyChange` and save generation.
2. `regions` is optional when a recipe has no surface changes. Each entry has exactly one selector form. The minimum selector forms are explicit `ids`, `floorIds`, `purposes` and `all` for all current `room` and `area` nodes. A selector resolves to stable node IDs before any operation is emitted.
3. `surfaces` accepts only `wall`, `floor` and `ceiling` values in the existing finish shape. Wall expands to the four directional surfaces. An omitted surface remains unchanged. `null` is reserved for an explicit clear operation and must be opt-in.
4. `facilities` targets existing facility IDs or a declared branch plus an index/candidate. Branch resolution must call `appearanceCandidates`. A candidate must become a concrete `{id,version}` before `replace-resource` is built. No recipe may silently add a missing facility.
5. Facility replacement defaults to `preserve.transform: true` and `preserve.state: true`. The adapter emits only `replace-resource` for that case. Existing `prepareCompanyChange` then carries the effective state forward. A replacement that fails `compareFacilityFunction` is a hard failure for the whole candidate.
6. `localChanges` is explicit and separate from visual replacement. Every `move` carries a complete local transform because the low-level operation does not support partial transforms. `stateChanges` is explicit and separate from replacement. State changes are validated by the resource's declared state contract.
7. Parent changes, add/remove operations, structural room edits and changes to portals are outside this minimal contract. They require an explicit layout or migration work package and must not be smuggled into a style recipe.
8. Unselected surfaces and facilities remain unchanged by default. The recipe must not reset all absent values to defaults. This is important for applying a style to an existing mixed layout with local exceptions.
9. The adapter applies all operations in one `prepareCompanyChange` transaction. It must return a candidate document and a report containing resolved IDs, operation count, previous and next revisions, and unchanged counts for facilities, regions and use points. It must not mutate the source document.
10. The adapter must expose a concrete failure code and path. On failure, the source document, saved bytes and displayed scene remain the previous valid candidate. A failed candidate is kept in a diagnostic output or report, but is never published under a successful style identity.

### Resource replacement and local-state boundary

The minimum safe rule is that a style recipe can replace a resource only when the existing function contract is identical. This includes mounting and use points even if the visual design appears similar. A change from a wall-mounted object to a floor object, a change in capacity, or a change in state schema is a rejected replacement. It needs an explicit remove/add or migration recipe with a new identity.

Transform and state preservation are independent flags. Preserving a transform does not grant permission to alter its parent or world placement. Preserving state does not grant permission to add unknown state fields. A recipe that changes a moving state or a light intensity must name the field and pass the existing range and placement checks.

The surface layer remains display-only. It cannot carry an interactive state, use point, blocking footprint or facility identity. Surface resource references are pinned by save exactly like facility resources.

## Batch input and output

The current `scripts/company-platform/batch.mjs` accepts one `input` or `document` and an optional `operations` array. It validates placement, checks local GLB bytes, writes `input.json`, `layout.json`, `save.json` and `report.json`, and publishes each item atomically under a per-key staging directory. It does not understand a style recipe today.

The smallest compatible extension is to allow one additional mutually exclusive field such as `styleRecipe` or `recipe` in each batch item.

```json
{
  "schema": "company-batch",
  "version": 1,
  "items": [
    {
      "key": "small-home-warm-v1",
      "input": {"id": "small-home-company", "spaceProfile": "small-home"},
      "styleRecipe": "scripts/company-platform/style-inputs/warm-home-v1.json"
    },
    {
      "key": "mixed-company-warm-v1",
      "document": "prototype/src/company/examples/c2-mixed-company.json",
      "styleRecipe": "scripts/company-platform/style-inputs/warm-home-v1.json"
    }
  ]
}
```

The actual batch implementation may use an inline object instead of a path. It must keep one deterministic input representation in `input.json`. Each item should produce the existing `layout.json`, `save.json` and `report.json` plus a `recipe.json` copy or a recipe digest. The report should include resolved surfaces, resolved facility IDs and candidates, dependency pins, placement checks, source hashes and the style recipe ID/version.

Each item remains independently retryable. A failure in one item must not publish a partial directory. Existing output with different bytes must remain an `output-conflict`, matching current batch behavior. A batch item that changes structure, adds missing facilities or requires an incompatible replacement should fail with a concrete recipe path and preserve the prior candidate.

## Files that can be reused and files likely to change

### Directly reusable

- `scripts/company-platform/apply-surface-recipe.mjs` for the surface expansion logic, after extracting or reusing its region and surface mapping rules.
- `prototype/src/company/document.js` for `prepareCompanyChange`, `deriveCompany`, `catalogMaps`, surface validation, replacement compatibility, revision checks and failure isolation.
- `prototype/src/company/appearance-samples.js` for `appearanceCandidates` and branch-to-candidate lookup.
- `prototype/src/company/appearance-contract.js` for the fixed-function comparison already used by `replace-resource`.
- `prototype/src/company/persistence.js` for save dependency pins and content mismatch rejection.
- `prototype/src/company/authoring.js` for asynchronous preload, retain, commit and rollback behavior.
- `prototype/src/company/placement.js` and `prototype/src/company/space.js` for placement and portal checks after the candidate is prepared.
- `scripts/company-platform/batch.mjs` for deterministic per-item publication, source hashes, dependency reporting and atomic output.

### Likely additions or narrow modifications

- Add `scripts/company-platform/apply-style-recipe.mjs` or a similarly named thin adapter. Keep the existing surface helper available for legacy v1 surface files.
- Add style recipe input examples and a CPU data QA script under `scripts/company-platform`, with at least one small-home and one mixed-company case.
- Extend `scripts/company-platform/batch.mjs` only if batch production is part of the current work package. The extension should translate the recipe to operations before the existing placement and asset checks.
- Extend `prototype/src/company/preview.js` only for a human-facing style candidate selector, resolved recipe/limitation display, and save/restore feedback. The preview should continue using `session.apply` and not manipulate the document directly.
- Update `prototype/src/company/facility-editor.js` only if the recipe needs a clickable candidate entry in the existing editor. Do not create a parallel style editor.
- Add a capability/evidence entry after a real candidate is produced and verified. This preflight report is not such evidence.

No change is currently justified in `document.js`, `appearance-contract.js` or `persistence.js` for the minimum contract. A change to those files would need a demonstrated field or migration requirement.

## Minimum CPU and browser acceptance

### CPU and data checks

1. Parse one v1 recipe and reject unknown fields, invalid selectors, duplicate selectors with conflicting writes, missing resource versions, and catalog version mismatch.
2. Apply the recipe to `c2-small-home` and `c2-mixed-company`. Check deterministic resolved IDs, revision increment, selected surface count, unchanged facility and use-point counts, and unchanged input bytes.
3. Replace at least one facility on each layout through an `appearanceCandidates` branch. Check that the resource ID changes while instance ID, parent ID, transform and state remain equal.
4. Apply one explicit local transform and one valid state patch. Check full transform validation, state range validation and expected derived placement.
5. Try one incompatible mount or function candidate and one missing surface resource. Check the error code/path and byte equality of the source document and previously saved text.
6. Encode and decode both layouts. Check that every facility and surface resource is pinned and that changing one resource's content causes `dependency-content-mismatch` while the old save remains readable with the old catalog.
7. Run placement, connections and motion-sweep checks on the candidate. A successful `prepareCompanyChange` alone is insufficient.
8. Run the batch adapter twice. The second run must be idempotent with byte-identical outputs. A changed existing output must fail without overwriting.

### Browser checks on the fixed 4196 workbench

1. Use the existing company workbench on port 4196 and fixed source/build identity. Provide a clickable style candidate entry and show the recipe ID, selected regions, resource limits and compatibility failures.
2. View `c2-small-home` and `c2-mixed-company` through room, floor and building modes. Confirm that selecting a style changes only the intended surfaces and compatible facilities, while unrelated facilities, local transforms and state remain visible.
3. For the mixed layout, switch between floor 1 and floor 2. Confirm distinct regional identities, no cross-floor replacement, and resource release after leaving the old floor.
4. Save, close the browser context, reopen and restore the exact layout, style recipe result, surface directions/scales, facility IDs, transforms and states. Import/export must preserve the same dependency pins.
5. Route a selected GLB or surface asset to a controlled failure. Confirm the previous scene, document and saved bytes remain active and the UI reports a concrete failure. Confirm a late resource response cannot overwrite a newer candidate.
6. Check actual rendered texture continuity at wall segments, door and window boundaries, floor scale and quarter-turn direction. Check facility contact, mounting, obstruction and use points where the style replaces resources.
7. Repeat style selection and room/floor switches enough to observe loaded asset counts, retained contact resources and renderer cleanup. Record browser timing and draw data separately from ordinary-device performance.
8. Treat normal PC performance, real character navigation, contact, occupancy and human visual acceptance as separate evidence. The CPU contract and browser viewer checks do not establish those results.

## Current verification and open items

The following checks were run during this preflight.

- `node scripts/company-platform/qa-surface-data.mjs` passed all 6 checks. These are data, CPU authoring, save pin and authoring resource-retain checks.
- A direct CPU invocation of `applySurfaceRecipe` applied the warm recipe to both target layouts. Small home produced 5 finishes and mixed company produced 50 finishes. Facility counts remained 8 and 86. The input documents remained byte-identical.
- The same invocation supplied an ordinary facility resource as a surface resource. Both layouts rejected the change with `invalid-surface-resource`, and the input documents remained byte-identical.
- `node scripts/company-platform/build-surface-examples.mjs --check` failed with `Stale example: c2-surface-company`. Existing generated surface fixtures therefore cannot be treated as current fixed outputs until rebuilt from a deliberate source candidate. This report does not relabel or repair that stale artifact.

Unresolved items remain explicit.

- No style-recipe adapter exists yet, so the contract above is a preflight proposal.
- The current surface helper has no explicit region selector or per-region preservation rule.
- The current batch runner has no recipe field and cannot publish a style recipe as a first-class input.
- Browser 4196 candidate selection and close/reopen evidence for a full style recipe have not been run.
- Actual GLB visual continuity, texture provenance, controlled resource failure in the full style path, ordinary-computer performance, character navigation and C3 use/contact remain unverified.
- The stale `c2-surface-company` fixture must be resolved by rebuilding from a fixed source or preserving the failure as a new candidate. It must not be accepted by changing labels or hashes.
- It remains undecided whether local transform and state overrides belong in the first style package or a separate layout-edit package. The recommended minimum keeps both opt-in and separate from resource replacement.

## Suggested next bounded package

Implement one thin style-recipe adapter and one CPU QA script. Use the existing warm surface choices plus one compatible monitor or sofa replacement on both `c2-small-home` and `c2-mixed-company`. Produce candidate layouts, `company-save@1` files and a report. Do not add structure edits, new assets, a second save format or a new editor. After CPU and deterministic batch checks pass, run the fixed 4196 room/floor/building and close/reopen checks before any visual acceptance claim.

