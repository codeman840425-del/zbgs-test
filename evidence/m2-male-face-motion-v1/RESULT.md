# M2 男性脸型运动补验 · 3016fadd5864

仅原 male 与 m2-male-jaw-v1，同固定版、相同 room 镜头/输入、独立短裤。没有产品改动、没有新增资产或附件，没有触碰 Rokoko30秒或加载未适配 normalized。正常1×两原片见 [index.html](index.html)。

## 结果

两体各12项检查通过、0pageerror。均实际进入runMix>.95，原跑步任务被重选取消、重选目标完成；技术舞实际准入并结束，再走任务完成，最终idle/active=null，短裤保留、无附件。所有采样room相机在单片内以及两体间相同。

实际技术舞来自同版manifest的 `dance-technical-once-v1` / `Dance_Technical_7s_Once_v1`，7.2秒一次播放，UAL通用源骨架重定向而非normalized身体专属片。两体均读取并核实际GLB SHA `2d785287de3c0187c76ed90ae6e0b76fed3008cb1a7a2ac75065720d3885304e`。它仍是自制技术编排，不是专业舞或动捕；源可重定向不是无条件观感通过。

| 身份 | rAF帧数 | wall / simulation秒 | 技术舞任务含进出秒 | 最大采样间隔 |
|---|---:|---|---:|---:|
| 原男 | 2535 |15.452 /15.461400|8.0685|48.5ms|
| 新下颌 |2512|15.4398 /15.456600|8.0690|18.2ms|

采样窗口为ready后rAF，不是完整文件时长；约一帧的边界差不代表改播放速度。原片保留加载段：原男加载更长，新样件开头短暂默认close，正式链开始后固定room。相同输入序列但wallclock调度及加载不同，不能直接把相同video时间当同姿。原任务取消持续约.8653/.8312秒，重选任务均约1.55秒完成。

## 实际抽审及限制

已查看全部7张2fps时序图，共原37/新35采样，覆盖两原片完整时段。原男约1.5–4秒、新体约.8–3秒为跑转停；原男约5–12秒、新体约4–11秒技术舞出现抬臂/交叉/小跳，随后回站再走。采样未确认新增明显肢体脱离、倒置或动作顺序异常。两片约10秒整场家具也变糊，为录像清晰度限制，不单独归因角色。

这是完整时段抽帧工程检查，不是1×连续人工观感验收；room人物较小，不能判断精细脸部形变/接触或排除小于.5秒跳变。没有重测皮肤接触矩阵，也不继承全部动作/附件/其他体型通过。普通电脑、手机未测；本轮帧时间不是独立性能基准。用户接受77基础不等于已接受这个新脸型。

## 复跑

```powershell
$env:QA_M1_BUILD='3016fadd5864'
$env:QA_M1_RUN_ROOT='F:/gamemake/output/playwright/m2-male-face-motion-v1-rerun'
node scripts/run-fixed-check.cjs experiments/m2-male-face-v1/dist scripts/qa-m2-male-face-motion.cjs
```

复用原male-face回读的身份与room设置，新增限定动作脚本；执行文件/源manifest/build-info、原报告无损gzip及两完整影片均归档。没有reset/固定步推进/传送，没有截图或skin探针阻塞影片。浏览器及临时服务已关闭，未提交。
