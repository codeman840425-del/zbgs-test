# 资产来源与使用记录

核查日期：2026-11-14。这里只记录已取得证据的许可和资产身份；模型在仓库中可下载不等于使用代码仓库的 MIT 许可。替代样本不是原游戏人物，也不表示项目拥有其独占版权。

## 本轮二次元代表模型

实际选定文件是 **VRM1_Constraint_Twist_Sample v1.0.1**，作者 **pixiv Inc.**，版权信息 **(c) 2022 pixiv Inc.**。当前文件为 `prototype/public/assets/avatar.vrm`；最初 `seed.vrm` 已纠正，不能据此称它为 Seed-san。运行 `python scripts/fetch-avatar.py` 可按固定提交和 SHA 恢复；已有不同内容会拒绝覆盖。

- 下载来源：[pixiv/three-vrm 的模型文件](https://github.com/pixiv/three-vrm/blob/release/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm)。
- 核查时 release 提交：`ff42fae4fcee1fcbca2cd262c7f5f8cbddeaf5ab`。
- 固定版本下载：[原始 VRM](https://raw.githubusercontent.com/pixiv/three-vrm/ff42fae4fcee1fcbca2cd262c7f5f8cbddeaf5ab/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm)。
- 文件长度：10,776,032 字节。
- SHA-256：`12c2b97e95e700783a6a550dc0eee2d7880aeedccef9ae67bc4c5a2f0f2631a2`。
- 独立官方说明：[VRM Consortium 样例 README](https://github.com/vrm-c/vrm-specification/blob/master/samples/VRM1_Constraint_Twist_Sample/README.md)。
- 官方外观参考：[截图](https://raw.githubusercontent.com/vrm-c/vrm-specification/master/samples/VRM1_Constraint_Twist_Sample/screenshot/screenshot.jpg)。已实际目视：棕色长发、白色短袖 T 恤、黑短裤、黑白运动鞋。可作为二次元裤装代表；截图不证明动画效果合格。

已直接解析本地 GLB JSON chunk 中 `extensions.VRMC_vrm.meta`，主要字段如下；完整快照见 `asset-source.json`。

| 字段 | 文件内实际值 | 本任务含义 |
|---|---|---|
| licenseUrl | `https://vrm.dev/licenses/1.0/` | 模型使用 VRM Public License 1.0，不是 MIT 或 CC0。 |
| avatarPermission | `everyone` | 可由第三方控制该角色。 |
| commercialUsage | `corporation` | 含企业商业使用，不需要为本次免费样机付费购买。 |
| allowRedistribution | `true` | 可随本地演示和代码备份分发原模型，保留原始许可元数据。 |
| modification | `allowModificationRedistribution` | 允许修改与修改物再分发；导出修改模型时需保留、正确设置许可字段。 |
| creditNotation | `unnecessary` | 不强制署名；本项目仍保留来源与作者。 |
| allowAntisocialOrHateUsage | `false` | 使用范围受此条件限制；本任务普通经营/动作展示不涉及该内容。 |

[VRM Public License 1.0](https://vrm.dev/en/licenses/1.0/) 与文件内许可设置共同构成条款。模型使用、修改和再分发依其设置执行；不能把原模型整体改标为项目代码许可，也不能暗示 pixiv 为本游戏背书。以上是对该固定文件及公开条款的工程使用记录。

## 同一人物两套外观的边界

裤装来自该模型的原始 Tops/Bottoms/Shoes 材质与蒙皮。当前裙装已从早期骨骼权重几何改为 `prototype/src/cloth.js` 的近似重力布料：复用 Three.js r110 `examples/webgl_animation_cloth.html` 的 Verlet 积分与距离约束思路，新增腰部固定、腿部胶囊与椅面/椅背盒碰撞。源码许可见 `prototype/licenses/three-cloth-MIT.txt`。同一头、发、人体和骨架保持一致，原始黑短裤保留为内衬。

这是真正逐帧求解粒子位置的布料近似，**未实现自碰撞，也不是通用衣库或通用体型适配**。坐姿截图可证明某一时刻的重力方向，不替代完整走坐舞的穿插、稳定性验收。裙体拓扑与碰撞代理由本项目制作并保留可读源码。

独立裙体若在运行时生成，应保留其生成源码；若导出 VRM 修改物，应保留原模型许可并记录修改内容。原有短裤可作为裙内遮挡层，但必须检查实际裙体、支撑、坐下和抬腿的穿插，不能将遮挡当作不存在问题。

## 已核实但未采用的候选

**Seed-san** 是另一资产：作者 VirtualCast, Inc.，官方图为黑短发角色、白色上衣与七分裤及肩部装备。其[官方说明](https://github.com/vrm-c/vrm-specification/blob/master/samples/Seed-san/README.md)指向 VRM Public License 1.0。不能混用 Twist Sample 的嵌入权限来推定 Seed-san 的全部权限。本轮无须下载替换当前更合适的女角。

**VRoid AvatarSample_A/B/C、VRoidPreset_A–Z** 不是 CC0。官方[使用条件](https://vroid.pixiv.help/hc/en-us/articles/4402394424089-VRoidPreset-A-Z)允许依条款使用、修改，列有重标 CC0、角色创建服务、付费再分发等限制。不要把适用于旧 beta 样本的 CC0 套用到稳定版样本。

旧 **β AvatarSample_1** 的[独立官方条款](https://vroid.pixiv.help/hc/en-us/articles/360012381793)确实给出 CC0，但该结论只属于对应旧样本。当前 Twist Sample 不以该条款为依据。

## 代码与前期排查资产

- `@pixiv/three-vrm` 代码为 [MIT](https://github.com/pixiv/three-vrm/blob/dev/LICENSE)，分发依赖时保留声明；这不覆盖独立模型许可。
- Three.js、Phaser 的依赖许可以锁定版本包内 LICENSE 为准，随发布保留；不要将整个项目第三方资产统称为 MIT。
- `RobotExpressive.glb` / `Soldier.glb` 是前期技术排查文件，已用于结构检查，未选作最终二次元人物。当前文档未完成这两项独立模型的来源许可核验，不应仅因它们来自 Three.js 示例就纳入面向用户的正式资产包。若后续删除排查文件，应同时更新旧检查记录中的路径状态。
- 原游戏发布包中的图集、图片、UI 和规则保留用户指定来源与固定提交，仅用于本项目延续和对照。发布清单中的“Seedream”或历史验收备注不是完整版权证明，原工程恢复时需补齐美术源文件及授权记录。

## 资产恢复清单

| 项目 | 已有 | 待恢复/验证 |
|---|---|---|
| 原演示 | 固定提交发布包、SHA 清单、JSON 图集和分件清单 | 可编辑程序源码、package/lock、构建配置、工具目录。 |
| 原角色 | 输出图集、骨架及动作嵌入 bundle | 原画/分层文件、切片导出脚本、授权及委托记录；无可用原人物3D文件证据。 |
| 代表 VRM | 原始二进制、固定来源、SHA、内嵌许可、官方外观图 | 可编辑 .blend/.vroid 未取得；当前应以 VRM 为不可变输入，转换步骤写入源码。 |
| 原装裤装 | 模型内现成网格、材质、权重 | 实际走/坐/舞连续视觉验收。 |
| 第二套裙装 | `prototype/src/cloth.js` 近似重力布料，腰部固定、腿/椅碰撞，保留短裤内衬 | 连续完整动作、遮挡及穿插验收；自碰撞和通用体型适配未实现。 |
| 动作 | 原包 rigid 帧可作对照；新样机动作正在实现 | 最终采用动作来源、重定向/生成脚本、步态脚锁定及循环验收。 |

任何新增外部服装或动作都单独登记作者、原链接、固定版本/哈希、使用和再分发条件，再进入可交付包。本次未进行购买。

## 成熟动作资产补充

已实际通过 [Quaternius 官方 itch 页面](https://quaternius.itch.io/universal-animation-library) 的免费 Standard 下载流程取得动作包，未登录、未付款，未取得收费 Pro/Source 内容。[官方介绍](https://quaternius.com/packs/universalanimationlibrary.html)及 ZIP 内 License.txt 均说明 **CC0 1.0**；作者 Quaternius，官方另感谢参与动画制作的 Gonzalo Furnier。

- 原始 Standard ZIP：15,904,933 字节，SHA-256 `cc73fc4e495b82958207316596317a3f40b9fa38065bde1027937452da537724`；仅分析暂存，不必加入源仓。
- 最小采用候选：ZIP 中 `Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb`（无根位移版），7,618,436 字节，SHA-256 `69591853d817488edaa8fd9bf8fc1d821eaeaf789f8627b3cd23b41c4ed67997`。目前保存于 `analysis/assets/UAL1_Standard.glb`；运行采用时由实现岗位选择最终路径。
- 实际读取 **43 个 clip**，包括 `Walk_Loop`、`Walk_Formal_Loop`、`Idle_Loop`、`Dance_Loop`、`Sitting_Enter`、`Sitting_Exit`、`Sitting_Idle_Loop`、`Sitting_Talking_Loop`。官方宣传全库120+不等于免费 Standard 有120+；免费包并未包括宣传中全部方向变体。
- `python scripts/fetch-animations.py` 可恢复固定内容；`--output prototype/public/assets/ual.glb` 可指定运行资源位置。脚本只请求免费文件，核对 ZIP 和 GLB 哈希，上游变更时拒绝静默替换。临时下载凭据不写入持久记录。
- CC0 允许在源码备份中保留可用源资产；这只解决使用来源，仍需实际完成骨架重定向、坐标单位、根位移归属、步距同步和连续视觉验收。无根位移版适合路径逻辑作为唯一平移负责人。

QA 正在并行检查已有 Soldier/Mixamo Walk/Idle 的重定向。Adobe [官方 FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html)允许在游戏内免版税使用；[官方工作人员的分发说明](https://community.adobe.com/questions-696/mixamo-faq-licensing-royalties-ownership-eula-and-tos-589400)区分游戏使用和原始动画文件再分发。因此不能仅凭 Three.js 的代码 MIT 就给 Soldier 原始模型/动作贴 MIT，也不要未经核查将其原始文件放入公开源资产仓。Quaternius CC0 更适合本项目要求的可重复、可备份生产流程。
