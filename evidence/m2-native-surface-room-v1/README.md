# 两份原生角色记录在游戏光照下的表面

固定源码 `9ff6116a`，构建 `ba8a7b36d01b`。两份输入使用 evidence/m2-native-hair-record-v1 的完整记录。A 是修订 2，B 是修订 1。浏览器、构建、记录摘要、已加载材质和截图都可在 capture.json 中逐项对应。场景使用现有灯光和镜头，讲话录像为正常速度。

在该源码的独立检出中运行 prototype 的 npm ci、npm run build。将 DIST 替换为构建目录，OUT 使用新的目录。采集脚本及复核器在本证据所在的提交。

```powershell
node scripts/run-fixed-check.cjs DIST scripts/qa-native-surface-room.cjs DIST/build-info.json OUT evidence/m2-native-hair-record-v1/contour-roundness-a.json evidence/m2-native-hair-record-v1/contour-cheek-b.json
python -B scripts/production/native_surface_readback.py --capture OUT/capture.json --build-file DIST/build-info.json --output OUT/readback.json
```

**画面。** 脸部近景中虹膜、镜架和头发轮廓可辨，白衣和皮肤亮度接近，闭嘴时唇线较淡。张口可见口腔形状。半强度灯光让两者变暗，不能由此认定全局灯光是唯一原因。没有改动游戏光照。两条 1× 视频可在 4196 的「检查 → 房间光照下的脸部与服装」观看。

**资源。** 六次运行状态中 Body 主贴图的透明度平面均逐字节对上对应源 PNG。加载记录后切到基础人体，保留该角色的鞋，再穿衣时恢复原遮罩和贴图引用。两个预算 JSON 是用本次固定源码和本次记录分别运行 record_budget.py measure 得到的。每份静态完整记录估算 211,466,920 字节 RGBA8 含 mip。穿衣时，浏览器当前可见材质所引用的贴图按源和上传配置去重，估算为 94,637,056 字节。两种估算的范围不同。实际显存字节和普通电脑性能未测。运行与画面证据均未将角色纳入正式批量发行。
