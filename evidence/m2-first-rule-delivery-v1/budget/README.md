# 两条签名记录的预算与模型来源

固定源码 `cb3aca0d`、构建 `9ce414f65f55`，两条 revision 1 原签记录均通过 `m2-technical-v1` 静态检查。两个身体分别与同一款 1K 上衣、长裤和平底鞋组成实际选中造型。每套四件模型各自满足单件阈值，两套分别单独计算、同时计算也都在当前暂定合计阈值内。[签名记录](../game/signed.json) · [全部指标和输入摘要](record-budget.json)

| 场景 | 记录 SHA256 前 12 位 | 依赖数 / 合计字节 | 造型三角形 | 纹理对象 | RGBA8 完整 mip 链估计 |
| --- | --- | ---: | ---: | ---: | ---: |
| 下颌权重 0.625 | 2e71d28e8d8f | 12 / 27,765,651 | 15,176 | 25 | 105,557,676 B |
| 下颌权重 0.375 | e16153214a8b | 12 / 27,765,651 | 15,176 | 25 | 105,557,676 B |
| 两条记录同时出现 | 上述两条 | 14 / 39,927,272 | 30,352 | 50 | 211,115,352 B |

合计参考为 67,108,864 B 依赖、96 个纹理对象及 268,435,456 B RGBA8+mip。双人按路径去重传输，每人的纹理成本各自累加。渲染器自身分配、骨骼和形态数据纹理、设备帧时与物理显存仍待实机测量，普通电脑未测。正式整套准入由受审索引单独判定。[预算说明](../../../scripts/production/ASSET-BUDGET.md)

| 角色资产 | 可核对的实物来源 |
| --- | --- |
| 两份新身体 | 从 `ab9af434…` 发布者原件拆去内置衣物，得到 `cf1118a2…`。重算 1K 身体贴图得到 `2e66ee6c…`，再按项目的 Blender 下颌形态和各自配方重建出 `0beabf44…`、`c6ce7efc…`。两者均与固定检出逐字节相同。 |
| 1K 制服上衣和领带 | 从该原件的两个图元重建 `10a51cbd…`，据 RGB 线性空间平均配方把上衣主图从 2048² 降至 1024²，逐字节复现两份清单共同选中的 `eef03164…`。 |
| 制服长裤 | 从同一原件重新提取蒙皮长裤及原图，逐字节复现两份清单共同选中的 `849d1b87…`。 |
| 平底鞋 | 从同一原件重新提取蒙皮鞋及原图，逐字节复现两份清单共同选中的 `9c69190f…`。 |

hecko 的发布页将旧版基础模型归属 VRoid Project，并说明来自 Studio β 0.14.0。pixiv 的旧模型说明明确采用 CC0。原件和两份派生 VRM 的元数据均声明 CC0、Everyone、允许商业使用。三件装备的来源字段与同一原件回执完全一致。下颌调整、贴图缩减和装备拆分属于本项目的制作步骤。原件是第三方导出，缺少官方 β 导出件的字节对证。本次来源核查覆盖精确的身体与装备；完整游戏包中的动作和软件有各自的来源条件。[逐件重建回执与来源文件摘要](source-rights.json) · [发布者记录](https://opengameart.org/content/vroid-studio-cc0-models) · [pixiv 旧模型许可](https://vroid.pixiv.help/hc/en-us/articles/900000088126-New-model) · [CC0 说明](https://creativecommons.org/publicdomain/zero/1.0/)

从制作工程重跑相同的单人和双人检查。

```powershell
$actorA = 'rule-male-0beabf44f27c0618b0ff'
$actorB = 'rule-male-c6ce7efc3da17fe50ea1'
python -B scripts/production/record_budget.py measure evidence/m2-first-rule-delivery-v1/game/signed.json --source-root experiments/worktrees/rule-male-a-cb3aca0d --budget-version m2-technical-v1 --concurrent-group $actorA --concurrent-group $actorB --concurrent-group $actorA $actorB
```
