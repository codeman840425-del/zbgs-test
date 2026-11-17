# 成熟角色生产工程的源码与原版复现入口

2026-11-17。研究范围为原作者的形体、表情、衣物及导出生产链。本轮只读文档、仓库元数据和选定源码，未安装插件、下载模型包、运行 Blender/Unity、制作新形状或修改工作台。派工沿用 requested `gpt-6.1-sol/high`，实际 provider 与 Hook 拦截未独立验证。

## 本次补齐的缺口

此前 `agent-production-research-2026-11-14.html` 将 MPFB 列为备选，但未追到作者的完整生产样例。`REPRESENTATIVE-SHAPE-PIPELINE-OPTIONS-2026-11-16.md` 主要比较 Mesh Deform、Surface Deform 和 SLIM 的几何能力。本次补齐已制作基模、形态库、表情、衣物对应关系、修正数据和导出之间的实际代码。几何求解器能否执行变形，与输入是否为合格人物形态，需要分别证明。

核到的共同做法是先有可编辑、经过美术制作的基模和形态数据，再让衣物沿该角色家族的明确对应关系适配，并保留作者修正入口。MPFB 的形态 targets、UMA 的 DNA/骨架效果与 blendshapes、MB-Lab 的 morph 数据都依赖这种源内容。它们提供了完整生产工程供学习，当前原男 `62b…`、原女 `027…` VRM 的拓扑、表情与衣库仍需单独接入，本文未批准更换基模或引擎。[MPFB targets](https://github.com/makehumancommunity/mpfb2/blob/9de0707fdc88438d7c53a1a2ac7937d9221e2431/src/mpfb/services/targetservice.py) [UMA 内容生产说明](https://github.com/umasteeringgroup/UMA/blob/697337b3e42e83312f5065c929689e44fa4b3b5f/UMAProject/Assets/UMA/Docs/ContentCreation.md) [MB-Lab morph 引擎](https://github.com/animate1978/MB-Lab/blob/063bff04e60f3e7c651fda628c30f5d83f3f3078/morphengine.py)

## 固定身份与许可

以下源码链接均固定到所读 commit。在线作者教程作为流程说明，未将其网页更新时间当作源版本。

| 工程 | 本次固定身份 | 许可及使用边界 | 与当前项目的距离 |
| --- | --- | --- | --- |
| MPFB / MakeHuman Community | `makehumancommunity/mpfb2@9de0707fdc88438d7c53a1a2ac7937d9221e2431`，扩展 manifest 为 `2.0.18`，Blender 最低 `4.2.0` | 逻辑代码 GPL-3.0-or-later。仓库许可明确 bundled 基模、targets、衣物、rig、表情等资产 CC0，作者声明输出为使用者的数据。外来社区服装/皮肤仍须逐包核许可 | 最接近当前 Blender 离线生产和 agent 脚本需求。其 MakeHuman 顶点身份、helpers、targets 与当前 VRM 不同。[扩展身份](https://github.com/makehumancommunity/mpfb2/blob/9de0707fdc88438d7c53a1a2ac7937d9221e2431/src/mpfb/blender_manifest.toml) [许可划分](https://github.com/makehumancommunity/mpfb2/blob/9de0707fdc88438d7c53a1a2ac7937d9221e2431/LICENSE.md) |
| UMA | `umasteeringgroup/UMA@697337b3e42e83312f5065c929689e44fa4b3b5f`，所读指南为 UMA 3，项目 Editor 为 Unity `6000.3.26f1` | 根目录及 `Assets/UMA/LICENSE.md` 为 MIT，须保留声明。新增第三方内容及依赖仍独立核身份和许可 | 可学习完整可换装角色架构、数据生产及修正工具。C#/Unity 运行链不能直接放进当前 Three/VRM 浏览器工程。[项目版本](https://github.com/umasteeringgroup/UMA/blob/697337b3e42e83312f5065c929689e44fa4b3b5f/UMAProject/ProjectSettings/ProjectVersion.txt) [许可](https://github.com/umasteeringgroup/UMA/blob/697337b3e42e83312f5065c929689e44fa4b3b5f/LICENSE) |
| MB-Lab | `animate1978/MB-Lab@063bff04e60f3e7c651fda628c30f5d83f3f3078`，README 为最终 `1.8.1`、Blender `4.0+`，仓库已于 2024-07-21 归档 | Python 代码 GPL3，数据库、网格、图像及 JSON 为 AGPL3，生成三维模型默认也为 AGPL3。二维渲染另有许可说明 | 提供实际二次元基模、形体、表情与衣物拟合代码，是风格相关的学习实例。模型许可与维护状态限制直接采用，当前 Blender/VRM 接入未实测。[README](https://github.com/animate1978/MB-Lab/blob/063bff04e60f3e7c651fda628c30f5d83f3f3078/README.md) [许可原文](https://github.com/animate1978/MB-Lab/blob/063bff04e60f3e7c651fda628c30f5d83f3f3078/license.txt) [归档状态](https://github.com/animate1978/MB-Lab) |

## MPFB 的可复用生产链

### 形体来自作者 targets，基模还有适配辅助几何

`HumanService.create_human()` 创建基模并消费宏观参数。`TargetService.calculate_target_stack_from_macro_info_dict()` 把 age/gender/weight/muscle 等宏观信息转为已有 target 组合。`load_target()`、`target_string_to_shape_key()` 将文件里的原顶点位移还原为 Blender shape key。新增鼻型、耳形等需要制作相应 target。作者教程要求大幅改身高等形体时同时调整 helpers 和 joint cubes，衣物和骨架依赖这些数据。[HumanService](https://github.com/makehumancommunity/mpfb2/blob/9de0707fdc88438d7c53a1a2ac7937d9221e2431/src/mpfb/services/humanservice.py) [TargetService](https://github.com/makehumancommunity/mpfb2/blob/9de0707fdc88438d7c53a1a2ac7937d9221e2431/src/mpfb/services/targetservice.py) [作者 MakeTarget 教程](https://static.makehumancommunity.org/mpfb/docs/assets/creating_a_target.html)

这能复用为源形态库、明确顶点身份和可重复组合的方法。当前 VRM 若保留为基模，需要自己的合格 shape keys、对应 helpers/关节点策略和表情修正来源，MPFB 的鼻部文件不能按同编号应用到它。默认普通人物基模也没有证明符合本项目二次元画风。

### 衣服先有版型和绑定数据，再随体型更新

作者 MakeClothes 流程从 `helper-tights` 提取模板，删去不需要的部分形成上衣，制作材质/UV，填写身份后检查并存库，随后在另一人物上加载。版型、缝口、松量与外观仍是需要制作的内容。[作者衣物教程](https://static.makehumancommunity.org/mpfb/docs/assets/creating_clothes.html)

实际调用及数据如下。

| 固定文件与函数 | 已核的实际行为 | 可复用边界 |
| --- | --- | --- |
| `ClothesCommon.generic_execute()` | 验证源人体/衣物、xref 与分组，调用 `create_mhclo_from_clothes_matching()`，写 MHCLO、OBJ 和可选材质 | 提供可读的制作、检查、存库入口。输出前仍要有合格衣物源。[代码](https://github.com/makehumancommunity/mpfb2/blob/9de0707fdc88438d7c53a1a2ac7937d9221e2431/src/mpfb/ui/create_assets/makeclothes/operators/clothescommon.py) |
| `VertexMatch` | 按同名分组限制 donor，依次尝试 exact、三点 rigid group、simple face、extended face 匹配 | 分组由作者定义，能表达裤腿分别关联及刚性小件。错误分组会留下错误绑定。[代码](https://github.com/makehumancommunity/mpfb2/blob/9de0707fdc88438d7c53a1a2ac7937d9221e2431/src/mpfb/entities/clothes/vertexmatch.py) |
| `Mhclo.load()` | 每衣物顶点保存 `verts` 三个源点、`weights`、`offsets`，另有 `x_scale/y_scale/z_scale` 参考和可选骨权文件、删除组 | 它是相对于指定基模的适配资产，可保存及复用。[代码](https://github.com/makehumancommunity/mpfb2/blob/9de0707fdc88438d7c53a1a2ac7937d9221e2431/src/mpfb/entities/clothes/mhclo.py) |
| `ClothesService.fit_clothes_to_human()` | 从当前 shape-key mix 读取人体点，三源点加权后加分轴缩放的 offset | 已制作的衣服可跟随同族形体。该公式本身不包含全身碰撞或层间布料求解。[代码](https://github.com/makehumancommunity/mpfb2/blob/9de0707fdc88438d7c53a1a2ac7937d9221e2431/src/mpfb/services/clothesservice.py) |
| `interpolate_weights()`、`update_delete_group()` | 使用同一 MHCLO 对应插值骨权，并管理衣服覆盖的人体隐藏区域 | 骨权传递与覆盖隐藏分别有数据。需要实际关节动作及卸衣恢复检查。[代码](https://github.com/makehumancommunity/mpfb2/blob/9de0707fdc88438d7c53a1a2ac7937d9221e2431/src/mpfb/services/clothesservice.py) |

`mesh_is_valid_as_clothes()` 还核全部顶点属于面、各点恰好一个制作分组、分组在基模存在、面型一致以及相同 scale。这里的制作分组用于匹配 donor，与最终多骨蒙皮权重用途不同。仅拷贝三角插值公式会遗漏这些生产输入。[检查实现](https://github.com/makehumancommunity/mpfb2/blob/9de0707fdc88438d7c53a1a2ac7937d9221e2431/src/mpfb/services/clothesservice.py)

### 表情与导出分别处理

`FaceService.load_targets()` 从已安装资产加载 visemes/ARKit face units。`interpolate_targets()` 根据同一 MHCLO 关系将受支持的命名表情位移传给子网格。它表明眼口、眉毛和代理表面有明确的随动渠道。该插值与任意新脸型下混合表情的质量仍是两项验证，现有函数存在不构成本项目 54 表达或所有组合的通过证据。[FaceService 源码](https://github.com/makehumancommunity/mpfb2/blob/9de0707fdc88438d7c53a1a2ac7937d9221e2431/src/mpfb/services/faceservice.py)

原版导出样例使用 `ExportService.create_character_copy()`，在副本上 bake modifiers、应用 mask、移除 helper 后导出 FBX，保留可编辑源层级。当前 VRM 还需要 humanoid、expression 绑定、MToon/作者法线、材质及 spring 数据的显式转接与回读。所核样例没有提供这条 VRM 接口。[完整原版样例](https://github.com/makehumancommunity/mpfb2/blob/9de0707fdc88438d7c53a1a2ac7937d9221e2431/script_samples/10_complete_character_export_fbx.py)

## UMA 的实际内容生产与衣物修正

UMA 3 将角色家族记为 `RaceData`，网格记为 `SlotDataAsset`，纹理/材质记为 overlays 与 `UMAMaterial`，穿戴物由 wardrobe recipe 组合。作者文档要求从目标 race 的中性体和骨架制作衣服，保 transform/骨名/权重，检查肩肘髋膝、极端 DNA 和实际 player build。自动组装消费这些已制作数据。[内容生产指南](https://github.com/umasteeringgroup/UMA/blob/697337b3e42e83312f5065c929689e44fa4b3b5f/UMAProject/Assets/UMA/Docs/ContentCreation.md)

### 实际源码接缝

| 文件与接口 | 已核行为 | 对本项目的启示及限制 |
| --- | --- | --- |
| `NewDNA/DNAGroup.cs`、`DNAEffect_BoneScale.cs`、`DNAEffect_BlendShape.cs` | DNA group 收集已定义 DNA。骨效果消费映射曲线并改指定骨 scale。blendshape 效果在 renderer 上找到同名已存在 shape 后设权重 | 一个语义参数可驱动数个已制作效果。缺 shape 时该效果无法产生新形态。[DNAGroup](https://github.com/umasteeringgroup/UMA/blob/697337b3e42e83312f5065c929689e44fa4b3b5f/UMAProject/Assets/UMA/Core/Scripts/NewDNA/DNAGroup.cs) [骨效果](https://github.com/umasteeringgroup/UMA/blob/697337b3e42e83312f5065c929689e44fa4b3b5f/UMAProject/Assets/UMA/Core/Scripts/NewDNA/DNAEffect_BoneScale.cs) [shape 效果](https://github.com/umasteeringgroup/UMA/blob/697337b3e42e83312f5065c929689e44fa4b3b5f/UMAProject/Assets/UMA/Core/Scripts/NewDNA/DNAEffect_BlendShape.cs) |
| `DynamicCharacterAvatar.cs` | 处理 race、wardrobe、DNA、颜色和生成周期，提供保存恢复。源码还保留旧 DNA converter 兼容路径及 blendshape 加载策略 | 须固定版本和所走 DNA 路径。旧 UMA 2 教程与当前 UMA 3 代码不能混作一次已验流程。[代码](https://github.com/umasteeringgroup/UMA/blob/697337b3e42e83312f5065c929689e44fa4b3b5f/UMAProject/Assets/UMA/Core/DynamicCharacterSystem/Scripts/DynamicCharacterAvatar.cs) |
| `UMAWardrobeRecipe.cs` | 穿戴 recipe 复制 compatible races、wardrobe slot、hides、DNA override 等 | 兼容关系是制作数据。其 `IncompatibleRecipes` 字段明示用于跟踪、并非自动执行，不能仅填该列表就声称互斥已守住。[代码](https://github.com/umasteeringgroup/UMA/blob/697337b3e42e83312f5065c929689e44fa4b3b5f/UMAProject/Assets/UMA/Core/DynamicCharacterSystem/Scripts/UMAWardrobeRecipe.cs) |
| `SkinnedMeshCombiner.cs`、`UMAExpressionPlayer.cs` | 合并 slot 的 mesh/blendshapes，表达播放器消费角色表情配置 | 同骨架、合并 renderer、保存 recipe 都不足以证明新脸/衣物形变质量。blendshape 是否加载也受角色选项影响。[合并器](https://github.com/umasteeringgroup/UMA/blob/697337b3e42e83312f5065c929689e44fa4b3b5f/UMAProject/Assets/UMA/Core/StandardAssets/UMA/Scripts/SkinnedMeshCombiner.cs) [表情播放器](https://github.com/umasteeringgroup/UMA/blob/697337b3e42e83312f5065c929689e44fa4b3b5f/UMAProject/Assets/UMA/Core/StandardAssets/UMA/Scripts/UMAExpressionPlayer.cs) |

当前固定版还有可直接学习的衣物形态传递实现 `UMABlendShapeTransfer`。它先将 body/slot 放到 avatar rest 空间，绑定最近表面三角与 barycentric/offset，优先同向表面，按距离衰减并平滑，保相同位置的接缝一致，选项可处理小刚件、clearance，再把每帧形态及 NORMAL/TANGENT delta 写回 slot 空间。`Transfer()` 先返回结果，`Apply()` 才写资产。实际源码包含检查和结果数据，另有独立合成 EditMode tests。[实现](https://github.com/umasteeringgroup/UMA/blob/697337b3e42e83312f5065c929689e44fa4b3b5f/UMAProject/Assets/UMA/Core/Editor/Scripts/UMABlendShapeTransfer.cs) [测试](https://github.com/umasteeringgroup/UMA/blob/697337b3e42e83312f5065c929689e44fa4b3b5f/UMAProject/Assets/UMA/Core/Editor/Tests/UMABlendShapeTransferTests.cs)

作者同时提供转移后的预览与 sculpt/save 工作流，要求修正夹折、拉伸并在最终写入前查看。直接再次转移可能覆盖手工修正。Mesh Hide 与衣物修正各有用途，隐藏被完整覆盖的皮肤不能替代领口、袖口和卸衣状态的正确性。这是一条有修正环节的生产链，实际本项目复杂叠穿、动作和普通机成本仍未验证。[转移与修正指南](https://github.com/umasteeringgroup/UMA/blob/697337b3e42e83312f5065c929689e44fa4b3b5f/UMAProject/Assets/UMA/Docs/BlendshapeTransfer.md)

仓库有原版 `U3-Character Creator`、`U3-How to equip items`、`U3-How to Load and Save a DCA to a string` 等场景。它们可用于学习原作者完整角色消费链。此版本需要对应 URP/HDRP 支持、UMA 3 内容和 Global Library，本文未加载场景或验证浏览器迁移。[入门及场景清单](https://github.com/umasteeringgroup/UMA/blob/697337b3e42e83312f5065c929689e44fa4b3b5f/UMAProject/Assets/UMA/Docs/%21GettingStarted.md)

## 二次元相关实例 MB-Lab

本次选择 MB-Lab 是因为仓库确有 anime 源数据。`characters_config.json` 定义 `anime_female_base` 与 `anime_male_base` 模板，关联原模板模型与 polygon 数据。另有 `anime_male_morphs.json`、joints、anime presets 和 anime expression 数据，README 记录 Anime CEL shader。当前所核男模板为 13687 顶点、13498 面，女模板为 13995 顶点、13806 面。它们是作者自己的二次元角色家族。[模板配置](https://github.com/animate1978/MB-Lab/blob/063bff04e60f3e7c651fda628c30f5d83f3f3078/data/characters_config.json) [男 preset](https://github.com/animate1978/MB-Lab/blob/063bff04e60f3e7c651fda628c30f5d83f3f3078/data/presets/anime_male_base/anyme_style1.json) [anime 表情数据](https://github.com/animate1978/MB-Lab/blob/063bff04e60f3e7c651fda628c30f5d83f3f3078/data/expressions_comb/anime_expressions/happy01.json)

`MorphingEngine.calculate_morph()` 按已存顶点 delta 更新角色。`Humanoid.correct_expressions()` 调 `correct_morphs()`，后者保留原表情 morph、依当前形体和 bbox 数据修正，再恢复表达值。`convert_all_to_blshapekeys()` 在中性态逐个生成表达 shape keys。`ExpressionEngineShapeK` 所在模块再消费命名表情数据。值得复用的是形体、表情修正和最终 shape-key 固化分层，而任意新脸型的嘴眼接触仍需要实际检查。[形体及表达修正](https://github.com/animate1978/MB-Lab/blob/063bff04e60f3e7c651fda628c30f5d83f3f3078/morphengine.py) [Humanoid 调用](https://github.com/animate1978/MB-Lab/blob/063bff04e60f3e7c651fda628c30f5d83f3f3078/humanoid.py) [表情消费](https://github.com/animate1978/MB-Lab/blob/063bff04e60f3e7c651fda628c30f5d83f3f3078/expressionengine.py)

`ProxyEngine.fit_near_vertices()` 在基模板与当前同拓扑 body 间找匹配面、检查方向并 barycentric transfer，远部件另按 bbox 处理。`fit_proxy_object()` 保存 `mbastlab_proxyfit` shape key，可传骨权、建 body mask 和 corrective-smooth modifier。作者教程先要求把衣服在指定基模板上做好中性版型，再适配该模板派生的人物，并展示拟合后仍需调整和修正的裙装案例。[ProxyEngine](https://github.com/animate1978/MB-Lab/blob/063bff04e60f3e7c651fda628c30f5d83f3f3078/proxyengine.py) [原作者 proxy 流程](https://mb-lab-docs.readthedocs.io/en/latest/proxy.html)

它可以帮助理解 anime 基模也需要作者形态库、表情和衣物源适配。其 AGPL3 模型许可、归档状态、README 已知 BVH/毛发材质问题，以及未经验证的 VRM 表情/材质/spring 转换，均未解决。没有证据支持直接替换当前源人物或宣称能生产本项目目标风格。

## 可执行的原版最小样例

优先复现 MPFB 自带样例，保持作者代码原样。这里给出后续执行入口，本轮执行次数为零。

### 不依赖额外衣物包的形体样例

1. 使用固定 commit 的 MPFB `2.0.18`，在符合 manifest 的 Blender 中安装并启用扩展。仓库版本和实际安装版本须一致。
2. 在 Blender 的 Scripting/Text Editor 打开原文件 `script_samples/02_working_with_modeling_targets.py`，在新场景运行原脚本。脚本自身的 `dynamic_import()` 处理 Blender extension 的包名，需扩展已加载。
3. 预期生成两个人物，位于 X=-1 和 X=1。右侧人物加载 `nose-volume-incr.target.gz` 权重 1.0 与 `nose-scale-horiz-incr.target.gz` 权重 0.5。两个 target 均在本次固定仓库的 `src/mpfb/data/targets/nose/` 中。
4. 留下原脚本/target/插件身份、可编辑 `.blend` 与同相机图。它只证明原作者 target 消费与真实几何差异，衣物和表情仍需后续样例。

[原样例 02](https://github.com/makehumancommunity/mpfb2/blob/9de0707fdc88438d7c53a1a2ac7937d9221e2431/script_samples/02_working_with_modeling_targets.py) [内置体积 target](https://github.com/makehumancommunity/mpfb2/blob/9de0707fdc88438d7c53a1a2ac7937d9221e2431/src/mpfb/data/targets/nose/nose-volume-incr.target.gz) [原样例目录说明](https://github.com/makehumancommunity/mpfb2/blob/9de0707fdc88438d7c53a1a2ac7937d9221e2431/script_samples/index.md)

### 同工程的完整角色导出样例

原文件 `script_samples/10_complete_character_export_fbx.py` 需要 `makehuman_system_assets` 安装并配置目录。它依次创建人、GAMEENGINE 皮肤、`game_engine` rig，加载眼、眉、睫毛、舌、牙、`long01` 头发和 `female_casualsuit01`，复制导出层级、bake/mask/remove helpers，最后写 `mpfb_character.fbx`。已有 `.blend` 时输出在其旁边，否则写 MPFB 用户 cache 的 `script_samples` 目录。可以在同一 Blender Text Editor 运行该原文件。[原样例 10](https://github.com/makehumancommunity/mpfb2/blob/9de0707fdc88438d7c53a1a2ac7937d9221e2431/script_samples/10_complete_character_export_fbx.py)

这个样例找不到皮肤会报错，找不到部分其他资产会打印 `Skipping` 后继续。因此 FBX 文件存在仅证明执行到了导出，完整复现还要核实际对象、rig、衣物及贴图。脚本也注明 FBX 材质转换需要查看结果，且没有加载表达 targets。本轮未下载该资产包，其本地可获得性和包身份待原版复现时核实。[原样例及其前提](https://github.com/makehumancommunity/mpfb2/blob/9de0707fdc88438d7c53a1a2ac7937d9221e2431/script_samples/10_complete_character_export_fbx.py)

## Agent 自动化边界与当前接入缺口

| 工作 | 原工程已提供的自动化 | 仍需真实制作或验证 |
| --- | --- | --- |
| 生成体型/脸型 | 选择已有 targets、presets、DNA 和效果，保存组合并重复构建 | 新目标的正常比例、轮廓和范围需要合格源形态。数值参数本身没有美术质量含义 |
| 衣物随形 | 固定基模绑定、骨权/形态传递、覆盖隐藏、可编辑修正 | 中性版型、松量、层次与开口、蒙皮关节、极端体型和动作仍需检查 |
| 表情 | 作者定义的表达 targets/骨架配置、子资产传递和部分形体修正 | 新脸混合口型、闭眼、眼白覆盖、口内碰撞及实际材质画面 |
| 导出与游戏 | 原工程导出或 Unity 生成，保存配方，明确内容身份 | 当前 VRM 的 humanoid、54 表达绑定、作者 N/UV/图像、MToon、spring、动作与穿戴生命周期接缝 |
| 批量生产 | 在已制作的数据范围内脚本化取参数、加载资产、导出及验证 | 新款式、陌生拓扑或未适配装备不能从已有一例自动推出支持 |

MPFB 最适合首先学习可重复离线生产，UMA 最适合学习完整 race/slot/wardrobe 和修正数据的组织，MB-Lab 补充了真实 anime 数据与表情修正实例。后续若进行原版复现，应先看原版正常源人物及完整衣物结果，再评估当前 VRM 的转接成本。本文尚无本机原版执行、性能、视觉或最终选型结论。
