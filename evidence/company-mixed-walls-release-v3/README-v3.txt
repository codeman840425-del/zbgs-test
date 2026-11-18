公司场景与设施平台｜正常墙体与两层混合住宅 v3

固定身份
- runtimeSourceCommit: 0c14c44ce650fae7f4d1cdcbb594e250d86f7500
- handoffToolingCommit: 8d2925e93fee8f3c607672fab09c6ea0ef3dbaf4
- build: b205fe1e4de0
- fixedTree: F:/gamemake-company-mixed-walls-fixed-v2
- delivery: F:/gamemake-company-mixed-walls-delivery-v11

本包证明
- 2.8m 正常墙体和完整墙体观看。
- 房间镜头按视线剖切遮挡，挂墙物随对应墙段隐藏和恢复。
- 两层混合住宅使用不同布局，楼层切换不改逻辑数据。
- 外观替换、整体变换、桌面部件跟随、模板升级、完整保存与关闭重开。
- 独立交付包可重建并重新运行同一浏览器检查。

固定版重复命令
```text
cd F:/gamemake-company-mixed-walls-fixed-v2
npm ci --prefix prototype
node prototype/scripts/build-company-id.mjs
cd prototype
npx vite build --config vite.company.config.js
cd ..
node scripts/company-platform/qa-mixed-company.cjs prototype/dist-company b205fe1e4de0 prototype/src/company/examples/c2-mixed-company.json prototype/src/company/examples/c2-mixed-company-edit.ops.json NEW_EVIDENCE_DIRECTORY --software
node scripts/company-platform/record-mixed-company.cjs prototype/dist-company b205fe1e4de0 prototype/src/company/examples/c2-mixed-company.json prototype/src/company/examples/c2-mixed-company-edit.ops.json NEW_RECORDING_DIRECTORY
```

独立交付重复命令
```text
cd F:/gamemake-company-mixed-walls-delivery-v11/source/prototype
npm ci
node scripts/build-company-id.mjs
npx vite build --config vite.company.config.js
cd ..
node ../scripts/company-platform/qa-mixed-company.cjs prototype/dist-company b205fe1e4de0 prototype/src/company/examples/c2-mixed-company.json prototype/src/company/examples/c2-mixed-company-edit.ops.json NEW_EVIDENCE_DIRECTORY --software
node ../scripts/company-platform/record-mixed-company.cjs prototype/dist-company b205fe1e4de0 prototype/src/company/examples/c2-mixed-company.json prototype/src/company/examples/c2-mixed-company-edit.ops.json NEW_RECORDING_DIRECTORY
```

独立重建 387/387 个运行文件字节一致。无 Git 的交付源录像会标记 `packaged-source`。

本包不包含真实角色移动、坐下、占用、跨层移动或普通电脑性能验收。60880 只用于人类预览，游戏交付以配置、资源、依附、观看状态和保存恢复数据为准。
