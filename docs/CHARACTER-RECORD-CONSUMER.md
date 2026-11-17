# 从最终角色记录进入游戏

`prototype/src/character-record-consumer.js` 提供 `prepareRecordedCharacter(record, options)`。输入是完整 character-record-v1，沿既有信封、精确身体版本、装备/造型/道具适配合同验证；不能仅替换身体 SHA 或省略原记录装备信息。

options 提供游戏 Three.js scene、renderer、position，以及可选 signal/isCurrent。默认适配器不读取工作台 DOM 或本地草稿。先在场景外完成基础人体、动作及完整造型恢复，成功后返回实例；调用 attach 才进入场景。失败释放本次候选。调用方负责逻辑位置、行为任务和唯一时钟。

update(dt, state, colliders) 的 dt 单位是秒，依次执行共用动作、VRM/直播层、世界矩阵、服装更新。游戏已有完整控制器时可通过 createController 注入其恢复接口，继续使用现有 simulate，不能同时调用两套更新。当前独立入口仅演示讲话，不新增一套路径或座位控制器。

`character-record-batch.js` 接收固定顺序的记录列表和 consume 回调。逐项返回 queued/running/completed/failed/cancelled、requestId、实际 identity/revision/recordSha。默认并发一项，最多两项。失败重试沿原始输入只处理 failed，不重新生成成功人物；重复 ID 和坏记录逐行失败。

consume 的成功返回应包含 `{applied:true,release}`。release 必须幂等，且只绑定本次创建的实例；它用于 Promise 完成但批次取消的交接窗口。不要让批次 AbortSignal 在成功交接后销毁先前 completed 实例。调用方按场景槽自己的代次检查新旧请求，游戏挂接/替换仍是其责任。

样件输入：`prototype/public/assets/record-consumer-v1/manifest.json` 及四份版本化记录。通过 `node scripts/generate-record-consumer-fixtures.mjs` 从已归档记录重新生成，原资产不重做；产生新身份时 sourceRefs 记录来源哈希。固定输入不是批量随机生成。跨基模的衣物/道具仍需对应适配，不能把新身体加载等同于旧功能自动兼容。

验证入口：4196 的既有“检查 → 原生制作/完整记录”页面链接到 record-consumer.html。页面不影响原工作台，按两人一组验证，技术通过范围以 CAPABILITIES 与具体构建证据为准。普通电脑尚无可用实测设备。
