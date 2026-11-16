# 柔和虹膜染色底图 v3：独立源候选

v2 实际游戏图 `evidence/iris-hue-open-v2/female-green-fov18.png` 确认：彩色外缘虽被覆盖，但原下部橙/蓝亮块经保 S/V 换 Hue 后变成荧光绿。本包改变的是可染虹膜的**低频亮度底图**，不继续仅旋转原 Hue；旧 v1/v2、原 VRM 和已失败 GPU 证据全部保留。

## 制作方法与可编辑参数

`parameters.json` 保存这一份样件的全部固定参数。实际 v2 UV 保护 mask 原样复用；男女各自原 alpha 中心连通轮廓决定外缘，不用新大圆覆盖眼白。虹膜上部灰度108、下部176连续平滑过渡，外环灰度42，在12像素内过渡；黑瞳外14像素渐暗。原图只保留0.6/2像素高斯差分的限幅细节（±2灰度级），不保留原低频大亮块；加幅值2.5灰度级的确定性径向纹理。没有随机生成、AI重画或多组参数扫描。

仅 mask>0 的底图区域写为中性灰；原黑瞳核心、mask0像素、原 alpha 逐字节保留。五个精确身体身份及材质、UV、index、贴图身份沿经验证的 v2 注册，未新增 fit。独立 EyeWhite、EyeHighlight、EyeExtra 与口腔材质均不修改。原料许可继承原 Base_Female/Base_Male/VRoid 的既有记录，本派生不标为 CC0。

## 安装接口建议

将 `runtime-manifest.json`、男女 `iris-neutral.png`、四张 mask PNG 安装到 `/assets/appearance-color-v3/`。这不是共享运行时已接入；本任务未改 public/src。

清单沿用 `character-facial-palette-v1`，`sourceVersion: appearance-color-v3`；iris descriptor 增加：

```json
{
  "colorOperation": "neutral-iris-multiply-v3",
  "neutralMapUrl": "/assets/appearance-color-v3/female-iris-neutral.png",
  "neutralMapSha256": "以清单实际值为准",
  "neutralMapSize": [1024, 512],
  "neutralChannel": "r",
  "neutralMultiplierReference": 192
}
```

建议非 original 色按下式从原始不可变图计算，不累计修改：

`coloredRGB = clamp(selectedRGB * neutralRed / 192, 0, 255)`

`outputRGB = round(originalRGB * (1-mask/255) + coloredRGB * mask/255)`

alpha 使用原图；mask0直接保留原像素。当前源底图可染域灰度42–180，故满遮罩像素不会超出所选颜色本身的最大通道。颜色/饱和度来自预设 RGB，明暗来自新底图；**不再保持原虹膜 S/V**。这有意移除了旧低频亮斑，与 v2 语义不同，须按新清单版本处理。原色选项应恢复原 map/shadeMap，不显示灰色底图。亮/暗材质纹理都需按实际来源正确恢复；唇遮罩和算法完全保持 v1/v2。

## 实际色样与有限结论

已实际查看两张 `*-old-green-soft-close.png` 与女性 neutral map。对照上半为 v2 绿色，下半为本样件；两者同 `#5e8b60`。下部大亮块已变为平缓连续明暗，深外环和细微径向纹理可见；原中央黑瞳本身的形状及少量深色边界仍保留。

女性纹理(256,310)由 v2 `[38,255,48]` 变为 `[81,119,83]`；男性同点 `[121,252,127]` 变为 `[80,118,82]`。这些是贴图像素，不是显示器亮度/最终GPU像素。图中没有叠加独立 EyeHighlight，所以不能因色样缺少白高光误判游戏中高光已删除。

不能据此宣布自然度或人物画风通过。后续由实际同镜头原绿/候选绿、左右注视、闭眼/半闭与讲话近景决定；不改几何、表情或眼骨来补贴图。

## 重复生成与门

```powershell
python scripts/appearance-color-v3/build.py --verify
```

从不可变 v2 输入和参数在临时目录重建，逐字节对比所有15个生成产物；不覆盖源包。首次生成（空产物目录）不加 `--verify`；已有 manifest 时拒绝覆盖。Python/NumPy/Pillow/SciPy 为现项目相同工具链。

`check-report.json` 记录原 alpha/黑瞳/mask0一致、两个 v2 iris mask 与两个旧 lip mask 字节一致、可染域灰度及完整探针；`manifest.json` 记录产物和脚本/参数/输入 SHA。生成器先核 v2 全包及其依赖 SHA，保持实际源身份。无浏览器、Blender、GPU或产品文件修改。
