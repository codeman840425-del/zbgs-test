# 角色底座规模与资源拆分调研

## 已核查事实

- VRoid 官方将 Face、Hair、Body、Clothing、General、Camera/Exporter 分成不同编辑域；发型编辑本身还分前发、后发、extension、ahoge 等部分。来源：[VRoid 编辑器说明](https://vroid.pixiv.help/hc/en-us/articles/360012681033-About-Editors-Design-and-Texture-Tabs-Properties-Panel)、[VRoid 入门](https://vroid.pixiv.help/hc/en-us/articles/4405597663385-Getting-Started-with-VRoid)。
- VRoid 官方 Body Editor 使用参数调整身体特征；这说明可维护底座通常是参数化身体，而不是为每个外观重新做完整控制器。来源：[Body Editor](https://vroid.pixiv.help/hc/en-us/articles/360012681033-Body-Editor)。
- VRoid 2.0 的 XWear/dress-up 流程明确针对不同体型的服装适配，并提供自动 fitting 能力；这支持“款式 ID 与身体适配版本分离”的设计。来源：[XWear 官方说明](https://vroid.com/en/news/26gn98sTuPJQ53LxDQRyFg)。
- Ready Player Me 的官方 SDK 示例将脸型、眼睛、眉、鼻、嘴、胡须、肤色和发色作为不同资产域，并区分 body type；这支持五官参数域与身体基础分开管理。来源：[Ready Player Me sample structure](https://github.com/readyplayerme/rpm-unity-sdk-core/blob/main/Documentation~/SampleStructure.md)。
- VRChat 官方创作文档建议将身体与头脸拆成独立 skinned mesh，并依靠骨骼/表情/动态能力；这说明内部网格可拆分，但对外仍应以完整可用角色或装备包交付。来源：[VRChat 创建 Avatar](https://creators.vrchat.com/avatars/creating-your-first-avatar/)。

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

## 当前工程差距

当前工程已经具备单一身体配方到角色记录的重复链路，但还没有完成“一款服装→多个 bodyType variant→自动配对→共同动作/接触准入”的完整闭环。下一工作包应先实现一个小型 bodyType/garment variant 矩阵和失败拒绝路径，再扩大资源数量。
