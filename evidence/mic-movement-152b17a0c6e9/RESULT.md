# 152b17a0c6e9 持麦与连续转向集成

已完成原女性裤装、原男性短裤各一条真实正常1×链：装备麦克风→站讲→直接起跑→移动中180°重选→自然到点/停止→再讲→卸麦。未改产品源码/固定dist；未重复14个原转向数值场景。身份初末均由verifyCandidate核对，pageerror0。

## 实际状态与数值

原速原片female-room.webm约9.61秒、male-room.webm约9.49秒，均未剪辑、同固定room相机（逐rAF外参完全相同）。sim/wall分别.999115/.999536。女首装备阶段359ms处有54.6ms长帧；男初始阶段24.2ms。不称普通电脑/持续性能通过。

原生trusted附件/讲话/速度按钮与实际任务请求贯穿，没有段间reset。首段walk因用户式重选正常cancelled(reason=superseded)，反向walk与idle任务completed，failed0。真实到点误差女17.50mm、男17.54mm。原先“全部completed”口头概括已纠正，任务history完整保留。

第一移动帧女speed.02346/男.02210m/s，runMix均1：直接进入真实Jog层且世界速度连续。移动carry阶段talkHoldWeight趋于0，稳定样本各559，腕角最大女.1817/男.1842度；全链满握持腕角最大女16.43/男12.10度，reachClamp0。停止时恢复讲话持麦，再次讲话按钮有效。末尾mic均requested=false/status=off/loaded=false/error=null。

实际mic刚性挂点相对raw hand位置误差<1e-15m，旋转误差<.004度；这是挂接一致性，不是手皮肤完整三角接触门。麦头tip到raw眼骨点距离最低约197mm，tip始终低于眼骨点约136mm以上；眼骨点不是可见虹膜表面，不能据此宣称所有角度无遮挡。

## 视觉核查及界限

已看链后男女carry/talk前侧近图以及两条完整时段4fps顺序解码概览。近图中carry掌前臂顺接，talk麦头位于嘴下方且未遮眼，未见旧大折腕；room概览未见麦克风脱手或转向导致大幅姿态跳变。完整1×原片供实际观看，**抽帧并不等于连续播放视觉验收**，本次不替用户接受新宽弧观感。

近图是链结束后的明确诊断重放，不是从room片裁出，也没有改变room原片相机。诊断重放直接调用live API重新装备/设讲话，旁边UI按钮文本未同步，因此近图按钮可能仍显示“装备”或“停止讲话”；这是QA绕过UI的副作用，不能当产品实际UI失败。原正常链使用真实按钮，最终卸麦状态有真实日志。

脚本：scripts/qa-mic-movement-integrated.cjs。复跑：node scripts/run-fixed-check.cjs experiments/m1-mic-curvature-integrated-1/dist scripts/qa-mic-movement-integrated.cjs 152b17a0c6e9 <全新证据目录>。身份/完整rAF、眼腕数值、任务history、原生event位于两份trace.json.gz，摘要summary.json，原片/图/执行脚本哈希见manifest.json。

补充旧结果口径：afebe clearPath后idle曾被旧QA误判到达，属于测试判定漏洞；现main.updateBehavior会将距任务payload目标>.05m的walk标destination-not-reached。没有已确认业务任务错误报告成功的反例。
