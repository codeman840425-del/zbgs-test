# FaceContour 原生配色离线核对

两套 FaceContour 候选可复用原生绿虹膜 `#4f7a4a`。脚本逐个核对发布基模 SHA、打包身份和 VRoid 原生导出。两套基模的虹膜底图字节、完整 MToon 材质、主图及阴影图路由、采样器、1584 个索引、索引 UV 均与 VRoid 原生配色样件一致。眼白与独立高光的原图字节也相同。原生绿图有 85,632 像素变化，alpha 保持一致。纯黑与暗部分析沿用原样件证据，瞳孔暗区仍需在实际镜头检查。

两个候选清单位于 `assets-source/native-facecontour-iris-palette-v1`。它们分别绑定精确基模 SHA，引用现有两张公开虹膜 PNG，文件未重复复制。源、样件与两套基模保留同一作者和用途限制。此次交付仅完成内部离线候选，WebGL、表情组合、关闭恢复与人工视觉验收待测。

| 未覆盖项 | 所见证据 | 最小制作输入 |
| --- | --- | --- |
| 眉色 | 现成棕眉样件底图为 `651a9bfb…`，两套 FaceContour 均为 `9a39a82e…` | 以报告所列任一精确 FaceContour `.vroid` 作原生副本，实际读眉色键后只改一次颜色，保存、冷开并导出，核两体底图及眉毛材质、索引 UV、alpha 范围。 |
| 脸身肤色 | 原生脸部图与原始身体图在两体一致。打包完整身体用另一张经验证的原生 PNG。现有可查材料包含颜色键、原图及覆盖图。 | 对同一精确 FaceContour 副本设置一组关联肤色，检查脸/身/鼻/眼睑。导出同色穿衣及移除 Tops 两个原生版本，复核未覆盖与覆盖 Body 的 RGB 一致、预期 alpha 不同、非目标资源和 UV 保持后提取。 |
| 外唇 | 现有导出有 FaceMouth 口内材质，Lip 留档仅有查询。 | 以精确 FaceContour 源实际选用一项可用免费 Lip，查询该项后改专用 Overlay，冷开并导出。核 Face 图变化范围、口内及牙齿资源、张合口与唇边界。 |

VRoid 官方分别说明了面部部件的 Overlay、皮肤的关联明暗渐变及 Lip 与 Mouth Inside 的入口。 [VRoid 颜色校准](https://vroid.pixiv.help/hc/en-us/articles/4405438979225-I-want-to-know-more-about-Color-Calibration)

```powershell
python -B scripts/production/native_palette_compatibility.py --stage
python -B scripts/production/native_palette_compatibility.py --check
```

`report.json` 保存基模、原生源、候选清单、贴图及材质校验身份。复核覆盖错基模 SHA、材质变更、共享消费者新增、表达纹理路由新增和暂存清单冲突拒绝；重复暂存保留原始文件与修改时间。
