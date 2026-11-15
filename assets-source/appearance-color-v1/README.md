# 虹膜 / 外唇局部颜色数据样件

本包只新增有来源和 UV 依据的像素遮罩；不改身体、脸型、原贴图、材质、表情或共享运行时。正常面部颜色和表情的游戏观看由主集成执行，本包不以 CPU 色样宣称外观已通过。

## 接入

复制 `runtime-manifest.json` 和以下四张 PNG 到 `prototype/public/assets/appearance-color-v1/`：

- `female-iris-mask.png` / `female-outer-lip-mask.png`
- `male-iris-mask.png` / `male-outer-lip-mask.png`

manifest schema 是 `character-facial-palette-v1`，`variants[]` 用**精确 avatarSha256**选择。每项 `parts.iris/lips` 提供 `materialName`、`maskUrl`、`maskSha256`、`mapSize` 和原 `sourceMapSha256`。不要用性别名称自动兼容未查的新脸。

PNG 为单通道灰度权重，黑保护、白可染、柔边混合；用 R 通道数值，不作 sRGB 转换。图像左上 y 对应本资产 glTF `TEXCOORD_0.v`，不再 `1-v`；源和遮罩 `flipY=false`。尺寸必须与原贴图一致。颜色变化仅改 mask>0 的 RGB，完整保留原 alpha；原始纹理对象/像素不得写入。每实例缓存和恢复，显式销毁独立缓存。`THREE.Texture.clone()`共享 Source，所以换图必须另建 `Source`。

实际男女 MToon 的 `_MainTex` 和 `_ShadeTexture` 指向同一原图，均须替换相应遮罩色图，避免只染亮部不染暗部。不要修改 normal、matcap、outline width、口腔、眼白或高光贴图。材质颜色和原有肤色选择需按确定顺序组合；色样采用保持源 Value 的示意算法，最终色彩/强度不是本包的产品批准。

## 实际素材依据

男女虹膜是独立 `F00_000_00_EyeIris_00_EYE` / `M00_000_00_EyeIris_00_EYE` 材质，贴图1024×512，左右眼中心约(0.25,0.5)、(0.75,0.5)。**瞳孔画在同一张图里**，不能将整个材质改色。遮罩在已看过的虹膜环内，保留原 alpha、外暗边；中心保护通过原纹理暗区(maxRGB<64)且连接到眼中心的连通组件取得，有限搜索域、1px保护扩边、3px柔边均记录。它是本素材作者 mask，不是通用自动分割能力。眼白和白色高光属于独立 `EyeWhite` / `EyeHighlight` 材质，完全不操作。已查看原图及绿色示意图，原瞳孔仍在，原细节保留。

外唇在 **Face_00_SKIN** 的1024×1024脸贴图中，不在 FaceMouth。已实际查看 FaceMouth 图：牙齿、舌与口腔不可整块染色。男女各从 Face_SKIN 真实三角网格找到一个32边的嘴洞闭环，只选与边界相邻的64个三角面作为外唇一环；2px向内羽化，不向脸颊/鼻/下巴扩张。白色原唇光保留。女有效1376像素，男2779像素；不同嘴型各自独立生成，不能套女mask到男。

`*-lip-topology-review.png` 蓝线是真实嘴洞边界，绿线是所选外唇三角。`*-lip-swatch-close.png` 仅是纹理放大色样，不是游戏面部图。牙舌材质、眼白、高光及遮罩外所有原皮肤像素均不改。

## 派生和表情

已分别读取当前 female、male、m1a-jaw-v1、m1a-waisthip-v1、m2-male-jaw-v1 的实际 VRM。对应父体虹膜/脸材质、索引、UV原字节、原贴图编码与解码像素、尺寸逐项完全相同，所以明确登记这五个 SHA。男女 UV 本来不同，未跨性别混用。

女56、男54个表情目标只含 POSITION/NORMAL，无 TEXCOORD 目标；相关材质也没有 expression materialValue绑定。故遮罩会随嘴唇实际几何的原 UV 运动，不会停留在世界空间或改染牙舌。但此证据只是 UV 稳定性，不替代张嘴、微笑、眨眼时实际观感验收。详细身份和面/点选择见 `manifest.json`。

## 复跑与来源

项目根目录：

```powershell
python scripts/appearance-color-v1/extract.py
python scripts/appearance-color-v1/build-masks.py
python scripts/appearance-color-v1/check.py
```

`check.py` 已实际重建并确认所有 mask/manifest SHA 字节一致，示意色图 alpha 完全不变、mask0像素完全不变、两眼中心保护、五身份 UV/索引/贴图一致。未开浏览器、未执行 Blender、未改 public/src。

原素材沿已有 Base_Female/Base_Male 的 VRoid 来源、许可和派生记录；无新AI图、无外来脸。原图提取仅为审查和可重建证据，来源见 `assets-source/foundation/source.json` 与 `assets-source/foundation-male/source.json`。不把新增局部颜色能力称为原模型已有独立唇材质。
