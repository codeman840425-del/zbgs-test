# 保存和恢复后发动态

固定源码 `7dd5038b`，Vite 构建 `00418d6b699b`。在该提交独立检出中保留 prototype 和 assets-source/variant-matrix-v1，在 prototype 目录执行 `npm ci`、`npm run build`。验证在开发机 Chrome 上执行。

两个 *.request.json 为可复跑输入。用 `node scripts/character-production-cli.cjs --dist DIST --request REQUEST --out NEW_RECORD --evidence NEW_FOLDER` 逐项执行。A 从相同身份的旧记录编辑到修订 2，B 新建修订 1。两个生产报告包含源构建、资源准备和真实消费者回读，对应输出记录在本目录。

以新 A 记录与 evidence/m2-native-batch-runtime-final-v1/records/contour-roundness-a.json 为两个输入，运行 `node scripts/run-fixed-check.cjs DIST scripts/qa-native-hair-record.cjs FITTED LEGACY NEW_FOLDER`。restore/report.json 保留实际结果，包括重新计算整条记录摘要后的错适配版本拒绝。同一页面的旧人物保持加载；新页面无需预览参数即可恢复适配；再加载旧记录可恢复原发动态。

正常速度房间录像由 `node scripts/run-fixed-check.cjs DIST scripts/qa-production-record-room.cjs FITTED NEW_FOLDER` 生成。走路、坐下、起身与离开四项任务完成，关闭重开后读回相同动态。录像可检查房间全身动作，远景的人脸、皮肤和白衣细节仍需近景复核。此证据覆盖候选技术链，未改变正式批产准入范围。
