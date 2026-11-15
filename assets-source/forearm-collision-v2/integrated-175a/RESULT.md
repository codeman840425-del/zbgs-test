# 集成候选 175a487d5ea3：受影响路径回归

固定目录 `experiments/m1-integrated-contact-1/dist`；完整 source digest 为 `175a487d5ea37afa9e2da8176ffccc1cfa92f9b87434a0f6126151eae25e4d2a`。本轮只测试已集成的前臂接触缓存及男性坐起退化，没有修改产品代码。浏览器和临时服务已关闭。

## 实际几何等价

女性原完整基模，lap/authored 两组各 270 个真实房间姿势，与独立 `4ee3891f1981` 比较：4,704,838 个数值最大差 **0**、结构差 **0**、pageerror **0**。包括真实蒙皮身体顶点、固定腰环、根位置和每轮手接触记录；仅计时字段不参与比较。

这是本轮直接的 175→4ee 比较。4ee→c9 的零差比较使用已归档证据，没有本轮重跑 c9。它证明相同输入下几何结果未变，不等于重新通过正常速度观感验收；有限 80 条轮廓轨也不是连续碰撞或完美包络证明。

## 无录制实际房间性能

Chrome 157、1440×1080、room 镜头、女性裙装、authored、full corrections、**动态关闭**、真实 1× 时钟、无录制、内部细分计时关闭。硬件浏览器报告 RTX 4090；这是开发机短样本，不是普通电脑达标证据。renderSubmit 仅 CPU 提交，不是 GPU 帧耗时。

|阶段|有效帧|平均 ms|P95 ms|P99 ms|最大 ms|
|---|---:|---:|---:|---:|---:|
|预热|658|6.076|6.3|6.8|9.5|
|站立裙|496|6.067|6.3|6.7|7.2|
|坐入|191|6.734|9.7|11.9|11.9|
|坐稳|379|9.256|11.0|12.9|21.0|
|起身|204|6.387|9.4|9.9|10.5|
|起身后站立|332|6.067|6.3|6.5|8.2|

坐稳 P50 9.4ms，1 帧超过 16.667ms，0 帧超过 33.334ms。每帧实际子步平均 1.887、最多 3；simulate 平均 8.409ms，motion 7.764ms，最后子步 fit 3.831ms，全部真实子步 fit 合计 7.213ms，avatar 0.507ms，renderSubmit 0.558ms，轻采样 0.0011ms。fit 使用左右累计计时的最大值，未将左右累计值相加。未以本轮短样本宣称跨设备或所有场景总体提速。

## 男性长裤 / 短裤坐起

完整男性基模 SHA `62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff`，默认椅，outfit 0/2。两组均坐稳后起身回 idle，0 timeout、0 pageerror；120Hz 模拟，30Hz 检查真实可见 indexed 蒙皮顶点与椅子局部盒，采样到的顶点入盒数量均 0。此方法不能排除面穿过盒而没有顶点进入，也不是连续扫掠检测。

坐稳裤装最低骨盆区域距座面：长裤 **1.004mm**、短裤主裤网格 **1.004mm**；身体 **15.373mm**。鞋底最低 y：左 **−0.112mm**、右 **−0.584mm**，如实保留未改阈值。两张坐稳图已查看：腿、鞋、椅完整可见，没有明显坐面穿入；短裤露膝/小腿，原材质深色褶皱仍可见。仅静态图判断，未据此宣布整段动作自然。

男性 profile 虽成功加载，但 `seatHandRadii:null`，handContacts 全程 0，符合当前校准层早退。这是未发生坐起退化的检查，**不是男性前臂接触层已验证**。

## 范围与复跑

未测：此构建的新正常速度完整观感片、动态开启、移动/旋转椅、双实例、jaw/waisthip 派生体型及普通目标电脑。派生 profile 不继承校准，但默认 authored wrist 仍改变其坐姿目标，不能继承本报告通过。

从仓库根目录运行（PowerShell）：

```powershell
$env:QA_M1_BUILD='175a487d5ea3'
$env:QA_M1_ASSET_SHA='027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'
$env:QA_FOREARM_TARGET_COMPARE='1'
node scripts/run-fixed-check.cjs experiments/m1-integrated-contact-1/dist assets-source/forearm-collision-v2/scripts/qa-forearm-runtime.cjs
python assets-source/forearm-collision-v2/scripts/compare-workspace-runtime.py output/playwright/forearm-4ee3891f1981 output/playwright/forearm-175a487d5ea3
$env:QA_FOREARM_PROFILE='0'
$env:QA_FOREARM_CASES='[["room","authored"]]'
node scripts/run-fixed-check.cjs experiments/m1-integrated-contact-1/dist assets-source/forearm-collision-v2/scripts/qa-unrecorded-perf.cjs
$env:QA_M1_ASSET_ID='beta-base-male-m1b'
$env:QA_M1_ASSET_SHA='62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff'
node scripts/run-fixed-check.cjs experiments/m1-integrated-contact-1/dist assets-source/forearm-collision-v2/scripts/qa-integrated-male-seat.cjs
```

脚本拒绝覆盖已有证据；复跑前将旧输出完整移入明确标注的归档目录。小证据归档于本目录；两份约 46MB 的女性完整几何留在 `output/playwright/forearm-175a487d5ea3/`，哈希见 `full-output-hashes.json`。
