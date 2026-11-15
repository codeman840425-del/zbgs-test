# 工作缓冲第一轮 ad0e99：几何严格等价，有收益但仍未达性能目标

候选 `ad0e99f456ee`，相对 `c9f074519f18` 仅复用拓扑/UV/工作缓冲，不跳过skin或降低接触频率。仍是独立实验，没有合主。c9固定dist备份、旧片保持。

## 实际接触与等价

相同房间/角色/椅位，lap及authored分别270步完整站→坐→起身。真实身体顶点、固定腰点、逐轮handContacts、root共4,704,838个数值与c9 **严格相同，最大差0**，结构无差异。0pageerror，均到sitProgress1后回0。固定腰环与真实手腿三角交叉均0；这不是整个动态衣物无穿插。authored最终投影残差仍4.888mm、30Hz最大肘移43.123mm，与原候选一致；lap仍137.011mm旧跳肘，不能为了速度恢复lap目标。

## 无录制实际房间性能

1440×1080、Chrome157、RTX4090开发机、女性裙装、关闭动态、full修正、1×，每组4秒预热/3秒站立/完整坐入/3.5秒坐稳/完整起身/2秒站立。与c9同脚本，同计时边界，均各一次。P50/P95/P99及阶段全分项在evidence/perf-*.json。

| 模式 | c9坐稳平均 | 新平均 | 新P50 / P95 / P99 | 新最大 | >33ms | 全部fit均值 c9→新 | 最后子步fit c9→新 |
|---|---:|---:|---|---:|---|---|---|
| close/lap | 29.49 | 11.38 | 11.10 / 13.60 / 16.60 | 20.10 | 0/309 | 25.47→9.17 | 5.97→4.56 |
| close/authored | 48.29 | 15.10 | 13.30 / 20.00 / 22.10 | 25.00 | 0/233 | 42.94→12.73 | 6.98→5.34 |
| room/authored | 44.55 | 20.31 | 19.20 / 30.00 / 47.50 | 54.40 | 5/173 | 39.65→16.85 | 6.73→5.52 |
| room/lap | 28.73 | 14.72 | 12.30 / 26.90 / 35.30 | 40.50 | 3/238 | 24.91→11.66 | 6.08→4.80 |

毫秒；fit⊂motion⊂simulate⊂update，不能横向相加。authored单步fit下降约23–24%，但子步数量从6/5.81降至2.39/3.05，累计帧成本进一步下降。CPU渲染提交仍<1ms均值；不是缩小角色/删除碰撞造成收益。room/authored仍P9530ms、1帧>50ms，**未达持续60fps/普通电脑目标**。room两组比close尾延迟高，单次顺序样本不足以归因镜头；不挑低值宣称通过。

## 正常速证据与观感范围

原始1×同镜头连续视频在 `../media/ad0e99-authored.webm` 与 `../media/ad0e99-lap.webm`，每段完整坐起约6.2秒；已保存逐帧trace与录像独立耗时，0pageerror。录像坐稳authored均18.28/P9524.2ms，lap11.36/P9512.2ms；录制和无录制分开，均非稳定60fps。

本代理审看全程4fps顺序解码全部6张图：authored中手臂顺随前倾、屈肘落手；lap坐下约1.5–1.75秒仍有近伸直到外折的突变，符合未更改其目标规则。裙坐稳硬折仍明显；没有把候选写成裙形修复。**本次仅采样帧审看，不等于完整正常速度连续自然度验收**，原片供root/用户实际观看。

首次补片在收尾取全局__forearmVideo时ReferenceError，未输出有效视频，浏览器finally已关闭。原因未确定；root确认无其他测试Chrome操作。仅重试一次并加入navigation/pageerror/crash诊断，重试成功，日志仅两页各自初次navigation；不把失败解释成产品自动重载，也不删除失败记录。

## 可合差异与下一步判断

`from-c9.patch`是局部补丁，helper源及Node等价输入均在本目录，可重复执行。不能整文件覆盖主线较新的转身/招手实现。收益证明本轮有价值，但不能将完整c9候选自动合主：真实衣物包络有限、男性未执行此层、普通PC未测、动态裙与日常完整动作未重验，仍需root整合决策与受影响回归。

有依据的第二轮应先在独立fit内部加极少计时，拆skin准备、grid构建、rail/alpha窄相和诊断分配；现总fit剩约5.3–5.5ms，当前数据不能判定哪个内部步骤占主导。之后只优化最大一项，保持同轨迹与接触结果。可选方向是缓存每次grid构建的三角投影系数/保持运算顺序，或复用诊断容器，但必须严格等价再测，不能用减少80rails/alpha取样/子步换性能。**尚未实施第二轮，无新增runtime修改。**

## 验证流程入口

```powershell
$env:QA_M1_BUILD='ad0e99f456ee'
$env:QA_M1_ASSET_SHA='027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'
$env:QA_FOREARM_TARGET_COMPARE='1'
node scripts/run-fixed-check.cjs F:/gamemake-forearm-patch/prototype/dist assets-source/forearm-collision-v2/scripts/qa-forearm-runtime.cjs
python assets-source/forearm-collision-v2/scripts/compare-workspace-runtime.py F:/gamemake-forearm-patch/output/playwright/forearm-c9f074519f18 output/playwright/forearm-ad0e99f456ee
node scripts/run-fixed-check.cjs F:/gamemake-forearm-patch/prototype/dist assets-source/forearm-collision-v2/scripts/qa-unrecorded-perf.cjs
```

已有输出拒绝覆盖；复测应使用独立输出标签/新构建。完整2×46MB几何捕获在output，未复制进Git包；其SHA、全部逐步几何分析和严格等价报告已归档。固定构建/源资料与运行测试入口分开，临时server随测试关闭。浏览器窗口已归还root。
