# 公司环境与设施平台外部调研 v1

- 调研日期 2026-11-18
- 调研范围 模块化空间、设施与装饰变体、父子依附、约束摆放、预览与验收、批量导入、保存版本
- 对照方案 F:/gamemake-company-platform-c1 当前的 Three.js 渲染、结构化 JSON 布局、GLB 资源、资源版本与 SHA 记录
- 结论性质 只读外部调研。没有修改代码、启动服务、安装插件或宣称任何外部工具已经接入本项目
- 页面核验 2026-11-18 对核心 Epic、Unity、SideFX 与 Blender 官方链接执行 HTTP 200 检查。页面内容和许可条款仍应在实际采用时按版本与地区重新核对

## 结论摘要

成熟工具把可复用内容拆成资源模板、可重复实例和参数化生成过程。实例保存父级、局部变换、变体或覆盖值，运行时再解析成世界变换。约束通常由编辑器或程序化工具提供，最终的项目语义检查仍由项目自己的规则完成。批量导入普遍带有可重复的导入配置、临时预览结果和显式固化步骤。版本升级通过源文件、资产包、场景文件和源代码管理配合实现，已有实例不会因为模板变化而隐式改变。

| 工具链 | 已证实的成熟机制 | 对公司平台的可复用输入输出 | 主要差异与限制 |
| --- | --- | --- | --- |
| Unreal Engine 5 | Level Instance、Packed Level Blueprint、Data Layers、PCG、Foliage、Interchange、Asset Manager、Source Control | 模块或设施模板 → 变换后的实例/布局包；导入管线 → 资产清单和预览；主资产与依赖可按需加载 | 资产保存为 UE 包和 Actor。浏览器 Three.js 无法直接消费 uasset、Data Layer 或 PCG 图 |
| Unity | 嵌套 Prefab、Prefab Variant、Prefab Mode 预览、AssetPostprocessor、Addressables、版本控制 | Prefab 模板和覆盖值 → 场景实例；导入回调 → 固定导入配置；目录和内容状态 → 发布版本 | Prefab、Scene、Addressables Catalog 是 Unity 专有格式。约束摆放和使用点语义仍需项目脚本 |
| Houdini Engine for Unreal/Unity | HDA 参数、几何/曲线/世界输入、实例化输出、Recook/Rebuild/Bake、PDG 批处理、命名空间与版本 | 结构化参数与输入几何 → 可重复生成的 GLB/材质/碰撞及 sidecar；cook 结果 → 预览；bake 结果 → 固化发布资源 | 生成依赖 Houdini Engine 运行时与许可证。浏览器只适合消费烘焙结果，不适合直接执行 HDA |
| Blender | Asset Library 与 Catalog、Collection/Geometry Nodes 实例、父子层级、Library Overrides、glTF extras | 可编辑源库和变体 → GLB 加 extras；集合实例 → 模块化资源；Override → 可追踪的局部覆盖 | Blender 视口和节点图是制作端。约束和验收不自动成为游戏运行合同，库引用丢失或层级变化时需要人工处理 |

## 1. Unreal Engine 5

### 模块化空间和设施变体

Level Instance 把一组 Actor 保存成可重复放置的子关卡。官方文档将普通 Level Instance 用于兴趣点和独立玩法组合，将 Packed Level Blueprint 用于静态建筑或密集视觉组合。复制出的实例仍指向同一模板，编辑后提交会传播到该模板的其他实例。Level Instance 也能放进 World Partition 的 Data Layer，实例内 Actor 默认继承所属层的 Data Layer。官方示例用它切换节日主题物件，这对应公司场景中按主题或设施状态切换装饰层。

- 可复用输入 资源模板、子布局、实例变换、Data Layer 名称
- 可复用输出 可重复放置的空间实例、按层启用或隐藏的变体、编辑后统一传播的模板
- 接入建议 在 JSON 中把空间模块写成稳定的 `templateId` 和 `instanceId`。变体写成显式的 `variantId` 或可启用层，不能让模板更新隐式改写已保存公司布局
- 限制 Packed Level Blueprint 偏向静态优化，不能直接代替角色使用点、预约状态或设施行为

Actor 的 SceneComponent 具有父子层级。子组件的变换相对父组件保存，父组件移动、旋转和缩放时子组件继承变化。这个机制适合直播工位、桌面设备、灯具支架和桌面麦克风一类组合设施。

### 约束摆放和批量布置

Foliage Mode 可以在允许过滤的地面或其他几何上批量绘制 Static Mesh Foliage 或 Actor Foliage。工具提供对齐法线、随机朝向、刷涂、填充、重应用和移动等操作。Static Mesh Foliage 采用硬件实例化批量渲染，Actor Foliage 则具有普通 Actor 的成本。公司平台可以借鉴“目标表面过滤 + 变换规则 + 批量实例”的分层设计，但座位接近区、承载面、门口通路和离开空间仍需要自己的几何与行为检查。

PCG Framework 面向从建筑工具到大世界生成的程序化内容。PCG 具有分区和分层生成模式，能把大区域拆成网格单元分别计算。它适合由空间边界、表面标签或曲线输入设施候选点，再输出实例和筛选结果。其生成图、编辑器显示和运行时生成属于 Unreal 体系，Three.js 端只能接收导出的结果。

### 导入、预览、验收与版本

Interchange 是 Unreal 的异步、可扩展、与文件格式无关的导入导出框架。导入过程通过 Pipeline Stack 处理中间节点，再由 Factory 生成资产。Preview 窗口列出将创建的资产及其类型和导入属性。重导入时会保存上次使用的管线和选项，Conflict Preview 会显示材质或骨骼结构变化。官方文档也支持用 Blueprint 或 Python 驱动导入。

Asset Manager 把资产分成 Primary Asset 和 Secondary Asset，支持扫描目录、按规则分组、审计磁盘和内存、异步加载和卸载。Source Control 集成支持签出、签入、历史、与仓库版本比较。它们共同形成了“导入配置、预览结果、资产依赖、版本历史、可回退交付”的闭环。

### 与 Three.js、JSON、GLB 的映射

- JSON 布局模板可映射为 Unreal 的 Data Asset 或自定义结构体
- GLB 可由 Interchange 导入为 Static Mesh、材质和场景 Actor。导入管线的每个选项应写入本项目的导入 manifest
- Unreal 的 Actor、Data Layer、PCG 图和 uasset 不应进入浏览器运行时合同。浏览器侧只接受已验证的 GLB、贴图依赖和结构化 sidecar
- UE 的编辑提交相当于本项目的显式版本记录。每次布局发布应保存源 JSON、资源 SHA、导入器版本、检查报告和可回滚候选
- UE 的临时 PCG 输出对应本项目的候选目录，Bake 后的原生资产对应本项目的固定发布目录。候选不能直接冒充已验发布

### 许可与获取

Unreal Engine 编辑器和文档可公开获取，项目使用和商业发布受 Epic Unreal Engine EULA、产品类型和可能的版税条款约束。是否引入编辑器或 Interchange 作为生产工具需要单独核对当前商业条款。

来源

- [Level Instancing in Unreal Engine](https://dev.epicgames.com/documentation/en-us/unreal-engine/level-instancing-in-unreal-engine)
- [World Partition Data Layers](https://dev.epicgames.com/documentation/en-us/unreal-engine/world-partition---data-layers-in-unreal-engine)
- [Actors in Unreal Engine](https://dev.epicgames.com/documentation/en-us/unreal-engine/actors-in-unreal-engine)
- [Foliage Mode](https://dev.epicgames.com/documentation/en-us/unreal-engine/foliage-mode-in-unreal-engine)
- [Procedural Content Generation Framework](https://dev.epicgames.com/documentation/en-us/unreal-engine/procedural-content-generation-framework)
- [Importing Assets Using Interchange](https://dev.epicgames.com/documentation/en-us/unreal-engine/importing-assets-using-interchange-in-unreal-engine)
- [Asset Management](https://dev.epicgames.com/documentation/en-us/unreal-engine/asset-management-in-unreal-engine)
- [Asynchronous Asset Loading](https://dev.epicgames.com/documentation/en-us/unreal-engine/asynchronous-asset-loading)
- [Source Control in Unreal Engine](https://dev.epicgames.com/documentation/en-us/unreal-engine/source-control-in-unreal-engine)
- [Unreal Engine EULA](https://www.unrealengine.com/en-US/eula/unreal)

## 2. Unity

### 模块化空间、父子关系和变体

Unity Prefab Asset 是可实例化的模板。嵌套 Prefab 保留各自的 Prefab Asset 链接，同时成为外层 Prefab 的一部分。Prefab Variant 以另一个 Prefab 为基础，保存添加、删除和属性覆盖。Prefab Mode 提供隔离编辑和资产预览。Unity 文档还说明，修改 Prefab Asset 后，所有实例会同步基础变化，而实例或 Variant 的覆盖值保留在覆盖层。

这个机制适合把公司空间拆成楼层、房间、工位、桌面设备和附件。外层组合只记录子 Prefab 引用与局部覆盖，替换桌面设备时不用复制整套工位。需要注意外层覆盖与内层覆盖有多个可能的 Apply 目标，批处理工具必须明确覆盖写入的层级。

### 约束摆放和预览

Prefab 系统本身管理层级、变体和覆盖，不定义通路、使用点或占用规则。Unity 编辑器可以由自定义脚本检查 Collider、Bounds、Tag、Socket 或 NavMesh。ProBuilder、网格吸附和自定义 EditorTool 可用于模块拼接，具体约束依项目工具实现。Prefab Inspector 提供资产缩略图和交互预览，Prefab Mode 用于隔离查看组合。

对公司平台可复用的最小规则是把“模板继承”和“布局合法性”分开。模板系统负责默认局部变换与资源依赖，布局检查器负责支撑面、方向、占用、通路和角色使用点。只通过 Prefab 嵌套存在，不能推定设施已经可用。

### 导入、批处理和版本

AssetPostprocessor 可以在模型导入前后运行脚本。OnPreprocessModel 可统一 ModelImporter 设置，OnPostprocessModel 可在最终 Prefab 写盘前修改导入层级、网格和组件。OnPostprocessAllAssets 可在一批资产导入完成后运行收尾逻辑。对公司 GLB/贴图导入，可以用固定脚本把节点命名、材质、碰撞标记和自定义属性转成平台 sidecar。

Addressables 维护资源组、内容目录、哈希和依赖。Content Update Build 会生成内容目录、哈希文件和 AssetBundle。运行时更新目录时，已加载旧 Bundle 与新 Bundle 可能冲突，官方建议在加载内容前更新目录或先卸载旧 Bundle，并可用 Unique Bundle IDs 减少冲突。这个约束对应本项目的“版本切换前先确认当前实例无在途依赖，失败保留原版本”。

Unity 的版本控制集成覆盖 Perforce 和 Plastic SCM，也允许使用可见的 `.meta` 文件接入其他版本控制系统。Scene、Prefab、导入设置和 Addressables 状态必须作为同一变更集管理，不能只提交 GLB 而遗漏依赖元数据。

### 与 Three.js、JSON、GLB 的映射

- Prefab 模板可映射为 `assetTemplate`，Prefab Variant 可映射为带 `variantOf` 和显式 override 的记录
- Unity GameObject 父子关系可映射为 JSON 的 `parentId`、`localTransform` 和可计算的 `worldTransform`
- AssetPostprocessor 对应本项目 GLB 导入前的结构化检查和 sidecar 生成步骤
- Addressables Catalog 对应资源清单、依赖 SHA、可加载组和冷/暖切换记录
- Unity 的 Scene 与 Prefab 是编辑器格式，不应作为浏览器运行时输入。浏览器仍需显式加载 GLB 和 JSON，并自己执行生命周期、碰撞和设施状态
- Unity 编辑器预览可以启发 4196 工作台的候选切换与组合预览，但 4196 仍需沿本项目 Three.js 运行链做最终观看

### 许可与获取

Unity 编辑器可获取，具体席位、服务和运行时条款以当前 Unity Software Terms 为准。Prefab、Addressables 和 AssetPostprocessor 属于 Unity 工具链能力，不能把其专有资产格式直接当作本项目交付格式。

来源

- [Introduction to Prefabs](https://docs.unity3d.com/Manual/Prefabs.html)
- [Creating Prefabs](https://docs.unity3d.com/Manual/CreatingPrefabs.html)
- [Nested Prefabs](https://docs.unity3d.com/Manual/NestedPrefabs.html)
- [Prefab Variants](https://docs.unity3d.com/Manual/PrefabVariants.html)
- [Unpacking Prefab Instances](https://docs.unity3d.com/Manual/UnpackingPrefabInstances.html)
- [AssetPostprocessor](https://docs.unity3d.com/ScriptReference/AssetPostprocessor.html)
- [AssetPostprocessor.OnPreprocessModel](https://docs.unity3d.com/ScriptReference/AssetPostprocessor.OnPreprocessModel.html)
- [AssetPostprocessor.OnPostprocessModel](https://docs.unity3d.com/ScriptReference/AssetPostprocessor.OnPostprocessModel.html)
- [Addressables Content Update Workflow](https://docs.unity3d.com/Packages/com.unity.addressables@1.21/manual/ContentUpdateWorkflow.html)
- [Addressables UpdateCatalogs](https://docs.unity3d.com/Packages/com.unity.addressables@1.21/api/UnityEngine.AddressableAssets.Addressables.UpdateCatalogs.html)
- [Version Control Integration](https://docs.unity3d.com/Manual/Versioncontrolintegration.html)
- [Unity Software Terms](https://unity.com/legal/terms-of-service/software)

## 3. Houdini Engine for Unreal and Unity

### 参数化资产和输入输出

Houdini Digital Asset 是带节点网络、输入和公开参数的可重复工具。Houdini Engine 插件把 HDA 放入 Unreal 或 Unity，艺术家可以在宿主编辑器内修改公开参数而不打开 Houdini。官方文档列出几何、曲线、世界、静态网格、场景对象、地形、样条线和其他输入类型。输出可为网格、实例化网格、曲线、碰撞或宿主原生对象。

HDA 输入变化会触发重新求值和 recook。Rebuild 会重新导入 HDA 并 recook，适合工具接口变更。Bake 会把临时结果固化为宿主资产或 Actor，并断开对 HDA 参数的依赖。这个“候选计算 → 预览 → 固化发布”流程与公司平台的实验候选、已验资产、固定版本三个目录层级高度相似。

### 设施变体、父子依附和约束

HDA 可以把房间边界、墙线、承载面、曲线和已有设施作为输入，再由节点网络生成模块、重复件和装饰。实例化输出保留共享网格并减少重复数据。对公司场景可用 HDA 生成墙体模块、吊灯分布、桌面设备候选或整套工位变体。具体“设备必须落在桌面承载面、门口必须连通、座位朝向角色目标”的规则需要在 HDA 中显式实现，并在 JSON 运行检查器中再次验证。

Houdini Engine 的输入可以保留世界变换或转换到资产局部空间。这个选项直接对应公司平台的 parent-local 与 world transform 选择。项目应把坐标约定、锚点命名和缩放限制写入 sidecar，避免把一个 HDA 的隐含变换约定当成通用合同。

### 预览、批量生产和版本

PDG 是用于定义任务依赖、调度和分发的程序化架构。Houdini Engine 的 PDG Asset Link 可把 work item 结果加载进 Unreal，显示每个 work item 的状态，再按选择批量 Bake。未 Bake 的输出是临时结果，HDA 变更可能销毁或更新它们。官方建议迭代 cook 后再 bake 供生产使用。

Houdini 的资产命名空间和版本号允许 `company::desk::2.0` 一类具体引用与旧版本共存。已有实例不会因为新版本出现而自动改写，脚本可以明确选择最新或固定版本。这个机制可直接借鉴到 `assetId`、`assetVersion`、`sourceDigest` 和显式迁移记录。

### 与 Three.js、JSON、GLB 的映射

- HDA 参数和输入对象可由 JSON 配方表示，HDA 作为离线生产工具运行
- Bake 结果应输出 GLB、纹理依赖、碰撞或锚点 sidecar。Three.js 只加载这些固定产物
- Houdini 的临时 cook 结果对应候选资源目录，PDG work item 对应批处理任务记录，Bake 对应固定资源发布
- HDA 版本、节点命名空间和输入源 SHA 应进入生成 manifest
- 浏览器端不执行 HDA 或 PDG。没有 Houdini Engine 时，运行链只能读取已烘焙 GLB 和结构化数据
- HDA 自动生成的美术结果不能替代游戏中的角色接近、使用、取消和保存恢复测试

### 许可与获取

SideFX 提供 Houdini、Houdini Engine、Indie、Education 和非商业 Apprentice 等许可类型。商业 Unity/Unreal 插件的许可安排与 Houdini Engine 许可不同，Indie 有收入和使用范围限制。正式采用前必须按公司规模、收入和分发方式核对 EULA，不应把免费插件下载等同于商业授权。

来源

- [Houdini Engine for Unreal introduction](https://www.sidefx.com/docs/houdini/unreal/intro.html)
- [Houdini Engine for Unity introduction](https://www.sidefx.com/docs/houdini/unity/about.html)
- [Houdini Engine Unity inputs](https://www.sidefx.com/docs/houdini/unity/inputs.html)
- [Houdini Engine Unreal inputs](https://www.sidefx.com/docs/houdini/unreal/inputs.html)
- [Houdini Engine Unreal assets](https://www.sidefx.com/docs/houdini/unreal/assets.html)
- [Houdini Engine Unreal PDG Asset Link](https://www.sidefx.com/docs/houdini/unreal/pdg.html)
- [Houdini Engine Unreal public API](https://www.sidefx.com/docs/houdini/unreal/publicapi.html)
- [Houdini namespaces and versions](https://www.sidefx.com/docs/houdini/assets/namespaces.html)
- [SideFX licensing](https://www.sidefx.com/Support/licensing/)
- [Houdini Engine licensing FAQ](https://www.sidefx.com/faq/question/how-does-houdini-engine-licensing-work/)

## 4. Blender

### 资产库、模块实例和父子依附

Blender Asset Browser 使用外部 Asset Library 与 Catalog 组织可重复使用的对象、集合、材质和节点组。Collection 和 Geometry Nodes 实例可以让多个设施共享同一份网格数据，同时保留每个实例的变换。实例可嵌套，必要时使用 Realize Instances 把共享实例转为独立几何。

Object Parent 保存父子变换。子对象继承父对象的平移、旋转和缩放，Parent Inverse 矩阵可保持建立父子关系时的世界位置。这个机制可作为制作端验证桌面设备跟随桌子、支架跟随灯具和整套工位旋转的参考。

Library Overrides 允许链接外部库并在本地保存可编辑覆盖。原库更新时，未被覆盖的属性可以同步。系统支持多个独立 override 和递归层级，但官方明确记录了层级变化、引用丢失和复杂角色数据的限制。对于公司设施，覆盖记录必须保留原库路径、库版本和局部改动，避免把 override 当成独立源资产。

### 约束、预览和批量导出

Geometry Nodes 可以把对象或集合实例化到点、曲线或表面上，并根据字段计算方向、缩放和筛选。它适合离线生成灯具、装饰、墙面模块或桌面小物的候选布置。视口可直接预览生成结果，Python 可以批量打开文件、替换参数和导出。

Blender 的 glTF 2.0 导出器支持节点层级、动画、材质、灯光、实例化选项和对象自定义属性。自定义属性会写到 glTF 的 `extras`，可承载资产 ID、锚点名、用途标签和制作版本。导出后的 GLB 仍需经过项目自己的 GLB 验证器、Three.js 加载和场景检查。

### 与 Three.js、JSON、GLB 的映射

- Blender Collection 或 Geometry Nodes 的生成结果可以导出为 GLB，集合层级或自定义属性保留到节点与 `extras`
- Asset Catalog、Blend 文件和 Python 生成脚本属于制作源，不能代替游戏布局 JSON
- Parent、Parent Inverse 和实例变换应在导出前固化或转成明确的 `parentId`、`localTransform` 和锚点数据
- Blender 视口预览只证明几何和材质可见，不能证明角色可达、占用、保存恢复或浏览器普通电脑性能
- 链接库和 override 需要人工或脚本化依赖检查。官方文档明确提示引用丢失和层级变化可能使部分覆盖失效

### 许可与获取

Blender 软件以 GNU GPL 许可发布。项目自己的 GLB、贴图、脚本和外部资产仍分别受其来源许可约束。Asset Library 目录、Catalog 文件、Blend 源和导出脚本应纳入源代码管理。

来源

- [Blender Asset Browser](https://docs.blender.org/manual/en/latest/editors/asset_browser.html)
- [Blender Asset Libraries](https://docs.blender.org/manual/en/latest/files/asset_libraries/index.html)
- [Asset Catalogs](https://docs.blender.org/manual/en/latest/files/asset_libraries/catalogs.html)
- [Blender Instances](https://docs.blender.org/manual/en/latest/modeling/geometry_nodes/instances.html)
- [Blender Parenting Objects](https://docs.blender.org/manual/en/latest/scene_layout/object/editing/parent.html)
- [Blender Library Overrides](https://docs.blender.org/manual/en/latest/files/linked_libraries/library_overrides.html)
- [Blender glTF 2.0 exporter](https://docs.blender.org/manual/en/latest/addons/scene_gltf2.html)
- [Blender license](https://www.blender.org/about/license/)

## 5. 对公司平台的可复用合同

### 5.1 资源模板、实例和变体分开

建议继续使用 JSON 作为平台可读的布局合同，GLB 作为显示资源。每个资源模板至少需要稳定身份、资源路径、源 SHA、版本、锚点、可用表面、碰撞或占用边界和可选依赖。每个场景实例保存自身身份、模板身份、父级身份、局部变换和显式变体。

一个抽象记录可以写成：

```json
{
  "schemaVersion": "company-layout-v1",
  "assets": [
    {
      "assetId": "desk-basic",
      "assetVersion": "2.0.0",
      "resource": "assets/facility/desk-basic.glb",
      "sourceDigest": "sha256:...",
      "anchors": ["top.surface", "mic.mount.left"],
      "capabilities": ["support-surface", "static"]
    }
  ],
  "nodes": [
    {
      "nodeId": "desk-001",
      "parentId": "room-001",
      "templateId": "desk-basic",
      "variantId": "oak-light",
      "localTransform": {
        "position": [0, 0, 0],
        "rotation": [0, 0, 0, 1],
        "scale": [1, 1, 1]
      },
      "attachments": [
        {
          "childId": "mic-001",
          "parentAnchor": "top.surface",
          "childAnchor": "base",
          "localOffset": [0, 0, 0],
          "allowedYaw": [0, 90, 180, 270]
        }
      ]
    }
  ],
  "checks": {
    "required": ["support", "clearance", "reachability", "dependency"]
  }
}
```

这里的字段是调研映射示意，不是对现有代码的改动或批准的新合同。实际字段名应沿当前项目合同和已验证入口落地。

### 5.2 父子依附用局部变换和锚点表达

设施组合移动时，由父节点的世界变换和子节点局部变换计算子节点世界变换。依附关系同时保存父锚点和子锚点，不能只保存一个经验偏移。替换承载面或桌子时重新计算并检查承载、朝向和间隙。若依赖资源缺失、锚点不存在或约束不满足，提交应失败并保留原组合。

### 5.3 约束检查与视觉验收分层

可以借鉴 UE Foliage/PCG、Unity 自定义导入脚本、Houdini 参数规则和 Blender Geometry Nodes 的输入过滤，但项目仍需自己的检查集合：

- 资源存在、版本和 SHA 一致
- GLB 节点、材质、单位和坐标约定正确
- 父子引用无环，局部变换在允许范围内
- 设施落在支持面或墙面，并满足旋转、缩放和锚点限制
- 门口、通路、角色接近点和离开空间可达
- 使用点、容量、占用状态和取消清理与角色运行合同匹配
- 预览截图或正常速度片段证明实际画面和动作合理

程序检查通过后仍需在 4196 既有工作台观看候选，不能把外部编辑器的预览等同于本项目游戏运行验收。

### 5.4 批量导入和保存版本

批量生产应保留四类身份：

1. 制作源身份，包括 Blend、HDA、脚本、外部依赖和许可证记录
2. 导入输入身份，包括 GLB、纹理、节点映射、导入器版本和参数
3. 运行资产身份，包括 GLB/贴图依赖、sidecar、固定 SHA 和兼容能力
4. 布局发布身份，包括 JSON、资源清单、检查报告、预览记录和可恢复版本

候选生成失败时保留输入、错误阶段和失败原因。成功生成后再复制到固定发布目录。模板升级必须显式迁移实例或生成新实例版本，不能通过覆盖文件让旧布局在重开后悄然改变。

## 6. 接入差异与未解决问题

- 本项目是浏览器运行链，不能直接消费 Unreal uasset、Unity Prefab/Scene、Houdini HDA 或 Blender Blend。它们最多作为制作与批处理工具，交付仍需 GLB、贴图、JSON 和可读取的依赖清单。
- 外部工具通常能帮助生成或预览模块，不能替本项目决定接近、使用、离开、预约、占用和保存恢复的业务语义。
- Unreal PCG、Houdini PDG、Blender Geometry Nodes 都可能批量输出大量实例，当前平台尚未为整层或整栋规模建立普通电脑预算与按需释放证据。
- GLB `extras`、节点名称和外部 sidecar 的优先级尚未在当前 Three.js 加载入口中统一确定。需要小样本验证后再固定输入输出。
- 需要基于现有空间与角色接缝确定锚点坐标、支撑面误差、通路宽度、使用点朝向、离开空间和允许缩放范围，外部工具文档没有这些项目数值。
- 需要核对当前 Three.js 版本对批量实例、材质状态、GLB 动态灯光和资源卸载的实际行为，不能直接把 UE/Unity 的性能数字移植过来。
- 是否引入 Unreal、Unity 或 Houdini 作为制作工具涉及席位、商业授权、团队流程和可维护性，当前报告没有替用户做采购或路线决策。
- 本次没有执行外部工具安装、GLB 导出、浏览器加载、普通电脑测试或项目服务验证。外部能力均未接入本项目。

## 7. 建议的后续有界验证顺序

1. 选一个桌子、一个桌面设备和一个灯具，制作一份 JSON 父子组合与两个显式外观变体。验证整体移动、局部替换、锚点缺失拒绝和关闭重开。
2. 用现有 Three.js 加载器读取一个带 `extras` 的 GLB，记录节点层级、锚点和材质依赖是否稳定，和 sidecar 方案并排比较。
3. 以一个房间边界和一个工位布局运行静态检查，补充通路、支撑面、使用点与离开空间的实测记录。
4. 在 4196 复用当前外观、动作和检查分区，加入候选布局切换与限制原因显示，再做正常速度观看。
5. 只有上述小样通过后，再评估是否需要 Houdini/Blender 批量生成，或保留纯脚本加 JSON/GLB 的生产流程。

这些步骤是调研后的有界验证建议，不表示已授权采购、插件安装或代码实施。

## 来源索引

- Epic Games Unreal Engine 文档  
  https://dev.epicgames.com/documentation/en-us/unreal-engine/level-instancing-in-unreal-engine  
  https://dev.epicgames.com/documentation/en-us/unreal-engine/actors-in-unreal-engine  
  https://dev.epicgames.com/documentation/en-us/unreal-engine/foliage-mode-in-unreal-engine  
  https://dev.epicgames.com/documentation/en-us/unreal-engine/procedural-content-generation-framework  
  https://dev.epicgames.com/documentation/en-us/unreal-engine/importing-assets-using-interchange-in-unreal-engine  
  https://dev.epicgames.com/documentation/en-us/unreal-engine/asset-management-in-unreal-engine  
  https://dev.epicgames.com/documentation/en-us/unreal-engine/source-control-in-unreal-engine  
  https://www.unrealengine.com/en-US/eula/unreal
- Unity 文档  
  https://docs.unity3d.com/Manual/Prefabs.html  
  https://docs.unity3d.com/Manual/NestedPrefabs.html  
  https://docs.unity3d.com/Manual/PrefabVariants.html  
  https://docs.unity3d.com/ScriptReference/AssetPostprocessor.html  
  https://docs.unity3d.com/Packages/com.unity.addressables@1.21/manual/ContentUpdateWorkflow.html  
  https://docs.unity3d.com/Manual/Versioncontrolintegration.html  
  https://unity.com/legal/terms-of-service/software
- SideFX Houdini Engine 文档  
  https://www.sidefx.com/docs/houdini/unreal/intro.html  
  https://www.sidefx.com/docs/houdini/unity/about.html  
  https://www.sidefx.com/docs/houdini/unity/inputs.html  
  https://www.sidefx.com/docs/houdini/unreal/assets.html  
  https://www.sidefx.com/docs/houdini/unreal/pdg.html  
  https://www.sidefx.com/docs/houdini/assets/namespaces.html  
  https://www.sidefx.com/Support/licensing/  
  https://www.sidefx.com/faq/question/how-does-houdini-engine-licensing-work/
- Blender 文档  
  https://docs.blender.org/manual/en/latest/editors/asset_browser.html  
  https://docs.blender.org/manual/en/latest/files/asset_libraries/catalogs.html  
  https://docs.blender.org/manual/en/latest/modeling/geometry_nodes/instances.html  
  https://docs.blender.org/manual/en/latest/scene_layout/object/editing/parent.html  
  https://docs.blender.org/manual/en/latest/files/linked_libraries/library_overrides.html  
  https://docs.blender.org/manual/en/latest/addons/scene_gltf2.html  
  https://www.blender.org/about/license/



