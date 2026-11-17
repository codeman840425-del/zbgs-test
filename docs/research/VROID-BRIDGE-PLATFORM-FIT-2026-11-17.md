# VRoid MCP Bridge 0.15：完整 M2 生产适配审查

2026-11-17。独立只读审查；requested `gpt-6-astra/high`，不冒认宿主配置或 Hook 实测。固定 `mcjo79/vroid-mcp@c7367a548626cbe69e26b533e48fc9ddaf85851e`（v0.15.0），目标宿主 Windows VRoid Studio 2.16。本报告没有操作编辑器、调用变更接口、安装软件或改变游戏；root 的实际安装/调用证据另行核收。

**判断：适合成为新原生角色的主要自动制作入口，但不是完整 M2 平台的替代品。** 它确实调用 VRoid 的原生模型命令，覆盖完整脸部参数、部分骨骼比例、预设衣物版型、纹理层、发束及已有发骨参数，并有原生源保存和 VRM 导出。可优先替代原来从导出网格自造头脸形变、自己维持眼口依赖、为普通原生发型手写发片等生产步骤。替代范围仅限**新原生项目及实际支持的参数/模板**；旧 VRM 不能因此回成 `.vroid`，旧 fit、54 个目标索引和眼补偿身份不能继承。当前八体、动作/装备适配、独立角色记录和最终游戏验收仍未完成。

依据是 [CAPABILITIES 完整 M2 映射](F:/gamemake/docs/CAPABILITIES.md:170)、[完整 v2](F:/gamemake/docs/research/M2-COMPLETE-CUSTOMIZATION-LONG-GOAL-v2-2026-11-16.txt)，以及下述固定源码；不把旧实验的 101 截面或夸张下巴当产品要求。

## 1. 固定入口与审查覆盖

已核 Python `TOOLS` 的 **59 项声明和全部 `run_tool` 分支**、HTTP 路由与相关 C# 实现。stdio MCP → Python → `127.0.0.1:7811` 普通 HTTP JSON → Unity 主线程；不是 brainrom 的 HTTP MCP 端口。导出、安装与 BepInEx be.791 的具体来源/哈希复用 [已封导出研究](F:/gamemake/docs/research/VROID-NATIVE-EXPORT-MCP-2026-11-17.md)，不另做第二套安装研究。[工具注册及分发](https://github.com/mcjo79/vroid-mcp/blob/c7367a548626cbe69e26b533e48fc9ddaf85851e/mcp_server/vroid_mcp.py)、[HTTP 实现](https://github.com/mcjo79/vroid-mcp/blob/c7367a548626cbe69e26b533e48fc9ddaf85851e/VRoidMcpBridge/HttpBridge.cs)

59 项按真实职责归并如下（均省略 `vroid_` 前缀；“有工具”只表示代码入口）：

| 组 | 工具 |
|---|---|
| 生命周期/导出，8 | status、create、open、save、export_vrm、export_vrm_options、main_menu、exit |
| 参数发现/修改，9 | list_groups、get_params、get_item_params、sections、categories、enter、set_param、set_blendshape、set_bone |
| 颜色/纹理，10 | set_color、colorize、list_layers、recolor_layer、export_layer、import_layer、list_hair_materials、set_hair_color、clothing_colors、begin_clothing_edit |
| 发型，10 | list_hair_groups、set_procedural_hair、scale_brush_hair、clone_brush_hair、get_hair_strand_points、move_hair_strand_point、duplicate_hair_strand、set_hair_material、list_hair_bones、set_hair_bone |
| 预设/物品，4 | list_presets、apply_preset、apply_custom、remove_item |
| 缓存/目录，5 | preset_cache_search、preset_cache_annotate、preset_thumbnail、preset_cache_sync、preset_cache_build |
| 观察/视图，6 | framing_get、framing_set、framing_reset、screenshot、camera、face_preview |
| 其他制作/辅助，7 | begin_hair_edit、measure、set_body_size、undo、redo、batch、help |

作者 [skill](https://github.com/mcjo79/vroid-mcp/blob/c7367a548626cbe69e26b533e48fc9ddaf85851e/agent/skills/vroid-studio/SKILL.md) 提供 inspect→改一项→截图→保存流程；`vroid://agent/{face,body,hairstyle,outfit,...}` 是按章节切分的参考资源，`help` 可离线查询。这里只审查它们，不执行其中编辑指令。参考目录由作者机器生成，包含用户 custom items 与可能未购买内容，其预设数量不是本机可用数量，必须现场查询 `usable`。[参数/工作流参考](https://github.com/mcjo79/vroid-mcp/blob/c7367a548626cbe69e26b533e48fc9ddaf85851e/docs/AGENT_REFERENCE_EN.md)

## 2. 与 M2 的真实适配面

| M2 机制 | 固定实现能做什么 | 尚不能据此宣布完成 |
|---|---|---|
| CUSTOM-BASE、F01–F13：男女、脸型、五官联动 | `Create` 使用 `Preset_F/F00`、`Preset_M/M00`；从当前模型发现参数，再调用原生 `SetBoneTransformParameterCommand` / `SetBlendShapeTransformParameterCommand`。FaceShape 实列 FaceRound、ChinRound/Roundness、FullCheeked、MandibleSize、颏上下/前后等；眼睑眼裂/眼位、眉形、鼻梁鼻翼、唇厚/牙形、耳形各有原生入口。可先使用原作者整脸预设观察正常比例，再作可回读局部编辑。 | 不是任意解剖轴、任意左右不对称、独立颅后/太阳穴/颧骨/人中等全覆盖。目录没有的轴不能用相似名称冒认。新脸的闭眼、口型、混合表情及侧面观感须实际检查；“原生命令”不保证极端组合合理。 |
| B01–B16、AGE：体型和比例 | 目录实列头宽/大小、颈长与 X/Z 围度、肩宽、躯干长度、整臂/整腿长度、手大小/指粗、足大小、胸部与腰宽、性别 silhouette。骨骼与模型由 VRoid 原生命令更新，可减少自己变形网格后修骨权的步骤。 | 没有证据覆盖独立上臂/前臂、大腿/小腿长度围度、手指各节、胸廓与肌肉、腹臀分布、足宽/踝围或年龄结构。`set_body_size(weight_kg)` **只是 BMI 映射腰宽**，不是体重/肌肉建模；身高是 silhouette 割线搜索，测量取 renderer bounds，发型/衣物可影响读数。不可用于证明全身体积和独立身高轴。 |
| S01–S03、M01–M05：肤发瞳唇、妆容表面 | FaceSkin/BodySkin 分组颜色，眉/虹膜及左右虹膜 overlay 等分色；发材质另有颜色入口。PNG 层导出、替换、新层导入和保 alpha 重染可承载自己制作的妆容/痣/雀斑/身体图案。 | 脸身色自动一致、唇色保护口腔、瞳孔眼白保护并非通用保证；要选真实组/层。`colorize` 默认可改多种颜色和所有层，不宜当精确保护蒙版。缺通用层删除/顺序/显隐 setter，眉胡须/体毛和指甲几何仍需素材/制作证据。 |
| H01–H06：长短发/发束/动态 | 原生各发区预设；procedural 仅暴露 length/hairCount；brush 可按根缩放、复制组/束、读取和移动控制点（可保原 normal/UV）、分配已有共享材质。已有发骨组可改骨数、根率、stiffness、gravity、colliderRadius。 | 没有暴露从零建任意发束组、重分配发骨成员、创建任意碰撞体或通用衣发避碰。复制束不等于正确动态绑定，须读回 `hairCount`/导出权重与 spring。编辫/盘发可从已有结构制作，但工具名不等于样件已成；帽发/坐姿/暂停恢复仍是游戏验证。 |
| E01–E08、FIT01：服装、鞋、叠层 | 预设 Tops/Bottoms/Onepiece/InnerTop/InnerBottom/Socks/Shoes；隐藏 template blendshape 可调现有模板的衣长/宽/袖/裙等；材质和层可形成新图案衣物。原生 body 参数与这些模板共同更新，值得实际测同款男女/体型变体。 | **不是任意新衣网格/UV/骨权导入器**；没有 Blender mesh 导入工具。超模板版型、新披肩外套、蒙皮附件等仍需已研究的 DCC 制作/适配路径。衣物导出通常是整角色，不能代替游戏独立装备拆分、覆盖索引、fit 身份。鞋预设不证明鞋楦/高跟脚姿/步态/地面和椅子接触。 |
| A01–A04：附件与持物 | 帽、眼镜、动物耳尾、腕颈饰等现有预设/custom item；支持应用、移除及模板可发现的参数/纹理。 | 没有任意挂点/左右成对多件合同、通用新附件网格与蒙皮入口，也没有握持、双手用途、支撑/视线/IK 动作适配；仍用项目装备和动作链及需要的 Blender 制作。 |
| 表情与动作 | `face_preview` 列出实际 renderer morph；可预览元音/情绪/闭眼并归零。原生 VRM 导出负责输出现有表达数据。 | **预览不持久化**：`SetBlendShapeWeight` 只写当前 renderer，模型重建可能复位；不是编辑/保存 VRM expression 配方的工具。没有动作制作/导入/重定向/接触求解工具。正式 happy .65 + vowel .66 + blink、lookAt 和动作仍在我们的实际 manager 中测。 |
| L01/L02、D01–D03、P01/P02、I01 | `.vroid` 保存/重开；顺序操作与逐项结果；VRM0/1 原生导出，可形成 agent 的制作 recipe 和恢复检查点。 | 无独立角色 ID/游戏记录/资源依赖准入/原子整套换装/跨进程续批事务/确定性产物保证；这些继续使用并扩展项目既有合同。不得把缓存注释当正式角色档案。 |

对应源码：[模型参数](https://github.com/mcjo79/vroid-mcp/blob/c7367a548626cbe69e26b533e48fc9ddaf85851e/VRoidMcpBridge/VRoidApi.cs)、[体高测量](https://github.com/mcjo79/vroid-mcp/blob/c7367a548626cbe69e26b533e48fc9ddaf85851e/VRoidMcpBridge/BodySize.cs)、[发束/发骨](https://github.com/mcjo79/vroid-mcp/blob/c7367a548626cbe69e26b533e48fc9ddaf85851e/VRoidMcpBridge/HairShape.cs)、[纹理层](https://github.com/mcjo79/vroid-mcp/blob/c7367a548626cbe69e26b533e48fc9ddaf85851e/VRoidMcpBridge/Textures.cs)、[衣物模板参数](https://github.com/mcjo79/vroid-mcp/blob/c7367a548626cbe69e26b533e48fc9ddaf85851e/VRoidMcpBridge/ClothingSliders.cs)、[表情预览](https://github.com/mcjo79/vroid-mcp/blob/c7367a548626cbe69e26b533e48fc9ddaf85851e/VRoidMcpBridge/FacePreview.cs)。

## 3. 必须按真实实现处理的自动化接缝

- **参数范围不能统一成 0..1。** 作者当前 skill 指定脸体一般 0..1、衣物 template sliders 0..100。`ClothingSliders.cs` 的旧注释仍写 0..1，而 HTTP/C# 不做百分比转换。参考文档前部“衣物无 numeric slider”也被后部 template 参数说明否定。以实际 `get_item_params.sliders`、一次写入 `readBack` 和可见变化核定，不照旧注释乘除 100。配对参数会由原生逻辑互斥；保存 recipe 要回读两侧，不能只记请求值。
- **`.vroid` 和 `.vroidcustomitem` 是两条不同能力。** `SaveSync` 支持原生项目另存；`Open` 先查文件存在且拒绝替换当前已打开模型，再进原生导入入口。`CustomItems.Apply` 先从编辑器 registry 按完整路径找已知物品，然后加载/反序列化/替换同类别；一个任意下载路径不保证可用。59 工具和 HTTP 路由中未发现 custom item 创建/保存/导出工具。原生 GUI 能做不等于桥已覆盖，必要时另行 GUI 有界补齐，不能假报 MCP 已完成。[生命周期](https://github.com/mcjo79/vroid-mcp/blob/c7367a548626cbe69e26b533e48fc9ddaf85851e/VRoidMcpBridge/FileLifecycle.cs)、[custom 应用](https://github.com/mcjo79/vroid-mcp/blob/c7367a548626cbe69e26b533e48fc9ddaf85851e/VRoidMcpBridge/CustomItems.cs)
- **批次最多 200 步，顺序执行，无回滚。** `stop_on_error` 默认 true，但 `_run_batch` 只识别异常、`error`、HTTP>=400，未把普通 `{ok:false}` 计失败；例如复制束找不到新 ID、材质未匹配等可能嵌在“批次成功”中。`set_param` 包装也可能顶层 `ok:true` 而子结果另有状态。必须检查嵌套结果、warnings 和实际读回；不以顶层 ok 判制作完成。不自动重试非幂等的复制/新增层；超时先查询当前状态并从保存的 `.vroid` 恢复。
- **撤销单位不等于工具单位。** brush 缩放每个点发一条命令，复制加偏移也可能多条；一次 undo 不能当整个调用原子撤销。一个模型串行处理，每次换模型或整套预设后重发现 group/strand/bone IDs。
- **缓存构图有制作副作用。** `preset_cache_build` 会脱掉物品/头发、逐件换装截图再恢复，源码明示恢复不保证完全相同。第一矩阵用 `search/sync/thumbnail` 与直接截图即可，不为“读取目录”运行全库 build。`remove_item` 传短类型可移除全部该类，不等于移除单个稳定资产。
- **保存/导出只构成文件层承诺。** SaveAs 检查 SaveSync 结果及非空文件；VRM export 有单次互斥、原生任务与 settings/warnings 回执，详见既有研究。使用全新路径，记录 `.vroid`、VRM、recipe 和输入版本 SHA；重新打开回读后再判保存。第二次导出比较解码骨架/网格/材质/表达，而非要求含元数据文件逐字同 SHA。归零预览再导出；新 sourceSHA 单独登记。

## 4. 交 root 执行的一次最小运行矩阵

建议单编辑器串行、两性各一个原生源及一个变体，最多四次 VRM 导出（两性各一次，另一个代表源复出一次，余一次仅用于确定的版本格式差异），总窗口 60 分钟；不扫 59 工具、不全库缩略图、不做八体批产。已有同输入实测可直接填证，不重复。到时保存具体失败/缺项，不能靠超范围继续试直到“全过”。

| 步骤 | 最小实际操作 | 必须留下的读回 / 能证明什么 |
|---|---|---|
| R0 真实连接 | status、tools/list、sections、groups；分别 create female/male，先保存 baseline，按保存→main_menu→create 切换 | 宿主/plugin 版本、59 工具名、两个源 SHA、真实组/参数目录。证明两性原生源能创建保存，不证明全细分参数。 |
| R1 正常脸与局部体型 | 每性从可用原版 FaceSet/FaceShape 选择一个不同且正常的样例；用实时参数选择一个脸型轴和一个肩/躯干比例轴作一次适度调整，记录请求/回读/配对值；variant 另存 | 同镜头正/侧/3⁄4及全身，脸、眼口、骨架比例是否真实变化。实际值是学习样例，不成为永久“正常脸”公式。 |
| R2 表面 | 在一个变体上分别修改脸/身体肤色、发色、虹膜、外唇对应层/色；选一层做 PNG 导出→原尺寸新层导入，保存重开 | 各目标组/层 ID、PNG/源 SHA；非目标眼白/口腔与脸身接缝观察。不得用 Mouth 全材质色代替外唇；没有外唇入口则记录缺口。 |
| R3 发型和骨 | 一套已拥有长发/束发；读一个 brush strand 的点，仅改一次末端并回读；读已有发骨组，改一项有范围依据的参数并回读 | `.vroid` 重开后控制点/骨参数保留；导出后对应骨/权重/spring 参数确实存在。若当前发型没有所需组，记录“不覆盖”，不捏造成员。只验证一次制作，不宣称游戏动态通过。 |
| R4 衣物/鞋/附件 | 一个模板服装 slider 写入并 readBack；选同款在两体读取实际结果；鞋/一个眼镜或帽应用→移除→恢复，记录组变更 | template key/范围实证，改衣长/宽真实可见；身体/衣物网格、骨权和接缝留查。若 registry 有合法 custom item，应用一次；没有则明确 custom 路径未实测，不下载凑样。 |
| R5 保存与表情/导出 | 变体保存→回菜单→重开；重新查询所改参数。neutral、Joy、Close、A、O 和一个 Joy+Close+O 组合截图；最后 reset。原生 VRM 导出、重开同源重复导出一个代表 | 同源几何、骨架、蒙皮、材质/纹理、表达映射、spring 解码对照，导出 options/warnings。预览组合仅编辑器证据；项目 .65/.66/blink 的真实 manager 后验另做。 |
| R6 错误与恢复 | 在已保存试样执行短 batch：合法只读、必错不存在工具、后续只读；默认 stop_on_error。另核一个真实 ok:false 返回（能安全取得时） | 执行索引/停止位置；证明部分失败不会被当完整角色成功。重开 checkpoint 后核状态，不能靠单次 undo 假定全批回滚。 |

R1 若已经怪异、R2/R3/R4 调用未生效、保存重开不一致、导出丢关键绑定/表达，均保失败并停止其后依赖项；不加自造曲线或默认新细分修饰结果。其余独立项可继续。只有此矩阵真实产物过后，才安排现有 4196 共同运行链的独立候选：真实表情混合、走跑/转坐起、用途持物、长发/衣物接触、加载卸载/双实例/关闭恢复和普通机预算。冻结女裙与 30 秒舞不重开。

## 5. 生产取舍与许可边界

最小可复用路线是 **原生 `.vroid` 检查点 + 原版预设/真实参数 recipe + 逐项读回 + VRM 原生导出 + 项目既有身份/适配/运行验证**。不再用自造尖锥目标作为学习原生工具的输入，也不把桥当新游戏运行时。对于原生模板覆盖不到的独立身体轴、新服装拓扑/蒙皮、通用饰物和功能持物，保留 Blender/既有适配脚本；先以具体缺项选既有成熟制作方法，不能因工具缺口把这些要求移出 M2。

桥代码为 MIT，保留版权/许可；第三方声明明确区分 pixiv 软件及素材与桥，并列出 brainrom 改编代码及打包 Python/NumPy/Pillow 的许可。MIT **不等于 pixiv 官方 API 支持，也不授予素材或玩家造人服务的权利**。[LICENSE](https://github.com/mcjo79/vroid-mcp/blob/c7367a548626cbe69e26b533e48fc9ddaf85851e/LICENSE)、[THIRD_PARTY_NOTICES](https://github.com/mcjo79/vroid-mcp/blob/c7367a548626cbe69e26b533e48fc9ddaf85851e/THIRD_PARTY_NOTICES.md)。稳定版素材、第三方 custom item、内部制作与对外生成/导出的区别，沿用已核 [官方原生流程报告的具体来源与限制](F:/gamemake/docs/research/NATIVE-ANIME-AUTHORING-WORKFLOW-2026-11-17.md)。不因本次只读审查制造安装审批，也不将内部学习记录当玩家生成服务许可结论。

当前结论等级：固定源码功能适配审查完成；本报告的两性/造型/长发/服装/保存/表达/批次矩阵实际结果待 root 提供。没有更新 CAPABILITIES 为通过，没有替换基模、profile、4196 或旧证据。
