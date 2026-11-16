# 单资产只读成本准入

从仓库根运行，Python + `requirements-asset-budget.txt`。命令沿用 production 的 `GLB`、相对路径解析及 JSON 读取，额外检查 accessor/view 边界、实际 skin weights、图像尺寸与依赖。它不启动制作工具或游戏。

```powershell
python scripts/production/asset_budget.py check prototype/public/assets/m1b/m1b-uniform-shorts-v1.glb --class garment --budget-version m2-technical-v1
python scripts/production/asset_budget.py check prototype/public/assets/m2-hairstyle-v1/female-bob.glb --class hair --budget-version m2-technical-v1 --descriptor prototype/public/assets/m2-hairstyle-v1/manifest.json
python scripts/production/qa-asset-budget.py
```

`--budget` 可指定仓库内相对 JSON，仍须给完全匹配的 `--budget-version`。四个 class 为 body、garment、hair、accessory。输出为 JSON，包含输入路径、资产 SHA、预算版本/内容 SHA、实测结构、超限项或错误。退出 0 表示静态准入，1 表示超预算，2 表示输入无效或依赖缺失。调用方应保留原资产，定位错误路径并恢复确切资源后重跑。当前流程只提供只读命令，尚未挂接所有历史生产/运行入口。

`m2-technical-v1` 是待普通目标机校准的保守技术准入上限。body 的纹理估算上限 96 MiB，garment/hair 各 16 MiB，accessory 8 MiB。body 允许当前表情/骨架结构规模，单件衣发与附件限制更少的三角、材质和 primitive，避免新增资产无限消耗预算。所有指标使用配置的同一版本，缺字段、负值、布尔阈值、错版本均拒绝。现有男女基础的纹理估算超过 96 MiB，麦克风的 9 primitive 超过附件上限 8，证据保留为 legacy 观察。当前素材原字节保留。

成本定义如下。

- `fileBytes` 为 GLB/VRM 文件实际字节，`externalImageBytes` 为去重相对图像文件实际字节。每图 `encodedBytes` 单独保留。GLB 内嵌图片包含于 fileBytes。
- `uniquePositionVertices` 以 POSITION accessor 身份去重，并非坐标焊接。`primitiveVertices` 按每个 primitive 的完整 POSITION count 累加。`triangles` 每 mesh 定义计一次，`nodeTriangles` 按全部 mesh node 引用累加，包含非当前 scene 的 node，采用保守资产上界。定义数、节点数另列。共享 accessor、多 primitive、实例数量均可分别检查，这些值不等于实测上传字节或 draw call。
- skin 分别列出每 skin 的 joint 数，并对累计 joint slots、最大单 skin joints、所有 WEIGHTS 集的最大正权重影响数设上限。解析实际权重、归一化与绑定 joint 索引。morph 分别限制单 primitive target 数和去重 accessor 的逻辑 payload 字节，包含 POSITION/NORMAL/TANGENT。
- 实际 PNG/JPEG 的尺寸由 Pillow 校验。每图有 RGBA8 基层和完整 mip 链字节估算，mip 逐层向下取整到 1×1。`uniqueImageRgba8MipBytes` 按图片字节 SHA 去重。预算的 `rgba8MipBytes` 按声明的 texture 对象累加，同图不同 texture/sampler 保守分开估算。所有图片都检查文件和尺寸，`imagesWithoutTextureObject` 与 `texturesWithoutMaterialReference` 显式报告未引用项。唯一图片估算包含未引用图片，texture 对象估算包含未被材质引用的 texture。
- RGBA8+mip 是固定格式假设下的静态估算。浏览器色彩空间/采样器分配、VRM材质附加贴图、缓存与实例共享会改变实际分配，当前结果没有实测显存含义。全部声明材质/texture 都计入相应数量上限。
- 原生 VRM0 secondaryAnimation 统计动态根及其后代，VRM1 springBone 统计声明 joints，并列出 collider 数量。可选 descriptor 目前仅核当前 `character-hairstyle-v1` 的 SHA 与 rigid 配置，其他外部动态格式拒绝。未提供 descriptor 时显式写 `not supplied`，原生动态仍计入。

范围限定为现有未压缩 GLB 2.0/VRM、内嵌 BIN、非 sparse accessor、TRIANGLES、PNG/JPEG。直接外部图片只能位于 GLB 所在目录或其子目录，先解 URI 转义，再核路径及符号链接真实路径。缺文件、绝对/远端/data URI、向上遍历、未知必需扩展、压缩 primitive/view/texture 均拒绝。node 上的扩展尚未计量，按实际 node 内容拒绝，即使扩展仅声明于 extensionsUsed 或未声明也拒绝，包括 EXT_mesh_gpu_instancing。新格式须扩展解析与回归后准入。

这项检查覆盖单个 GLB/VRM 及其直接图像依赖。运行时 materialRecipes 的替换或额外纹理、整套造型累计、动作流、实例缓存/释放及帧耗时仍待运行链验证。其结构检查也不代替完整 glTF/VRM 标准验证器。当前没有普通电脑设备数据，开发机 4090 未参与本 CPU 检查，不能推导普通机性能通过。

代表样件与固定来源 SHA 见 `evidence/m2-asset-budget-v1/representatives.jsonl`，每行资产路径可代入首条 check 命令重跑。详细每图、skin 与 texture 结果由命令输出，不在能力清单复制第二套状态。
