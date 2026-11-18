# 素材登记与独立移交边界审查

日期：2026-11-18  
工作树：`F:/gamemake-company-platform-c1`  
范围：只读核对 `build-library.mjs`、`package-company.mjs`、`asset-library.js` 的可复用校验边界，旧资源 provenance、catalog stale、未跟踪素材和旧存档兼容读取。本文给出最小安全修改方案和回归矩阵，不修改代码、catalog 或构建身份。

## 现场状态

当前 catalog 有 219 个资源，其中 211 个带 GLB，8 个为旧的 procedural/node 资源。

- 210 个 GLB 资源同时有 `provenance.license`、`sourceParameters`、`sourceParametersSha256`、`generator` 和 `generatorSha256`。
- 唯一缺少这组最小字段的是 `concept-acoustic-panel@1`。它有 `sourceImage` 和 `sourceImageSha256`，但没有 `sourceParameters`、`sourceParametersSha256` 或 `generatorSha256`。它的 `generator` 文件当前摘要为 `57e8c72fb0e7af5bf694a4f017c453cbf657731bb05a6ede98d735ee2fbcbb12`，catalog 没有对应 pin。
- 133 个 GLB 资源有 `functionalContractSource` 及摘要。其余 78 个主要是旧家具、建筑覆盖件、饰面或简单设备。functional contract 字段在现有 package 逻辑中是可选项，不能把缺少它们直接等同为损坏。
- 8 个无 GLB 的 procedural 资源不走 package 的 asset provenance 循环。它们保留 `sourceFile`、`sourceCommit` 等旧记录即可，不需要为了本次 GLB 登记强行改写。
- `node scripts/company-platform/build-library.mjs --check` 当前失败并输出 `Registered catalog is stale`。固定 catalog 与 library-inputs/collection 输入尚未重新对齐。
- 当前 `prototype/public/company-build-info.json` 的 `inputs` 包含 12 个 Git 未跟踪的 `public/company-assets/headphones-and-stand/...` 文件。这些文件不在现有 catalog 的 headphones-v1 路径中，却已经进入当前 build ID 的 623 项输入集合。

## 可复用校验入口边界

### `build-library.mjs`

当前入口可复用的部分是 catalog 汇总和基础文件身份检查。

- 读取 base catalog、`library-inputs.json` 的显式 resources、collections 和 adapters。
- 检查 asset URL 位于 `/company-assets/`，文件在 `prototype/public` 内，文件字节数和 SHA 与 sidecar 一致。
- 检查 sidecar 至少有非空 `provenance.license` 和 `provenance.sourceParameters`。
- 最后通过 `catalogMaps` 检查资源 ID/version 的重复和合法性。

它没有复用 `asset-library.js` 的 GLB 容器、纹理、节点、footprint、mounting 或专用 geometry 检查。它也没有校验 provenance 的 source hash、generator hash、许可证文件或 collection 的结构完整性。对已有 base catalog 资源，只做 adaptation 后直接保留，不检查其旧 provenance。

### `asset-library.js`

文件内部已有三层可复用逻辑，但目前没有导出纯 CPU 校验 API。

1. `describe(resource)` 校验资源 ID/version、GLB asset URL/SHA/bytes、坐标、contact 节点声明和 blocking footprint 字段。
2. `inspectGlb(bytes, path)` 校验完整 GLB v2、JSON/BIN chunk、禁止外部 URI、禁止 skin/animation、禁止压缩扩展和有限 node transform。
3. `validateResource(pack, description)` 在 GLTFLoader 完成后检查纹理解码、mesh、contact mesh、footprint、mounting envelope、门户净空和各类资源专用 geometry gate。

对外公开的是 `createCompanyAssetLibrary({fetchImpl})` 的异步 `preload`、`instantiate`、`retainOnly` 和 `snapshot`。它适合运行时和现有 Node QA 中用 fake fetch 做检查，但目前 `describe`、`inspectGlb` 和 `validateResource` 不是可直接调用的纯入口。把整个浏览器 asset library 在 build-library 内部重复初始化会引入 GLTFLoader/纹理解码和资源释放边界，不建议直接复制一套规则。

### `package-company.mjs`

当前 package 入口复用的部分是独立交付身份和来源摘要。

- 读取固定 `company-build-info.json`，要求 build ID/sourceDigest 与 dist 一致。
- 把 build manifest 的所有 `src/company`、`public/company-assets` 和 fixed input 复制到 transfer package，并检查 source digest。
- 对 catalog 的每个 asset 再检查本地 GLB bytes/SHA、viewer asset 是否存在。
- 对 provenance 的 `sourceParameters`、`generator` 和可选 `functionalContractSource` 做路径边界及文件 hash 检查，并把来源文件加入 supplemental source。
- 对 save/layout 使用现有 `decodeCompanySave`，因此仍能验证 resource/template content pins。

它没有调用 `asset-library` 的 GLB 或 mounting 预检，也没有检查 Git 是否 clean。它信任 build-info 的输入集合。若一个未跟踪文件在 build-info 生成前已位于递归扫描目录，它会成为合法构建输入并进入 sourceDigest、dist 和 package。

## 必须处理的边界缺陷

### P0  catalog stale 阻断固定复现

**复现**

```powershell
node scripts/company-platform/build-library.mjs --check
```

**结果**  
当前结果为 `Registered catalog is stale`。

**最小安全修改**  
先固定本轮 collection、resource sidecar 和登记顺序，重新生成 catalog，再把 `build-library.mjs --check` 纳入固定构建门禁。检查失败时保留当前 catalog 和失败日志，不通过变更标签或跳过 check 发布。此步骤优先于任何独立移交。

### P0  未跟踪素材已污染 build identity

**根因**  
`prototype/scripts/build-company-id.mjs` 递归扫描 `src/company` 和 `public/company-assets`，不检查 Git tracking 状态、allowlist 或 source manifest。当前 build-info 的 `inputs` 已包含 12 个未跟踪的 headphones 输出文件：

```text
public/company-assets/headphones-and-stand/headphones-halo-display/v1/...
public/company-assets/headphones-and-stand/headphones-in-ear-case/v1/...
public/company-assets/headphones-and-stand/headphones-on-ear-angle/v1/...
public/company-assets/headphones-and-stand/headphones-overear-arc/v1/...
```

这些路径不属于当前 catalog 的 headphones-v1 资源，但会改变 sourceDigest，进而改变 build ID、dist 输入和 package 内容。

**最小安全修改**  
构建身份生成前，对递归输入执行明确的 tracked/allowlisted 检查。建议把允许进入身份的未跟踪文件列入一个版本化 `company-build-inputs.json`，默认拒绝未列出的文件。对当前 12 个文件先决定它们是正式资源并补齐登记，还是移出 build input 再重建。不能仅依赖 `git status` 的人工观察，也不能把 untracked 目录静默当作正式资源。

### P1  `concept-acoustic-panel@1` 旧 provenance 会阻断 package

**根因**  
`build-library.mjs` 对 base catalog 资源不检查旧 sidecar provenance。`package-company.mjs` 却对 catalog 中每个 asset 无条件读取 `sourceParameters`、`generator` 和相关 pin。`concept-acoustic-panel@1` 缺少 `sourceParameters` 和两个摘要字段，进入 package 时会在 unsafe/缺失来源路径阶段失败，哪怕当前 company save 根本没有使用它。

**旧资源处理建议**  
不要原地向 `concept-acoustic-panel@1` 追加 provenance。resource 对象内容变更会改变 `company-save@1` 的依赖 SHA，任何引用旧版本的存档都可能出现 `dependency-content-mismatch`。保留 `@1` 作为兼容读取版本，建立明确的 legacy provenance allowlist 或迁移记录。新生产结果使用 `concept-acoustic-panel@2`，引用同一 GLB 时也要生成新的完整 sidecar、资源摘要和交付证据。配方候选默认排除 legacy @1。

### P1  登记阶段没有 GLB/挂载纯校验

**根因**  
`build-library.mjs` 和 `package-company.mjs` 只验证 asset bytes/SHA、路径和部分 provenance。GLB 结构和实际安装包络只在运行时 asset-library 加载后检查。错误会延迟到浏览器 preload，且无法在 catalog 生成阶段定位。

**最小安全修改**  
从 `asset-library.js` 提取共享的结构校验模块。

- Node 可执行的纯入口负责 resource metadata、GLB v2/chunk、内嵌 buffer/image、外部 URI、skin/animation、compression、有限 transform、bytes/SHA。
- 需要真实 Three 场景的 contact、footprint、mounting 和专用 geometry gate，沿现有 `createCompanyAssetLibrary` 或固定 headless browser QA 执行。
- build-library 在登记前至少运行第一层并验证来源 pin。独立 package 在固定输入上运行第二层 QA，并在 transfer manifest 中记录校验报告及其 sourceDigest。

不要在 build-library 和 asset-library 各复制一份规则。错误 code/path 要保持相同命名，便于 agent 从侧录回溯到具体字段和模型。

### P1  build-library 只检查 provenance 存在，不检查 provenance 内容

`build-library.mjs` 只要求 `license` 和 `sourceParameters` 非空。它不验证 `sourceParametersSha256`、`generatorSha256`、functional contract pin 或许可证实际文件。package 阶段才会部分检查，导致登记成功、交付失败的长反馈回路。

**最小安全修改**  
登记阶段验证所有存在的 provenance path 和对应 hash。新资源强制 source parameter、generator、generator hash，功能性资源强制 contract source/hash。旧兼容资源通过显式 legacy allowlist，不以缺字段的普通资源身份继续进入新生产。

### P2  collection 发现和 catalog 注册没有 orphan 报告

`library-inputs.json` 只读取显式 `collections`。未被列出的 `assets-source/company-*` collection、sidecar 或模型不会被登记，也没有 orphan 诊断。建议在不自动吸收全部素材的前提下，扫描生产根目录并输出 `discovered`、`registered` 和 `orphaned` 三组清单。对 orphan 给出失败或明确警告，避免新模型完成后只停在概念图和磁盘文件阶段。

### P2  catalog 写入不是安全发布

`build-library.mjs` 的正常模式直接写目标 catalog。进程中断时可能留下部分 JSON。建议沿 batch/package 的 stage + rename 模式写入，`--check` 继续比较最终字节。生成的 catalog、collection digest 和失败诊断应来自同一固定源快照。

## 旧资源迁移与兼容读取分类

| 资源类别 | 当前状态 | 处理建议 |
| --- | --- | --- |
| `concept-acoustic-panel@1` | 有 GLB，source image provenance 存在，source parameter/generator pin 不完整 | 保留 @1 兼容读取，加入 legacy allowlist。新建完整 @2 或完成显式迁移后再作为新候选。不要原地改 @1 内容字段。 |
| 其余 210 个带 GLB资源 | 具备最小 source/generator provenance 和摘要 | 可兼容读取。登记阶段补做 hash、GLB 结构和挂载预检，不改资源 ID/version。 |
| 78 个缺 `functionalContractSource` 的 GLB 资源 | 主要是旧静态家具、覆盖件、饰面和简单设备 | 可兼容读取。饰面和纯装饰不强制补功能 contract。后续改变 mount/use/state 的新版本必须提供 contract。 |
| 8 个无 GLB procedural 资源 | 旧 `node` 形态，含 sourceFile/sourceCommit 等记录 | 可兼容读取，不参加 GLB package provenance 循环。只有转成独立 GLB 时才进入新资源登记合同。 |
| 新生成但未登记的 headphones 文件 | 当前 build-info 已吸收，catalog 未引用对应路径 | 在固定构建前作正式登记或移出输入并重建 build-info。不能继续作为隐式构建内容。 |

## 最小安全修改方案

### 登记层

1. 固定输入快照和 catalog 版本，先解决 stale。
2. 增加 resource/collection schema 校验、provenance pin 校验和 orphan 清单。
3. 对旧 resource 只读兼容采用版本化 legacy allowlist。新资源不得复用 legacy 例外。
4. 写 catalog 使用临时文件加原子 rename，失败不覆盖旧 catalog。
5. 共享纯 GLB metadata 校验，禁止 build-library 自己复制 asset-library 规则。

### 构建身份层

1. build ID 输入由版本化 allowlist 生成，不再无条件递归吸收所有 public asset。
2. manifest 记录每个输入的 tracking/allowlist 状态、来源分类和 SHA。
3. build 前拒绝未跟踪且未 allowlist 的 `src/company` 或 `public/company-assets` 文件。
4. assets-source 和 scripts/company-platform 的生产依赖通过 provenance/extraFiles 显式纳入移交清单，不假装它们已经属于 runtime build identity。

### 独立移交层

1. `package-company` 继续验证 sourceDigest、catalog resource SHA 和 save pins。
2. 对所有 catalog asset 执行至少一次登记报告中记录的 GLB metadata gate。
3. provenance 失败在登记阶段出现一次，在 package 阶段再独立复核一次。
4. transfer manifest 明确列出 legacy assets、未使用资源、实际 save 依赖和生产来源。
5. 独立包恢复旧 `concept-acoustic-panel@1` 存档时，使用旧 resource 内容和 legacy 记录，不自动替换为 @2。

## 回归矩阵

| 场景 | 入口 | 预期结果 |
| --- | --- | --- |
| 当前 catalog 与 collections 同步 | `build-library.mjs --check` | 通过，输出 catalog bytes 与固定源一致 |
| catalog stale | 修改一个 collection/resource sidecar 后运行 check | 失败 `catalog-stale` 类错误，旧 catalog 未被覆盖 |
| 旧 concept @1 存档 | `decodeCompanySave` 使用旧 catalog/resource | 成功恢复旧文档，resource ID/version 不变 |
| 新 concept @2 | 登记、asset preload、save/restore | 新资源有完整 provenance、GLB gate 和独立 pin |
| 旧 procedural 无 asset | `deriveCompany`、save/restore | 继续兼容，不要求 GLB provenance |
| provenance 缺 source hash | `build-library` | 新资源失败并指出 resource、field、source path。legacy allowlist 仅对明确旧 ID 生效 |
| provenance 内容被改 | `build-library` 与 package | 登记和 package 都拒绝，报告 declared/actual SHA |
| 外部 URI/坏 GLB | 共享 GLB metadata gate | 在 catalog 发布前失败 `invalid-glb` 或 `external-asset-uri` |
| mount envelope 越界 | asset-library/headless geometry gate | 在交付候选前失败 `asset-mount-envelope-mismatch`，不进入成功清单 |
| 未跟踪 runtime asset | build-id | 未 allowlist 时拒绝，或显式登记后进入 manifest。不能静默改变 build ID |
| untracked assets-source 依赖 | provenance/package | 不改变 runtime build ID，缺 source pin 时 package/登记失败，报告来源缺口 |
| package 后文件新增 | package source input comparison | `package-source-inputs-mismatch`，不生成部分独立包 |
| package source dirty but allowlisted | package source digest | 只在 manifest 明确列出并 SHA 匹配时通过 |
| catalog resource 未被 save 使用 | package | 可保留在 catalog，但仍须满足登记元数据或 legacy allowlist。save dependency 只 pin 实际使用资源 |
| 旧 save 依赖资源内容变化 | `decodeCompanySave` | `dependency-content-mismatch`，旧存档和旧 catalog 保留，不能静默迁移 |

## 边界结论

旧资源兼容读取和新资源生产登记应分开。现有 210 个完整最小 provenance 的 GLB 资源可以沿原 ID/version 继续读取，8 个 procedural 资源也不需要改造成 GLB。唯一必须进入迁移/legacy 分支的是 `concept-acoustic-panel@1` 的缺失 provenance。当前 12 个未跟踪 headphones runtime 文件必须在固定构建前作正式登记或排除，否则 build-info 已经把未跟踪磁盘内容当作构建身份的一部分。

本审查没有执行 catalog 重建、资产迁移、GLB 导出或独立 package，也没有更改当前工作树状态。

