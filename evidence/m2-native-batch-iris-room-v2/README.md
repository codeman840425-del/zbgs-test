# 两个身体共用一款作者虹膜

固定源码 `e6062a06`，构建 `0d1ccbf3ff61`。输入为 evidence/m2-native-hair-record-v1 中两份既有完整记录。当前候选仅供项目内部制作验证，源作者和许可元数据保存在 published.json。

按 scripts/production/native-facecontour-iris-batch-v1.json 登记目标及来源。native_palette_compatibility.py 顺序执行 `--stage`、`--publish`、`--check-published`。两个目标复用同一套原图与绿色图，登记表和每体清单从批次数据生成。历史男性眉色仍有单独适配。女性样件的棕眉因原图不匹配被拒绝。肤色、外唇及其他发型仍需各自的源和适配。

在固定提交独立检出的 prototype 中运行 npm ci、npm run build，然后从保存本证据的工程运行以下检查。OUT 使用新目录。

```powershell
node scripts/run-fixed-check.cjs DIST scripts/qa-native-batch-iris-room.cjs 0d1ccbf3ff61 OUT evidence/m2-native-hair-record-v1/contour-roundness-a.json evidence/m2-native-hair-record-v1/contour-cheek-b.json
python -B scripts/production/qa_iris_pixels.py OUT
```

原色旧记录恢复后，从工作台切换绿色并保存下一修订。关闭重开后，拦截绿色 PNG 的请求，两项分别返回失败并保留原人物与原配方；解除拦截后从同一份记录恢复绿色、已有后发适配与道具，按 1× 录下讲话。证据为 report.json 及各身体目录下的记录、图片和视频。

**画面定位。** 第一轮使用眼骨原点估算眼睛位置，并且网页截屏包含状态提示；这两个因素使眼部像素统计失真。复测在相同姿势、相同灯光下，读取实际蒙皮虹膜顶点投影及同次绘制的画布。两组共四只眼睛均发生颜色变化，在两眼包围框外，各通道差异达到 4 级的像素数均为 0。仅说明这两个正面姿势的颜色变化范围。pixels.json 保存原计数。

**预算。** 使用当前源码和各自绿色记录实测静态依赖，两个可见造型各估算 222,651,736 字节 RGBA8 含 mip、44 个贴图对象。此前同一配件组合的原色估算为 211,466,920 字节、40 个对象。普通电脑性能及真实显存仍未测。两个样件的整身正式准入仍未通过。
