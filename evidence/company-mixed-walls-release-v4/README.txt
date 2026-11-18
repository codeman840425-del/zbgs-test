公司场景与设施平台｜2.8m正常墙体与两层混合住宅 v4

固定版本
- sourceCommit: 8b2e0538bb0110869957116bf5cad68b2ce43f56
- build: 75cd8662a060
- fixedTree: F:/gamemake-company-mixed-walls-fixed-v3
- delivery: F:/gamemake-company-mixed-walls-delivery-v12

本包验证
- 2.8m正常墙体、完整墙体观看与房间剖切。
- 房间镜头按视线遮挡，挂墙物随对应墙段隐藏和恢复。
- 两层混合住宅分别显示，切层不改逻辑数据。
- 外观替换、整体变换、桌面部件跟随、模板升级、完整保存和关闭重开。
- 固定版本与独立交付浏览器各10项通过。
- 独立交付重建461/461运行文件字节一致。

重复命令
```text
cd F:/gamemake-company-mixed-walls-fixed-v3
npm ci --prefix prototype
node prototype/scripts/build-company-id.mjs
cd prototype
npx vite build --config vite.company.config.js
cd ..
node scripts/company-platform/build-library.mjs --check
node scripts/company-platform/qa-mixed-company.cjs prototype/dist-company 75cd8662a060 prototype/src/company/examples/c2-mixed-company.json prototype/src/company/examples/c2-mixed-company-edit.ops.json NEW_EVIDENCE_DIRECTORY --software
node scripts/company-platform/record-mixed-company.cjs prototype/dist-company 75cd8662a060 prototype/src/company/examples/c2-mixed-company.json prototype/src/company/examples/c2-mixed-company-edit.ops.json NEW_RECORDING_DIRECTORY
```

本包不包含真实角色移动、坐下、占用、跨层移动或普通电脑性能验收。4196与62080只用于人类预览，游戏交付消费配置、资源、依附、观看状态和保存恢复数据。
