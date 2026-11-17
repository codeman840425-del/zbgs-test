# CUSTOM-M03 · 原生男性外唇妆单件接入审查

建议下一样件取 Studio 自带的 `Overlay/Lip/N00/101`。现成作者预设清单记录其为单件、可用、价格 0、未穿戴。当前男性原生源没有独立 Lip 组，4196 build1084 的 `appearance.appearance.lipColor.choices` 只有 original。现存的是预设目录记录与可编辑人体，项目尚无 101 的专用导出或游戏配方。本次仅离线读源码、真实 Bridge 回执及 VRM 字节。相关能力范围见 `docs/CAPABILITIES.md` 的 CUSTOM-M03；既有原男女外唇染色有效。

## 输入与可复用条件

| 已提交输入（路径相对仓库） | 本次逐文件 SHA256 |
|---|---|
| `assets-source/vroid-bridge-study-v1/generated/male-native-base-216.vroid` | `c936b24182e8bb9951f94fd0aec91db1995eb73938ff496a0614fccadd3e0e6a` |
| 同目录 `male-native-base-216.vrm`，原生基线 | `a18a2d1138dbae7709b3fed3711a37b5b67888552655afe8a3dfd1398ffa58da` |
| `assets-source/native-vroid-male-unmasked-base-v1/generated/male-native-unmasked-79-v1.vrm`，游戏身体 | `7586d3bc0921f88e86b38f7cf2f6651e4be76c47bbe0dfad45020f9001806d81` |

直接解析两份 GLB。原生基线与游戏身体的 Face 材质 3 同用 1024² 主图/shade 图 5，PNG SHA 为 `37a8761fde74ef03731d7686e55a0bc529c5afe0aca94b377f2d1c1471b42118`。口腔 FaceMouth 材质 0 使用独立 512² 图 0，两源同 SHA `2c80a4a3c10825836aaa1f9dc5547bd2d2b899384a4b224166bb5455e52393f7`。身体图 11 两源不同。新图实际落在哪些材质/采样器，须以导出后读回确定。旧身体覆盖图不能被带回游戏。

## 一个原生窗口

1. 使用已装 Studio 2.16.0 与 mcjo79 Bridge 0.15.0 的原调用器 `python -B assets-source/vroid-bridge-study-v1/call.py <request.json> <fresh-result.json>`。新建排他输出目录。按 `assets-source/native-vroid-iris-study-v1/native_cycle.py` 的保存/恢复流程读取 `vroid_status({})`、保留进入文件、打开固定 c936b、另存工作副本。沿用安装及内部样件许可记录。
2. `vroid_list_presets({"filter":"Overlay/Lip","include_locked":false,"limit":3})` 核 `2eeea322ca3040fbdd8c67033208045488584ddc.transferablegroup` 对应 101 且可用/免费。这个精确查询在同机 `male-before-skin-study.vroid` 上有回执，c936b 工作副本需要重新核对。保存 `vroid_list_groups({})` 前态，然后只调用一次 `vroid_apply_preset({"id":"2eeea322ca3040fbdd8c67033208045488584ddc.transferablegroup","preserve_material":false})`。重读所有组与新 Lip 组的 `vroid_get_params({"group":"<实际组ID>"})`。`vroid_list_layers({"group":"<实际组ID>"})` 若返回可编辑层，可用真实 transferable/image/node 三个 ID 和新 PNG 路径调用 `vroid_export_layer` 采集作者覆盖范围。层不可读留原错误，可用导出前后逐像素差与真实唇部 UV/近景交叉核对。
3. `vroid_save({"path":"<全新绝对路径>/male-lip101.vroid"})` → `vroid_main_menu({})` → `vroid_open({"path":"<同一候选>"})` → 核组、参数、原衣发及元数据。导出 `vroid_export_vrm` 参数沿 `assets-source/native-vroid-iris-study-v1/requests/16-export-vrm1.json`，保持 version=1、delete_transparent=false、四类减面/材质/纹理/发骨参数 0、leave=true，仅指定全新 `male-lip101.vrm` 路径。记录 warnings、输入输出 SHA、实际耗时，恢复进入时的文件。依据为 `assets-source/native-vroid-appearance-producer-v1/read-only/15-free-lip-catalog.json`、同包 `official-source/Presets.cs` 和 `evidence/vroid-bridge-study-v1/tools-list.json`。

## 游戏路径与停止条件

- 先将候选与 a18a 基线按实际材质消费者逐图、逐通道读回，保留差异图和外唇区域证明。核可见变化、牙齿口腔/眼/其余脸肤保护，核骨架、绑定、UV、表情和衣物。若仅有局部贴图变化，复核 7586 的材质/UV/原图身份后可提取独立 PNG 或有来源的覆盖层。若生成额外 primitive 或存在非目标变化，记录实际依赖并停止这次贴图接入。一次预设、一次冷开导出，不改另一个 preset 追求可见差异。
- `prototype/src/native-facial-palette.js` 当前只构造 eyeColor 的部件，getState 固定 lipColor=original，且拒绝 native surfaceLayers。需按实际输出把款式登记为独立选择，保留已有颜色语义；款式 101 不等于一个颜色值。沿既有外观事务、实例私有材质及 `scripts/stage-native-iris.py` 的逐 SHA/消费者核对接入，并纳入 query/完整记录、传输依赖和预算。若脸肤主图由多个机制读写，使用单一材质合成方，核 MToon 主图与 shade 的完整替换/恢复。材质小样无需新增身体、动作控制器或重新生产鞋衣。
- 一套实际验收即可覆盖此样件：原生候选与独立装配在同镜头同表达比对，1× 张闭口、元音/微笑、持麦讲话，镜头确认口内与嘴角。外观入口原样→101→卸妆恢复，测与原生虹膜/眉色并用、坏纹理保旧；完整记录在独立游戏入口关页重开后同 ID/款式与贴图 SHA 一致。样件只覆盖男性 7586 的原生离散唇妆；各自独立色值、浓度、其他脸型以及完整 M03 仍按实际证据登记。
