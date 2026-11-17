# Character record concurrency review

状态：通过有界文件存储回归。

本次只改角色记录模块和测试入口。资源验证仍由调用方显式提供，未接入 runtime 或 UI。

## 修复

- 记录 ID 现在拒绝 Windows ADS 分隔符 `:`、路径字符、保留设备名（例如 `con` 和 `con.json`）以及尾随点/空格。存储路径和记录对象共用同一个 ID 判定函数，目录列表也过滤不安全历史文件。
- 创建和更新在目标 JSON 旁使用独占 `.lock` 文件。锁内完成读、验证、CAS 判断、临时文件写入和 rename，因此两个进程不能同时用旧快照覆盖更新。
- 临时文件通过 `wx` 创建并 `sync()` 后 rename。操作结束在 `finally` 清理锁和临时文件。锁带主机、进程和时间标记，持有期间每 15 秒刷新 mtime，超过 120 秒的遗留锁通过原子 rename 隔离后回收。等待 30 秒仍未获得锁返回 `store-busy`。

## 回归结果

运行 `node scripts/test-character-record.mjs` 通过。

- 两个真实子进程同时创建同一 ID，两个调用均成功，结果分别为 `changed: true` 和 `changed: false`，最终只有一个 JSON 文件。
- 两个真实子进程同时以 `expectedRevision: 1` 更新同一记录，一个提交 revision 2，另一个收到 `revision-conflict`，最终文件保持 revision 2。
- `record:ads`、`con`、`con.json`、尾随点和尾随空格 ID 被拒绝。目录列表忽略 `unsafe:ads.json`。
- 失败更新不会留下 `.lock`，旧记录仍可读取。超过租约的遗留锁可被回收。
- 原有回归继续通过，包含重复创建保持 mtime、不同内容重复创建拒绝、校验回调必填、损坏 JSON、CAS 冲突和 pending 资源校验。

完整机器可读结果见 [report.json](report.json)。
