# 虹膜遮罩 v2：限定源修复

这是原虹膜贴图的可重复局部配色遮罩，不是新眼睛资产或游戏观感验收。旧 `appearance-color-v1`、身体、UV、材质、表情和 fit 均未修改。原素材沿已有 Base_Female/Base_Male 的 VRoid 来源许可，不标为新 CC0 素材。

## 可安装产物

将本目录 `runtime-manifest.json` 和四张 `*-mask.png` 复制到 `/assets/appearance-color-v2/`。产品加载入口应明确改为 `/assets/appearance-color-v2/runtime-manifest.json`，不能在 v1 URL 下偷换内容。

- schema 保持 `character-facial-palette-v1`，`sourceVersion` 为 `appearance-color-v2`。
- iris descriptor 明确 `colorOperation: hsv-hue-preserve-sv-v2`；只能用虹膜专用 HSV 最短圆弧 H 插值。mask 权重作用于 H，不是 RGB 混色。保留源 S、V、alpha；mask=0 像素原样保留。
- lips descriptor 与 v1 相同语义；女/男唇遮罩逐字节复制 v1，原唇色公式不变。
- 五个精确 avatar SHA 与 v1 完全相同，男女分别实际核原材质、indices、UV、原贴图编码和解码像素。未新增其他身体准入。
- `_MainTex` 与 `_ShadeTexture` 都需对应替换/恢复；EyeWhite、EyeHighlight、EyeExtra、FaceMouth 及所有其他材质不在此操作范围。

## 遮罩依据

原男女 EyeIris 各有 192 个真实索引三角。其 UV 覆盖按图像左上 v 栅格化，扩 2 像素仅作纹理过滤边支持，然后与原 alpha>0 相交。取消 v1 固定椭圆截断和全图暗像素排除，因此有颜色的棕/蓝外缘和紫色暗虹膜会换色，而深轮廓的源明暗保留。

黑瞳核心限定在左右眼中心的原搜索域内，选与眼中心连通、原 maxRGB≤45 的暗核心，向外 3 像素平滑释放。不是把整个旧 ≤64 暗色区域当黑瞳，也不是通用自动分割模型。这一作者规则只适用于已核的两张原图。明亮近中性的源 glint（minRGB≥210 且通道差≤3）保持原像素；独立 EyeHighlight 材质完全不动。

原虹膜下部本来有鲜明亮块，女为橙色、男为蓝色。保持 S/V 后亮块仍在，变为亮绿；本次不重画原画风、不保证消除这种亮部造型。`female-source-green-comparison.png` 与 `male-source-green-comparison.png` 上半为原图、下半为按当前绿色 `#5e8b60` 仅取 Hue 的 CPU 色样，透明区合成到灰底，**不是实际游戏图**。已实际查看两张对照，外棕/蓝边统一换色，中央暗核心保留；源亮块仍明显，需游戏近景判断。

## 重建和检查

在项目根目录，具备 Python、NumPy、Pillow、SciPy 后：

```powershell
python scripts/appearance-color-v2/build.py --verify
```

该命令在临时目录重新从实际 VRM 生成全部 13 个产物，逐字节核对后删除临时输出；不写入公共资源、旧 v1 或现源文件。已实际执行通过。首次生成使用不带 `--verify` 的命令，但检测到现有 manifest 会拒绝覆盖。

`manifest.json` 固定生成产物与输入依赖 SHA；`check-report.json` 保存五身体实际身份、两核心边界/点数、UV 范围、彩色边缘探针及 CPU 检查。CPU 已核 alpha、mask0、黑瞳核心、白 glint 原样，源 max/min 通道逐像素相同（因此保留 HSV S/V，包括羽化区），核心羽化外有效彩色区域完整覆盖。原表情无 UV morph、无相关 materialValue 绑定；这只证明坐标可复用，不代表眨眼/注视/表情近景观感通过。

后续需要同角色原色/绿色实际近景、左右注视、完整闭眼、微笑讲话对照。不得把贴图色样或 CPU 保护门当用户已接受。
