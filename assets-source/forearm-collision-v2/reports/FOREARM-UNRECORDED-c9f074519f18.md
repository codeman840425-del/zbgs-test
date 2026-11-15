# c9 无录制房间分项：前臂求解多子步成本确认

固定构建 **c9f074519f18**，sourceDigest `c9f074519f187fb595e6211869d8c1e978a7ff2a2755db1caaa374b92f93a3cf`。身体SHA仍为 `027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95`。未修改主区或独立候选runtime、阈值、碰撞范围。无录制、无截图、无重几何探针。

## 结论

持续长帧不是录制器或close镜头独有。authored在close/room坐稳平均48.29/44.55ms；真实每帧6/5.81个simulate子步，前臂fit累计42.94/39.65ms，占update均值约89%。原先最后一个子步约7ms不能代表整帧成本。lap同样超16.7ms预算；不可为了速度恢复造成大幅跳肘的lap目标。仍不建议合入c9。

每组4秒预热、3秒穿裙站立、完整坐入、3.5秒坐稳、完整起身、2秒站立。close/lap→close/authored→room/authored→room/lap串行，各条件一次。相同1440×1080、动态关闭、full修正、1×真实时钟；同椅位同角色，无MediaRecorder。所有组开始/结束都核served/runtime/body身份，0 pageerror，最终idle且sitProgress0。

## 分段帧间隔（毫秒）

| 镜头/目标 | 阶段 | N | P50 | P95 | P99 | 最大 | >33.33ms | >50ms |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| close/lap | warmup | 460 | 9.50 | 12.10 | 13.90 | 15.30 | 0 | 0 |
| close/lap | standing-skirt | 437 | 6.20 | 10.40 | 11.50 | 15.00 | 0 | 0 |
| close/lap | sit-enter | 82 | 7.90 | 31.00 | 32.40 | 32.40 | 0 | 0 |
| close/lap | seated | 119 | 27.80 | 36.50 | 40.70 | 41.50 | 26 | 0 |
| close/lap | rise | 102 | 10.40 | 27.50 | 29.50 | 29.80 | 0 | 0 |
| close/lap | post-standing | 262 | 6.30 | 11.20 | 23.00 | 36.30 | 1 | 0 |
| close/authored | warmup | 465 | 9.20 | 12.20 | 15.30 | 18.40 | 0 | 0 |
| close/authored | standing-skirt | 339 | 8.20 | 14.50 | 18.30 | 24.60 | 0 | 0 |
| close/authored | sit-enter | 104 | 6.20 | 46.50 | 52.30 | 68.40 | 8 | 3 |
| close/authored | seated | 73 | 47.20 | 56.60 | 59.80 | 59.80 | 73 | 12 |
| close/authored | rise | 86 | 11.40 | 48.80 | 60.00 | 60.00 | 9 | 4 |
| close/authored | post-standing | 237 | 9.20 | 10.80 | 11.50 | 11.90 | 0 | 0 |
| room/authored | warmup | 394 | 10.30 | 14.00 | 21.20 | 25.80 | 0 | 0 |
| room/authored | standing-skirt | 474 | 6.10 | 9.50 | 10.80 | 14.50 | 0 | 0 |
| room/authored | sit-enter | 101 | 12.40 | 30.80 | 31.30 | 31.80 | 0 | 0 |
| room/authored | seated | 79 | 45.10 | 48.50 | 70.70 | 70.70 | 78 | 2 |
| room/authored | rise | 93 | 10.70 | 44.40 | 49.30 | 49.30 | 6 | 0 |
| room/authored | post-standing | 275 | 6.20 | 10.60 | 11.80 | 12.70 | 0 | 0 |
| room/lap | warmup | 404 | 9.90 | 13.10 | 21.70 | 31.50 | 0 | 0 |
| room/lap | standing-skirt | 359 | 8.90 | 11.80 | 15.60 | 20.40 | 0 | 0 |
| room/lap | sit-enter | 57 | 26.80 | 39.80 | 40.70 | 40.70 | 18 | 0 |
| room/lap | seated | 123 | 27.80 | 35.40 | 37.50 | 38.70 | 16 | 0 |
| room/lap | rise | 118 | 10.10 | 25.30 | 28.40 | 29.20 | 0 | 0 |
| room/lap | post-standing | 274 | 6.20 | 10.80 | 11.90 | 14.60 | 0 | 0 |

## 坐稳分项（每帧均值，毫秒）

这些计时互相包含，不能横向相加：fit⊂motion⊂simulate⊂update；render与simulate是update内的不同部分。avatar为VRM/附件更新包围值。renderSubmit只是CPU提交，不是GPU耗时。

| 镜头/目标 | 实际子步 | 帧间隔 | simulate | motion | fit全部子步 | fit最后子步 | avatar | garment | render提交 | 轻采样 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| close/lap | 4.218 | 29.487 | 28.308 | 26.786 | 25.471 | 5.972 | 1.207 | 0.003 | 0.850 | 0.004 |
| close/authored | 6.000 | 48.290 | 47.063 | 44.742 | 42.937 | 6.975 | 1.818 | 0.003 | 0.874 | 0.001 |
| room/authored | 5.810 | 44.547 | 43.433 | 41.333 | 39.647 | 6.728 | 1.647 | 0.010 | 0.942 | 0.010 |
| room/lap | 4.130 | 28.733 | 27.579 | 26.114 | 24.911 | 6.082 | 1.183 | 0.002 | 0.811 | 0.006 |

## 仪器与边界

- 包装Phaser实际调用的 `scene.sys.sceneUpdate`、`simulate`、motion.update、avatar.update、updateGarment和renderer.render，仅计时、透传原调用。没有改变dt、调用次数或动作。第一轮误包scene.update被Phaser缓存绕过，断言失败、finally关闭；未生成通过报告，随后改为实际入口。
- 使用现有getMetrics返回值获取最终handContacts。每simulate取左右累计fitElapsedMs的最大值；跨实际子步才相加。未把左右两个累计值直接相加。
- 每个阶段包含真实边界第一帧，没有按好看数据裁尾；控制轮询会有轻微阶段标签延迟。warmup与持续区间分开，空首间隔不进分位数。记录帧内真实子步数。
- 轻采样字段含计时汇总和帧记录的可测部分；包装调用固定开销/计时器分辨率未单独扣除，不能声称仪器零成本。没有每rAF复制完整snapshot/iterationTrace。
- Chrome157、ANGLE NVIDIA RTX4090 D3D11；系统CPU名称AMD Ryzen9 9950X3D（当前环境暴露8核8线程），浏览器hardwareConcurrency8/deviceMemory32。开发机结果，不是普通电脑或手机实机通过。动态关闭与上一录屏保持一致，garment接近0不代表开动态裙成本为0。

## 解释与一个局部修复建议

代码 `ceil(min(elapsedMs/1000,.05)*120)` 使长帧进入最多6个子步。authored单步fit约6.7–7ms已接近8.33ms步长，连同其他更新会推动下一帧继续多子步；实测坐稳每帧39–43ms属于这一重复CPU开销。close与room均复现，不宜通过缩小人物/镜头作为修复。此测试定位到fit整体，没有细分其skin/grid/rail/alpha内部，因此不能声称其中某一子函数占多少。

建议下一独立候选仅优化fit的数据准备/分配：预建不可变衣物index/UV及rail连接结构，复用Vector/投影数组和候选stamp缓冲，替换每子步、每臂、每轮创建的Map/Set/小数组；每子步仍刷新真实顶点/方向并执行同样80rails、5点alpha、5轮上限与最终残差复查。**不缓存碰撞结论、不重用过期姿态、不降低子步或碰撞范围**。这是一项尚未实施的局部建议，实际收益需数值等价与固定腰/手腿及同条件成本回归，不能提前称已优化。若收益不足，再依据内部profile选择其他方案。

## 复现与证据

```powershell
$env:QA_M1_BUILD='c9f074519f18'
$env:QA_M1_ASSET_SHA='027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'
node scripts/run-fixed-check.cjs F:/gamemake-forearm-patch/prototype/dist assets-source/forearm-collision-v2/scripts/qa-unrecorded-perf.cjs
```

输出拒绝覆盖已有summary。完整帧数据及每阶段全分项P50/P95/P99已归档至 `evidence/unrecorded-perf/`。本轮结束浏览器与临时server已关闭，窗口交还root。历史录屏报告保留，其“需无录制复测”已由本报告补充，历史数字不改写。
