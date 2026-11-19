# 茶水站编辑一致性修复

固定构建 `1ffa066260bf` 对应源码 `314cad4ddbd25e2beb8e0878b349f5345f6fb80a`。历史版可把柜体原地转动 180° 后保存，重新打开才会在离线制作检查中发现柜前维护空间越界。此版在两间原房的普通编辑器里即刻拒绝该操作，保留上一次合法存档。出租屋换成饮水柜，整层走廊换成开放柜，两房均已关闭并重开。录像时长分别为 8.16 秒和 8.40 秒，均为 25 fps、1×。[出租屋录像](browser/tea-rental-editor-normal.webm) · [整层录像](browser/tea-floor-editor-normal.webm) · [历史回执](cpu/baseline-report.json) · [录像解码回执](browser/recording-probe.json)

接收方从空 npm 缓存按锁文件构建，713 个运行文件与原包逐字节相同。四款既有柜体、咖啡机和杯子的模型与资源卡重新生成后哈希一致。接收方独立选用饮水柜，两份原房及隐藏楼层场景共 15 次非法事务保留原场景和存档，三份合法存档分别从新进程打开。机器、杯子的两处实体支撑及出租屋三个、整层六个门至服务位的路径均通过。16 房整层复用拖放探针的三个测点为 24.49、23.48、25.15 ms，记录的是接收机 CPU 时间。[出租屋重开画面](browser/tea-rental-replacement-cold.png) · [整层重开画面](browser/tea-floor-replacement-cold.png) · [通路受阻回归](cpu/witness-regression.json) · [接收回执](receiver/receipt.json) · [事务与承托点](receiver/transactions.json)

本包用于公司平台的离线制作历史回归。正式游戏中的角色占用、行走及服务行为由游戏运行链另行验收。原始报告中的 `candidate` 是封存前的目录名。正式包已迁入 `company-workspace/deliveries/tea-editor-parity-v1`，迁移后 2,623 个文件全部通过清单核验。[交付清单身份](identity.json) · [发布后校验](package-verify.json)

在安装了锁定依赖的接收副本 `source` 下运行以下命令，输出指定一个新的项目内目录。

```powershell
node scripts/company-platform/test-tea-editor-parity.mjs F:/gamemake-company-platform-c1/output/tea-parity-replay tea-counter-water@1
```
