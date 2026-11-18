# 七人固定接收与十三人服装缺口复核

融合侧私有候选为 `89bb64fabca474f216449d2cd9022a9815a466093b392ef91c7db5edbf114a2a`。实算 `source.bundle` SHA-256 为 `6936fe66a8b7d5000fe05db4590a9f4a749f1d22745e8935561db56354087c9a`，`git bundle list-heads` 只列 `ef07d4e6146f5de81bbf768f297a4cf09596a4f2 HEAD`，`git bundle verify` 通过。用现有检出 684 项输入复算得到同一构建摘要，已核另附的 Vite 实际导入文件。候选评审 SHA-256 `40aa08450ff6b144d647b666f3f8b1c9b68f6295e6412365b199e3dd1f0983b3`，11 项长度和哈希在两个已有 dist 均吻合。本仓正式评审索引未登记该候选。此次只读核验，未运行快照中的代码或重新构建。[源快照摘要](/F:/gamemake-test/native-studio-round/registration/seven-fixed-89bb64fabca4/source-summary.json) · [候选评审](/F:/gamemake-test/native-studio-round/registration/seven-fixed-89bb64fabca4/proposed-review.json) · [正式索引](../../scripts/runtime-package/game-runtime-reviews.json)

## 七人消费证据

逐项核了 `01 Yun Lan`、`02 Bo Chen`、`03 Mei Lin`、`08 Min Tao`、`11 Su He`、`16 Ren Yu`、`20 Hao Qi` 七份原记录和 14 次单人冷开。报告记录每人两独立 Chrome 进程。每次 `selectGroup` 均返回一条 `completed`，恢复同一 revision 1 及记录哈希，回读的外观、装备、来源和资源身份与原件一致。14 组场景根、VRM、头骨实例分别唯一，页面和清理无报错，每次均有实际 idle 骨骼变化。Su He 两次分别推进 121、122 帧，其他六人均为 121、121 帧。每次实访七项角色资源返回 HTTP 200，报告摘要均核对固定 dist 的实际文件。七份 gate 各九项 `verified`，各收本角色一项、适配任务零项，外层均为 `ready`，计划为 `runtime-admitted`。本证据覆盖开发机逐人恢复，七人同屏、普通机、全动作及人眼验收尚无本批证据。[逐人回执索引](/F:/gamemake-test/native-studio-round/registration/evidence/seven-game-outcome.json)

七条原件造型 role 均为 `shorts`，每条实际装备是 top→`top`、shorts→`bottom`、shoes→`shoes`。21 个装备来源字段均为 `internal-study-only`，记录原 VRM 条款 `onlyAuthor`、`personalNonProfit`、`creditNotation=required`、`allowRedistribution=false`、`modification=prohibited`。使用边界限于已有私有试验范围。此次回执未提供对外分发许可，也未改该范围或正式准入。

## 十三人已证边界

13 人均不满足目前原生打包器按 Body 材质名分别唯一择取 Tops、Bottoms、Shoes 的规则。共同运行时已有精确身份的 `onePiece`、`outerwear`、`bottoms-overlay`、`socks` 及一次占用一个对应槽的合成规则。已有 M1 原上衣与领结图元合为同一 top 的实例。当前缺口集中于从原生源按作者组映射实际图元、证明遮罩归属和给各体建立确切适配。 [逐人图元实测](/F:/gamemake-test/native-studio-round/registration/evidence/thirteen-source-layouts.json) · [十三人诊断](/F:/gamemake-test/native-studio-round/registration/THIRTEEN-LAYOUTS.md) · [原生择取规则](../../scripts/production/native_body_package.py) · [共同装备规则](../../prototype/src/equipment-set.js) · [M1 分件实例](../../assets-source/m1/README.md)

| 实测构造 | 角色编号和接入缺口 |
| --- | --- |
| 多 Tops、Shoes 或 Bottoms 图元 | 12 人多 Tops（除 14），04、06 双 Shoes，18 三 Bottoms。材质名及 UV/蒙皮能定位图元。若同一件衣物分多个材质，需由原生作者组或去衣回读证实后合为一个装备。若为实际多层，则需匹配各角色的槽、遮罩、层间适配及恢复。 |
| 明确 Onepiece 名称 | 06、12、17、18、19。12、17、19 无 Bottoms，06、18 另有具名 Tops/Bottoms。共同 `onePiece` 槽已具备，且会占用 top/bottom。05、09 的额外 Accessory 名为领结，可核对是否随上衣成组。材质计数无法证明 Onepiece 与其他部件的真实叠穿归属，或领结可独立换装。 |
| 缺 Bottoms 且没有明确 Onepiece 名称 | 04、07、14、15。14 的计数为 1/0/1。现有证据无法判断下身覆盖应来自现有服装、原生变体还是需另制作合格部件。不能凭遮罩像素数指定替代归属。 |

13 人的原 Body 材质及 UV 消费者检查均能定位，旧模板对照均报 `Body material or UV consumer differs`，13 人均无本人的单上衣去除回执。尚无任一人的同体完整皮肤供体和逐件覆盖归属实证。这里不能据此判定取不到供体，也不能用七人的同体通过记录证明其余十三人可复用供体。
