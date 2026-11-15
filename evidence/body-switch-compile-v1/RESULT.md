# 换体真实 actor compileAsync 候选（仅CPU）

产品仅main.js的switchFoundationBody局部；SHA见source-pins.json，已冻结。没有构建/浏览器/GPU/提交/发布。原a0dd测量记录仍属于旧构建，不能改标。

## 单一改动

在新actor离屏加载、动作建立以及当前服装/配色准备之后，调用公开 `await renderer.compileAsync(nextAvatar.root,camera,world)`。保留旧actor与其动作，不主动绘制新actor、不改材质引用/renderer.debug、不调用私有getUniforms。await后先检查generation，过期只走现有finally释放next；否则重新取当前outfit/debug/dynamics/corrections，再采样oldAvatar/oldMotion/saved位置、yaw、镜头、暂停、速度、simulationTime、坐姿和dance。实际attach→转移所有权→旧资源清理仍为同步原顺序。

三项边界：取消并不立即中断Three编译，pending资源等Promise完成后释放；编译异常仅释放next、不动旧actor/任务；等待中新显示模式若换了material，提交以最新状态为准，不能保证该迟到variant已被前一次compile覆盖，不循环预备。

## API依据与不能保证的事情

本机Three0.187.0 WebGLRenderer.js:1400的compile接受Object3D：使用targetScene的光照/环境，同时遍历传入root的material；包括hidden mesh/material数组，因此不需把nextRoot先挂进world。现VRM由真实SkinnedMesh及MToon/outline材质组成，沿实际root及材料调用，不造材质代理。

WebGLRenderer.js:1519的compileAsync调用compile后轮询每material currentProgram.isReady；它不预先getUniforms/infoLog，不是LINK_STATUS成功证明，也不保证所有双面变体首次调用无阻塞。既有shader errors和首次使用日志保持原行为。此次不涉及shadow预备、离屏draw或延迟旧材料dispose。旧同cache-key可复用性及新program并行编译是否改善最大帧，只能后续真实对照测量。

## CPU检查

`node scripts/qa-body-switch-compile-cpu.mjs --out <不存在的新目录>`，拒覆盖。

cpu-2：22项通过。实际提取当前switch/sync函数，复用真实behavior-tasks模块，renderer/actor/DOM用可控fixture。覆盖compile同步throw与异步reject保旧、加载与初始化故障、提交后UI/cleanup故障仍如实报告已换体、坐姿退出座位；load/clips/appearance/compile各阶段过期请求只释放next；编译等待中旧角色位置/yaw/速度/暂停/倍率/时间/镜头/舞更新被采纳；等待中新坐姿使用新approach；最新outfit/debug/dynamics/corrections被采用；旧compile晚拒绝不覆盖最新bodySelection错误/加载状态。没有宣称GPU shader成功或体验改善。

cpu-1保留首版21项（尚未补等待中衣服/调试模式重采），cpu-2记录最终22项和精确执行脚本/main快照。原baseline-main.js完整保留。node语法与CRLF-aware diff检查通过；未更改产品其他文件。
