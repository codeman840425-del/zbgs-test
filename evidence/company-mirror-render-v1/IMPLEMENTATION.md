# 镜面实例 owner 与显式反射控制器

2026-11-16。仅实现 `prototype/src/company/mirror-render.js`、CPU QA 和本目录证据。未修改宿主 render/authoring/preview、CAP 或 CURRENT，未运行浏览器或 GPU，未执行 git commit。

## 可接入 API

- `createMirrorBinding(resource, parts, id)` 对非镜资源返回 null。镜面返回独立 owner，构造时不创建目标。owner 提供 surface、reflector 只读 getter、activate、deactivate、dispose、snapshot。原 GLB mesh、几何和材质继续由场景静态树拥有。只有动态 Reflector、专用 shader、重基几何和目标属于 owner。
- `createMirrorController()` 返回 update、preflight、snapshot、dispose。update 与 preflight 都接收 `(bindings, renderer, world, camera, {frameId,timeMs})`。update 的同名 preflight 选项也可转发到独立预检。
- update 使用稳定 ID 从当前可见、正面且在主视锥中的镜片选择一面。失活立即释放动态目标，原 GLB 中性面恢复。宿主同 token 最多一次，时间间隔至少 1000/30 ms，无独立时钟或定时器。
- 新镜被选中但宿主限频尚未放行时，返回 `reason='host-budget-awaiting-fresh'`、fresh=false、activeId=null，保留中性面且没有新目标。正常宿主节奏下等待至下一个准入帧，宿主说明应反映该状态。
- preflight 是单独统计的事务验证阶段，不改变 normal 的 frame/time 门。它只调整传入候选 owner，不释放 controller 原场景的 active owner。成功留候选目标供交接，失败释放候选目标。宿主按合同暂时隐藏旧 root 并挂候选，finally 恢复图和显示状态。
- `mirrorResourceSnapshot()` 提供 target 对象 created/disposed/live/peak。owner.snapshot 提供 ownerId、fresh、width、height、HalfFloatType、samples=0 及各自创建/释放计数。这些是 JS 目标对象和 dispose 事件计数，不是显存字节。

GLB 镜片需先经过上游完整几何校验。薄层补核固定 schema/profile/position、实际 identity Mesh 和非空几何。动态几何减去 [0,0,.026]，Reflector 位置放回该平面，原顶点与世界位置一致。官方 onBeforeRender 保存后永久替换为 noop，由 controller 在主画面前明确调用保存函数。

## 异常和 shader 检查

反射期间隐藏当前 world 中所有标记镜面，含交接窗口旧 root 中的镜面和未活动的中性面。finally 恢复各物体的原可见值、target/face/mip、XR、shadowMap.autoUpdate、实际设备像素 viewport/scissor、shader debug 设置与 render 方法。guard 阻止重入 controller。

首个 fresh pass 先检查镜片自身 shader。锁定 r187 的 `renderer.compile(reflector,camera,world)` 仅 link，`WebGLProgram.onFirstUse()` 要到 getUniforms/getAttributes 才诊断。薄层明确通过 `renderer.properties.get(reflector.material).currentProgram.getUniforms()` 强制该检查，收集 onShaderError，返回正常路径后再拒绝。该接缝依赖 r187，不宣称通用 Three 版本兼容。没有增加第三目标、主场景 draw 或第二 world。

进入 renderer.render 或 renderer.compile 内部后出现未知异常，给 `mirror-renderer-reset-required`，要求宿主终止帧并重建 renderer。finally 只证明公开状态恢复，不能修复 r187 私有 render 栈。上下文丢失和 shader 编译诊断另有具体错误，不能用正常 return 宣称产生新像素。

owner 对 Object3D.childadded 中的同步 dispose 有保护，防止 attach 后继续复活实例或重复释放。未提交候选的最终 dispose 仍由宿主场景负责，controller 只管理动态活动状态。

## 一轮实现和一次证据修正

初版源码 SHA256 为 `9d5a57ca85d7e4d9ad8333e316c03e61ad3eb8e6210dbb937fa2c3e9e09d1375`，CPU 14 项通过的原报告保留为 initial-report.json。根代理静态复核指出，初版只画镜中宿主内容，没检查 Reflector 自身 shader。该缺口是源码审查发现，初版 CPU 报告不能证明镜片 shader 已验。

一次有根据修正补齐 r187 首用 shader 检查、编译内部异常边界、DPR canvas 恢复检查、新活动镜等待状态和 attach 中 dispose 保护。最终 report.json 为 19 项 CPU 检查通过，20 个目标对象创建、20 次 dispose、live=0、peak=2。这些检查使用实际锁定 Reflector 与替身 renderer，没有实际编译 WebGL shader，没有证明反射像素、私有栈恢复、关闭重开或普通电脑性能。

运行入口为 `node scripts/company-platform/qa-mirror-render.mjs`。实际 GPU、宿主事务及可点击用户路径由根代理集成后验证。

本任务请求配置沿已记录 gpt-6.1-sol/high，实际 provider 配置和宿主 Hook 拦截未独立核实。

## 后续独审修正

原 19 项报告保留为历史结果。后续独审发现 canvas scissor 的 round/floor 差异以及绑定 target 后实际状态与配置不一致的缺口，旧替身也未覆盖。最新定点修复和四项真实失败复现记录见 scissor-correction-v1/REVIEW-FIX.md，最新 CPU 结果为该目录 fixed/report.json 的 23 项通过。runtime 仅调整 captureRenderer，保留根代理新增 lastReflection 统计。
