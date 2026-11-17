# Native glasses fit v1 independent review

状态：**接触缺陷，待正常速度近景视觉分级**。本次只读复核没有修改 runtime、源 GLB、输入捕获或生成 profile，也没有启动 GPU/Studio。`glassesFit=legacy` 只作为原眼镜测量输入，没有计为运行通过。

## 复核对象

- 生成器 [scripts/build-native-glasses-fit.py](../../scripts/build-native-glasses-fit.py)，源 GLB [prototype/public/assets/m1c/studio-glasses-v1.glb](../../prototype/public/assets/m1c/studio-glasses-v1.glb)，运行坐标 helper [prototype/src/glasses-temple-fit.js](../../prototype/src/glasses-temple-fit.js)。
- 固定 987 的四个身体输入和 stand/sit 两个姿态，共 8 个捕获。输入、profile、身体 SHA 与 accessory SHA 记录在 [report.json](report.json)。
- 四个 profile 均为两镜腿、每镜腿 36 点、四环各 9 点。索引 0..35 无重不漏，源 ring position SHA 与生成 manifest 一致。耳区均使用脚本中限定的 `local x*sign > .072` 且 `z < -.065` 选择，并保存 crest/bounds。该区域选择内部一致，但仍只是 VRoid 源系列边界，不代表任意耳型或耳根沟。

## 可重建与冲突保护

在临时目录重新运行生成器得到四个 profile 和 manifest，全部字节及 SHA 与冻结 generated 目录相同。直接对冻结目录重跑返回 0，所有 JSON mtime 保持不变。复制后篡改一个 profile 再运行返回 1，并报 `Conflicting output`，所以重复生成不会覆盖冲突产物。

## 具体阻断错误

对每个捕获，先将 Face+Body skin 三角按 `glassesMatrix` 逆变换到附件局部坐标，再按 profile 四环变形 Temple 网格，最后运行跟踪的有限非共面三角线段检查。该检查是静态 CPU 检查，**不是 CCD，也不是视觉验收**。

| 身体 | 姿态 | Temple-1 交叉 | Temple1 交叉 | 镜框/铰链/鼻桥 |
|---|---|---:|---:|---:|
| native-female-843ac-v1 | stand/sit | 8，每侧总线段约 2.789 mm | 8，约 2.815 mm | 0 |
| native-female-face-v1 | stand/sit | 8，每侧总线段约 2.789 mm | 8，约 2.815 mm | 0 |
| native-female-waist-v1 | stand/sit | 8，每侧总线段约 2.789 mm | 8，约 2.815 mm | 0 |
| native-male-7586-v1 | stand/sit | 8，约 0.573 mm | 10，约 0.603 mm | 0 |

女性单个交叉线段最大约 0.641–0.678 mm，男性约 0.115–0.183 mm，均有严格双平面穿越。交叉集中在耳冠附近。最近皮肤距离约 0.34–0.45 mm（女性）和 0.45 mm（男性），耳区三角采样最近约 0.57 mm（女性）和 0.70 mm（男性），这些距离不能抵销已发现的三角穿越。

根因是 LP 只对每段中心线的横向 x 值加余量，四环 9 点截面仍会穿入真实皮肤。当前 profile 不能称为 zero-contact，记录为接触缺陷候选。项目当前观感尺度允许动作连贯时的轻微穿插，严重度须由正常速度近景浏览器画面分级。保留当前 profile 供 root 的候选录屏与视觉检查，不据此单独否定眼镜可用性。

## 证据边界

- 这次没有检查发型遮挡、鼻梁视觉自然度、镜腿支撑力、真实连续动作或普通电脑性能。
- 结论限于固定 987 的四个身体和 stand/sit 捕获，不外推到任意头型。
- 完整数据、哈希、每个 mesh 的交叉样本和输入身份见 [report.json](report.json)。
