# bcade 换体动作源成本：唯一采样

结论：当前证据不足以支持立即增加动作源缓存。确有重复解析，但尚未分离出可缓存的动作源 CPU 总成本；不能用 parse/loadAnimation 的 self 时间当完整解析，也不能把角色/衣物解析、目标重定向和校准算作缓存收益。本轮不实现缓存、不追加测量。

## 本次测量

- 固定构建 `bcade40d24f1`，新 Chrome 进程/context，加载前清 local/sessionStorage；女→男一次成功，无录像、截图、GL wrapper 或产品代码注入。
- 命令 wall **864.300ms**；CDP interval 1000µs。Profiler 含命令前协议开销、命令、其后900ms首draw/运行，窗口 **2028.267ms**（样本加权2028.035ms）。这不是纯命令CPU窗口。
- 采样带开销；不能拿864.3ms与旧无Profiler的523.3ms直接判退化。OS/驱动缓存未清。本设备结果不代表普通电脑。
- 浏览器和临时服务已关闭；没有运行第二次。

## 可识别的同步栈采样

| 实际范围 | self ms | inclusive union ms | 能说明什么 |
|---|---:|---:|---|
| createMotion / `ks` | 2.581 | 72.945 | 目标角色初始化、源采样/鞋底校准等；源parse缓存不消除 |
| loadRetargetedMotions / `HA` 恢复后的同步栈 | 6.956 | 23.480 | 包含内联重定向、骨世界矩阵、创建新轨道；不是整个异步加载wall |
| danceEntries async callback | 8.816 | 34.778 | 包含hash调用、GLB入口及目标normalized JSON验证/构造；异步parser后续不全部在此栈 |
| parseNormalizedMotion / `BA`（上行子集） | 0 | 15.580 | 当前目标身份验证/新clip构造，不可当纯源GLB解析 |
| GLTFLoader.parse入口，全资产 | 5.269 | 11.572 | 只此调用及同步子栈，遗漏异步后续 |
| GLTFParser.loadAnimation入口，全资产 | .058 | 7.320 | 只此调用及同步子栈，遗漏Promise完成回调 |
| GLTFLoader类及helpers范围，全资产 | 38.043 | 73.780 | 所有识别到的loader回调/子栈联合，含身体、衣物与动作，不能按资源归因 |

所有inclusive均对样本祖先集合取并集，不重复累加嵌套时间。函数通过实际加载bundle的0-based行列与源码片段定位，见analysis.json；没有依靠仅同名函数猜测。内联retarget没有独立函数/阶段标记，不能单独给准确self或全阶段时间。GLTF异步后续只有parser方法/Promise栈，缺原URL归属，不能可靠得到UAL/Jog/两GLB各自完整解析成本。

## 缓存上限的证据边界

把所有识别到的GLTF loader栈、HA、dance callback都合并，得到 **130.421ms** 的宽泛采样集合。它包含大量不能由只读源缓存消除的工作（新身体/服装、目标验证、重定向），不能宣传为可省130ms。73.780ms同样只是全资产GLTF栈的宽泛上界范围，不是动作解析值。未关联native/worker/网络等待不在该集合，因此130.421ms也不是整个异步加载收益的严格全局上界。现证据只支持“所识别CPU候选范围是几十毫秒量级，实际可缓存部分更小”，尚不能给可靠的动作源缓存节省值或最大长帧改善预测。

相对地，目标createMotion72.945ms不在源缓存范围；本profile还采到getProgramInfoLog **208.049ms**（含首draw阶段），缓存动作不解决该项。没有证据支持用源缓存解决原数百毫秒换体长帧主因。

维护性成本也仍存在：当前scene world-matrix求值及末尾geometry/material/texture.dispose属于真实源对象写/释放；直接缓存GLTF对象再浅clone会共享资源生命周期。合理缓存须另存只读clip/rest表并每角色生成独立轨道/UUID，不能复用目标clip。当前证据不足以承担这次额外生命周期改动；建议本轮停止，不叠加补丁。

## 复核

唯一执行：
`node scripts/run-fixed-check.cjs experiments/body-switch-compile-fixed-v1/prototype/dist scripts/qa-body-source-cost-bcade.cjs`

离线重算（不启动浏览器）：
`python evidence/body-source-cost-bcade-v1/analyze-profile.py`

原cpuprofile、executed-script及两份实际bundle均保留。report.json记录浏览器/设备/构建完整digest和请求URL。analysis.json记录每节点self/inclusive与符号片段。没有源map时不宣称恢复了完整异步阶段。产品文件未修改。
