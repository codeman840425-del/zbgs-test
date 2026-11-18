# 角色底座规模与资源拆分调研

## 已核查事实

- VRoid 官方将 Face、Hair、Body、Clothing、General、Camera/Exporter 分成不同编辑域；发型编辑本身还分前发、后发、extension、ahoge 等部分。来源：[VRoid 编辑器说明](https://vroid.pixiv.help/hc/en-us/articles/360012681033-About-Editors-Design-and-Texture-Tabs-Properties-Panel)、[VRoid 入门](https://vroid.pixiv.help/hc/en-us/articles/4405597663385-Getting-Started-with-VRoid)。
- VRoid 官方 Body Editor 使用参数调整身体特征；这说明可维护底座通常是参数化身体，而不是为每个外观重新做完整控制器。来源：[Body Editor](https://vroid.pixiv.help/hc/en-us/articles/360012681033-Body-Editor)。
- VRoid 2.0 的 XWear/dress-up 流程明确针对不同体型的服装适配，并提供自动 fitting 能力；这支持“款式 ID 与身体适配版本分离”的设计。来源：[XWear 官方说明](https://vroid.com/en/news/26gn98sTuPJQ53LxDQRyFg)。
- Ready Player Me 的官方 SDK 示例将脸型、眼睛、眉、鼻、嘴、胡须、肤色和发色作为不同资产域，并区分 body type；这支持五官参数域与身体基础分开管理。来源：[Ready Player Me sample structure](https://github.com/readyplayerme/rpm-unity-sdk-core/blob/main/Documentation~/SampleStructure.md)。
- VRChat 官方创作文档建议将身体与头脸拆成独立 skinned mesh，并依靠骨骼/表情/动态能力；这说明内部网格可拆分，但对外仍应以完整可用角色或装备包交付。来源：[VRChat 创建 Avatar](https://creators.vrchat.com/avatars/creating-your-first-avatar/)。
- VRoid 官方曾在一次版本更新中提供 100 个脸部预设和 100 个发型预设，同时把发型拆成前发、后发、扩展、侧发等资源域。这个数字是某版本的内容目录规模，不是底层身体基模数量。来源：[VRoid 200 presets](https://vroid.com/en/news/1FI7DuaA77iAntDfxBFTRT)。
- The Sims 4 官方资料支持身体形状、发型、配饰、服装和步态编辑；官方更新也记录了不同身体框架和体型滑条导致的服装变形修复。这说明成熟产品把体型参数和服装兼容修正放在同一生产合同中。来源：[EA Create-a-Sim](https://www.ea.com/games/the-sims/the-sims-4/how-to-play-the-sims)、[EA 2025-02 update](https://www.ea.com/games/the-sims/the-sims-4/news/update-2-25-2025)。
- Ready Player Me 官方 SDK 示例按 body type、脸型、眼、眉、鼻、嘴、发型、服装、眼镜和头饰组织资产面板，但没有公开统一基模总数。来源：[RPM sample structure](https://github.com/readyplayerme/rpm-unity-sdk-core/blob/main/Documentation~/SampleStructure.md)。
- VRChat 官方把三角形、skinned mesh、材质槽、PhysBones 和骨骼数量纳入性能等级；这支持把动态组件和资源预算纳入我们的准入合同。来源：[VRChat performance ranks](https://creators.vrchat.com/avatars/avatar-performance-ranking-system/)、[PhysBones](https://creators.vrchat.com/common-components/physbones/)。

## 不能从公开资料直接推出的数字

公开资料通常不会给出“标准游戏应该有多少男体、女体、脸型或发型”的统一答案。成熟产品把运行时选项数量、底层身体基模数量和可售/可生产资源数量分开；菜单里可以有很多选项，但底层往往由少量身体基模、形态参数和大量服装/发型变体支撑。

因此本项目不直接采用“男十种、女十种”作为固定需求。应先确定少量可维护基模和参数范围，再用实际生产成本与兼容证据决定扩充数量。

## 对本项目的建议

1. 首版保留男女各一个正式候选基模，另设有限派生体型，不把每个体型做成独立控制器。
2. 五官按眉、眼、鼻、嘴、耳等参数域管理；脸型变化生成新的 body/face identity，并触发受影响 fit。
3. 发型对外以完整 style 包登记，内部可包含刘海、后发、马尾、动态骨骼和发饰部件。
4. 衣服以完整款式/版型为生产单位；每种身体类型生成独立 variant，记录共同 `styleId` 和具体 `bodyType` 适配版本。
5. 每个新款式先用男女各一个代表体型跑完整闭环，再决定是否扩展到更多体型。扩展依据是资源生产时间、超预算比例、失败组合和动作/接触适配成本。
6. 生产验收优先使用游戏的2.5D远景检查轮廓、发型、服装和动作；近景检查继续保留，用于捕获会扩散到绑定、接触、表情和资源身份的结构性错误。

## 调研后的最小机制矩阵

这是 M2 的验证下限，不是要求现在制作的内容库规模：

- 男女各 1 个正式绑定基模；每个基模先验证 3 个可复现体型记录，再决定是否增加体型档位。
- 每个基模至少 3 个脸型记录，覆盖下颌/脸颊、眼、鼻、嘴等局部变化，以及肤色、虹膜、唇色和眉色。
- 至少 4 类发型机制：短发静态、长发分束动态、束发/盘发、带侧发或扩展的组合。每个对外仍是一个完整发型包。
- 至少 4 类服装机制：上装、下装、外层或连体、裙装/宽松动态；每件记录身体 variant、叠穿层级、覆盖和动作限制。
- 至少 1 个头部附件、1 个面部附件和 1 个真实持物道具；挂点与实际使用姿态分开验收。
- 用少量确定性角色记录验证保存、恢复、双实例隔离和资源预算；不以这些样件数量宣布大规模衣库或随机生成完成。

这些数量来自对独立机制的覆盖，不是对最终游戏内容数量的承诺。真正扩充多少体型、脸型、发型和服装，待共同生产闭环和目标设备预算测量后决定。

## 当前工程差距

当前工程已经具备单一身体配方到角色记录的重复链路，但还没有完成“一款服装→多个 bodyType variant→自动配对→共同动作/接触准入”的完整闭环。下一工作包应先实现一个小型 bodyType/garment variant 矩阵和失败拒绝路径，再扩大资源数量。
