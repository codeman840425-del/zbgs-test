# 统一资产、GLB、资源与挂载预检设计审查

日期：2026-11-18  
工作树：`F:/gamemake-company-platform-c1`  
范围：只读检查 `asset-library.js`、`build-library.mjs`、`document.js`、`render.js` 与现有资产合同，给下一包统一预检提供可复用入口、缺口、函数依据和稳定错误码建议。本文不修改代码。

## 现有校验分层

### 资源元数据层

`prototype/src/company/asset-library.js:39-75` 的内部 `describe(resource)` 是当前最接近资源元数据预检的入口。

- `39-43` 检查稳定资源 ID 和正整数版本，错误为 `invalid-asset-resource`。
- `44-51` 复用 window、window-cover、support、moving、clock、information、mirror 和 vanity 合同校验。
- `52-55` 检查 GLB 格式、URL、SHA256 和安全字节数，错误为 `invalid-asset`。
- `56-57` 固定米制、`+Y` 上方和 `+Z` 前方，错误为 `unsupported-asset-coordinates`。
- `58-67` 检查座面/靠背 contact 字段存在，错误为 `invalid-contact-node`。
- `68-72` 检查 blocking footprint 的二维中心和正 halfSize，错误为 `invalid-asset-footprint`。

缺口在于该函数没有导出。它也没有检查 asset URL 必须是本地 `/company-assets/` 路径，没有检查 mounting 对象的统一字段，也没有验证 materialSlots/display mapping 是否对应 GLB 节点。后两项目前在实际场景加载或外观覆盖时才暴露。

### GLB 容器层

`asset-library.js:77-121` 的内部 `inspectGlb(bytes,path)` 可直接作为纯 CPU 结构检查的基础。

- `79-81` 检查 GLB magic、版本 2 和总字节数，错误为 `invalid-glb`。
- `82-96` 检查 chunk 边界、唯一 JSON 首块、JSON 解析和最多一个 BIN chunk，JSON 解析错误为 `invalid-glb-json`。
- `97-98` 拒绝 animation、skin 和带 skin 的 node，错误为 `unsupported-asset-rig`。
- `99-103` 拒绝 buffer/image 外部 URI，错误为 `external-asset-uri`。
- `105-115` 遍历 extensions，拒绝未配置的 Draco、meshopt 和 BasisU，错误为 `unsupported-asset-compression`。
- `116-120` 检查 node matrix、translation、rotation、scale 的有限性，错误为 `invalid-asset-transform`。

该层仍有三个边界。

1. `binaryChunks > 1` 会拒绝多个 BIN，但没有在 JSON 声明 buffers 时明确要求至少一个 BIN。空 BIN 或 buffer 与 chunk 不匹配应在入口给出明确错误。
2. 没有检查顶层 asset URL 的本地路径安全。`build-library` 和 package 各自检查了 `/company-assets/`，运行时元数据层仍可接受外部 URL。
3. 没有把结构报告作为 catalog 或 package 的持久证据。当前结果只在运行时加载过程中出现。

### GLTF 加载与纹理层

`asset-library.js:293-375` 的 `createCompanyAssetLibrary` 是当前唯一公开的完整导入入口。

- `301-308` 通过 fetch、bytes 和 SHA 检查得到 `asset-fetch-failed`、`asset-byte-length-mismatch`、`asset-digest-mismatch`。
- `309` 调用 `inspectGlb`。
- `310-323` 用锁定 Three.js `GLTFLoader` 加载、禁止外部 loader 请求，并调用纹理校验。
- `230-251` 的 `validateTextures` 检查纹理依赖、图像尺寸、UV 存在、UV 数量和有限值，错误为 `asset-texture-load-failed`、`missing-asset-uv`、`invalid-asset-uv`。
- `324-342` 检查有限矩阵、非空 mesh 和有限 position，错误为 `invalid-asset-transform`、`empty-asset-mesh`、`empty-asset`。
- `343` 进入专用资源与安装几何校验。

该入口是异步 runtime API，依赖 fetch、Three、GLTFLoader 和图片解码，不是适合登记脚本直接重复初始化的纯函数。`preload` 在 `366-369` 使用 `Promise.all`，多资源同时失败时只向调用方暴露首个拒绝，登记 QA 无法一次得到完整的资源失败清单。下一包应提供批量聚合包装，保留每个资源的独立 code/path。

### 实际几何与挂载层

`asset-library.js:175-228` 的内部 `validateResource(pack,description)` 已有重要 gate。

- `177-197` 无条件进入 window、cover、cable、clock、information、mirror、vanity、makeup、support、side-table、ceiling、wall-shelf 和 moving 专用 geometry 函数。各函数按 resource 字段决定是否实际检查。
- `198-203` 检查声明的 contact name 在 glTF JSON 和导入 scene 中均唯一且为 mesh，错误为 `missing-contact-mesh`。
- `205-212` 用实际导入 Box3 包围声明 blocking footprint，误差为 1mm，错误为 `asset-footprint-mismatch`。
- `213-219` 用实际导入 Box3 检查 mounting envelope，错误为 `asset-mount-envelope-mismatch`。
- `220-225` 对 `portal` 安装使用射线采样，检查真实几何不穿越净开口，错误为 `asset-blocks-portal`。

`document.js:252-332` 是实例级挂载和布局校验，不替代上述资源级几何 gate。

- `264-269` 检查 desk-surface 的父承载面和实例原点。
- `271-273` 检查 window-cover 的 parent/attachment 一致性。
- `275-315` 检查墙、洞口、门户、portal-door 和 floor-surface 的区域、方向、尺寸、边界、入口和门户重叠。
- `317-331` 检查状态、楼层、blocking footprint 和房间边界。

预检设计需要同时执行资源级和实例级两层。只执行 `prepareCompanyChange` 或只执行 asset-library 都不能证明资源已经可以进入某个房间。

### 运行时显示映射层

`render.js:189-218` 延迟检查两类侧录引用。

- `189-199` 只有节点声明 appearance materials 时才检查 `materialSlots` 和实际 mesh，错误为 `unknown-material-slot`、`missing-material-target`。
- `201-218` 在有 `display.screen` 时检查显示节点、颜色、emissive 材质和状态映射，错误为 `invalid-display-mapping`、`missing-display-mesh`、`invalid-display-material`。

这意味着一个声明了错误 materialSlots 但当前没有 appearance 覆盖的资源，可以通过 preload 和当前 render，直到用户触发材质外观时才失败。统一预检应把 materialSlots 和 display targets 提前解析到 imported pack，并在登记阶段报告。

## `build-library.mjs` 目前能复用和缺失的部分

依据 `scripts/company-platform/build-library.mjs:7-46`。

- `7-15` 读取 base catalog、应用 adaptations，并从 procedural `node` 自动生成 materialSlots。它不是 GLB 读取器，且会对 base resources 重建 materialSlots。
- `17-21` 只读取 `library-inputs.json` 显式列出的 resources 和 collections。collection 结构缺字段时没有领域级错误。
- `22-29` 验证 asset URL 在 public 目录内、文件 bytes/SHA 一致和 `license`/`sourceParameters` 非空。
- `31-42` 检查 adapter source 摘要、身份和插入位置。
- `43-46` 使用 `catalogMaps` 检查 ID/version，并直接覆盖 catalog 或比较 stale bytes。

登记层缺少以下校验。

1. 不会调用 `describe` 或 `inspectGlb`，所以 GLB 结构、压缩、外部 URI、纹理、mesh 和实际挂载均延迟到 runtime。
2. 不检查 `sourceParametersSha256`、`generatorSha256`、许可证文件或 functional contract 来源。
3. 不检查 sidecar 的 mounting、materialSlots、display mapping 和 resource 专用几何字段。
4. 不收集每个资源的完整失败列表，也不把校验结果写入可追踪报告。
5. 正常写模式直接写 catalog，失败或中断可能留下半成品。

## 统一预检的最小 API 建议

建议抽取一个 `prototype/src/company/asset-preflight.js`，由 asset-library、build-library、package QA 和固定浏览器入口共同使用。新 API 不应复制既有 geometry gate。

### 纯 CPU 层

```js
describeRegisteredAsset(resource, {path})
inspectRegisteredGlb(bytes, {path, expectedBytes, expectedSha256})
validateRegisteredProvenance(resource, {root, legacyAllowlist})
```

返回可序列化的 description 和 checks。每个函数只做确定性数据检查，不分配 Three 场景。

- `describeRegisteredAsset` 复用 `describe` 的资源 ID、asset、坐标、contact 和 footprint 检查，并新增本地 URL、mounting 基础字段、materialSlots/display target 形状检查。
- `inspectRegisteredGlb` 复用 `inspectGlb`，增加 buffers/BIN 数量关联、JSON asset version、所有声明 URI 和 chunk 长度的稳定报告。
- `validateRegisteredProvenance` 验证 source/generator/contract path、摘要和许可证存在。旧资源只通过显式 ID/version allowlist，并返回 `legacy: true`。

### 已加载场景层

```js
validateImportedAsset({resource, description, pack, parser, textureFailures})
```

该函数复用 `validateTextures` 和 `validateResource`，返回 mesh 数、contact targets、实际 XZ/y/安装 Box3、专用 gate 记录。它需要 Three/GLTFLoader 产物，因此由 `createCompanyAssetLibrary` 在 runtime 和 headless browser QA 调用，不放进单纯 catalog JSON 解析。

### 批量聚合层

```js
validateAssetSet(resources, {fetchImpl, mode: 'metadata'|'loaded'})
```

应逐项返回 `{id, version, status, checks, error}`，不要用一个 `Promise.all` 丢掉其余失败。批量报告写入 collection/evidence，package 只接受与固定 sourceDigest 对应的报告。

## 稳定错误码建议

现有错误码应保持不变。新增码只覆盖当前没有稳定诊断的边界。

| 层 | 已有代码 | 建议新增 |
| --- | --- | --- |
| 资源 ID/版本 | `invalid-asset-resource` | 保持 |
| asset 字段 | `invalid-asset` | `external-asset-url` 用于非本地 runtime URL |
| 坐标 | `unsupported-asset-coordinates` | 保持 |
| contact/footprint | `invalid-contact-node`, `invalid-asset-footprint` | `invalid-mounting-contract` 用于 mounting 字段缺失、非有限或无效 origin |
| GLB 容器 | `invalid-glb`, `invalid-glb-json` | `missing-glb-bin`、`glb-buffer-mismatch` |
| URI/扩展 | `external-asset-uri`, `unsupported-asset-compression` | 保持 |
| node transform | `invalid-asset-transform` | 保持 |
| 纹理/UV | `asset-texture-load-failed`, `missing-asset-uv`, `invalid-asset-uv` | 保持 |
| mesh | `empty-asset-mesh`, `empty-asset` | `missing-material-slot-target` 用于预检阶段提前发现 materialSlots/display target 不存在 |
| contact geometry | `missing-contact-mesh` | 保持 |
| footprint/mount | `asset-footprint-mismatch`, `asset-mount-envelope-mismatch`, `asset-blocks-portal` | 保持 |
| provenance | 当前由普通 Error 或 package path 错误表达 | `invalid-provenance`, `provenance-digest-mismatch`, `legacy-provenance-required` |
| collection/catalog | 当前多为 TypeError、duplicate 或 stale 普通 Error | `invalid-collection-entry`, `catalog-stale`, `catalog-resource-mismatch` |
| 批量 | 当前 Promise.all 首错 | `asset-preflight-incomplete` 仅用于聚合器自身未完成，单项继续使用原始错误码 |

错误 path 应稳定使用 `resources.<id>@<version>...` 或 `collection.<path>.resources[<index>]...`。消息可以变化，code/path/details 必须可被 QA 和 agent 解析。

## 最小回归矩阵

| 场景 | 复用入口 | 预期 |
| --- | --- | --- |
| 正常静态 GLB | `describeRegisteredAsset` + `inspectRegisteredGlb` + loaded gate | 通过，报告 bytes/SHA/mesh/contact/mount checks |
| GLB magic/version/总长坏 | `inspectRegisteredGlb` | `invalid-glb`，不进入 catalog 候选 |
| JSON 解析坏 | `inspectRegisteredGlb` | `invalid-glb-json`，保留 source/collection 诊断 |
| 外部 buffer/image URI | `inspectRegisteredGlb` | `external-asset-uri` |
| 未配置压缩扩展 | `inspectRegisteredGlb` | `unsupported-asset-compression` |
| asset bytes/SHA 错 | metadata/load gate | `asset-byte-length-mismatch` 或 `asset-digest-mismatch` |
| 纹理解码/UV 错 | loaded gate | `asset-texture-load-failed`、`missing-asset-uv` 或 `invalid-asset-uv` |
| contact 名称缺失/重复 | loaded gate | `missing-contact-mesh` |
| blocking footprint 越界 | loaded gate | `asset-footprint-mismatch` |
| mounting envelope 越界 | loaded gate | `asset-mount-envelope-mismatch` |
| portal 净空被模型穿越 | loaded gate | `asset-blocks-portal` |
| materialSlots 指向不存在 mesh | registered + loaded gate | `missing-material-slot-target` |
| resource mount 与 room/parent 不匹配 | `deriveCompany` | 现有 `missing-mount-region`、`invalid-surface-fit`、`invalid-wall-fit` 等 |
| provenance 缺或摘要错 | `validateRegisteredProvenance` | `invalid-provenance` 或 `provenance-digest-mismatch`。旧 ID 只接受 explicit legacy |
| 多资源同时失败 | `validateAssetSet` | 返回所有资源的独立 code/path，不丢弃后续失败 |
| 旧 procedural resource | `deriveCompany`/save | 继续兼容，不强制 asset preflight |
| 旧 GLB 资源 | metadata + explicit legacy | 保留 ID/version 和 save pins，不原地修改 resource 内容 |
| catalog stale | `build-library --check` | `catalog-stale`，旧 catalog 未覆盖 |
| 独立 package | metadata/load report + `package-company` | manifest 记录固定 sourceDigest、asset checks 和 provenance checks |

## 合同对齐结论

`docs/COMPANY-APPEARANCE-PRODUCTION-STANDARD.md:39-45,121-138` 要求米制、轴向、接触、footprint、mount、状态和实际导入检查，并明确元数据比较不证明网格接触。统一预检应将这些分成资源级 metadata、实际导入 geometry 和实例级 placement 三个结果域。

`docs/COMPANY-SURFACE-FINISH-CONTRACT-v1.txt:8-19` 要求 surface-finish 资源使用内嵌 PNG 的静态 GLB、唯一 `finish-surface` mesh、source/generator SHA，并在保存、关闭恢复和资源释放中验证。surface 预检必须额外检查 `finish.materialNode` 和 `materialSlots.finish` 的实际 mesh，而不能只通过 `document.js` 的 surface 字段校验。

`docs/COMPANY-SUPPORT-SURFACE-CONTRACT-v1.txt:9-17` 要求 supportSurfaces、supportNodes、实际板面顶高和净空。该逻辑已经有 `validateSupportGeometry` 调用，但登记层不能只检查 sidecar 数组，必须在 loaded gate 运行真实 mesh 支撑面检查。

`docs/COMPANY-CABLE-CONTRACT-v1.txt:4-9` 要求端点、接口和连接状态与真实几何一致。资源预检应保留 cable port geometry gate，实例级 `deriveCableConnections` 继续检查 endpoint 引用和保存恢复。

## 最小接入顺序

1. 先抽取并导出 metadata/GLB structural 校验，保持现有错误码。
2. 增加 provenance、local URL、mounting 基础字段和 material/display target 预检。
3. 用批量聚合器接入 `build-library`，生成每资源可序列化结果。
4. 用同一 description 调用现有 asset-library loaded geometry gate，生成 fixed browser/Node QA 证据。
5. 将报告摘要写进 catalog production evidence 和 independent transfer manifest，package 只复核不重新发明规则。
6. 先回归旧 procedural/GLB save restore，再接入新资源和新的 style recipe。

本审查没有修改代码、catalog、sidecar 或构建产物。

