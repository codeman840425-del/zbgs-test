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

## 选中造型聚合切片

`selected_look_budget.py measure` 只读取明确列出的 look 输入。当前代表输入见 `scripts/production/selected-look-representatives.json`，包含女性默认穿着、男性默认穿着、男性短裤＋外搭及男性 onePiece。每个 look 逐项声明 body、装备角色、当前资源路径与 SHA、manifest/fit/shape 依赖和 material recipe 版本。命令不会从目录扫描或从旧 manifest 猜测未列出的资源。

```powershell
python scripts/production/selected_look_budget.py measure scripts/production/selected-look-representatives.json --look-id male-shorts-outer-recipe-v1 --budget-version m2-technical-v1
python scripts/production/qa-selected-look-budget.py
```

聚合结果按每个 GLB/VRM 累加文件字节、网格、骨骼、材质、texture object、编码图片字节和 RGBA8+mip 估算。相同图片 SHA 的跨文件重复只额外给出 informational 去重值，不从 texture object 或显存估算中扣除。纹理累计共用操作同时加入对象数、编码字节及完整 mip 字节，4×2 PNG 的回归固定增加 44 bytes。

material recipe 限定当前实际 `zbgs-garment-material-recipe-v1` 版本1与 `cloth-normal-v4-review1` 实现。检查实际 recipe JSON、已选 garment/body、manifest 内 recipe SHA/bytes/fit/style、真实材质名、数值范围，并核 `material-recipes.js` 与 `cloth-material.js` 的源码 SHA。该实现 clone 材质并沿用原 map 引用，额外纹理数为零。非空调用者 `textureFiles`、实际 recipe 中未知纹理引用或不支持实现均拒绝。支持范围没有外部纹理 recipe，不把调用者清单视为完整依赖证据。以后真实实现新增纹理读取须先扩展依赖解析与回归。依赖 JSON/实现源码的字节另列为 `dependencyBytes`，不混入 GLB 几何字节。

聚合状态为 `legacy-observation` 时，至少一个选中资产超过现有单资产预算。`measured-unadmitted-temporary-limit` 表示数据已测但聚合临时上限没有普通目标机校准，不能作为准入或性能结论。`aggregateLimitExcesses` 列出实测累计超过临时上限的指标、实际值和限值。当前聚合临时值只用于报告，不能覆盖 body/garment 的既有 legacy 状态。浏览器纹理缓存、sampler、材质 clone 的实际分配、共享关系、GPU 显存和帧时延仍未测。


## 完整最终记录的依赖与成本（D02/P04）

```powershell
python -B scripts/production/record_budget.py measure RECORD_OR_ARRAY.json --source-root EXACT_CHECKOUT --budget-version m2-technical-v1
python -B scripts/production/record_budget_test.py --source-root EXACT_CHECKOUT
```

输入为一份完整角色记录或1–4份数组，必须带合法摘要、稳定身份和精确资源版本。共用 record collector 只读核实际依赖，source-root 须是 prototype 干净的确切 Git 检出；body、当前衣物、启动衣物、替换发型、左右附件、live道具与PNG分别识别。启动后被换下的服装仍记在启动驻留范围，最终已穿范围另列，不假称所有缓存都释放。

退出0仅表示支持的静态指标未超当前阈值；退出1是超限，退出2是无效或不支持的输入。指标范围为文件中图片纹理及已支持派生图片估计，明确不包含骨骼Float纹理、morph DataArrayTexture和渲染器按source/sampler分配的全部开销。不能把RGBA8估算当实际显存或总GPU上界。没有普通电脑实测，不自动放宽临时阈值。

原生覆盖与局部调色按当前源码的两份材质、每份两张 map 估计。校验颜色的参考 PNG 只计入交付文件。旧材质布料复用原图。马尾外部适配的 6 个关节和 3 个碰撞体计入单资产和整套，原生 GLB 的嵌入动态只计一次。实际房间碰撞代理的对象数单列。

完整记录的默认预算命令可识别已核的旧女体及独立短发配色。它核对身体、发型、材质、贴图和加载代码的实际版本，按原 Texture 对象区分底色与阴影，再对共用它们的发网格和描边去重。报告分别列出画布、保留的像素数组与逻辑纹理字节。未支持的挂接、表面或交叉配色返回具体失败原因。每份新记录仍需独立检查交付权限和设备性能。固定签名的发、眉、虹膜和唇色可用 `qa_record_palette_cost.py 签名记录 静态报告 浏览器报告` 逐项复核。

实测输入与修正记录：evidence/m2-record-budget-v1/records.json，修正后报告m2-record-budget-v2；独审m2-record-budget-review-v1。当前三记录都存在单资产超限，不能按整套临时总量未超就视为准入。

同构建1084的m2-record-budget-runtime-v1是RTX4090开发机headless Chrome、1440×1000、原生男/女/旧男/男女双例各12秒讲话的独立短测，无录屏干扰。角色纹理计数增量51/47/36/98，移除后纹理与几何都回ground基线1；该计数不提供GPU字节，也不证明长期无泄漏。单例纹理估计48/40/28与实测差异已明确，不用估计替代测量；本轮没有新压缩、减面或画质降级。
