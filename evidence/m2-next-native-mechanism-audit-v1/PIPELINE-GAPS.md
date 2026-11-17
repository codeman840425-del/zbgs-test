# 原生参数批量制作的断点

审查基准为 4196 build1084 / source55d363，离线核现有源、生产脚本、真实调用与工厂查询，本次没有原生制作或导入。按最新目标，上一份同目录报告的单件唇妆不再作为下一主包。

**现有路径到原生 API 可以按数据发请求，游戏也能批量消费已登记造型。中间缺少把新的参数配置制成资源、验证其依赖并登记的共用入口。** 就已核的原生脸、腰、发型和虹膜路径，没有两组尚未登记的原生值可以直接贯通现有正式角色工厂。分别重开源工程、编辑、导出后用 QA 查看 VRM 技术上可行，历史 `scripts/qa-native-vroid-study.cjs` 使用注入模型的 QA 路由并固定旧 build83de。它没有生产登记、游戏记录或交付语义。

| 环节 | 已有可复用实现 | 新参数具体卡点 |
|---|---|---|
| 原生制作入口 | `assets-source/vroid-bridge-study-v1/call.py` 接受请求 JSON、保响应及嵌套失败。Studio 2.16 + Bridge 0.15 可按新读出的组和键调用 `vroid_set_bone` / `vroid_set_color` / `vroid_apply_preset` 并导出。 | `native-vroid-appearance-producer-v1/color-recipe-template.json` 与 `next-hair-sample-template.json` 是需解析的模板，没有从一批最终参数启动的执行器。`vroid_batch` 顺序调用但无自动事务，不能忽略内层失败。 |
| 脸 / 腰 | `assets-source/native-vroid-geometry-production-v1/requests` 的真实输入分别从同一女性源重开、设值、另存、冷开导出。 | 已归档的是具体请求序列。下游 `native-vroid-geometry-factory-input-v1/build.py` 的 INPUTS 限三个 SHA，另固定 unmasked Body donor。各自新资源再经 face/waist 的工厂、装备、覆盖与道具 fit；可复用的计算散在样件脚本。 |
| 发型 | `native-vroid-hairset-study-v1/native_cycle.py` 用原生作者预设重开导出。 `scripts/native-vroid-hair-equipment-v1/build.py` 有真实蒙皮、材质、代理和骨链提取。 | native_cycle 固定男源、进入快照及 001 preset。prepare.py 固定源/目标 SHA、style、12 spring，build 输出固定 URL。换另一个预设会改变依赖和成本，沿用 001 数据会缺骨或碰撞配置。 |
| 虹膜 | `native-vroid-iris-study-v1/native_cycle.py` 能发现唯一 Level3.Iris 组，按左右键设 RGBA，冷开及导出。`readback.py` 的 extract 按材质查实际消费者，核每个 accessor、图片、表达与采样器。 | cycle 的 RGBA、文件名、目录、进入文件固定；readback 主入口固定 green VRM、输出名与基线。 `scripts/stage-native-iris.py` 仅允许三个现有源 SHA，写 green 槽。 `prototype/src/native-palette-part.js` 可按表取色，`native-palette-catalog.js` 固定已登记键和清单 SHA。新值缺共同登记与传输入口。 |

## 可验证的最小两件输入

用同一 c936b 男性编辑源、同一双眼字段、相同模板与导出设置，只变配置中的最终色。示例 A 取 `#586C85`，B 取 `#886442`，两组均明确左右同色、alpha=1。这是拟议测试向量，尚未生产，颜色选择与绘画审美无关。两条都使用 `vroid_set_color({group:<fresh Level3.Iris id>,key:"Level3Iris_LeftOverlayColor" 或 "Level3Iris_RightOverlayColor",r:R/255,g:G/255,b:B/255,a:1})`。两条分别以 `vroid_open` 重开固定模板，按固定导出配方保存独立 .vroid/VRM，保原生端原文件。两份正式记录各带稳定人物 ID。既有 original/green 排列能测记录，无法触达新增颜色的断点。

共用入口只需把该已证机制的模板身份、参数、资源键、输出目录与目标体从样件移入一份有版本的配置，沿原 call.py 和提取器执行。模板声明实际组类型、键、单位和允许范围，执行时验证 fresh inventory。每件产物回执记录输入摘要、工具版本、冷开值、VRM/PNG SHA、原始和游戏目标消费者以及结果/失败原因。以验证通过的数据生成带 SHA 的新颜色与清单版本，由一个受信的清单入口登记；现有记录继续解析旧版。第二件只能增加数据。原有字节 SHA 完整性仍逐件核查，不能由输入声称的兼容性替代。

**确定性检查。** 同一输入从不可变模板重新求值，冷开后的左右值、非目标字段、解码几何及目标 PNG 实际像素应一致。原生 .vroid 或 VRM 整文件的跨运行字节确定性尚未证明，每次记录真实 SHA。两份不同输入必须产生可区分的目标 PNG。相同输入重复导入复用已核相同资源或显式报告差异，不增加第二份角色、不改成功兄弟项。对已登记资源包仍按精确字节身份进行重建/交付。新色通过前不开放整段 RGB 参数任意值。

## 由实际导出判断适配影响

- **纯纹理。** 先与 a18a 男性原生基线比较所有解码 accessor（含索引、UV、权重、IBM、morph）、材质/纹理绑定、骨架、表达、spring、非目标图。基线与游戏 7586 的 Body 图已知不同，故仅搬运验证过的虹膜 PNG 到精确匹配的原始虹膜材质、图、UV和采样器。已有绿的实测为 139 accessor、91 节点、79 骨、目标图及缩略图改变。每个新值仍须核 alpha、眼白/高光和目标实际变化，记录暗瞳变化，不能把阈值充作解剖分区。这一路径保持游戏体几何身份，衣物/握姿/鞋/座位可沿原 fit；需重新核 PNG 预算、近景表达、实际开关、组合与记录恢复。
- **脸部几何。** 既有脸样件同时影响 Face_SKIN、FaceMouth、HairBack，Body_SKIN normal 也变。逐 primitive 的引用顶点、实际 morph 和区域绑定决定眼睑/口型、发际、眼镜/耳饰与麦克风口端是否重算；衣服能否复用取决于所用顶点、骨的 rest/IBM 和 coverage 证据。派生身体保新 SHA 和 fit 身份。
- **躯干 / 四肢几何。** 腰样件实改 Body、Bottoms、Tops，18 个辅助节点、三套 skin 各 12 个 IBM 及 spring 碰撞半径变化。须重新生成或验衣物版型/绑定/覆盖、坐起接触及动态。涉及腿长或足姿另核鞋底、步幅、座位和镜头。只凭 humanoid 名字一致不足以复用。
- **发型或其他改拓扑的部件。** 定位真正新增/移除网格、骨链、权重、碰撞体与动态中心，重新核头部挂接、帽发/肩部相交、预算与单实例资源所有权。新体型若同时改头，不继承旧长发 fit。

此两件最小验收应有独立原生输出、两个不同的新游戏资源和两份实际角色记录；同一执行入口从配置直达正式加载、关闭再开，并留一次坏 hash 拒绝/保旧及单项重试证据。该证据只覆盖纹理型批产；体型批产仍需同一机制下两组新几何参数及准确 fit 失效/重建证据。历史脸/腰两种不同机制的单件结果不构成这种重复生产证据。
