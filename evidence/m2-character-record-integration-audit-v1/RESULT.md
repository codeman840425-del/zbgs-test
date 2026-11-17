# Character record integration audit

状态：现有配方恢复事务可复用，角色记录仍缺少游戏层导入/关闭恢复的接线；本次未改模块。

## 可复用接口

- `__debug.exportAppearanceRecipe()` 和 `importAppearanceRecipe(text)` 直接调用 `captureAppearanceRecipe`、`applyAppearanceRecipe`。导出的配方包含身体 SHA、发型资源与 fit、颜色、面部几何和当前服装 `equipment.resources`。`validateAppearanceRecipe` 会核身体、palette、发型、面部配方、manifest、服装 fit 与资源身份。
- `applyAppearanceRecipe` 已有完整准备/提交事务。它先快照各 domain revision，准备面部、外观、服装和耳饰/帽子，提交前再次检查 freshness 和依赖，准备阶段失败时保留旧外观。`readAppearanceRecipeFile` 在异步读文件期间检测 actor、外观、几何、服装和耳饰/帽子 revision 变化后取消恢复。
- `admitAppearanceCandidate(record)` 可作为资源预检入口，返回 `accepted`、问题字段和 preparation checks。它仍需随后走 `importAppearanceRecipe`，不能代替真实提交。
- QA 脚本 `scripts/qa-avatar-record.cjs` 已证明“捕获资源身份 → 关闭 → 重新打开 → 重新应用 → 比较状态”的浏览器路径。它使用的是 QA 专用 `avatar-record-contract.mjs`，只应复用捕获/应用顺序和断言思路，不能把 QA contract 当生产角色记录格式。

## 当前记录缺口

`captureAppearanceRecipe` 只调用 `captureAccessories(a)` 保存耳饰和帽子。`a.livePresentation.getState().accessories` 中的 `mic` 与 `glasses` 没有进入配方或 `equipment.resources`。因此现有 `character-record` envelope 即使完整保存 `appearanceRecipe`，也会遗漏麦克风/眼镜的 requested 状态、实际 accessory SHA、body-specific fit/profile 身份和最终装备组合。

`__debug` 只暴露原始配方文本导入/导出，没有 character-record 的 identity、revision、record hash、关闭重开存储入口。`resourceIdentities` 是 envelope 中可选的独立数组，当前校验只检查 `id` 和 SHA 格式，未证明它们覆盖或对应配方里的每一项资源。

## 最小接入方案

1. 保留现有 `captureAppearanceRecipe` 作为 recipe 生产者。由记录适配层在同一已加载 actor 上读取 `livePresentation.getState().accessories`，把 mic/glasses 的 `requested/status/loaded/sha256` 映射为显式 accessory records，并绑定当前 body SHA 与已登记 fit/profile SHA。未加载或 `status !== 'on'` 的 prop 不得写成最终装备。
2. `createCharacterRecord` / `updateCharacterRecord` 的 `validateResources` 回调调用 `admitAppearanceCandidate` 做静态预检，再核对 prop accessory manifest、GLB SHA 和 body-specific fit/profile。通过后将完整 recipe 与 resource identity 列表写入现有 store。
3. 关闭恢复先用 `validateCharacterRecord` 校验 envelope/hash，再检查当前 body 与所有资源身份，随后调用 `importAppearanceRecipe(controller, JSON.stringify(record.appearanceRecipe))`。最后按记录中的 mic/glasses 显式调用 `livePresentation.setAccessory`，每次检查 `applied` 和最终 `getState().accessories` SHA。
4. 以 4196 固定构建做最小真实测试。female、male 各跑一次“装备服装+耳/帽+mic+glasses → export → create/store → 关闭页面 → 重开同 body → validate/import → 恢复 prop → 对比 recipe、outfit resources、prop SHA、revision”，再对 body SHA、clothes fit SHA、mic/glasses SHA 和中途资源失败做拒绝并确认旧外观仍在。测试只沿现有 debug/事务入口，不新建平台或编辑器。

## stale lock 反例

当前 store 的锁在 [scripts/character-record-store.mjs](../../scripts/character-record-store.mjs) 第 55 行按 120 秒 mtime 回收。精确反例是进程 A 获锁并读到 revision 1，随后进程挂起超过 120 秒。进程 B 回收锁，读 revision 1、提交自己的 revision 2 并释放。A 恢复后不会检查自己 token 已被替换，仍会执行 `atomicWrite(..., {allowExisting:true})` 的无条件 rename，把 B 的 revision 2 覆盖掉。A 的 release 因 token 不同不会删除新锁，但 CAS 已经丢失。

在未改并发模块前，建议二选一。关闭 stale takeover，只在确认持锁进程已退出后人工恢复。或实现带 fencing 的写入，在临时文件 rename 前强制确认锁 token/代数仍属于当前操作，并对更新的旧文件 revision/hash 做最终 CAS，token 失效时删除临时文件并返回 conflict。仅增加第二次 token 读取仍有 rename 竞态，不能单独作为完整修复。

本审计是源码与已有 QA contract 的只读核查，没有启动浏览器或修改 runtime。
