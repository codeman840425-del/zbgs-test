# Character record put/CAS independent review

本次只读核对 [putCharacterRecord](../../scripts/character-record-store.mjs)、`qa-character-runtime-record.cjs` 和 runtime envelope 路径，没有启动浏览器、GPU 或修改源码。

## CPU 回归

使用真实 `createCharacterRecord` / `updateCharacterRecord` 生成 envelope，并通过 `putCharacterRecord` 写入临时目录。

- 首次 put 成功，随后读取 JSON 与输入 envelope 深度一致。
- 同一 record 重复 put 返回 `changed: false`，不改写内容。
- revision 1 更新为 revision 2 时，提供 `expectedRevision: 1` 后成功写入，回读 revision 为 2。
- 另一个基于旧 revision 1 的不同 revision 2 记录再次 put 时返回 `revision-conflict`，没有覆盖已写入 revision 2。
- `putCharacterRecord`、runtime record 和 QA 脚本均通过 Node 语法检查。

## 源码检查

`putCharacterRecord` 在独占 store lock 内重新读取并校验现有 envelope，再要求现有 revision、输入 revision 和 `expectedRevision` 形成连续 CAS。它还比较 stable identity 与 `createdAt`，禁止更新时改变身份或把 `updatedAt` 往回移动。实际落盘后用 `readCharacterRecord` 回读，内容与输入 JSON 语义一致。

QA 脚本覆盖真实 mic/glasses 加载、关闭重开、资源 503 保旧、错误 fit 身份拒绝，以及注入最终 live commit 异常后的整套回滚。该脚本未在本次审查中启动，因其包含浏览器/GPU录制步骤。它的资源 callback 明确返回 `pending`，生产资源通过仍由浏览器 prepare 阶段验证。

本次未发现 put/CAS 的可复现覆盖缺陷。需要保留的边界是同字节 record 的幂等 put 不要求调用者提供 `expectedRevision`，这是重试语义，不应当被当成一次新的 CAS 更新。旧 record 缺少 `liveAccessories` 仍由 runtime restore 拒绝，属于当前未发布结构边界。
