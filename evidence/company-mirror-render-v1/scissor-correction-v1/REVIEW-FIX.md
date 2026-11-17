# SCISSOR 实际状态恢复修正

2026-11-16。独立审查发现原 captureRenderer 重新推算 canvas scissor，并以 render target 配置代替实际绑定状态。旧替身也固定 floor，因此原 19 项通过报告没有覆盖真实差异。

锁定 r187 的 setScissor 使用 round，而恢复 canvas 的 setRenderTarget 使用 floor。DPR 1.5、setScissor(3,4,20,21) 后实际设备矩形为 [5,6,30,32]，原捕获会得到 [4,6,30,31]。绑定 target 后，宿主调用 setScissor 或 setScissorTest 也可使实际 GL 状态与 target.scissor/scissorTest 配置不同。

本次把捕获统一改为 getContext().getParameter(SCISSOR_BOX) 和 getParameter(SCISSOR_TEST)。恢复继续使用设备像素状态，不再次乘 DPR。runtime 改动仅限 captureRenderer，根代理新增 lastReflection draw/triangles/CPU 提交时间 wrapper 字节保持一致，receipt.json 保存了对比及 SHA256。

before/ 保存修改前源码、QA 和旧报告。先增强替身，给出正确的 setScissor round 与 setRenderTarget floor 行为，以及独立可查询的设备状态，再对旧源码运行。baseline-regression/report.json 如实记录四个失败。

- canvas round 状态正常反射后恢复失败。
- canvas round 状态在 renderer 异常后恢复失败。
- target 实际矩形和开关不同于配置时，正常反射后恢复失败。
- target 实际状态不同于配置时，renderer 异常后恢复失败。

一次定点修复后 fixed/report.json 的 23 项 CPU 检查全部通过，24 个镜面目标创建、24 次 dispose、live=0、peak=2。原 canvas setRenderTarget floor 路径与既有生命周期检查也保留。

命令支持可选输出目录，本次使用 `node scripts/company-platform/qa-mirror-render.mjs evidence/company-mirror-render-v1/scissor-correction-v1/fixed`。未运行浏览器或 GPU，未改宿主文件、合同、CAP、CURRENT，也未提交 git。此报告是 CPU 设备状态替身验证，真实 GL 状态由根代理继续独立检查。
