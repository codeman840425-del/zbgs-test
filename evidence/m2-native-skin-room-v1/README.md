# 两份 FaceContour 记录共用原生暖肤色

游戏源码 `4f43b6aa72442e7f52ee81bfec9b90b694bdfb98`，构建 `436562eeac4a`。在独立检出的 prototype 中安装锁定依赖并运行 npm run build。独立检出至少包含 prototype 和 assets-source/variant-matrix-v1。review 页面及录像供内部预览。

作者输入、Bridge 回执与两套冷开导出位于 assets-source/native-facecontour-skin-tone-v1。提取脚本 scripts/production/native_skin_tone_package.py 的 --stage、--publish 和 --check-published 分别生成、登记与逐字节复核两份资源。原生眼线有 836 个可见像素改变。两体共用一次制作，保留逐体 UV、材质、绑定和覆盖校验。四张图在两个独立适配目录内各保留一份，合包的跨路径传输去重还需改进。

使用下列命令重跑房间检查，DIST 为上述固定构建，OUT 为新目录。

```powershell
node scripts/run-fixed-check.cjs DIST scripts/qa-native-skin-tone-room.cjs 436562eeac4a OUT evidence/m2-native-batch-iris-room-v2/native-contour-roundness-a-v1/green.json evidence/m2-native-batch-iris-room-v2/native-contour-cheek-b-v1/green.json
```

两份记录均在真实下拉菜单中改色、拍摄同姿势半身对照、基础与穿衣模式检查、撤销回原色，冷开后逐一恢复。每体模拟四次 PNG 请求返回 503 后保留原人，再从暖肤记录载入并录制讲话、笑容与后视角，各约 6 秒。report.json 的 states 包含实际材质贴图对象、Body alpha 哈希和可见贴图估算。本次 QA 未写入 renderer 全场计数。口内、眼白、虹膜贴图的对象未变。讲话片的截图是逐秒抽帧。近景出现的白衣高亮与环境亮度仍属历史素材和灯光局限。

每份暖肤和绿瞳记录的静态纹理估算上界为 377840984 字节，共 60 个纹理对象上界。原绿瞳为 222651736 字节。暖色四张位图解码的 RGBA8 等效为 37 MiB。A 着装时浏览器看得到的材质按上传参数估算，从 96734208 到 101977088 字节；该数未包含场景、骨骼、形态贴图、卸下后保留的纹理或驱动开销。budget.json 含两体统计和成本口径。普通电脑帧耗时和实际显存仍待测，整角色情况保持候选。

此前绿虹膜独立交付包的双角色关闭重开证据见 evidence/m2-native-pair-handoff-browser-v1。本版暖肤生产 CLI 与独立游戏包的复现及双角色录像另存 evidence/m2-native-skin-game-handoff-v1。
