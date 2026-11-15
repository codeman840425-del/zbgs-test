# 女性齐颈侧后短发候选 v1

这是当前 Base_Female 的独立发型样件，不是换色、换整个人物或已获产品批准的经典波波头。实际源近景显示：侧后轮廓明显更长、更宽，前发际仍为原短发，整体偏齐颈侧后短发。头发仍为刚性短发，没有新增物理系统。

## 精确输入和使用条件

- 当前女体：`prototype/public/assets/foundation/base-female-roundtrip.vrm`，SHA256 `027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95`。
- 原可编辑整体源：`assets-source/foundation/base-female-editable.blend`，SHA256 `bcfd5d2c99d7f9e53ca0a6b4fb7f42f1ce740a87b86777c276c1fa1094f520c7`。本候选从上述精确运行 VRM 提取实际头发。
- 原模型为 VRoid Project Base_Female，经 OpenGameArt 第三方发布，原文件 VRM meta 声明 CC0，并明确允许修改、商业使用和再分发；完整发布来源和原授权字段保存在 `provenance.json`。这不是新找的匿名素材；不把未恢复的 `.vroid` 文件称为已恢复。
- 仅原女性 SHA 登记兼容。女性 jaw/waist、男性及其他体型未自动继承；需实际头部/脸型空间和动作检查。

## 可复用结构

原头发为 Body mesh0 primitive5、材质 **`F00_000_HairBack_00_HAIR`**，225 点/394 三角，所有点 100% `J_Bip_C_Head`。没有头发 shape key，也没有头发 spring。Face 中 HA 命名键是牙齿相关，不用于换发。

新 GLB 为一个普通 Mesh、identity 根，没有 SkinnedMesh。已应用原 Head inverse-bind，坐标精确为 raw head bind local；直接挂当前原女性 raw head，局部位置零、旋转 identity、scale1。不要重复乘头骨 bind 位移/VRM0翻转。原 Head矩阵在 `build-report.json`。运行时可复制原头发 MToon 材质保持渲染一致；源 UV 和原纹理保留。

隐藏仅匹配该原材质对应的 primitive/group 或 VRMLoader 拆出的独立 mesh；如有描边副本，只处理相同 HAIR primitive 的描边。**绝不隐藏整个 Body、Face 或所有带 HA 的表达。** 卸下新发后恢复之前记录的原材质/group可见状态。颜色选择由调用方克隆材质处理，不能污染共享原材质。

## 制作与重建

在项目根目录执行：

```powershell
python scripts/m2-hairstyle-v1/build.py
& experiments/tools/blender-4.5.9-windows-x64/blender.exe --background --factory-startup --disable-autoexec --threads 2 --python-exit-code 1 --python scripts/m2-hairstyle-v1/preview.py
& experiments/tools/blender-4.5.9-windows-x64/blender.exe --background --factory-startup --disable-autoexec --threads 2 --python-exit-code 1 --python scripts/m2-hairstyle-v1/export-editable.py
python scripts/m2-hairstyle-v1/check.py
python scripts/m2-hairstyle-v1/check-head-space.py
```

`build.py` 是本次确定性作者操作源，`parameters.json` 是该操作的输出记录。它保留原顶部 Y≥1.525m 和前发际，沿侧后连续轮廓扩展并加长，156 点发生位移，最大63.065mm；拓扑/UV/纹理不变，重新计算光滑法线。`editable.blend` 包含真实完整原人物、原发与候选两组，纹理已打包，可实际编辑 `Hair_candidate`。`export-editable.py` 从保存的 blend 选择该网格、恢复 head-local，导出另一个 `editable-export.glb`，不会静默替换冻结 candidate 或 manifest。手改后的产物必须新版本再适配。

`check.py` 已实际验证源重新执行后候选、原发、manifest、fit字节相同；保存后重新打开 blend 导出的三角顶点位置在1µm精度一致。Blender导出器格式/顶点拆分不同，不要求两个不同导出器字节相同。

## 已看和未通过边界

- `views/` 是原/新前、侧、后完整材质近景，固定相机、完整脸耳颈和衣领保留。Blender glTF预览不等于游戏 MToon完全相同，实际游戏由根代理回读。
- 首次预览 front/back 标签反向，已只交换标签和脚本相机定义；没有改变候选几何或挑好帧。`preview-report.json` 记录。
- 实际图：脸眼无遮挡；侧后头发延长明显，发梢较碎，前面仍是短发式发际，不声称经典圆bob造型通过。
- 静态有限三角诊断：颈部 Body 原10对→候选0对；Face 原56→114对，其中106对为新配对，集中两耳/太阳穴侧缘。该数值**没有透明纹理alpha过滤、不含共面重叠**，不能当作106处可见穿模；也不能据图宣布无交叉。耳侧覆盖是否接受待游戏近景观看。
- 未测完整头部俯仰/转向、跑坐舞、衣领动态、各种表情/派生体型。刚性头发与颈/肩的动作接触风险保留；本轮没有隐藏耳、颈或身体来消除它。
- 原角色身体、服装、动作、公共 runtime 与 public 均未修改。
