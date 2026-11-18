# 原生男性 7586 逐贴图成本

固定游戏源码 `cfca0dd1`、构建 `fe2e58489bbb`，两份完整记录 `native-male-7586-v1-record-a` 与 `native-crew-7586`。核对签名记录、游戏包文件清单、各模型及选中贴图字节，再回算已有 `m2-technical-v1` 静态结果。两份记录共用身体、覆盖与原生三件装备。袜子、麦克风和眼镜 GLB 各自没有嵌入贴图。

## 预算归因

| 项目 | 每人字节 | 口径 |
| --- | ---: | --- |
| 现行选中造型纹理估算 | 203,078,308 | 原模型的完整 mip 链加四份线性覆盖贴图上界 |
| 仅嵌入贴图，现行估算 | 135,969,444 | 33 个 GLTF texture 定义，含未绑定缩略图 |
| 嵌入贴图按源文件实际采样参数 | 101,977,088 | 线性放大和缩小、Repeat，无 mip，每个 texture 定义计一份 RGBA8 |
| 嵌入贴图按材质实际引用 | 85,199,872 | 线性口径移除只供 VRM meta 使用的缩略图 |
| 嵌入贴图按当前装备控制器可用材质 | 71,568,384 | 上一行再去除被隐藏的 VRM 原衣裤鞋三张主图 |
| 一份覆盖 RGBA8 | 16,777,216 | 2048²，实际包内 PNG 为 859,870 字节 |

上表按源图与定义计数。Three 会为材质槽建立自己的包装和 Source，渲染器还有额外的分配与预热。固定构建的既有浏览器探针实测每人覆盖 `map` 和 `shadeMultiplyTexture` 各一个已上传 handle，两者使用同一 Bitmap，描边沿用对应 handle。换装前后的完整驻留需以运行探针核实。记录中覆盖图与身体基础图的每个 RGB 像素相等，608,383 个 alpha 像素不同。它们分别服务穿衣和恢复，不能互换。详见 [固定构建浏览器探针](../../m2-native-short-socks-room-v1/browser-budget/report.json) 及 [逐图和材质槽记录](report.json)。

身体 VRM 共 14,194,256 字节，21 张嵌图的独立 BIN 区间共 5,724,331 字节，其中身体法线 2,829,576 字节。三件装备的主图与 VRM 内相应原衣裤鞋逐字相同，重复传输 714,460 字节。4 处 8² 默认法线相同，8 处 8² 纯黑 emission 或 matcap 相同，合计另有 720 字节重复。33 张嵌入图和一张覆盖 PNG 经完整 RGBA8 解码比对，共五组重复，像素重复集合与字节重复集合完全一致。像素哈希含尺寸和透明区域 RGB。

## 收益与外观约束

| 候选 | 固定样件数据 | 适用边界 |
| --- | --- | --- |
| 身体法线跨实例复用 | VRM image 12 的 2048² 法线为 16 MiB RGBA8。既有双人探针显示两位各自占一个 handle，同一人的描边共享该 handle。复用成功时双例少一份，单人无收益。 | 沿已验证的不可变 Source 和引用计数机制复用，保留独立材质和 Texture 包装，核采样配置、加载顺序、任一实例退出及最终释放。固定构建的现有 pins 仅覆盖两位 FaceContour 女体，两者法线哈希与这位男性不同。 |
| 身体覆盖 map 与 shade 共用 Source | 同一人可避免一份 16 MiB 原始像素对应的不同 handle，双例最多 32 MiB。 | 固定 2048² sRGB、LINEAR、Repeat、UV0 和 alpha cutoff 0.5。两槽需保留独立包装和材质更新。暖肤派生、回退原图、装备事务及描边单独检查。 |
| 脸部法线等值缩减 | VRM material 3 → texture 6 → image 6 → bufferView 6。1024² 全图 RGBA `(128,128,255,255)`，只用于脸法线。1² 的 RGBA8 理论节约为每人 4,194,300 字节，现有探针证实其原尺寸 handle 已上传。 | 已生成单一精确 pin。只有身体 SHA、结构、原始 PNG、副本像素和独占 bufferView 均匹配时才可代入。原材质/法线采样及外观合同保留，具体 GPU 与近景结果由固定运行候选验证。默认 8² 法线的红绿值是 127，不能代用。 |
| 全透明睫毛底图 | VRM image 9 为 1024×256 全零，RGBA8 账面 1 MiB。 | 它同时绑定 BLEND 材质的主图和 shade。若继续，须核 alpha/颜色及眼部材质替换、轮廓和恢复。当前只记录常量，准入仅限脸部法线。 |
| 衣鞋重复源与缩略图 | 三张重复主图至少 714,460 个源字节，VRM meta 缩略图另占 596,463 字节。 | 当前原 VRM 包含来源衣面，源装备 GLB 为实际换装资源。去重涉及新发布资源、体衣 SHA、fit 与记录回读。缩略图仍有 VRM 元数据用途。两项的传输字节与实际 GPU 节约应分别验证。 |

顾问原始报告已归档并提出分层优化。已完成的先例包括 801 HTTP 传输、801 男女 KTX2 诊断与两份 FaceContour 身体 KTX2 源旁车，以及 FaceContour 法线 Source 共享。旧 KTX2 的原始 PNG 和材质身份与此 7586 样件不同。KTX2 可能保留普通纹理的染色或覆盖回退，须用精确原色、MToon 主图/shade、sRGB/线性、alpha 边缘及实际转码格式证据衡量，不能直接从旧旁车估出 7586 收益。本轮保持稳定资产与预算，普通电脑仍未测。参见 [顾问调研](../../../docs/research/RESOURCE-COMPRESSION-GAME-PRACTICES-2026-11-16.html)、[HTTP 传输证据](../../m2-http-transport-801-v1/summary.json)、[801 KTX2 对照](../../m2-ktx-room-comparison-v3/summary.json)、[FaceContour KTX2 旁车](../../../assets-source/m2-ktx-pilot-v1/native-facecontour-sidecar-v1/README.md) 和 [法线复用证据](../../m2-body-normal-lifetime-after-v1/report.json)。

## 重跑

从项目根运行以下只读命令。Pillow 版本用 12.1.0。静态报告已用独立固定源码构建的第二份 dist 字节级复核。

```powershell
python -B scripts/production/native_texture_cost.py --check
python -B scripts/production/native_texture_cost.py --assets-root experiments/worktrees/role-asset-admission-fixed-v1/prototype/dist --check
$vrm = 'experiments/m2-native-sock-cfca0dd1/dist/assets/native-male-factory-v1/native-vroid-male-unmasked-base-v1/generated/male-native-unmasked-79-v1.vrm'
python -B scripts/production/native_uniform_normal.py --vrm $vrm --sha256 7586d3bc0921f88e86b38f7cf2f6651e4be76c47bbe0dfad45020f9001806d81 --check
python -B -m unittest discover -s scripts/production -p test_native_uniform_normal.py
```
