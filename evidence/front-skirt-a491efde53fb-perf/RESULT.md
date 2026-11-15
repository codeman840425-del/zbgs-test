# a491 两项30秒无录制成本

固定a491efde53fb；原女性、1440×900、room/UI、dynamics ON/full corrections。仅skirt-run既定2.6m/s、skirt-sit-hold；原CPU分项未改、detail=false。预热1秒与准备排除；无录像、节流、强制GC或产品改动。

|场景|帧P50ms|P95|P99|max|场景CPU P95|motion P95|garment P95|
|---|---:|---:|---:|---:|---:|---:|---:|
|skirt-run|6.10|6.70|7.00|10.30|3.00|0.90|1.10|
|skirt-sit-hold|10.40|12.30|16.50|29.80|12.00|10.60|0.00|

两项>33.34ms/>50ms均0；passed仅表示测量有效，不是普通PC达标。实际GPU RTX4090、Chrome157；navigator报告8逻辑核/32GB，不据此猜物理整机配置。

run4953帧：移动3578帧72.24%，速度>1.5为2279帧46.01%；含转弯、停步、250ms命令间隔，不是满负荷连续跑30秒。平均1.001子步/帧。坐稳2839帧全sit，平均2.010子步/帧；motion P50约9ms/P95约10.6ms仍为主成本。garment0不等于没有裙成本：坐姿手接触surface刷新在motion内部，当前未启hand-fit细计时。

0pageerror、0hidden/paused/background/非1×帧，计时覆盖/exclusive守恒通过，始末build及实际body身份一致。renderer136–138calls、约52k三角、45纹理、90geometry；JS heap非VRAM，未作长稳/泄漏证明。

Inclusive时间有重叠不可相加；exclusive只扣已包装子调用，仍非GPU完成时间。未做同窗口旧新随机A/B，不能精确归因成本变化或把旧f7报告改标。

复跑环境QA_M1_BUILD=a491efde53fb，QA_PERF_CASES=skirt-run,skirt-sit-hold，QA_PERF_SECONDS=30，QA_PERF_DETAIL=0，QA_M1_RUN_ROOT=<新目录>。运行node scripts/run-fixed-check.cjs experiments/m1-skirt-anatomical-support-v1/dist scripts/qa-m1-current-perf.cjs。独占测量，其他agent无浏览器/Blender/重编码。Chrome与临时53101server均已关闭。完整原始每帧report.json保留。
