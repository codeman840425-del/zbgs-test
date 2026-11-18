# FaceContour 头身肤色原生试样

固定输入为 `assets-source/native-parameter-batch-v2/contour-roundness-a/candidate.vroid`。源包记录女体的两项 FaceContour 原生脸型参数。本次制作持有独立的 VRoid Studio 2.16 实例，通过原作者 Bridge 0.15.0 的 stdio 入口控制，不需要桌面操作。编辑全程使用副本。

源脸、身体、眼睑、鼻部高光组的主色均为 `#faebde`。采用单个中等暖棕色 `#bc8b6f`，让同一底图的校色变化可在导出像素上测量。该色号只代表本试样。单独写 FaceSkin 后重新读取全部 38 组，只有该组主色变化。因此分次写入另外三组现有 MainColor，并在每次写入后重新发现和读取。四组 ShadowColor、HighlightColor 保持原值。

`calibration.json` 给出源色、第一次写入的实际结果、四组的冷开值及逐组参数数量。穿衣可编辑文件保存后，经主菜单关闭并重开，核验了 Bridge 返回的 240 条参数，四个主色以外的 236 条逐条保留。眼白、眼部高光、虹膜、Mouth 和 MouthLine 均在核验范围内。贴图中口腔、牙齿的像素及材质容器仍应以导出比对为准。

穿衣可编辑文件及 VRM 在 `generated/covered.vroid`、`generated/covered.vrm`。身体供体使用独立的 `generated/donor-copy.vroid`，其起始字节与穿衣件相同，仅移除经身份及资源名核实的 Tops。再次保存、关闭、重开后，检查其余组与全部返回参数，再输出 `generated/donor.vroid` 和 `generated/donor.vrm`。身体供体保留其他服装组，完整身体图的透明度与服装覆盖差异由下游提取检查确认。

重放时，一次独占一台已启用 Bridge 的 2.16 实例，留在干净主菜单，在仓库根目录运行以下命令。输出路径须是新目录。仅对专为本次制作启动的实例追加 `--exit-owned-editor`，经主菜单检查后走原生 `vroid_exit(discard=false)`。出现失败时脚本保存自有工作副本、记录回执并恢复。原始请求、应答和原始字节在 `calls/`，导出和恢复信息在 `authoring.json`。

```powershell
python -B assets-source/native-facecontour-skin-tone-v1/author.py --output experiments/native-skin-replay --exit-owned-editor
```

导出沿用该 FaceContour 模板的原生 VRM 1.0 设置和元数据，保留原有使用条件。原作者插件及 pixiv 素材许可记录见 `assets-source/native-vroid-color-preflight-v1/official-sources.json`。本包供内部生产验证，工作台登记、游戏消费及最终观感另行验证。
