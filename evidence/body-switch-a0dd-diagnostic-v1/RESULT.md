# 当前换体首次绘制诊断

固定 a0dd7fb7bf4a，Chrome 157/1600×1000/RTX4090。独立新进程、新context且清空测试草稿，只执行原女→原男一次。实际环境与原始program身份在run-v1/report.json、raw.json。无录像、无CPU profiler、无强制GC；OS/驱动缓存未清理。仅诊断wrapper，不改产品。

实际命令436.4ms；首次男体render707.7ms；最大rAF812.9ms。首次绘制14次getProgramInfoLog共640.8ms，是CPU可见同步等待，不能直接解释成GPU执行时间或具体驱动编译原因。compile/compileAsync调用均0；旧motion.dispose0.3ms，旧avatar.dispose1.8ms。

确认4组同cache key在旧体销毁后重新link，但这些program的infoLog合计47.8ms（全部640.8ms约7.5%）；不能把它当主要阻塞全因。直接delete/link调用很短，不代表GPU没有排队。

createMotion、解析/重定向和预备内部为词法导入，无可达计时接口，本次不注入源码，因此不声称测到各子阶段。命令返回也不等于画面已经呈现。

本次测量支持一个有界候选：在旧角色仍可见时，用公开compileAsync预备真实新角色材质，随后检查生成序号并提交。它是否改善整段出帧，必须另测，不提前宣称通过；不使用被否决的私有getUniforms分段预备方案。

执行：node scripts/run-fixed-check.cjs experiments/m2-appearance-workbench-v21/dist scripts/qa-body-switch-a0dd-diagnostic.cjs。重跑必须换新输出目录。浏览器与临时服务已退出，旧固定版未改。
