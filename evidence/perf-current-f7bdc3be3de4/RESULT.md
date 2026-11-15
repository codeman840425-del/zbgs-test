# 当前固定版开发机成本 · f7bdc3be3de4

Chrome 157.0.8103.51，1440×900，RTX4090开发机；每项30秒，无录屏、无CPU限速。原始帧保存在可无损解压的report.json.gz，summary.json记录SHA。采样阶段全部前台、1倍速、非暂停，测量检查通过，不等于视觉或目标设备通过。

| 场景 | 场景CPU P95 | 帧间隔P95 | 最大帧间隔 |
| --- | ---: | ---: | ---: |
| 基础人体行走 | 1.8ms | 6.3ms | 12.9ms |
| 裤装行走 | 1.7ms | 6.3ms | 10.2ms |
| 裙装坐稳 | 11.0ms | 11.3ms | 29.8ms |
| 男女双实例裤装行走 | 2.4ms | 6.2ms | 14.3ms |

每项没有>33.34ms帧，但裙装坐稳CPU仍超过暂定8ms场景预留预算。显示器/浏览器刷新节奏不是60fps固定测试；不能据这些数字宣布普通电脑通过。各移动场景包含路径到点/换向/250ms检查间隙，运动占比在summary，不是30秒全稳态行走。

进一步30秒分项诊断见../perf-skirt-detail-f7bdc3be3de4/summary.json。该次加入计时，场景CPU P95 12.1ms；motion累计P95 10.8ms，其中seatHandSurfaces（同步raw骨架并准备实际裙面）P95 2.6ms，剔除此嵌套后的motion P95 8.4ms。最后模拟子步的手接触total P95 5.0ms，railAlpha部分3.2ms；这些是重叠区段/最后子步，不能相加当整帧总成本。部分渲染帧含两个固定模拟步。

最终updateGarment统计接近0，是同一步裙面已为手部接触计算、后续调用被复用；不是服装不耗时。现有性能瓶颈至少包括手臂/手掌与裙面接触查询，不能仅归责布料动态，更不能通过取消接触处理来达标。本轮仅测量，未修改姿势或求解结果。

复跑：QA_M1_BUILD=f7bdc3be3de4，QA_PERF_SECONDS=30，QA_PERF_CASES选择上述四项，运行scripts/qa-m1-current-perf.cjs http://127.0.0.1:4193/；详细坐稳另设QA_PERF_DETAIL=1。脚本拒绝覆盖旧report，需指定新QA_M1_RUN_ROOT。使用scripts/summarize-foundation-perf.py归档完整原始帧。目标普通电脑仍无实机，152合并候选没有继承本性能数字。
