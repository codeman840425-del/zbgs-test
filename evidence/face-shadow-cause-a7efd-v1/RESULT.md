# 首次大嘴宽：shadow pass 因果隔离

固定 a7efd61c61c8 / 源0137d7e，四个独立新 headless:true 硬件加速 Chrome 进程/页面、无草稿、原女男第一次UI嘴宽+12%。F开→冻结，M冻结→开交错；rAF不等于实际屏幕呈现。无录像、Profiler或GC，系统/驱动shader cache未清，不称冷驱动或统计稳定性。浏览器与随机端口服务均exit0关闭，产品未改。

关闭实验采用 `shadowMap.autoUpdate=false; needsUpdate=false`，保留 enabled=true 和已建立的原阴影图。实际 Three WebGLPrograms:372 中 enabled=false 会改变主色shader；本次避开此混淆。冻结后真实depth调用为0，两体各自on/off两个主色cacheKey逐项完全相同。此时阴影图是旧几何，不可作为产品修复。

| 身体/条件 | 最大rAF | 最大render | 最大shadow调用 | depth infoLog | main infoLog |
|---|---:|---:|---:|---:|---:|
| 女/on |121.4|121.4|38.1|27.3|80.3|
| 女/frozen |60.7|62.0|0|0|52.7|
| 男/frozen |66.8|69.0|0.1|0|57.1|
| 男/on |103.2|106.0|34.1|25.7|69.6|

单位ms。本次每体实际**一个**新depth program（MeshDepthMaterial），非历史全脸算法的两个；两个新主色为FaceMouth与Face Skin Outline。depth在首次draw才link及getProgramInfoLog，on时depth日志同步25.7–27.3ms，完整shadow调用34.1–38.1ms。主色两program已在compileAsync准备，但首次infoLog仍在draw内；冻结shadow仍有52.7–57.1ms主色日志，不能称阴影是唯一根因。

on/off rAF差不能全部归因depth：同主色cacheKey的FaceMouth日志也从24.8–31.1ms变为0.3–0.4ms，可能与驱动调度/缓存/先前depth工作相关，本次没有内部驱动证据细分。仍能确认shadow工作路径给首次draw增加具体同步区块，且移除该路径时整体帧改善；异步预备是否改善必须另测。

上传量同体条件严格相同：女7,568,112B，男7,308,736B，12次记录调用；JS上传返回累计0.2–0.6ms，**不等于GPU传输完成**。set promise总时女144.8/141.0，男冻结137.6/on113.4ms；它不包含真正显示完成，不能单独作性能胜负。长任务on女123/男107ms，冻结女63/男70ms。全rAF、longtask、renderer/render shadow、GL时间及program cacheKey/对象ID、环境、bundle SHA均在run-v1原始JSON。

结论：可支持一次仅真实depth variant的准备候选；应保主色/最终阴影一致，并对整段rAF重新评估。不得关闭阴影发布，不重试已撤回的主色first-use路径，也不据本开发机一次对照宣布普通电脑达标。
