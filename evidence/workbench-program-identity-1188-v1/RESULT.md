# 1188 首次编辑程序身份复核

同固定1188、单独新Chrome进程、仅首次嘴宽−.04；无录像/截图，未修改固定构建。Chrome和临时服务已关闭。执行脚本 `scripts/qa-workbench-program-identity.cjs`，`python evidence/workbench-program-identity-1188-v1/analyze.py` 离线复算。

**纠正此前假设：主颜色pass此次没有漏掉program cacheKey，也没有在第一次draw重新link。** 编译阶段生成5个实际WebGLProgram；每个KHR_COMPLETION_STATUS_KHR均返回true，之后同一program第一次getProgramInfoLog仍阻塞。只用compileAsync完成作为“first draw不会停顿”的边界不成立。

| GL ID | shader身份 | link阶段 | completion=true | 第一次infoLog CPU阻塞 |
|---|---|---|---|---:|
|23|FaceMouth MToon|compile|2354.5ms|36.1ms|
|24|FaceEyeline MToon|compile|2364.9ms|48.6ms|
|25|EyeIris MToon|compile|2364.9ms|57.0ms|
|26|Face SKIN Outline|compile|2376.5ms|47.6ms|
|27|EyeExtra MToon|compile|2388.4ms|49.9ms|
|28|MeshDepthMaterial|实际draw|未预先查询|25.4ms|
|29|MeshDepthMaterial|实际draw|未预先查询|26.0ms|

compile-ready2388.5ms，命令结束2388.6ms；首编辑render2393.3→2758.0ms。完整link/query日志及shader source已保留，可关联同一GL对象与Three program id/cacheKey。28/29的SHADER_TYPE确认为MeshDepthMaterial，与前次CPU影子栈吻合。

这组结果支持两项分别处理：一是设备/浏览器路径下，KHR完成后仍有首次诊断/初始化同步工作，需在可取消预备阶段真正完成first-use（保留错误诊断），而非再次调用同一个compileAsync；二是阴影depth程序尚未预备。若尝试主动first-use或离屏渲染，必须测每个阶段最大主线程块，不能把整段370ms挪到用户点击后的另一位置便称解决。可分程序预备/调度，但使用Three内部getUniforms等有版本耦合，先做隔离验证；不要关闭checkShaderErrors掩盖或强行GPU finish。

另一个更小的独立候选是仅克隆真正引用mouth/brow/nose受影响点/法线的primitive，避免当前嘴宽也让EyeIris/EyeExtra等产生NORMAL morph程序与独立纹理。能减少多少程序与真实首帧成本尚未测，不能从5个程序名称直接保证结果。

限制：本次没有追踪驱动内部实现，不断言getProgramInfoLog内部到底是哪一种编译/读取任务；新进程不代表GPU冷缓存。详细draw wrapper只保留前4帧（发生于compile等待中），所以不伪称已逐mesh记录第17帧；上述结论依据完整GL对象link/query记录与ready快照成立，无需为这个非核心缺口重跑。原数据不覆盖此前CPU profile，仍不能代表普通电脑性能。
