# 具名训练室旧版接收测试

固定底包为 backdrop-fabric-v1，构建 2070c652571c，原清单 81f3f0c8d875e3bcbed3f15a455db6b8b8ff97db9fb7e6246dc501fec32f02ef。工作副本使用与原包锁文件逐字节相同的接收依赖。旧工具用默认公司 backdrop-home 和具名训练室重新制包，新增测试包的清单 16c896a6981fa334e2c5eda54a89d7ba4541c2fcc84fdb3ccba764ab62561256，1871 个声明文件经 verify.mjs 全部通过。所有操作均从本报告所在目录执行。

| 条件 | 旧 edit apply | 旧 edit validate | 包内净空检测器 |
| --- | --- | --- | --- |
| 具名出租屋训练室，盆栽进入活动区 | 成功，写出 layout、save | 通过 | 拒绝，活动区中检出占地与网格 |
| 具名二层训练室，同一局部落点 | 成功，写出 layout、save | 通过 | 同上 |
| 将出租屋训练室作为默认公司 | 拒绝，未生成结果目录 | — | edit 返回同一净空错误 |

两间训练室的初始布局均通过净空检查。操作给训练室直接添加 plant-bonsai@1，局部坐标 [0.25, 0, -1.02] 米，yaw 0。两个输出各触发 7 个占地和网格命中，错误均为 training-clearance-obstructed，定位到 test-bonsai。两份原存档验证后字节未变。早先试放的 [0.45, 0, 0.65] 被通用入口检查以 blocked-entry 拦下，因此采用上表落点隔离训练活动区问题。

```powershell
node named-mixed/edit.mjs apply named-mixed/data/rooms/rental-original/save.json rental-intrusion.ops.json repeat-rental
node named-mixed/edit.mjs validate repeat-rental/save.json
node named-mixed/source/scripts/company-platform/check-training-clearance.mjs repeat-rental/layout.json rental-clearance.json
node named-mixed/edit.mjs apply named-mixed/data/rooms/upper-original/save.json upper-intrusion.ops.json repeat-upper
node named-mixed/edit.mjs validate repeat-upper/save.json
node named-mixed/source/scripts/company-platform/check-training-clearance.mjs repeat-upper/layout.json upper-clearance.json
node training-primary/edit.mjs apply training-primary/data/save.json rental-intrusion.ops.json repeat-default-control
```

## 旧清单的证据边界

- 批次具名房存有经过清单签定的 save、layout、batch-result/{input,layout,report,save}.json。用实际清单 SHA/bytes 校验这些文件后，可从 input 读区域，核对 input.input.id、report.companyId、save.document.id。report.files 同时给出三份原始批次的完整哈希。
- 编辑结果目录作为具名房输入时，旧包钉住 save、layout、training-edit.json，后者包含 companyId、原始 saveSha256 与区域。实测其原存档 f419c53c… 与规范化后的包内存档 0154efe9… 字节哈希不同，JSON 完全相等。旧制包器在规范化前已检查原始哈希。直接把包内 save 文件哈希当作原始哈希会拒绝正常旧件。
- 同一份修订 3 存档单独作为文件打包，只有 save、layout、original-input.json，三者均不记训练区域。不能仅凭房名或 companyId 填出区域。
- 两个具名别名可持有完全相同的公司、修订和存档字节，但训练区域不同。rental-original 和 rental-narrow 均为修订 2、存档 2daff2ac…，活动区 minX 分别为 -1.25 和 -1.20。仅凭 save 哈希也无法从中选定一个具名约定。接收时应保留别名或同时核验所有适用约定；当操作需要唯一约定时明确报告歧义。

完整输入路径、逐文件 SHA-256、命令、退出码和占用明细见 [REPORT.json](REPORT.json)。
