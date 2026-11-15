# 13f558e44696 全新检出重建核验

结果：**通过，同一完整产物逐字节一致**。未运行浏览器或重做动作验收。

- 源提交：`6fcfc24a0382be002cfb90a281e60b7acddceb8a`。
- 新隔离目录：`experiments/acc01-fresh-6fcfc24`，detached HEAD；只稀疏检出完整 `prototype/` 与根配置，避免重复历史录像。不是复用旧 node_modules/dist。
- 固定对照：`experiments/m1-acc01-integrated-1/dist`，未修改。
- 新产物：`experiments/acc01-fresh-6fcfc24/prototype/dist`。
- Node v24.13.0，npm 11.6.2，Windows 11；Python 3.13.11 驱动。
- `npm ci` 原锁安装33包，exit 0，约4.60秒；`npm run build` exit 0，约4.50秒。npm本次审计报告0漏洞，仅代表当次结果。
- 安装前没有 node_modules/dist，构建前后 `git status --porcelain` 为空。
- 同一完整 build-info：`13f558e44696a7f96be48138c6e6bc4d6ebb790da79700becb2deb5f0761b5cd`。
- **63 文件，125,721,179 bytes：路径、文件大小、SHA-256全部一致。缺失0、额外0、变化0。** 包括HTML、打包JS/CSS、全部发布资源、build-info。
- 原有Vite大于500KB bundle警告保留；不是构建失败，也不借此宣称性能通过。

`build-id.mjs`仅散列prototype源码、scripts、静态assets、入口、Vite配置、package及lock文件，不含Git元信息。没有改写build-info或伪造提交。完整输入清单及每项SHA、完整产物两套清单见 `report.json`；安装/构建stdout/stderr原文均保留。

## 复跑

工作区与输出路径必须全新不存在；脚本拒绝覆盖，无删除清理命令。保留目标提交与固定产物后，在仓库根运行：

```powershell
python scripts/qa-fixed-rebuild.py --commit 6fcfc24a0382be002cfb90a281e60b7acddceb8a --baseline experiments/m1-acc01-integrated-1/dist --worktree experiments/acc01-fresh-recheck --output evidence/acc01-rebuild-recheck
```

脚本源码SHA256：`535788412c1d1202b113a846904e83c833b2b2264f3b50c3185bc4d40a5385cc`，本目录附同字节副本。

## 备份建议与边界

把 `scripts/qa-fixed-rebuild.py` 与本报告目录一起入Git；本目录 `.gitignore` 明确保留原 `.log`。主提交6fcfc24已经由负责人push核实，本次无需提交node_modules、临时worktree或再次存125MB dist；已有固定目录继续保留作回退。原附件源/输入/导出/视频在先前版本化源包和证据中，不靠此重建报告替代。

这是当前开发机/操作系统的**运行源码+已提交导出资产+锁文件**可重建证明，没有再次执行Blender/资产生成器，也不等同跨平台字节一致、普通电脑性能或视觉合格。

结束UTC：2026-11-15T03:25:04Z。浏览器未启动，npm/构建进程已结束。
