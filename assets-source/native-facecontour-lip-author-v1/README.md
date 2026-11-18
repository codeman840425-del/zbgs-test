# FaceContour 原生唇妆 101

原肤与暖肤分别使用已封存的圆脸可编辑源。VRoid Studio 2.16 / Bridge 0.15 重新查询可用目录，在各自副本上应用 pixiv 的免费单项预设 `Overlay/Lip/N00/101`。具体预设身份、源文件哈希与完整导出设置见 `recipe.json`。仅供内部制作验证，沿用源角色与预设的使用条件，出处见 `assets-source/native-vroid-color-preflight-v1/official-sources.json`。

两次均只新增 Lip 组，冷开读回 `Level1Lip_OverlayColor` 为预设自带的 `#ffb8b2`。每个源原有 38 组和 240 条参数保持原值。每个状态的 `generated/*-lip.vroid` 是可继续编辑的样件，配套 `*-lip.vrm` 采用相同设置。两份脸图分别烘焙在各自肤色底图上。应用时应按肤色匹配。原肤与暖肤分别变化 2450、2675 个面部 RGB 像素，面部透明度保持。导出缩略图的唇部近景可见下唇的淡粉变化。口内与牙齿所用 FaceMouth 贴图、所有材质参数及 146 个几何访问器在各自前后对照中保持原值。张口讲话与游戏运行属后续独立检查。

`calls/` 保存 46 次原生调用的请求、回复、原始字节与四张截图。作者回执与两肤色交叉差分见 `authoring.json`、`pair-readback.json`。从仓库根目录执行以下命令可离线复核结果。

```powershell
python -B assets-source/native-facecontour-lip-author-v1/verify.py
```

原生重放需要独占处在干净主菜单的 2.16 实例。将 `author.py --output` 指向仓库内一个新目录；仅为此次制作启动的实例使用 `--exit-owned-editor`。该选项在还原主菜单后正常退出。
