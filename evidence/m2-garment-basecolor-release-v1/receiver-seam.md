# 普通上衣近距与远距资源的游戏接缝

本轮只读核对加载器、角色工厂及正式资源清单。现有独立 1K 上衣是 CPU 候选，尚未接入角色 profile 或游戏记录。[源端派生报告](report.json)

## 两份现成上衣及其派生物

| 身体 | 近距基准资源 | 独立远距候选 |
|---|---|---|
| `source-male-ab9a-release-v1`，`cf1118a2…` | `source-outfit-release-uniform-top-v1`，`/assets/raw-male-equipment-v1/raw-male-ab9a-uniform-top-v1.glb`，SHA `10a51cbd…`，2,762,796 B，10 条绑定 | `assets-source/garment-basecolor-release-v1/raw-male-uniform-top-1k-v1.glb`，SHA `eef03164…`，743,232 B。其派生报告指向发布前的 `ab9af434…` 源男体，仍须对实际 `cf1118a2…` 登记新适配。 |
| `female`，`027bed60…` | `m1-uniform-top`，`/assets/m1/m1-uniform-top.glb`，SHA `27bcfe02…`，2,696,548 B，16 条绑定。原 M1 制作脚本从 `base-female-roundtrip.vrm` 取上衣和领结两个原始 primitive。 | `assets-source/garment-basecolor-release-v1/m1-female-uniform-top-1k-v1.glb`，SHA `030a5814…`，765,288 B。身体身份相同，装备 ID、SHA 和覆盖绑定仍需独立登记。 |

男体入口在 `prototype/src/source-outfit-profiles.json:23`，女体入口在 `prototype/src/foundation-profiles.js:10`。女性源提取见 `scripts/m1-assets/build.py:105`。现有远距报告只改不透明主色图，保留另一张图片及各项几何和蒙皮流。两件单独上衣的 RGBA8 全 mip 静态估算均由 22,719,144 B 降为 5,941,928 B。这个结果只适用于上衣资源，未给整身、碰撞或实机画面作结论。

## 最小共用接线

1. 每体一份 `zbgs-equipment-v1` 增量目录，用 profile 的 `additionalEquipmentManifests[{url,sha256}]` 固定目录字节。同一增量目录的全部条目都须绑定该角色的身体 SHA，装备 URL 使用真实 `/assets/...`。给远距上衣独立 `id`、`fitId`、`url`、`sha256`、`bytes`、`compatibleAvatarSha256`、`bindings`、`requiresRawSkeleton` 和 `preserveOriginalBody`。源归属保持文件 `extras` 的真实含义。用 `flow.py::Validator.equipment()` 对照实际身体和导出 GLB 的骨与逆绑定，再核对 rest、权重、原有拓扑和 UV。男体可复用已有的 `cf1118a2…` 对原制服静止蒙皮证据作输入，本次新字节仍需独立回读。运行时 `createEquipment()` 核增量目录与身体，`loadOne()` 核实际骨、IBM、文件长度和摘要。位置见 `prototype/src/equipment.js:24`、`:40`、`:149`。
2. 保留默认 `ids.top` 和 outfit 0，新增具名角色 `topFar` 和一个稳定、未占用的 `extraOutfits` 选择，`bottomRole:'pants'`，`equipmentRoles:['topFar','shoes','pants']`。近距如需另出独立 GLB，也用自己的 ID 和选择索引。实际读取的占用索引为女性 0／1／3／4、男派生体 0。已有相同策略是 `native-female-843ac-v1` 的 `alternateTop` 袖长样件，见 `prototype/src/foundation-profiles.js:173`。`outfitSelection()` 解析所选角色，`resolveEquipmentSet()` 限制每套只能有一件 top，`createM1Equipment().prepareOutfit()` 延迟加载、核版本后事务切换，`getAssetProfile().top` 读取当时实际所选 top。位置见 `prototype/src/outfit-selection.js:3`、`prototype/src/equipment-set.js:28`、`prototype/src/m1-equipment.js:166`、`:264`。
3. 女性旧 `/assets/body-coverage-risk-v1/female-top.json` 绑定 `027bed60…`、`m1-uniform-top` 和 `27bcfe02…`，也校验实际身体 index stream。为 `topFar` 生成独立 ID/SHA 的覆盖描述，并在 `additionalBodyCoverage[{role:'topFar',descriptor:{url,sha256}}]` 登记。可以用旧面列表作为候选输入，前提是重新核定相同几何、UV、透明范围、使用面及贴身效果。若只有旧条目，切远距时旧遮罩会停止生效。库存收集器同样核对描述与装备条目。男派生体当前无此覆盖依赖。位置见 `prototype/public/assets/body-coverage-risk-v1/female-top.json:6`、`prototype/src/body-coverage.js:79`、`prototype/src/m1-equipment.js:198`、`scripts/runtime-package/record-resources.mjs:141`。
4. 生产保存继续用 `queryCharacterProduction()` 暴露的套装与精确 `outfit.selection`，传 `{bodySha256,role,equipment:[{id,slot,sha256},…]}`。角色记录保存索引、角色、原主清单 URL 和完整的所选装备条目。恢复会比对当前目录全字段，再通过 `prepareOutfit(record.equipment.index)` 提交。保留现有主目录和索引 0 可让旧记录继续使用旧上衣。位置见 `prototype/src/character-production-query.js:107`、`prototype/src/character-production.js:19`、`prototype/src/appearance-recipe.js:51`、`:119`、`:179`、`prototype/src/character-runtime-record.js:63`。

## 只交付所选版的启动条件

添加套装只解决选择、保存和恢复。当前 `createM1Equipment()` 在初始化时固定加载 `outfitSelection(config,0)`，`loadFoundationAvatar()` 和默认记录控制器的初始 outfit 同样为 0。`prepareRecordedCharacter()` 在场景外加载这套资源，然后才恢复记录里的所选版。`collectRecordResources()` 也显式收集 `equipment(0)` 再收集记录中的所选套装。因此远距记录仍会读入近距 GLB，两者都进入现行独立包。位置见 `prototype/src/m1-equipment.js:36`、`:64`、`prototype/src/foundation-avatar.js:161`、`prototype/src/character-record-consumer.js:11`、`:58`、`scripts/runtime-package/record-resources.mjs:477`、`:492`。

若要让远距生产包只带远距 GLB，最小附加改动是在 `outfit-selection.js` 提供同一启动套装解析规则，由**经配置允许的所选记录**决定初始索引。记录入口先验证记录信封和已登记身体，再将所选索引传入 `loadFoundationAvatar()` 和 `createM1Equipment()`，以配置目录解析实际 URL 和 SHA。同步初始化装备层、actor 层及记录控制器的 outfit 和下装角色，继续调用现有完整恢复校验。覆盖初始化用 `adapter.describe(IDS.top)` 读取旧 top 元数据，避免远距启动时引用尚未加载的旧 `item('top').entry`。将同一解析规则用于 `collectRecordResources()` 的 startup 集合，选中的同一 GLB 只入库一次；覆盖描述可继续按现有契约预读。在未配置该行为的记录和普通工作台使用中保留默认 0。此补充属于装备启动与打包合同，人物动作控制器无需改动。

远距单包只选远距记录，分别导出旧近距和新远距包以验证传输差异。同一独立包含近距旧记录和远距新记录时，两份 GLB 都是实际依赖。若同一场景明确比较两套或需要现场切换两套，也须保留两份资源。

## 可复现的最小验证

1. 先运行 `python -B -m unittest discover -s scripts/production -p test_garment_basecolor_release.py`，复算远距 GLB 与源端报告。对每个目标用生产侧绑定检查实读新 GLB 和保持的身体。覆盖候选核实女体的完整及遮罩索引和可见衣边。近距、远距测试先共用规定的裤、鞋，封存裙装不参与。
2. 从固定候选打开工作台并走正常换装入口。确认远距前只加载默认套装，切到远距生成正确几何和覆盖状态，来回切换能回到原选择。以单独测试构建下真实缺失或损坏的资产验证换装失败留旧，精确拒绝错体、错 SHA、错覆盖及未登记选择。测试由静态目录提供文件，成功链使用实际清单与真实 URL。
3. 用 `scripts/character-production-cli.cjs` 通过精确 outfit 选项生成各体的近、远签名记录。运行 `review-game-runtime.mjs` 比对固定及独立复建，再用 `game-record-cli.mjs inventory/export` 核真实文件闭包。远距单包清单与物理目录均应只有远距 GLB。另以保留的近距旧签回归它仍能从近距版本恢复。
4. 使用 `node scripts/run-fixed-check.cjs` 配合 `scripts/qa-production-package.cjs` 从实际导出的干净目录进入游戏，关闭重开比较准确的 `recordSha256`、选装、资源路径和重新创建的演员。该浏览器脚本默认读两份记录，可用两体远距签在同一远距专包内验证。用固定机位单独记录近远画面。记录包内实际资源请求和字节数，整套预算重跑 `record_budget.py`。
