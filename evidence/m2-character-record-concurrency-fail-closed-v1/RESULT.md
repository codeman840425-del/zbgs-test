# Character record fail-closed lock receipt

本次修正取消 mtime 自动夺锁。生产默认等待 30 秒，测试可传 `lockWaitMs`，范围必须是 1–300000 的安全整数。检测到已有锁只返回 `store-busy`，不删除或改写锁。进程崩溃后的锁需由 agent 在维护窗口确认无活跃持有者后处理。

`node scripts/test-character-record.mjs` 通过，机器结果见 [receipt.json](receipt.json)。覆盖以下回归。

- 两个真实子进程同时创建同一 ID，仍只有一个实际写入，另一个返回相同内容。
- 两个真实子进程以相同旧 revision 更新，只有一个 CAS 胜出，另一个收到 `revision-conflict`。
- 过期 mtime 的锁不会被夺取。100ms 注入等待后返回 `store-busy`，锁仍存在。测试显式移除锁后，维护恢复写入成功。
- 不同 ID 的两个锁不互相阻塞，失败更新会释放锁并保留旧记录。
- `lockWaitMs: 0` 被拒绝。

旧的 `evidence/m2-character-record-concurrency-v1/` stale-passed 结果保留为历史证据，本 receipt 记录 fail-closed 修正后的结果。
