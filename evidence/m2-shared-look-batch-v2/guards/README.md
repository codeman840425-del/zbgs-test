# 精确套装选择的失败与恢复

固定构建 `7809b98bd700`，Chrome 157。输入为上一轮保存的两份裤袜记录，文件 SHA256 为 `42d69ebf8e3451abd218f938cdde5670fd4cd94caed907b4c21eca6bc9f3ad4f`。两份旧记录先同时进入活动场景，再分别执行 D02 编辑和校验。

- 错袜 SHA、错身体 SHA、用另一身体的袜替换以及缺袜均在编辑第 0 项被拒绝。篡改完整旧记录后，D02 校验报配方 SHA 不一致。
- 拦截原女性实际袜 GLB 请求并返回 HTTP 503 后，D02 拒绝本次编辑。所有故障期间，场景子节点、两具活动对象、可见装备、绑定记录版本、配方与资源身份保持一致，磁盘输入文件的 SHA 保持一致。
- 解除拦截后，两份合法请求先换回默认裤装，再用顺序反转的完整装备集合恢复裤袜。D02 校验通过，记录从 rev1 递进到 rev3，身份和配方 SHA 一致。保存这两份新记录后，关闭页面并重新打开，两个新实例按各自记录恢复。

浏览器报告登记 8 个场景检查，预期的 503 是唯一失败响应，页面错误为 0。此次验证覆盖资源身份、失败保留和关闭恢复。[浏览器报告](report.json) · [重试产出的记录](retry-records.json)

从项目根目录执行，输出目录使用新路径。

```powershell
node scripts/run-fixed-check.cjs experiments/m2-shared-look-d02-v1/dist scripts/qa-production-outfit-selection-guards.cjs output/shared-look-guards-replay evidence/m2-cross-body-production-seam-v1/browser/records.json 7809b98bd700
```
