# 最终UI候选 1a0d06fc8ffe：干净重建通过

- 精确源提交：`0ae64b83384a3ed9853185f6a008ac6b70b1e8cc`。
- 完整重建身份：`1a0d06fc8ffe933a01621a97beea847d314ccbc3d8118d453602b259bc76009d`。
- 全新detached sparse检出：`experiments/accessory-ui-final-fresh-0ae64b8`。完整prototype及根配置，初始无node_modules/dist，安装前/构建后Git clean。
- `npm ci`使用已提交锁文件，exit0、约5.87秒；`npm run build` exit0、约5.47秒。Node v24.13.0 / npm 11.6.2 / 当前Windows 11。
- 对照`experiments/m1-accessory-ui-2/dist`未改动。**完整63文件 / 125,721,827 bytes，路径、大小、SHA-256全部相同。** 缺失0、额外0、变化0；build-info完整一致。
- 不修改/伪造Git元信息或build ID；未改运行源码，未启动浏览器、未复跑布局/全动作/录屏。旧902审查及重建报告保持原身份。

报告范围仅当前环境从提交源码+导出资产+锁文件恢复固定发布产物。布局实际检查/rapid traverse结果使用负责人对应新固定版证据；本报告不把旧902失败或13f动作影片重标为新版本通过，也不声明普通电脑性能或观感验收。

完整输入与产物双清单、命令/耗时在report.json，原stdout/stderr及脚本同字节副本已保留。npm/Vite已有大bundle提示不是构建失败。

复跑（新输出/工作树路径不得存在）：

```powershell
python scripts/qa-fixed-rebuild.py --commit 0ae64b83384a3ed9853185f6a008ac6b70b1e8cc --baseline experiments/m1-accessory-ui-2/dist --worktree experiments/accessory-ui-final-recheck --output evidence/accessory-ui-final-recheck
```

完成UTC：`2026-11-15T03:38:20Z`。建议随下一次归档提交本证据目录（`.gitignore`保留.log），不复制node_modules或再存一份125MB构建产物。
