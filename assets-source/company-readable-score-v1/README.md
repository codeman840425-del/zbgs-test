# 抬面承托三脚谱架

`floor-score-stand-tripod-readable@1` 导入 Grab3D 原谱架与谱纸的已登记成品。旧谱板与脚架原样保留。谱纸和所有原五线谱浮雕沿纸面法向前移 59.393 毫米，最靠后的纸点仍超出旧架最靠前表面 6 毫米。两个下托和四个背垫把纸面与原谱板连在一起。六张原始贴图、1,944 个纸面顶点、页片形态和三脚底盘都沿用源模型。[原始许可](../company-singing-stage-v1/original/CC0-1.0.txt)

沿用 `floor-score-stand` 的地面安装、资源占地与 `singing-score-pages` 网格名称。新资源具有独立 ID；现有场景继续引用各自固定版本。生产器现场读取旧谱板及纸面三角面来求承托尺寸。两个下托从原板接出，纸底与托座各约 0.10 毫米交叠。四个背垫测试点与纸背各约 0.15 毫米交叠。

```powershell
node scripts/company-platform/build-readable-score.mjs --check
node scripts/company-platform/build-readable-score.mjs --output output/vocal-height-profile-v1/score/score-rebuild
```

独立配方可选 4 至 9 毫米的净距和承托颜色。请使用新资源 ID 或版本，并保留原安装、占地和谱纸网格合同。下面的配方例子把净距改为 8 毫米。在接收工作区可以用普通外观命令发布；复查读取首次发布保存的配方原字节。

```powershell
node scripts/company-platform/build-readable-score.mjs --output output/vocal-height-profile-v1/score/eight-mm --parameters assets-source/company-readable-score-v1/examples/eight-mm.json
node scripts/company-platform/publish-room-appearance.mjs --publish assets-source/company-readable-score-v1/examples/eight-mm.json
node scripts/company-platform/publish-room-appearance.mjs --check assets-source/company-readable-score-v1/examples/eight-mm.json
```

在项目主目录复算真实眼位时使用已登记的导出文件与上一轮固定录像采样。原谱架在 26 帧均重现自遮挡。新版在两房通过完整的每页 260 点，共 13,520 个读谱样点。女角的低位麦克风几何另做 20 帧复验，10,400 个样点通过。角色注视与实际唱播播放另验。

每件新几何或新房间组合都需要用具体房间的实际角色眼位复验整页读谱与遮挡。普通外观的安装与保存复查只核对资源合同和版本。

```powershell
node output/vocal-height-profile-v1/score/test-score.mjs . another-report.json
```
