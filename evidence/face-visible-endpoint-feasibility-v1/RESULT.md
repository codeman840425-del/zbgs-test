# 现有五官端点扩大：一次离线可行性检查

> 后续授权已实际完成嘴部新源：`assets-source/mouth-visible-v2/README.md`。该包采用一次固定 24 mm 过渡与断开口腔组件保护，不能与本报告的旧 8 mm 算子纯数组结果混同。以下其余域仍仅可行性检查；计划目录名以实际 mouth-visible-v2 为准。

建议先制作原男女嘴宽 **−12% / +12%** 的独立源候选，替代当前 ±4% 的过小观看差异；不能直接把旧 UI 上限扩大并宣称通过。已运行的纯数组检查表明拓扑仍可生成，但男 +12% 的 Joy 局部压缩明显，必须在新源导出后看讲话/笑容。眉 +3 mm、鼻尖 +2 mm、眼裂 +5% 可作为后续各域的单一候选幅度，不代表已经制作或获准范围。

本目录只含计算与方案，未运行 Blender、浏览器或 GPU，未产生可加载新 VRM/recipe，未修改旧源、runtime/public 或身份门。没有扫描多个幅度。全部结论只适用原女性/男性，不能继承给 jaw/waist 等派生。

## 实际运行与边界

在仓库根执行 `python evidence/face-visible-endpoint-feasibility-v1/check.py`，成功退出。读取原 VRM、四域冻结 recipe；每个输入按 recipe 的真实 baseAvatar SHA 核对。检查女性 Basis + 56、男性 Basis + 54 个绝对 shape，逐形态比较几何，不等于任意表情叠加或实际渲染验证。`report.json` 保存每个 shape、来源与脚本 SHA；`manifest.json` 补记工具及依赖。

| 本轮唯一候选 | 女性实际结果 | 男性实际结果 | 制作/观看重点 |
|---|---|---|---|
| 嘴宽 −12% | 中性口环 24.931→21.939 mm；410 点，最大 2.796 mm；全形态边比 .728–1.584 | 40.800→35.904 mm；410 点，最大 3.346 mm；边比 .773–1.643 | 口环变窄，同时口腔材质按固定仿射联动；需看牙齿、张嘴、笑容比例 |
| 嘴宽 +12% | 口环→27.923 mm；边比 .468–1.325；最大三角法向变化 26.06° | 口环→45.696 mm；边比 .461–1.355；最大法向变化 **85.26°（ALL_Joy）** | 旧 8 mm 皮肤衰减域在更大幅度下产生强局部压缩；女最小边比在 ALL_Fun。不能由“无翻面”推断自然 |
| 眉高 +3 mm / 每侧向外 +3 mm（组合端点） | 110 点刚性平移，最大 4.243 mm；稀疏 alpha 样点前向离皮最大 **3.082→5.325 mm** | 110 点，最大 4.243 mm；离皮最大 3.469→3.491 mm | 女眉有离面风险；这是两个参数同时到端点，不是分别滑动已验 |
| 鼻尖 +2 mm | 原 9 点域；边比 1–1.265；法向变化 11.07° | 原 7 点域；边比 .997–1.258；法向变化 8.82° | 仅鼻尖前突，不是鼻高/鼻宽；需侧面及眼镜碰撞观看 |
| 眼裂宽 +5% | 632 点；最大 2.452 mm；边比 .834–1.118；法向变化 31.98° | 630 点；最大 2.634 mm；边比 .838–1.129；法向变化 46.84° | 最大法向变化在 EYE_Close；半闭、单眼、注视和透明边根仍须真实渲染 |

以上 10 个案例在对应原 shape 对照下均无新增退化三角、无新增法向反转；边比是候选边长/原 shape 边长，不是验收阈值。女性/男性嘴宽全 shape 口缝距离均为 0。最大位移表列 Basis，嘴宽的任意 shape 最大位移女 4.410 mm、男 4.898 mm。

眉部 alpha 正面筛查仅 96/98 点，原/候选位于 Skin 后的样点均为 0，不能排除侧面悬浮。眼 +5% 的 Skin–White 配对缝全 shape 为 0；虹膜/高光点所有 shape 位移为 0。全闭眼固定 alpha 样点（女虹膜 1309/高光 61，男 1353/45）原/新均无透射率大于 .5 的可见点。没有改变 Eye pivot，也没有通过缩放虹膜冒充眼形；这些 CPU 射线不覆盖真实注视、半闭、单眼、shader 光照、当前 eye-only Joy 补偿与组合表情。

## 最小可复用源制作路径

现有生成器可复用计算与验收，但 `BASE`、部分 ID/幅度/报告字段被固定，**不能直接向旧生成器传 `--out` 就得到新幅度**。应复制少量相关脚本到新隔离目录，保留原底 SHA，改 package/ID/spec，而不是覆盖旧 recipe 或伪造新 base SHA。

1. **优先嘴宽一组。** 新建（尚未创建）`assets-source/face-mouth-visible-v1`、`scripts/face-mouth-visible-v1`。复用 `scripts/face-parameters-v1/build.py` 的原男女口环识别、32 对口缝、8 mm 测地衰减和固定每点仿射；spec factors 改为 `[0.88,1.12]`，新 ID。原底重新打开，每个 absolute shape 用同一 `A_i` 变换，relative POSITION delta 应为 `A_i × oldDelta`，不能沿用“所有 delta 不变”的平移公式。整个 FaceMouth 材质包含口腔结构并联动，避免仅拉外唇产生接缝；这也意味着牙齿横向形状会变，必须实际看，不宣称保持牙齿尺寸。若笑容压缩不可接受，停在此明确失败，下一次应调整口周衰减域/保护牙齿的源方法，而非连续试滑条幅度或放宽几何门。
2. **眉。** 复用 `scripts/face-brow-parameters-v1`，独立新包如 `face-brow-visible-v1`。现 `heightVectors/spacingVectors` 以米为参数，拟 .003/.003；当前 builder 的 `height1-spacing1` ID 也须改。每侧 A=I 的平移可保原 shape delta，不能据此保证贴皮。女端点需侧视；如果需贴合额头，必须作为显式源表面适配及重新形态检查，不能偷偷改变旧平移 recipe。本轮没有实现贴面修正。
3. **鼻。** 复用 `scripts/face-nose-parameters-v1` 至独立 `face-nose-visible-v1`，spec 前突 .002、新 sample ID。初始仍用已核地标与 8 mm 测地半径/2 mm 平台，真实域女 9/男 7 点；Basis 与 absolute shape 同点平移使 POSITION delta 不变，但位移梯度会改变法线。眼/口/眉/头颈/Body/骨/UV/权重仍需逐项不变证据，眼镜需新端点检查。
4. **眼。** 复用 `scripts/face-eye-sample-v1` 至独立 `face-eye-visible-v1`。必须重新生成固定 `xScale/centerX`（目标 1.05），并修改 selection、build 中固定 1.01 的字段/报告；未编辑点仍规范为 scale=1、center=0。保持 Eye pivot/眼角中点及虹膜/高光不动，联动原 Head-bound Skin/White/Eyeline/Eyelash，保持全 shape 仿射语义，不能把原 blink 差分原样加回已缩放绝对 shape。与当前 mouth/nose 的顶点和法线邻域交集重新核对，不假定可叠加。

所有域均需独立 raw/final 身份、每个绝对 shape 独立重算法线，再由 final normal 减 Basis normal 得到 morph NORMAL；不能复制旧法线或把原导出缺少 NORMAL target 写成已保正确。可复用 `scripts/face-nose-parameters-v1`、`scripts/face-eye-sample-v1` 以及较新的 `scripts/m2-male-jaw-mouth-v1/{finalize.py,normal_core.py,audit.py,check-rebuild.py}` 工作流，移植时改输入/shape pin 与多端点遍历。原嘴生成器的原生导出本身不是最终法线整理流程。

## 工具、命令与准入顺序

现成工具为 Blender 4.5.9、VRM addon 4.10.5；无需下载/安装。以下是**待创建新脚本后的计划命令，尚未执行**，不能直接认为目录已存在。新生成器须提供这些接口并拒绝覆盖既有输出：

```powershell
& 'F:/gamemake/experiments/tools/blender-4.5.9-windows-x64/blender.exe' --background --factory-startup --disable-autoexec --threads 2 --python-exit-code 1 --python scripts/face-mouth-visible-v1/build.py -- --out generated
python scripts/face-mouth-visible-v1/finalize.py --out generated
python scripts/face-mouth-visible-v1/audit.py --out generated
& 'F:/gamemake/experiments/tools/blender-4.5.9-windows-x64/blender.exe' --background --factory-startup --disable-autoexec --threads 2 --python-exit-code 1 --python scripts/face-mouth-visible-v1/build.py -- --out fresh-check
python scripts/face-mouth-visible-v1/finalize.py --out fresh-check
python scripts/face-mouth-visible-v1/check-rebuild.py
python scripts/face-mouth-visible-v1/manifest.py
```

每一端点保存 editable.blend、原源映射、shape 全名/材质/primitive/index/position/UV/权重身份、raw/final VRM 与 SHA、两次独立导出、从原底 fresh 重生成；将原源不可变、Body/骨/眼 pivot 不变作为硬门。新 runtime recipe 以真实原底及新产物身份准入，并记录单端点/实证范围，不能只放大旧 bounds。

源门后，按原/新同 camera、同光照、同表达做静态正面/侧面，以及正常讲话/笑容/闭眼/单眼/半闭/注视。嘴 +12% 男 Joy 是优先失败观察点；眼部必须复验当前 eye-only Joy 兼容处理。组合端点未实测前只声明各自来源检查，不升级组合通过。普通机性能、衣库、完整捏人均不在本次范围。

原底精确路径与 SHA 已在 `report.json` 的 dependencies 及 `assets-source/face-parameters-v1/spec.json`；本报告不改变封存裙/舞、派生身体或已交付端点。
