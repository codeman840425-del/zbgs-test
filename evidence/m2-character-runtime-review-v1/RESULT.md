# Character runtime record independent review

范围：只读审查 root 新增的 `live-accessory-record.js`、`character-runtime-record.js`、`character-record.js` 的 `liveAccessories` 字段，以及 `appearance-recipe.js` 的 live prop prepare/commit 接线。没有改源码、浏览器或 GPU。

## 已确认

- live prop 身份使用当前 body SHA、accessory GLB SHA 和 body-specific fit SHA。mic 还记录 grip id/fitVersion，glasses 记录 temple fit id/sha。`deriveCharacterResourceIdentities` 会从 recipe/live 对象收集纯 SHA 字段，保存前与 envelope 的 `resourceIdentities` 做完整数组比较。
- `restoreRuntimeCharacterRecord` 在应用前重新做 appearance candidate admission、recipe 校验、live prop 校验和 envelope hash 校验，并检查 actor/外观快照是否改变。`applyAppearanceRecipe` 将两个 live prop 放进所有准备任务之后，提交前做 freshness/identity 检查。
- source 语法检查通过。用实际 manifest/profile 构造 mock actor 运行 `validateLiveAccessories`，合法 mic/glasses identity 可通过。

## 可复现字段校验缺陷

`validateLiveAccessories` 对 enabled identity 只比较部分 SHA，未对 identity/fit 做精确字段校验。下面这些篡改在独立预检中都仍返回 `true`。

- `mic.identity.fit.id = 'fake'`
- `mic.identity.fit.fitVersion = 'fake'`
- `glasses.identity.fit.id = 'fake'`
- `glasses.identity.fit` 缺少或篡改 `bodySHA256` / `accessorySHA256`
- `glasses.identity.extra = 'x'`

运行时 `assertAccessoryIdentity` 和 `assertPreparedLiveAccessory` 的部分路径会再次发现其中一些差异，但记录校验本身已经允许不完整身份进入，且不能把额外字段、fit id/version 和 fit body/accessory identity 当作确定合同。应在 `validateLiveAccessories` 里对 identity 和 fit 使用 exact keys，并逐项比对 manifest 中的 id、SHA、fitVersion、body/accessory SHA。

## 部分失败风险

`applyAppearanceRecipe` 在所有 prepare 成功后按 `updates` 顺序调用 `commit()`。live mic 先提交、glasses 后提交时，若 glasses commit 在 `postUpdate()` 或最终身份检查中失败，catch 只抛出“同步提交失败”，没有回滚已经 commit 的 mic 或此前 appearance/equipment updates。每个 live update 能恢复自己的旧 slot，但跨 update 没有统一 rollback。需要 root 后续把 commit 设计成可回滚批次，或在提交前建立全部旧状态并在后续 commit 失败时逆序恢复。

## 其他边界

- `liveAccessories` 在 core record 中是可选字段，但 runtime restore 会无条件调用 `validateLiveAccessories(record.liveAccessories)`。缺少该字段的旧 record 会被拒绝，当前没有“缺省双道具关闭”的迁移路径。
- `captureRuntimeCharacterRecord` 的资源 callback 返回 `passed` 主要表示当前 actor 的结构、哈希和登记身份通过。它没有独立重新下载每个服装/prop 资源，游戏实际准入仍依赖 prepare 阶段的 bytes、fit 和运行链检查。`pending` 只能作为结构性状态，不能冒充资源通过。

仍需 root 处理精确 live identity 字段合同、跨 domain 部分提交回滚和旧 record 的迁移策略。
