# 零 NORMAL 布局：一次有限 GPU 对照

候选在本次开发机测量中消除了首次嘴宽编辑的新增 shader link/infoLog，首改长帧明显减小；代价是初始化更慢及持续增加形态纹理内存。**不自动合入/发布，不宣称首改无卡顿、视觉等价或普通设备达标。** 公共4196仍为root原固定34e。

基线源0137d7e94be80bff15ae391f54e3c31a259babeb / a7efd61c61c8；候选源13526ff9800f52a3096d2fb8dc0c2345be8a9d86 / 4f33a4f72f21。候选新建独立sparse检出 `experiments/face-normal-reserve-measure-source`，独立npm ci/build输出dist；未进入含node_modules junction的原候选安装/删除，也未改主树产品。没有叠加shadow预备。

## 方法与身份

同脚本基线→候选，各原女性/男性独立新有窗口Chrome进程/干净context。固定1600×1000，Playwright1.58.2主CDP session关闭focus emulation，移除既有3个后台自动化flag；ready/修改后以及10秒讲话实际帧均核visible+focus。无录像/截图/Profiler/限速/forcedGC；系统与驱动缓存未清，只运行这一顺序一次，存在顺序/缓存混杂。

每页：初始化与ready→实际UI首嘴−12%→reset→相同happy/讲话/自动眨眼10秒。GL、rAF和longtask在document执行前加测量钩子；renderer只能在__debug暴露时挂钩（约279–320ms），此前render可能未完整计时，不能伪称整个load所有内部stage都已分离。原始调用/帧/事件、GL程序ID、bundle SHA与环境在两子目录。脚本为 `scripts/qa-face-normal-reserve-cost.cjs`，每run自存执行快照。

## 实际结果（毫秒）

| 指标 | 原女→候选女 | 原男→候选男 |
|---|---:|---:|
| 导航到debug/UI ready |1953.2→2209.3|1844.8→2377.6|
| 初始化窗口最大rAF |934.3→1158.8|867.5→1231.6|
| 已观察初始化最大render |931.0→1151.2|867.0→1223.4|
| 首嘴set总时 |123.1→46.6|118.3→55.8|
| 首嘴最大rAF |109.2→42.4|103.2→54.7|
| 首嘴最大render |108.6→9.2|105.6→15.1|
| 首嘴新增link / infoLog |3/3→0/0|3/3→0/0|
| 10秒讲话最大rAF |7.1→7.4|6.7→6.5|
| 10秒讲话render P95 |0.70→0.80|0.70→0.80|

讲话四页P95/P99 rAF约6.2ms，均无>33ms帧；实际blink>0.9且aa>0.1。该短窗口不能证明长期稳定或GPU吞吐量等价。首嘴候选男仍有54.7ms帧；无新shader并不消除source处理、分配/上传及其他浏览器成本。

初始化程序链接女22→25、男20→24；额外布局成本提前到加载阶段而非消失。首嘴仍上传与基线相同的7,365,120/7,105,536bytes。GL API返回时间不是GPU完成；rAF不是屏幕呈现。本轮没有额外输入延迟或视觉像素验收。

## 内存与资源账

实际 `MAX_TEXTURE_SIZE=16384`。按真实9个Face geometry布局及Three WebGLMorphtargets的RGBA32F数组公式，初始估计与实际texSubImage3D上传字节**精确相等**：

| 身体 | 原初始 | 候选初始 | 增量（CPU backing与GPU基础存储各自） |
|---|---:|---:|---:|
| 女 |16,571,520 B|27,619,200 B|11,047,680 B / 10.54 MiB|
| 男 |15,987,456 B|26,645,760 B|10,658,304 B / 10.16 MiB|

这是CPU backing及GPU基础存储的各自公式估计，**不是JS heap或VRAM实测**，不含驱动额外副本/对齐等。当前可见mesh合计不等于总保留量：编辑后原geometry纹理仍缓存，另增加两个clone纹理。因此首改时原源+新纹理估计女23,936,640→34,984,320B、男23,092,992→33,751,296B（CPU/GPU各自）。reset销毁clone，计数与源初始恢复。

renderer初始/复位几何和纹理计数相同：女89/44，男88/45；首改各+2，reset cloneCount0。候选额外容量未体现在“纹理个数”增加，不能只看计数忽略容量。初始zero NORMAL属性本身仅多24,660/24,672B，与更大的纹理backing不同。

QA独立审核另证：brow-only不重算法线时，clone零NORMAL属性女1,380,960B、男1,332,288B会随该眉clone保留到reset，不只是临时分配。本轮GPU只嘴宽，不把该眉路径当已测；参见 `../face-normal-reserve-v1/independent-review/check.json`。MAX_TEXTURE_SIZE=4096时6几何增量约31.46/30.34MiB各CPU/GPU，来自既有CPU公式，**未在本GPU上模拟验证**。

## 结论边界

有依据继续评估此资产布局策略：本次首改新增shader为0，且编辑请求与render峰同时下降，不只是把首用搬进同一个请求。但加载ready增加约256/533ms，初始化长块增大，每角色常驻增加约10MiB CPU及10MiB GPU基础存储；应由root据用户路径和目标设备取舍，不能只报首改收益。没有修改候选再扫描、没有扩大服装/舞蹈动作矩阵。

两份报告status measured且页面错误0；所有Chrome及随机端口服务均已关闭。后续视觉、其他端点、换体及普通设备回归尚未由本轮完成，是否安排由root决定。
