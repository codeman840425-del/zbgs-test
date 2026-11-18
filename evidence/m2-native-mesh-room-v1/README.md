# 房间口型同机位对照

[正常速度录像与画面](index.html)。固定游戏构建为 `fbf65135f5eb`，Chrome 157，开发机 RTX 4090。房间恢复了原签名记录，再独立解码并校验派生 VRM 的真实 SHA，仅将受影响的嘴部几何装上同一个角色。保留游戏材质、骨架、表情和灯光。20 组姿势中逐像素差异为零。在张嘴的房间视角、近景、画幅左右边界及画外，对照中可见的口内像素依次为 8、4,917、4,342、2,431、0。实际 actor 的 frustumCulled 为 false，边缘结果覆盖相机裁切。

正常速度文件解码得到 150 帧，1280×480，约 5 秒。同时记录的模拟时间 5.002 秒，现实时间 5.004 秒。视频 SHA256 为 `6cb7363976b13e45eead4b9cd3e4e182aef2677abf437ff4c9e697b78d27d4ce`，关键帧为 `01896e5dd4a7a9e2948cf96095870ffd9f1afc9f5ddf4414f238ea9f880e27e6`。首轮浏览器脚本的 bundle 响应编码错误已修复。fixed-room 目录为首次完成的本机画面，pixel-boundaries 另验证左右边界确有口内像素。

先按 [派生说明](texture-export/README.md) 重建前缀和固定派生文件。准备对应提交的固定游戏构建和锁文件依赖，再在工程根运行。最后一个参数为现有工程证据目录下的新子目录；录屏时间及视频编码允许随设备变化。

```powershell
python -B scripts/production/native_release_fit_inputs.py
node scripts/run-fixed-check.cjs experiments/m2-native-body-render-3058c41c/dist scripts/qa-native-mouth-representation.cjs evidence/m2-native-mesh-room-v1/texture-export/release-body.vrm b0ce392d0c846edd38d368e1685fc83ac5a4f22f7db65d4088e304b276312a5c evidence/m2-native-mesh-room-v1/replay
```

模型元数据的修改与再分发权限须另行确认。派生 VRM、录像与截图保留在本机，仓库保留脚本、哈希和测量结果。整具派生体的角色记录及普通电脑性能待验。
