# Character record validation receipt

修复了两个结构性校验缺陷。

- `validateCharacterRecord` 现在直接调用 512 KiB `checkLimits`。调用者即使先构造并重新计算完整 recipe/record SHA，也不能通过超大对象绕过大小限制。
- `resourceIdentities` 现在要求每项只含非空 `id` 和 SHA-256，拒绝空 ID、重复 ID、额外字段和错误 SHA。它仍只验证 envelope 结构，未声称资源已加载或已通过游戏 fit。

`node scripts/test-character-record.mjs`、`node prototype/src/character-record.test.mjs` 和 store/worker 语法检查通过。机器结果见 [receipt.json](receipt.json)。

资源绑定、live prop 最终装备和共用游戏关闭恢复仍由 root 的集成接线处理，测试中的 `pending` callback 只表示结构与哈希检查完成。
