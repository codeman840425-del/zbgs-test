# 化妆台面收纳生产输入

项目原创参数与构造源。四款为托盘、分格收纳、刷具杯、固定开放化妆箱，共用真实短行程抽屉；另有一个独立保存的小圆盒。不是台体内置抽屉或角色化妆动作。

从工程根目录运行：

```powershell
node scripts/company-platform/build-makeup-storage.mjs
node scripts/company-platform/build-makeup-storage.mjs --check
node scripts/company-platform/build-library.mjs
node scripts/company-platform/build-makeup-storage-examples.mjs
```

可编辑输入是本目录 parameters.json，生产器为 scripts/company-platform/build-makeup-storage.mjs。功能规格见 docs/COMPANY-MAKEUP-STORAGE-CONTRACT-v1.txt。统一提示词、四款设计输入、来源许可及工具/几何门摘要在参数中；产物及侧录在 prototype/public/company-assets/makeup-storage-v1。

生产器导入无写入，--check 重新导出并比较当前登记字节，不读取或写入 evidence。常规导出保留参数变体和实际读回结果。当前正式样件把托盘 rimHeight 从 .140 改为 .145 米，再导出、登记并由实际场景消费；修改前源与 GLB 在 evidence/company-makeup-storage-production-v1/published-parameter-cycle。其他三款及小圆盒模型不因该参数变化而改变。

只在功能规格允许的范围内修改几何；修改功能/安装/状态不是换皮。资源元数据与 GLB 摘要必须共同登记，不能以相同ID/版本偷偷替换已交付存档所绑定的内容。当前 v1 还在首次固定交付准备期；首次交付后再修改已发布资源时使用明确的新版本并显式替换或升级，旧资源和源保留。

已修复杯底及箱提手同向重复外表面，原模型/源/截图保存在本包 failures 证据中。几何检查证明厚度、连接、空腔、连续滑动和轨道接触，不证明机械承载强度、角色手部使用或普通电脑性能。
