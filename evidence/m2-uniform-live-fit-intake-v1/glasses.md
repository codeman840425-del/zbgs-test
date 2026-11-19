# 男女 1K 制服身体的眼镜适配来源

女性原发可用已登记女体的镜腿控制生成目标身体专用候选。男性原发可把已登记男体的同组控制作为实测起点，需单独验证其在目标男体上的站姿、坐姿与转头表现。两具目标原始身体均无现成正式眼镜条目。此次只读读取固定源码 `1239c0e2`、其八份正式镜腿配置、十份实际身体 VRM 和同一个眼镜 GLB。[完整 CPU 读数与逐供体判定](glasses.json)

| 原发、原脸静止读数 | 女性供体 → 女性 1K | 男性供体 → 男性 1K |
| --- | --- | --- |
| 身体 SHA 前缀 | `027bed60` → `1049f87a` | `62b44b03` → `2e66ee6c` |
| 眼镜依赖的两虹膜中心距离 | 两者 82.993132062 mm | 84.592343308 → 84.592347077 mm |
| 从眼平面到桥座的向前偏移 | 两者 22.988703378 mm | 26.930503823 → 26.930502272 mm |
| 眼镜整体缩放 | 两者 1.296767688 | 1.321755364 → 1.321755423 |
| 原始镜腿控制候选 | `female-temple-fit-v1` | `male-temple-fit-v1` |

女性身体的既有完整性核对固定了两个变化的图像视图（身体肤图和缩略图），其余 160 个二进制视图、138 个访问器、节点、蒙皮、材质语义和表情数据均保留。结合本次实际装载坐标，原始头骨、双眼、骨骼逆绑定、虹膜、Face、含头皮的 Body、原发索引三角形在头部局部坐标中全部精确对应。原作者耳区使用的表面也保留。另一个 bob 发型有 152 个顶点相对原发偏移超过 1 微米，最大约 63 mm，本次佩戴对照只覆盖原发。[已有女性身体与头发证据](../m2-uniform-lite-head-intake-v1/report.json)

男性的 1K 纹理派生直接源是 `cf1118a2`，该源没有已登记镜腿。它与目标身体的完整结构对应已有证据。已登记的 `62b44b03` 是另一份重导出，脸皮从一个网格图元分成两个，Body 从一个分成四个。头部及双眼局部变换、骨架节点与逆绑定均未达到精确相等。[已有男性纹理派生证据](../m2-cc0-body-release-fit-v1/report.json)

为消除图元和顶点顺序的影响，再用男性 `62b44b03` 对目标男体做逐三角几何对照。每个三角形都在另一表面寻找角点最接近的三角形，允许六种顶点排列；反向也完整计算。原发 408 个、虹膜 192 个、脸部 1,360 个、Body 7,340 个三角形，双方数量相同。双向最大角点偏差依次为 0.2433、0.2423、0.2437、0.2881 微米。这支持直接使用同一候选控制去验装，仍需在各自实际蒙皮和姿态下观察。[每类三角面的原始结果](glasses.json)

**装载与接触边界**

- 使用实际 Three GLTFLoader、VRMLoaderPlugin、VRM0 转向、身体地面偏移及产品的 `createLivePresentation`；材质只用 1×1 CPU 纹理占位。眼镜 GLB、两个原始镜腿的 36 顶点 POSITION 流、每侧四个控制环及原点桥座均与正式 profile 匹配。八份旧 profile 对两个新身体的 SHA 均被正式校验器拒绝。
- 原供体过去在站姿和坐姿的静帧中与不透明 Face、Body 都没有测到有限非共面三角穿入；原检查也记录了耳冠处镜腿明显上扬。耳根沟真实承托、动态发丝遮挡和目标身体实际戴镜仍需现场观察。新 fit 应有目标专属的 ID 和固定文件，装载后核对两侧实例几何、桥座、耳冠、头皮与发丝，再做卸下与恢复。[供体原检查](../acc01-temple-fit-v1/RESULT.md) · [集成实测](../acc01-integrated-13f558e44696/RESULT.json)

在工程根目录运行 `node evidence/m2-uniform-live-fit-intake-v1/compare-glasses.mjs`，标准输出即完整 JSON。脚本默认读取已固定的 `experiments/worktrees/live-pair-1239c0e2`；可传入相同提交且含离线依赖的检出。它仅在供体是已证纹理派生的直接父体、身体字节身份正确且所有实测头部依赖相等时标记精确复用。[复算脚本](compare-glasses.mjs)

## 两份目标专用的候选配置

运行 `python -B scripts/production/uniform_glasses_transfer.py` 会重做上述 CPU 对照，整对生成目标配置；追加 `--check` 可逐字节核对现有产物。女性配置 `uniform-1k-female-temple-fit-v1` 使用直接父体控制，男性配置 `uniform-1k-male-temple-fit-v1` 用于中性原发几何诊断。两份配置保留供体镜腿控制，其中耳冠和耳区边界是供体测量值。候选生成时均未实际佩戴。[可编辑配方](../../assets-source/uniform-glasses-transfer-v1/recipe.json) · [来源、级别与文件 SHA](../../assets-source/uniform-glasses-transfer-v1/generated/provenance.json)

固定运行时的正式 `validateTempleProfile` 已按新身体和原镜架 SHA 验过两份候选。把原供体 SHA 代回目标或替换镜架 SHA 都会被拒。运行 `python -B scripts/production/test_uniform_glasses_transfer.py -v` 可重复四组测试，覆盖男女对应、候选级别、错误后重试、已有文件冲突、盘根和目录联接拒绝。[生产脚本](../../scripts/production/uniform_glasses_transfer.py) · [回归测试](../../scripts/production/test_uniform_glasses_transfer.py)
