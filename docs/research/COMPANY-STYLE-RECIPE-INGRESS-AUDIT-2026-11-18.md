# 整屋风格配方接入缺陷审计

日期：2026-11-18  
工作树：`F:/gamemake-company-platform-c1`  
范围：审计“概念图或新模型 → 资源侧录 → GLB 读取 → catalog 登记 → 挂载约束 → 保存恢复 → 独立交付”的自动化入口和失败诊断。本文只记录审计结果，不修改代码，也不把新增脚本的 CPU 或浏览器试验扩大为素材生产通过。

## 结论摘要

当前整屋样式脚本已经可以调用 `prepareCompanyChange` 并生成 `company-save@1`，但素材接入仍有多个断点。最严重的断点是样式替换对布局中的基础资源静默跳过，导致“整屋换装”只换饰面或只换已有候选资源。独立交付还没有包含新样式脚本和配方输入。资源登记脚本检查文件字节和来源字段，却没有在写入 catalog 前复用 `asset-library` 的完整 GLB、纹理、挂载和专用几何检查。

本轮已观察到以下可复现事实。

- `node scripts/company-platform/test-style-recipe.mjs` 报告 5 项通过，但测试没有断言每个请求分支都产生替换，也没有执行资源登记或独立打包。
- `node scripts/company-platform/build-library.mjs --check` 当前失败，错误为 `Registered catalog is stale`。固定 catalog 不能作为当前生产输入的可重复结果。
- 直接运行 `apply-style-recipe.mjs` 对 `c2-small-home` 和 `warm-live.json` 只生成 5 个表面操作，没有任何 `replace-resource` 操作。该样件的 8 个设施仍为基础 `desk`、`monitor`、`keyboard`、`desk-microphone`、`chair`、`fill-light`、`plant` 和 `lounge-sofa`。
- 同样的样式对 `c2-mixed-company` 生成 50 个表面操作和 57 个设施替换，但楼层和房间中的基础资源仍被跳过。脚本把“没有命中候选”视为正常，不在结果中报告跳过项。
- 样式 CLI manifest 的 `output.sha256` 是对没有结尾换行的 `JSON.stringify` 计算，实际写入文件带有换行。实测 manifest hash 与 `Get-FileHash` 不相等。

## 按严重程度排序的缺陷

### P0  固定资源 catalog 当前不可核验

**现象**  
`node scripts/company-platform/build-library.mjs --check` 在当前树失败并输出 `Registered catalog is stale`。因此 catalog、侧录集合和生产脚本之间没有一个可被固定构建接受的共同字节身份。任何依赖当前 catalog 的样式结果都不能直接称为固定候选。

**复现入口**

```powershell
node scripts/company-platform/build-library.mjs --check
```

**最小修复**  
在固定源候选上重新运行登记流程，审查并提交生成的 `prototype/src/company/library-catalog.json`，随后把 `build-library.mjs --check` 纳入固定构建门禁。若生成差异来自新资源或新注册脚本，先补齐 collection 和 provenance，再生成 catalog。不要通过改标签或跳过 check 接受旧 catalog。

### P1  基础设施被样式配方静默跳过

**根因**  
`apply-style-recipe.mjs` 的 `facilityOperations` 为每个允许 branch 构造 `appearanceCandidates` 的 ID 映射。`appearanceCandidates` 只返回带 asset 且属于该 branch 的最新外观候选。布局中的基础资源 ID，例如 `desk`、`monitor`、`keyboard`、`desk-microphone`、`chair`、`fill-light` 和 `plant`，不在候选映射中。`facilityOperations` 对找不到 branch 的节点直接 `continue`，也不产生 skipped 记录或失败。

**复现入口**

```powershell
node --input-type=module -e "import fs from 'node:fs/promises';import {applyStyleRecipe} from './scripts/company-platform/apply-style-recipe.mjs';for(const l of ['c2-small-home','c2-mixed-company']){const d=JSON.parse(await fs.readFile('./prototype/src/company/examples/'+l+'.json'));const r=JSON.parse(await fs.readFile('./scripts/company-platform/style-recipes/warm-live.json'));const x=applyStyleRecipe(d,r);const replacements=x.operations.filter(o=>o.type==='replace-resource');console.log(JSON.stringify({layout:l,totalOps:x.operations.length,replacements:replacements.length,changedIds:replacements.map(o=>o.id)}));}"
```

当前输出为 `c2-small-home totalOps=5 replacements=0`。这表示该配方成功返回文档，却没有替换任何设施。

**最小修复**  
把“目标槽位”与“现有基础资源”分开解析。至少按资源的 `mountRole`、`productionBranch` 和已声明的工位 part key 建立稳定的 branch 映射，或在配方中允许显式 `targetIds`。对每个声明的 branch 统计匹配、替换和跳过数量。若配方声明要替换某类设施而布局中存在该类设施但没有可用候选，应返回明确错误并保留旧文档。补一条小民房回归，要求 `replacements > 0` 且每个请求的工位槽位均有结果。

### P1  样式 CLI 的输出身份 hash 错误

**根因**  
CLI 以 `JSON.stringify(result.document)` 计算 manifest 的 `output.sha256`，实际输出通过 `JSON.stringify(...) + '\n'` 写入。manifest 不能证明实际交付文件的字节。

**复现入口**

```powershell
$tmp = Join-Path $env:TEMP 'style-audit'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$out = Join-Path $tmp 'out.json'
node scripts/company-platform/apply-style-recipe.mjs prototype/src/company/examples/c2-small-home.json scripts/company-platform/style-recipes/warm-live.json $out
$manifest = Get-Content ($out + '.style.json') -Raw | ConvertFrom-Json
Get-FileHash -Algorithm SHA256 $out
$manifest.output.sha256
```

实测两者不相等。

**最小修复**  
先构造最终 `Buffer`，用同一字节同时写 `output.json` 和计算 manifest hash。增加断言，读取输出文件后的 bytes 和 manifest 完全一致。

### P1  样式 CLI 不是原子发布，可能留下半成品

**根因**  
CLI 先以 `wx` 写布局文件，随后再以 `wx` 写 `.style.json`。进程在第二次写入前退出，或 manifest 已存在导致第二次写入失败时，布局文件仍然留在输出位置。该入口没有 `batch.mjs` 使用的 stage 目录、锁和最终 rename。

**复现入口**  
在一个新输出路径预先创建同名 `.style.json`，再运行上一节命令。预期命令失败，实际布局文件已被留下。进程中断可产生同样状态。

**最小修复**  
沿 `batch.mjs` 的 staging 目录和 `package-company.mjs` 的锁/rename 模式发布布局、manifest 和诊断文件。失败时只清理自有 stage。已存在且字节一致的结果可以幂等返回，不同字节必须报冲突。

### P1  生成和发布前没有统一的 GLB 读取与挂载预检

**根因**  
`build-library.mjs` 对 collection 侧录只检查 `asset.bytes`、`asset.sha256`、`provenance.license` 和 `provenance.sourceParameters`，然后直接把资源对象推入 catalog。`package-company.mjs` 也只检查 catalog 中 GLB 的路径、长度和 SHA。两者都没有调用 `createCompanyAssetLibrary`、`inspectGlb`、`validateResource` 或资源专用几何验证。

因此一个字节和 SHA 正确、但 GLB 外部引用、缺 BIN、缺纹理解码、缺挂载节点、穿出 mounting envelope 或阻塞门洞的侧录，可以通过登记和打包，直到浏览器 preload 或实例化时才失败。

**复现入口**  
在一个 collection 中登记一个内容 hash 正确的坏 GLB，侧录保留合法的 asset 字段和来源字段，然后运行：

```powershell
node scripts/company-platform/build-library.mjs
node scripts/company-platform/package-company.mjs FIXED_DIST BUILD_ID SAVE_OR_BATCH_RESULT OUT_DIR --source FIXED_SOURCE_ROOT
```

登记和 package 阶段只会看到 bytes/SHA 检查。将该资源放入布局后，固定 viewer 的 `createCompanyAssetLibrary().preload()` 才会报 `invalid-glb`、`external-asset-uri`、`missing-contact-mesh` 或 `asset-mount-envelope-mismatch`。

**最小修复**  
抽取 asset-library 的纯 CPU GLB/资源验证入口，让每个生产生成器和 `build-library.mjs` 在 catalog 写入前执行。至少覆盖完整 GLB v2、内嵌 buffer/image、无 skin/animation、有限 transform、有效纹理 UV、声明 contact mesh、footprint、mounting envelope、门户净空和已有资源专用几何 gate。保留同一错误 code/path，避免登记阶段和浏览器阶段出现两套诊断。

### P1  独立交付没有包含样式接入入口和配方

**根因**  
`package-company.mjs` 的 `extraFiles` 明确包含 `apply-surface-recipe.mjs` 和 surface 输入目录，但没有 `apply-style-recipe.mjs`、`style-recipes/`、`build-style-recipe-examples.mjs`、`test-style-recipe.mjs` 或 `qa-style-recipe-preview.*`。固定 viewer 可以带着样式结果布局交付，却无法在独立包内复现或继续应用该样式。

**复现入口**  
查看 `scripts/company-platform/package-company.mjs` 的 `extraFiles`，或对独立包的 `source/scripts/company-platform` 搜索 `style-recipe`。当前清单不会加入这些文件。

**最小修复**  
把样式适配器、schema/输入、生成器、CPU QA、browser QA 和 style recipe 目录纳入固定 package grammar。若样式配方作为 batch result 的输入，额外把原始 recipe JSON、recipe SHA 和 resolved operation report 放进交付包，并在 transfer manifest 中列出。

### P1  新资源 provenance 在登记阶段只检查存在，不检查内容 pin

**根因**  
`build-library.mjs` 只要求 `provenance.license` 和 `provenance.sourceParameters` 为真值。它不核验 `sourceParametersSha256`、`generatorSha256`、functional contract 来源或这些文件的当前内容。`package-company.mjs` 才会在交付时对部分字段做 hash 检查。

**复现入口**  
把一份已登记 resource sidecar 的 `provenance.sourceParametersSha256` 改成错误的 64 位值，保持 GLB bytes/SHA 不变，重新运行 `build-library.mjs`。登记阶段仍可能生成 catalog，之后 package 阶段才在 `production-source-hash-mismatch` 失败。

**最小修复**  
登记阶段就按 package 允许的路径规则读取每个 provenance source，验证其摘要、许可文件和 functional contract pin。错误定位应包含 resource ID、provenance 字段和源路径。package 继续保留独立复核。

### P2  collection 到 catalog 的注册覆盖没有闭环报告

**根因**  
`library-inputs.json` 通过显式 `collections` 路径加入资源。`build-library.mjs` 会读取列出的 collection，但不会扫描 `assets-source/company-*` 中是否存在未被引用的 collection、resource sidecar 或 model。新模型和侧录若忘记添加 collection 路径，会被静默留在 catalog 之外。

**复现入口**  
在 `assets-source/company-*` 新增合法 collection 和 resource sidecar，但不改 `scripts/company-platform/library-inputs.json`，运行 `build-library.mjs`。没有“未注册生产输出”的诊断。

**最小修复**  
让生产集合声明自己的 collection manifest，并在登记阶段生成 `discovered`, `registered`, `orphaned` 三组报告。对孤立 sidecar 给出可定位警告或失败。不要自动把所有素材目录盲加到运行 catalog。

### P2  sidecar 和 collection 结构错误缺少领域错误码

**根因**  
`build-library.mjs` 直接访问 `collection.resources`、`entry.resourcePath`、`resource.asset`。缺少字段时可能得到普通 `TypeError` 或路径级字符串错误，而不是统一的 resource/collection 诊断。`catalogMaps` 只检查 ID 和版本，不能替代资源结构校验。

**复现入口**  
将 collection 的 `resources` 改为非数组，或将一个 entry 改为没有 `resourcePath`，运行 `build-library.mjs`。

**最小修复**  
在读取 collection 和 resource sidecar 时增加 schema 校验，错误至少包含 collection 路径、entry 索引、resource 路径和缺失字段。统一复用 asset-library 的资源描述校验。

### P2  样式配方身份没有 catalog/source pin，且目标覆盖范围不足

**根因**  
当前 `apply-style-recipe.mjs` 的 `allowedTop` 只允许 `version`、`id`、`name`、`surfaces`、`facilities`。配方没有 catalog ID/version、输入 source hash、资源版本集合、显式 region ID、局部 transform 或 state patch。区域只能按所有 room/area 和 purpose 展开，设施只能按 branch 和 purpose 展开。配方无法精确表达“二层某个房间保留局部例外”，也无法在 catalog 漂移时拒绝错误候选。

**复现入口**  
向现有 `warm-live.json` 添加 `catalog` 或 `regions` 会收到 `Unknown style recipe field`。同一配方在 catalog 候选变化后仍由运行时的本地 `appearanceCandidates` 解析。

**最小修复**  
补充 catalog pin、recipe source digest、显式 region/facility target selectors 和 resolved candidate manifest。对未命中的目标提供 skipped 统计或失败。局部 transform/state 继续作为显式可选层，不能暗含在普通资源替换中。

## 当前测试覆盖缺口

`test-style-recipe.mjs` 的五项检查覆盖资源身份保留、第二布局、输入文档不变、保存恢复和版本拒绝，但没有覆盖下列入口。

- 基础资源是否被实际替换，尤其是 `c2-small-home` 的 0 replacement 情况。
- 不兼容安装、mountRole、使用点、状态 schema 或 GLB 几何是否在生成阶段失败。
- sidecar 来源 hash、许可证文件和 collection 注册是否完整。
- 样式 CLI 输出 manifest 是否等于真实文件 bytes。
- CLI 中断、已存在 manifest、批量幂等和半成品清理。
- 独立包是否包含 style recipe、生产脚本、输入、QA 和 source digest。
- 普通 browser preload 之前的完整 GLB/纹理/挂载 gate。

`qa-style-recipe-preview.mjs` 和 `.cjs` 能对已经生成的布局执行 SwiftShader 预览、保存和重启，但它们不证明从新模型侧录到 catalog 的路径，也不检查独立交付内容。当前报告不把这些 browser 试验称为普通设备性能或 C3 角色使用证据。

## 建议的最小修复顺序

1. 先恢复 `build-library.mjs --check` 绿状态，固定 catalog 和 collection provenance 身份。
2. 修复样式 branch 解析，使基础资源也能命中目标槽位，并对零命中和部分跳过显式失败或报告。
3. 修复 CLI 字节 hash 和 stage 发布，补输入 recipe、resolved operations 和失败诊断。
4. 在 `build-library.mjs` 与生产生成器前接入统一 CPU GLB/资源/挂载预检，保留 asset-library 的错误码和路径。
5. 将样式入口、配方、QA 和生产依赖加入 `package-company`，执行独立包中保存、恢复、继续编辑和再次应用配方的检查。
6. 再做 4196 browser 验证和视觉验收。普通电脑、角色导航、接触、占用和 C3 仍单独验收。

## 审计边界

本审计没有修改代码、catalog、sidecar 或构建产物。`test-style-recipe.mjs` 被运行并报告 5 项通过，`build-library.mjs --check` 被运行并报告 catalog stale。输出 hash 不一致通过临时目录复现。完整坏 GLB 登记尚未写入工作树，相关缺陷依据现有入口的实际检查范围和可定位的后续 browser 错误路径记录，避免制造新的坏资产。

