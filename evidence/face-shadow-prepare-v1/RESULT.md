# 仅 depth 预备候选：有限结果与限制

当前为实验候选，**未修改 delivery / 未发布**。主色首用优化没有恢复，facial-geometry/法线/模型/动作/衣物没有改动。候选减少了所测最大 rAF 间隔，但总编辑请求更长、主色仍有显著停顿；不宣称交互响应或屏幕呈现已达标。

## 精确版本

- 固定基线 a7efd61c61c8，源0137d7e94be80bff15ae391f54e3c31a259babeb。
- 首次候选源 f733c36f160a1b160148b897d8427544c9185387，独立检出/npm ci/build，固定 bb6e996f7a0f：`experiments/face-shadow-prepare-candidate-v1/dist`。以下成本两序都属于此版。
- 可靠性修正最终源9248dfe7842197894bb1160edd311173158c415b，固定34e7745e78ab：`experiments/face-shadow-prepare-final-v1/dist-final`。它只补可见帧捕获等待与context失效成功入口门；未将bb6e成本改标为34e。
- 最终host SHA `57fcd047d3b8e8d235bdb60aaa54d08eef94f509f0c7cfd2f432244ed2e64407`，helper SHA `6132cc6ca3fb049dc40a2226727648260d098b7275f006df72938471419a6fc3`，cpu-final有精确源码与执行脚本。

## 最小实现

待提交真实部件的旧几何下一次正常 `onBeforeShadow` 捕获实际 depth material 快照、shadowCamera 与 target。复制真实 mesh/skin/morph 布局作 compile-only proxy，不draw、不改原material，不创建替代角色。复制当前主视角可见灯数量，targetScene无fog/environment；同步切实际target调用公开compileAsync，立即finally还原target/cube/mip，跨await不保持target。

仅该 depth wrapper ready 后任务让步并首用，保原shader诊断，主色路径不动。材质归原warm entry持有，原材质版本淘汰保留。并发同mesh使用单hook订阅集合，最后订阅退出恢复原callback。等待按真实可见帧累计2秒预算，后台不消耗预算，实际捕获后下一帧完成；未捕获拒绝而不是伪称预备。context/dispose取消与统一catch释放新批，成功入口再次核signal与Map归属，不允许失效批resolve后提交。

依赖Three0.187内部wrapper/properties，只适用于此固定实现；不是通用shader管理器。方法风险与源API位置见前置只读报告，官方本机源码SHA记录在source-identities.json。

## 有窗口一次顺序 + 一次反序

每格为女/男毫秒；独立新Chrome进程，真实UI嘴宽+12、3次真实tab点击，无录像/Profiler/GC。**旧性能脚本仍是Playwright默认focus/background配置，未记录原生focus/visibility；headful不等于原生焦点或屏幕呈现验证。** 驱动/OS shader缓存不清，次数不足以建立统计稳定性。

| 比较 | baseline最大rAF | candidate最大rAF | baseline请求 | candidate请求 |
|---|---:|---:|---:|---:|
| baseline→candidate |133.3 / 133.5|90.9 / 91.1|159.7 / 137.5|242.1 / 241.5|
| candidate→baseline |127.5 / 127.5|97.1 / 103.2|142.2 / 119.6|230.4 / 250.0|

两序峰值改善24–43ms，但请求增加82–130ms。基线shadow最大40–45ms，候选9–11ms；仍有75–86ms主色infoLog调用累计。API返回、GL返回和rAF均不等于GPU完成或显示呈现。

输入反例保留：首序男max dispatch111→18.1ms；反序男baseline15.5ms、candidate59.7ms，女反序baseline13.2、candidate20ms。只有各3点击，不支持输入延迟稳定改善。完整原始rAF/longtask、render、GL、bundle哈希、浏览器/GPU信息与事件在四个headful目录；comparison.json汇总，不选择性省略反例。

## 实际程序命中与额外side

每体当前实际新depth只有一个。基线它在draw link/首用，候选draw无新depth link或infoLog；主色两cacheKey完全相同。最终34e真实门进一步以actual GL useProgram、depth material currentProgram及预备Map逐项匹配同一glID/cacheKey，证据不只引用数推断。

捕获额外生成一个side变体：两key仅布尔掩码bit12 flipSided相差4096（8533216 vs8529120）。WebGLShadowMap会按原材质side改共享depth.side，独立快照compile会各生成；本次匹配变体最终refs3，另一个停refs1（只预备持有），额外约35ms等待。**没有为消掉它再改side或扫参数**。当前原生draw的共享材质缓存复用与各clone独立compile不同，未将额外变体冒充必要实际draw，也未据此更改Three。

## 有限可靠性门

- cpu-final：13项通过；覆盖实际捕获/target同步还原、同批共享、不同layout重叠hook、材质版本失败保stable、无capture拒绝、dispose/context、后台可见预算等。它是实际函数+Three类/mock renderer，不替代GPU。
- QA三层microtask context失效反例原本resolve且4/4未释放，原失败保留。修正后原脚本复跑rejected且4/4释放，见context-aftercheck-fixed；真实contextlost通常task，不把故障注入称用户自然复现。
- browser-native-final：34e四项通过。复用既有Playwright1.58.2主session关闭focus emulation，并移除3个自动化后台flag；普通开始/结束均断言document.visibilityState=visible且hasFocus=true。真实后台tab记录hidden/focus=false，不伪造事件。
- 首次编辑：actual depth program命中、回调恢复；快速反向旧请求取消、新请求提交，同layout compile次数仍4，stage材料6、geometry91/texture46不增长。
- 男后台实际捕获等待超过2.3秒仍pending，返回可见后完成，hook全部复原。
- 女后台pending换男：旧请求cancelled、3/3新批材料释放、无重复dispose、旧callback精确复原，新男mouth0。没有复用旧actor几何。

环境失败均保留：browser-final前两门过但后台无法隐藏；browser-background为Playwright owned-context限制；browser-background-tabs仍被focus emulation阻挡。这些不是产品后台失败。最终native脚本直接复用已验证环境方法后4门过；没有反复改产品试图绕开测试。

所有Chrome与随机端口服务已关闭。无截图/视频视觉验收；最终用户UI可观看证据由root安排。两版成本与最终功能身份分开，公共版不因本报告自动替换。


## Root final integration (34e7745e78ab)
Final same-script cost: female/max rAF91.0ms, request235.4ms; male90.9ms/222.7ms. These are this build's automated headed Chrome measurements, not transplanted bb6e results or input-to-photon. Actual native focus/background four cases passed separately. Ten UI recipe/palette gates passed. Same-script original male/female full 1x movies recorded, all six final13s/2fps sheets reviewed plus two diagnostic screenshots; no continuous human visual approval claimed. Fresh independent checkout rebuilt122files byte-identically. Full details final-integration.json.
