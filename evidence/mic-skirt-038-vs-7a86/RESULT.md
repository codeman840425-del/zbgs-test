# 原女性裙装持麦有限对照

旧 `7a86c24e34aa` 与新 `038341558517`，原女性 `027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95`，outfit 1、全修正、动态开启。固定 1/120 秒，894 步 / 7.45 秒模拟，装麦→站讲→2.4m/s直跑→停讲→卸麦恢复。不是正常速度视觉或性能验收。

- 两版时间、root、jogPhase逐步差值0；真实跑步任务完成，末态麦克风卸载、live.arm=null。
- 右持麦腕最大差0.010413mm，麦头最大差0.030636mm，均在装麦淡入。握点误差≤4.58e-16m，正规化四元数后握姿误差≤4.22e-8rad。
- 左侧未持麦腕最大差5.004195mm。讲话起始单步22.959060→24.036178mm（增加1.077117mm）；保留真实变化，不称姿态逐位一致。
- live在motion之后重设持麦臂/手指，再由最终raw手挂载麦克风。因此handContacts是前置solver指标，不能证明最终持麦手无衣面接触。
- 本直线链新避让最大投影仅2.66e-9m，没有激活实质非零避让争用。没有最终skin×裙碰撞或连续观感结论；追加真实跑到终点再请求坐下的单项诊断另存。

首次baseline失败来自继承QA对未单位化world quaternion直接angleTo；原件保留在baseline/。修复测量先normalize双方，未放宽1e-6rad门。有效比较使用baseline-normalized/与candidate/，详见comparison.json。无产品修改。

追加单触发结果见SIT-TRIGGER-RESULT.md（讲话）与SILENT-TRIGGER-RESULT.md（普通携带）。后者激活实质投影，最终采样手皮肤0交叉，但左空手最大52mm旧新姿态差及单步增加4.14mm待观感，不升级本报告结论。
