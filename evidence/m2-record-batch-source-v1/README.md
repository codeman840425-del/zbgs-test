# D03 角色记录批次接口与 CPU 验证

从 `prototype/src/character-record-batch.js` 导入 `createCharacterRecordBatch(records, { consume, maxConcurrency, batchId })`。输入是有序的完整角色 JSON 记录数组。工厂同步复制所有记录，每次尝试递交独立副本。默认并发 1，可显式指定 2。并发为 2 时依输入顺序启动，完成顺序由加载耗时决定。批次 ID 默认生成 UUID，调用方指定时应使用该次运行独有的值。

| 方法 | 行为 |
| --- | --- |
| `snapshot()` | 同步返回可序列化副本，含 `batchId`、`phase`、按输入顺序排列的 `items` 和 `cleanupErrors`。每项含 `index, identityId, revision, recordSha256, status, attempt, requestId, code, reason`。尚未尝试的请求 ID 为 null。 |
| `run()` | 返回 Promise，待所有已启动的消费与回收结束后取得快照。重复调用复用当前运行或返回已有结果。重复 stable ID 的所有参与项都报告 `duplicate-identity`，其余项继续。其余记录逐项调用已有 `validateCharacterRecord` 核对版本、时序与哈希，资源验证回调明确返回 `pending`。 |
| `retryFailed()` | 等待上一轮 `run()` 结束后调用，返回新快照 Promise。仅重试 failed 项，沿用捕获的完整记录，增加尝试次数并更换请求 ID。调整造型或版本后须显式新建批次。 |
| `cancel(reason?)` | 同步将批次置为 cancelled，将 queued/running 项标记 cancelled，撤销 `isCurrent()` 并触发 `signal.abort` 事件。已完成及已失败项保留原回执。此批次终止后，`retryFailed()` 也只返回原运行或快照。 |

## 房间消费与释放

`consume(record, { index, batchId, requestId, signal, isCurrent })` 应在共享加载器检查资源和装备适配，并负责入场。对一处房间槽替换批次时，先取消旧批次，在槽内递增操作代次。每次异步准备结束、尤其是同步提交之前，核对 `isCurrent()` 和槽代次。支持取消的资源加载可订阅 signal。并行消费应使用彼此隔离的槽。

消费成功返回 `{ applied: true }`，房间接管人物并负责关闭释放。失败可抛出带 `code` 的错误，或返回 `{ applied: false, code, reason }`。槽操作过期可返回 `{ applied: false, cancelled: true, reason }`。仅在原子入场完成后返回成功。

抛错前由消费方处置自己的临时资源。若通过返回值转交回收责任，请附带 `release()` 闭包，只释放该次请求所持有的候选。批次在未应用或迟到的结果上调用并等待它一次。释放错误用原请求 ID 记入 `cleanupErrors`。已提交到房间的可见对象由房间决定何时卸载。批次报告与错误存放在调用方，角色最终记录只承载角色数据。

## 验证

在仓库根目录运行 `node --test prototype/src/character-record-batch.test.mjs prototype/src/character-record.test.mjs`。Node 24.13.0 的 5 项批次用例及 1 项原有记录检查通过。样本来自既有固定候选的原生女、原生男与另一男性短裤记录，另以现有 `createCharacterRecord` 为女性同体副本生成独立身份。

测试检查了输入顺序、不同装备、身份和哈希绑定、输入及回调副本隔离、坏哈希、版本拒绝、重复 ID、局部失败和原记录重试、取消与迟到回收、双并发上限及回收失败报告。消费回调使用 CPU 替身。真实角色资源、双实例、房间切换与关闭恢复由游戏集成验证。
