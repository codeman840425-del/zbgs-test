# 新轴向源的运行表情接缝：只读结论

**54 个单目标端点通过不能替代实际混合通过。** 当前运行还会把 happy、双眼 blink、一个元音叠加，并在四类材质上加入负 EYE_Joy。新 VRM SHA 必须有自己的源配置和补偿准入证据；不能用原 male SHA 或旧派生 profile 代替。此包未运行组合、导出或修改 runtime。

## 已核调用与映射

- [live-presentation.js:134](F:/gamemake/prototype/src/live-presentation.js:134)：每帧先清 `happy/aa/ih/ou/ee/oh/blink`，happy preset 写 `.65`；讲话每 `.27 s` 轮换 `aa,ih,ou,ee,oh`，当前元音为 `.66*sin²(π phase)`。非讲话 aa preset 是 `.65`。blink 每 `3.6 s` 的前 `.18 s` 取 `sin(π phase)`。它是程序元音演示，不是音频口型。
- [foundation-avatar.js:321](F:/gamemake/prototype/src/foundation-avatar.js:321)：`livePresentation.preUpdate → vrm.update → matrix update → postUpdate`。补偿在 live 第 144 行更新；权重取 expression 当前 `outputWeight`，不是上帧读回（本地 three-vrm getter 在 module 第 116 行直接返回非 binary weight）。暂停 `dt=0` 应保持时钟和权重、无累加。
- 原 male VRM SHA `62b44b…b35ff` 的 mesh 1 有 54 targets；下表直接由原 GLB 读取。VRM0 别名转换见 [three-vrm-core.module.js:1025](F:/gamemake/prototype/node_modules/@pixiv/three-vrm-core/lib/three-vrm-core.module.js:1025)，原 bind weight 100 转成 1（第 958 行），均非 binary。

| 运行名称 | VRM0 preset | 原目标 / index |
|---|---|---|
| happy | joy | ALL_Joy / 4 |
| blink | blink | EYE_Close / 11 |
| aa / ih / ou / ee / oh | a / i / u / e / o | MTH_A/I/U/E/O / 28/29/30/31/32 |
| 补偿专用 lane | 无原 preset 占用 | EYE_Joy / 15 |

导出后须核真实文件仍为这些唯一名字、索引和 VRM bind，不能只信 targetCount=54。

## 负 EYE_Joy 与身份门

[eye-blink-compatibility.js:69](F:/gamemake/prototype/src/eye-blink-compatibility.js:69) 注册实例私有 expression，以 bind weight **−1** 指向原 EYE_Joy。第 76–80 行取 `c=clamp(happy)*clamp(blink)`；所以 corrected primitive 的该 lane 最终贡献 **−h*b**，不是向 manager 写负权重。

四类 corrected：Face_SKIN、EyeWhite、Eyeline、Eyelash；五类 protected：Mouth、Brow、Iris、Highlight、EyeExtra（第 16–17 行）。这是**运行补偿角色**，不要与离线 G 的固定/随动角色混同：例如 EyeWhite 在 G 中固定，却仍参与原运行表情；EyeExtra 可随 G 适配，但不接受这个负补偿。没有 iris 骨移动需求。

在新 baked source 上，实际位置应按材质验证：

```
P′ + h D′ALL_Joy + b D′EYE_Close + v D′vowel
   − h*b D′EYE_Joy      // 仅四类 corrected
D′j = G(P+Dj) − G(P)
```

非线性 G 一般不与此混合交换；既有 55 状态没有覆盖这类正负权重组合。尤其不能把 `G(原混合位置)` 当成运行实际混合的标准答案。

[eye-blink-compatibility.js:8](F:/gamemake/prototype/src/eye-blink-compatibility.js:8) 的 Map 以**精确 avatarSha256** 准入。未知 SHA 在第 31 行失败，但被第 72 行捕获为 `available=false/reason`；角色加载本身未必失败。因此新样件必须显式检查 `available=true`、`mode=fixed`、正确 SHA、54 targets、各材质私有 influences、所有原 binds/override 与 EYE_Joy lane 无占用。只看到人物出现不是补偿通过。单眼 blinkLeft/Right 在第 77–79 行明确 skipped，不得扩称单眼组合已覆盖。

旧 [publish-representative-eye-compatibility.py:54](F:/gamemake/scripts/publish-representative-eye-compatibility.py:54) 的派生准入依据是四 corrected 材质的 EYE_Joy/EYE_Close **逐字节等同原源**，另核 VRM bindings。新轴向 delta 是否仍相同必须在实际导出后核，不能预设；若不同，不能放宽旧发布脚本然后冒称原等同证明。应保留旧名单/证据，为新 SHA 单独记录这次真实组合核查后再登记。

源身份最小差异：新 `id/url/sha256` 的 foundation entry，`referenceBody:'male'` 只选择共用男性行为/适配分支，不替代精确身份；factory 在 [foundation-avatar.js:97](F:/gamemake/prototype/src/foundation-avatar.js:97) 检查实际字节 SHA，并在第 184 行把该 SHA 传入 live。补偿登记是另一道独立门。相关装备/附属配方仍按自身 SHA 合同，不能因 referenceBody 相同借用兼容身份；本包不批准这些依赖。现 v2 runtime index 的两失败项仍保未发布（[representative-batch.js:12](F:/gamemake/prototype/src/representative-batch.js:12)），新头部样件不能改标成原完整 body preset 通过。

## 最少后续检查：复用已有链

每个实际新源先用真实 GLTFLoader/three-vrm/foundation 链做 **10 个有界静态状态**：neutral；happy=.65 睁眼；neutral+blink=1；happy=.65+blink=.5；happy=.65+blink=1；再分别叠加五个元音各 `.66`（happy=.65、blink=1）。这是通过真实 manager 注入的边界组合，不宣称自然时钟会让各峰值同时到达；不是穷举连续权重域。

对有 h*b 的状态做同姿 legacy/fixed 对照：只四类材质的 EYE_Joy influence 改为 −h*b，其余原 lanes 保留；五类 protected 的实际位置/混合法线不因切补偿而变；新源自身 geometry/morph buffers 不被补偿修改。观察闭眼眼白覆盖、眼角/睫毛、笑嘴及五元音口内。再保一个 `dt=0` 重复、两个实例隔离、dispose/recreate 清 lane、未知 SHA 拒绝补偿、单眼 skipped 检查。原 source 本来被 G 修改，不拿新源与旧源几何相同作验收。

可复用 [qa-eye-blink-compatibility.mjs:30](F:/gamemake/scripts/qa-eye-blink-compatibility.mjs:30) 的真实 CPU harness。须另做有界新源入口/输出参数，不能原样运行其旧 bodyType 列表，或继承第 29 行“派生 EyeJoy 与原家族相同”以及旧四域配方可用假设。CPU texture/renderer 是替身，不能称 GPU 通过。

游戏侧复用固定 **4196** 工作台的 face framing、同镜头 legacy/fixed 和正常 **1× happy+speaking 约 11.2 秒**片段，确认至少三次近闭 blink、五元音实际 trace、回 neutral 后 happy/元音/补偿归零。入口与 trace 可复用 [qa-eye-blink-compatibility.cjs:16](F:/gamemake/scripts/qa-eye-blink-compatibility.cjs:16)；它调用的共用 core 默认旧 4277，必须显式传当前 `--url http://127.0.0.1:4196/` 与固定 `--build`。其 `q.IDS/source()` 仍绑旧男女样件，需给本有界检查绑定实际新 asset ID/SHA，不能仅改 URL 后声称已测新源。不能新开常驻验证平台或沿用旧 BUILD。原静态前/45°镜头证据及 1×录像方法可复用，旧录像不能重标新源。

已有 [check-composition.py:22](F:/gamemake/scripts/face-eye-visible-v2/check-composition.py:22) 提供历史 `.65/.999/.512` 正负组合的数组参照；它只验证旧四域操作与原源，不能原样拿来证明新 G 的交换性。历史 runtime 证据在 `evidence/eye-blink-runtime-084c61578262/`，不需新架构。

本报告为接入/检查边界，不是上述新源检查已执行。现有严格 55 单目标检查与这些少量混合/运行检查互补；source/export、完整身体、附件适配及最终游戏准入保持各自状态。
