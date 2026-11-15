# 持续性能 QA 计量审查

审查及修正范围仅 `scripts/qa-m1-current-perf.cjs`；无运行时修改，无浏览器运行。原脚本 SHA256 `d5fe5c4200dc6e74480423f434acd61cf15adee392d6738266a4e3f43deff4a6`；修订后 SHA256 `9aae9d52fecdafee95b873bed6f41857bc33627337584f5f1e9820acfb0f6fbf`。报告自身会保存实际脚本 SHA。

## 旧挂点正确，但不能当整帧/GPU时间

锁定 Phaser `Systems.step` 顺序为 PRE_UPDATE → UPDATE事件 → sceneUpdate → POST_UPDATE。当前 `CharacterScene.update` 在自身末尾调用 Three renderer.render，因此原pre/post挂点能捕获模拟、Three提交及该段UI工作，不存在“Three渲染在postupdate之后所以没测”的问题。后续 Phaser render、浏览器布局合成、GPU完成不在此CPU范围。

旧 motion/avatar/vrm 等是 inclusive：avatar.update包含vrm.update；motion内手接触同步也可能调用humanoid。原limitations已说明不能相加，本次不把历史值伪称重复计时bug。当前安装顺序主实例一次、每次全新peer一次，未发现同对象重复包裹。双实例同名指标原本就是两个角色合计，不是单角色成本。

确认的可修缺口：没有检测采样期间hidden/paused/rate/真实模拟进展；坐稳setup循环结束未确认到位；walk/run/dual标签未保存实际活动占比；异常退出不会写完整失败回执。这些可能把错误场景的数值误当相应动作性能，已仅在QA修正。

## 新报告范围

- 保留原 `*Ms` inclusive字段。新增每帧exclusive映射扣除嵌套**已插桩**调用，calls计数与primarySimulateMs；防止重复wrap。同名motion/avatar/vrm仍是两个角色的合计。exclusive之和只是场景CPU的已计量子集，剩余包括控制器、Phaser事件、UI及插桩开销，不称纯业务执行成本。
- cpuUpdateMs是pre→post场景CPU区间；frameMs是pre→pre墙钟节奏。renderSubmitMs仅CPU提交。新增exclusive总和不得大于scene span的自洽检查，不把它变成FPS验收门槛。
- 每例显式1×、full corrections、helpers off；保留base关闭次级动态、服装开启动态的原条件，不能把base/pants差值全归为材质。setup仍reset、人工模拟及1秒warmup，**不计入持续窗口**；非冷启动成绩。
- 逐帧记录mode/speed、paused/hidden/background/rate、simulationTime与peer活动；保存modeFrames、movingFrames、runningSpeedFrames和peerMovingFrames。路线仍含转向、停步及250ms轮询间隙，必须看实际占比，不能称30秒纯直线匀速。
- sit-hold先确认真正坐稳；采样检查无错误状态、有实际模拟推进/渲染及simulate调用；walk/run/dual至少到过相应活动，switch例实际出现sit和stand。没有添加或放宽性能通过阈值。
- 成功/失败均写报告，错误时保留可取得的帧。支持QA_M1_RUN_ROOT指定新的输出目录，禁止覆盖旧report。资源仍只为renderer计数/JS heap，不等于VRAM、完整进程或泄漏证明。

`node --check scripts/qa-m1-current-perf.cjs` 与 `node scripts/qa-m1-current-perf.cjs --self-test` 已通过。self-test使用与浏览器同一个timer helper，检查嵌套10ms/3ms→exclusive7ms/3ms、异常清栈、重复安装拒绝、非采样时不记录。它只验证计时算术与机制，**新版浏览器挂接和九场景有效性仍待负责人授权窗口实测**。

后续按原固定构建流程使用，不自动重跑既有历史数据：设置明确QA_M1_BUILD、可选QA_PERF_SECONDS（12–120，默认30）及新QA_M1_RUN_ROOT，再由run-fixed-check临时服务执行。录屏、其他浏览器和重CPU任务不得并行；开发机结果仍不代表普通电脑通过。
