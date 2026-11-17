# D02 角色记录文件往返

已有 `character-record-store.mjs` 提供读、校验及带锁的版本条件写入，旧命令行开放 list/validate。新增 `scripts/character-record-transport.mjs` 将完整封装交给既有 `putCharacterRecord`，读和导出调用 `validateStoredCharacterRecord` 并核对文件名与身份。导出使用既有 `writeFresh` 的临时文件和同目录硬链接，目标文件系统须支持硬链接。

```powershell
node scripts/character-record-transport.mjs import --root F:/records --input ./prototype/public/assets/record-consumer-v1/native-female.json
node scripts/character-record-transport.mjs read --root F:/records --id d03-female-a
node scripts/character-record-transport.mjs export --root F:/records --id d03-female-a --out F:/exports/d03-female-a.json
node scripts/character-record-transport.mjs import --root F:/records --input F:/exports/d03-female-a-revision-2.json --expected-revision 1
```

首次入库接受修订 1。导入相同记录可重复执行；替换需提供当前修订，输入为紧邻后继，并保留身份和创建时间。导出保留全部记录字段与 SHA，写为紧凑 UTF-8 JSON，目标须为新文件。记录库直属路径使用 import 写入。第四行的输入由运行时完成更新后提供。

成功退出 0，stdout 返回单个 JSON，含 `ok, command, id, revision, recordSha256, resourceValidation`。文件传输阶段的资源适配状态是 `pending`。`read` 增加完整 `record`，`import` 增加 `file, changed`，`export` 增加 `file`。失败退出 1，stderr 返回 `ok:false, code, message` 和可用的 `field`。

## CPU 核验

Node 24.13.0 执行 `node --test scripts/test-character-record-transport.mjs`，三组 CLI 子进程测试通过。

- D03 manifest 的四份现有记录导入、读取、导出后由 `parseRuntimeCharacterRecord` 回读，每个字段及签封 SHA 匹配。包括同一原生女体的两个独立 ID、原生男及不同装备的旧男体。首轮测试错误假定两份同体女记录的道具选择不同；核对原始记录后将差异断言改为女体与旧男实际麦克风状态。
- 相同文件重复导入返回 `changed:false`。签封有效但改名、缺失或错误的期望修订均被拒绝。两个并发的修订 2 只有一个写入成功，回读与胜者完整一致；过期修订 1 重放被拒绝。
- 错误 JSON、无效 UTF-8、超 512 KiB、未知版本和破坏哈希均保留空库。导出到缺失目录能创建目标，两个并发导出保留唯一成果，已有文件保持原字节。误放在其他身份文件名下的有效封装无法读取或导出。

此证据覆盖文件和记录封装。实际资源适配、创建与修改闭环沿房间的共享游戏入口验证。
