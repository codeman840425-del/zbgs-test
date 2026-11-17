# 稳定版 VRoid 原生二次元角色制作流程核查

2026-11-17；只读官方研究，未安装、下载、启动编辑器或制作角色。requested agent 配置沿用 gpt-6-astra/high；不声称已验证实际 provider 或 Hook 拦截。

**应先复现作者的完整制作流程，学习成套脸部、局部比例、表情与发型如何配合；不能再用自拟轮廓函数代替造型学习。** VRoid Studio 的原生编辑与复用功能有官方依据，但本机尚无可用编辑器/原生工程，GUI 重复制作成本与批量效率未实测。本报告不批准更换项目基模，也不把学习样本当八体生产完成。

中断实况已复核：`scripts/m2-semantic-female-face-v1/`、`assets-source/m2-semantic-female-face-v1/` 均未创建；未发现命令行匹配该包的 Python/Blender/Node 进程。此前仅查询旧源数据，没有新配方、G 求值或导出；原证据不变。

**1. 有什么可编辑源，不能恢复什么**

既存核查 [native feasibility](F:/gamemake/evidence/m2-native-face-authoring-feasibility-v1/REVIEW.md) 在已声明注册表、Steam 库、项目及用户目录范围未找到 VRoid 或 `.vroid`；不是全盘不存在证明。官方 Windows 下载身份先前核到 2.16.0，不是已安装版本。已取消的安装器残片保持原状，本轮没有续传。现有男女 `.blend` 是旧 beta VRM 的重建可编辑文件，不包含原生滑条工程。

| 官方内容 | 真正用途与复用边界 |
|---|---|
| 新建模型 + 内置预设 | Home Screen 的 `+` 进入 base 选择；在同一个原生工程内制作、保存。是学习原版流程最小入口。[Home Screen](https://vroid.pixiv.help/hc/en-us/articles/4405171049113-Home-Screen) |
| 官方 A–Z Sample Models | 模型选择页可下载、打开完整可编辑样例，适合观察作者怎样配置部件；非 CC0，且附加限制，不能直接作为对外造人服务底库。本轮未下载。[样例入口](https://vroid.pixiv.help/hc/en-us/articles/31627266179865-How-to-use-sample-models) |
| `.vroid` | 完整原生编辑源；应保存基线和变体，保留可继续编辑的模型身份。 |
| `.vroidcustomitem` | 指定类别的复用部件，能保存该类别支持的参数、纹理层、材质、发组及发骨设置。**Body 类只承诺皮肤纹理复用，不能当全身体型配方**；全体型须留在 `.vroid` 和参数记录中。[Custom Items](https://vroid.pixiv.help/hc/en-us/articles/900005583186-How-to-Use-Custom-Items)、[导入导出及保存内容](https://vroid.pixiv.help/hc/en-us/articles/7467455312409-How-to-import-and-export-custom-items) |
| `.vrm` | 面向运行时的导出模型；不是原生可编辑源，不能反推出原始部件选择/参数。新换装模块可以消费 VRM，但不恢复原生捏脸工程。[文件格式](https://vroid.pixiv.help/hc/en-us/articles/23731198070809-About-file-formats-used-by-VRoid-Studio)、[换装模块的格式区分](https://vroid.pixiv.help/hc/en-us/articles/39513343637529-What-is-vroid) |

稳定版更新过基模、脸/身体参数及着色；旧 beta `.vroid` 有专门转换入口，也可能改变外观。它不能转换项目仅存的旧 `.vrm` 为原生工程。旧 beta 的超滑条范围演示、CC0 New model 条件，不移植为稳定版能力或许可。[官方 beta/稳定版差异](https://vroid.pixiv.help/hc/en-us/articles/4405597671193-What-are-the-differences-between-the-old-beta-and-stable-versions)、[转换说明](https://vroid.pixiv.help/hc/en-us/articles/4405853251481-How-to-use-models-from-the-old-beta-version)

**2. 作者原版工作流：先组合完整形象，再编辑局部并检查运动**

官方入门顺序是 Face → Hairstyle → Body → Outfit → Accessories。先选择成套预设，再修改部件；身体明确支持身高、肩宽等参数。这里可借鉴的是完整角色制作顺序和原版参考内容，不是官方给出了“正常脸”的固定数值标准。[Getting Started with VRoid](https://vroid.pixiv.help/hc/en-us/articles/4405597663385-Getting-Started-with-VRoid)

1. **先建立脸部基线。** Face Sets 提供完整脸，Eye Sets 将虹膜/高光/眼白/眼线/睫毛作为组合；再选眉、眼睑、鼻、口、口内、唇等类别编辑可用的位置/尺寸/颜色。轮廓、五官与纹理都参与最终观感；不能把“Cheeks”类别存在理解为已证圆脸/方脸几何控制。官方没有公布全部形变场或保证任意组合正常，需要在原版里实看正面、侧面和 3/4。[How to edit faces](https://vroid.pixiv.help/hc/en-us/articles/4406164546969-How-to-edit-faces)
2. **在同源内做局部身体和服装。** Body 编辑颈以下，局部比例与整体身高分开观察；记录实际版本中所选控件名称和原/新值，不凭旧 beta 名单承诺当前全参数覆盖。Outfit 模板也有自身参数，层叠衣物与 Skin Mask 是独立制作步骤，不能由“改身体成功”推出现有项目服装自动适配。Skin Mask 隐藏覆盖区域的皮肤，并非改变衣服几何或证明没有穿插。[模板与分层](https://vroid.com/en/studio)、[Skin Masks](https://vroid.pixiv.help/hc/en-us/articles/4405516267033-How-to-use-Skin-Masks)
3. **发型先复用成套/分区，再编辑发组。** 需要自制时，原版提供沿 guide 绘制的 Freehand Hair 和按数量/截面/扭转配置的 Procedural Hair。转换为 Freehand 后不再保留过程参数编辑能力，应保转换前源；不能把手绘轨迹包装成可确定性批处理。[发型编辑](https://vroid.pixiv.help/hc/en-us/articles/900005678786-How-do-I-customize-hairstyles)
4. **发型形状与动态分别完成。** 预设已有 Hair Bounce；自制可自动分骨组，再调骨数、固定点、刚度/重力和碰撞半径。尤其官方指出：修改已有发型不会自动更新原发骨，需重新检查骨轴。Photo Booth 运行姿态/动画只能证明编辑器中的表现，游戏 SpringBone 仍需实际检查。[Hair Bounce](https://vroid.pixiv.help/hc/en-us/articles/900006910023-I-want-to-edit-hair-bounce)
5. **把表情作为制作内容。** Expression Editor 选择 Neutral/Smiling 等表达后配置眉、眼、口的变化，保存在模型并进入 VRM；不能只验证静态脸。NEUTRAL 不等于所有表达权重为 0，切入 Photo Booth/导出时预览归零不等于表达被丢弃。[Expression Editor](https://vroid.pixiv.help/hc/en-us/articles/4408150140825-How-to-use-the-Expression-Editor)
6. **用实际形象复核后保存。** Photo Booth 能预览表达、眨眼和姿态；其中调整不回写模型编辑设置。官方建议在编辑器选择 CLOSE 检查闭眼，A 检查张口/口内。项目还需在自己的实际 manager 混合下复核，不能把原版单表情预览当混合接触保证。[Photo Booth](https://vroid.pixiv.help/hc/en-us/articles/900006969003-I-want-to-know-more-about-the-parameters-in-Photo-Booth)

这套机制与旧实验的关键区别：有作者设计的成套部件、局部编辑、表情配置和可视反馈循环。官方文章未给出自动保持眼口接触、全姿态无穿插或“正常圆/柔宽/方必然可达”的证明；应学习并测量这些实际行为，而非替它编造保证。

**3. 保存、版本与重复执行边界**

完整模型另存 `.vroid`；可复用部件另存/导出 Custom Item。临时未保存部件每类别最多一个，不能作为配方库。稳定版 `.vroid` 可指定位置，Windows Custom Items 位于 `AppData/LocalLow/pixiv/VRoid Studio/custom_items`，且模型没有自动备份保证；附件 Custom Item 不同于普通部件的应用内保存行为，须按其文档单独导出。[保存位置与备份](https://vroid.pixiv.help/hc/en-us/articles/900007039003-Where-are-3D-models-and-custom-items-saved)、[Custom Items](https://vroid.pixiv.help/hc/en-us/articles/900005583186-How-to-Use-Custom-Items)

可持续生产记录最小应包含：编辑器实际版本/语言、基线 `.vroid` 哈希、所选预设截图和类别、每次改动控件的精确标签与原/新值、表达配置、部件文件哈希、导出设置、最终源与 VRM 哈希。UI 标签或缩略图并非已验证的跨版本稳定 ID；重复恢复优先打开保存源，不能假定一份手记可跨版本重建全部隐藏默认值。

**目前官方可核的是 GUI 操作，不是建模 CLI。** 已有检索没有找到官方 Studio 参数枚举/设值、无界面保存或批量导出入口。Hub SDK 负责 OAuth、Hub 模型信息/下载和 Unity 消费，不能驱动 Studio 捏脸。[官方 SDK 功能](https://github.com/pixiv/vroid-sdk-developers)

Agent 原则上可按 GUI 逐步操作、读回可见值、保存/重开、导出；这属于待实测能力。尚未验证 UI 稳定性、需要的操作数、耗时与失败恢复，不能说已比现有脚本高效。复制原生项目和 Custom Items 可减少重复劳动，仍不等于批处理。此轮只读，无 GUI 操作；后续如获准做学习样例，应先按 computer-use skill 协调独占操作窗口，不让用户代做美术，不采用注入/逆向私有格式。

**4. 一次原版最小复现练习（建议，未执行）**

目的只为观察原生完整脸及表情联动，并测保存恢复；不替换项目源、不批量生产八体。待工具获取获准后，设一个 60 分钟学习窗口；到时保存观察/缺口，不用参数搜索补成“通过”。

1. 从 `+` 创建一个原版 base，选一套原版 Face Set、现成发型及简单衣装；原样保存 `study-baseline.vroid`。记录实际版本、所选项与正/侧/3/4截图。优先默认内容，不导入旧 VRM、不先用 A–Z 样例构建生产库。
2. 另存 `study-variant.vroid`。在同一源上仅比较另一套原版 Face Set；记录眼、口、口颏、轮廓和贴图变化，避免先猜一套“正常脸”参数。再在 Body 中选官方已列出的肩宽，作一次界面正常范围内可辨的局部调整并回读具体值。这个值是操作试验，不上升为产品规范，不循环扫值。
3. 在原/新状态分别观察 0 权重、NEUTRAL、Smiling、CLOSE、A；检查脸型改变后眼口/眉是否连贯，口内是否暴露异常。发型采用现成动态，在 Photo Booth 运行一段内置动画，记录问题；不先发明补偿形变。
4. 将已改脸部件按支持类别保存成 Custom Item，保存完整源后关闭重开；核实际部件、参数和表达。保留前后源和截图；**不要求 Body Custom Item 保存肩宽**。
5. 从重开的同一源以固定格式/同一减面、材质、骨设置导出两次 VRM；比较解码后的网格、骨权、表达与材质，同时记录元数据造成的文件差异。输出只标学习样例。此步骤检验可重复导出，不能凭文件能打开宣布游戏动作/装备通过。

最少交付是 2 个原生源、部件文件、参数/操作记录、同镜头图、2 次导出对照与实耗时间。若 UI 无法可靠回读、保存后状态不一致或造型不正常，停止并记录具体步骤；不要求用户雕刻，也不改用新数学曲线绕过学习目标。

**5. 接入现有游戏链的差额**

原生编辑器导出页支持 VRM0.0/1.0，并有减面/材质/骨设置；导出时预览归零仍保留表达配置。换装功能的 VRM 导出只支持 1.0，这是另一入口，不能混淆。[原生导出](https://vroid.pixiv.help/hc/en-us/articles/15760756822297-I-want-to-learn-more-about-the-VRM-export-feature)、[换装格式限制](https://vroid.pixiv.help/hc/en-us/articles/39513600013721-Q-Can-I-export-in-VRM-0-x-format)

项目已用 `GLTFLoader + VRMLoaderPlugin`，例如 [foundation-avatar.js:119](F:/gamemake/prototype/src/foundation-avatar.js:119)，并执行 `rotateVRM0`。因此未来新原生输出可走现有 Three/VRM 加载链，无须换引擎或接 Hub SDK。**格式入口复用不等于角色合同复用**：须独立 sourceSHA/角色身份、真实骨架与 humanoid 映射、材质/法线、表达语义、SpringBone、动作与装备 fit 检查，不能复制旧 54 target 索引或原眼补偿 profile。

当前 [live-presentation.js:138](F:/gamemake/prototype/src/live-presentation.js:138) 实际叠加 happy .65、五元音最高 .66 和 blink，随后运行眼补偿。新源须由真实 VRM 表达映射验证这些组合，而非继承旧源补丁。现有 4196、骨架动作消费和诊断分区可保留；新源若将来采用，其装备适配和源语义重新入账，不能为学习样例默认重做或替换已验证资产。

**6. 许可：内部制作与玩家造人/导出不是同一授权**

稳定版默认 mesh/服装/预设不是 CC0。无特别限制的内容允许个人和法人商用、出售模型及外部软件修改；官方商业 FAQ 将此对应到 Terms Article 11。第三方纹理/配件及样例另约优先，不能以“软件免费”推定所有内容随意再授权。[稳定版商业使用说明](https://vroid.pixiv.help/hc/en-us/articles/4405813333657-Can-I-use-the-models-created-with-VRoid-Studio-Stable-Ver-for-commercial-purposes)

Guidelines 的 **“When creating character creation tools”** 要求生成或输出由 Studio mesh/texture 变形组合而成的模型/物品的应用取得单独许可；仅自己使用的程序列有例外。当前内部制作固定资源与对外玩家造人/导出须分开判断；不能把多人商业制作系统或玩家应用自动塞入“自己使用”例外，也不能认为去掉导出按钮就避开其“generate”范围。本报告不是新对外生成服务的许可通过。Guidelines 还禁止软件逆向/反编译。[具体指南条款](https://vroid.com/en/studio/guidelines)

A–Z 样例允许编辑和多种商用，但禁止标为 CC0、将其数据用于角色创建服务，以及收费再分发原样例数据；文章同时列有修改后销售的允许示例，须保留原/改身份，不概括为“样例完全不能商用”或“无条件可卖”。CLCT 项目另有官方说明按无特殊限制数据使用，依然不是 CC0。[A–Z 条件](https://vroid.pixiv.help/hc/en-us/articles/4402394424089-VRoidPreset-A-Z)、[CLCT 条件](https://vroid.pixiv.help/hc/en-us/articles/17427062939289-I-want-to-learn-more-about-the-terms-and-conditions-for-using-CLCT-items)

本轮读到官方 Guidelines 与 FAQ；其链接的完整 [Terms](https://policies.pixiv.net/en.html) 在网页工具返回不可打开，未假称逐条审读或接受。旧资产许可记录不改。当前学习结论不是安装许可阻塞，更不是整个 M2 停工理由；下一实际行动由 root 依据本报告与另两条成熟制作研究合并决定。
