# 镜面集成独立审查

本次只读审查公司平台镜面运行集成，唯一写入文件为本报告。工作树为 `F:/gamemake-company-platform-c1`。审查包含 `mirror-render.js`、`mirror-data.js`、`mirror-geometry.js`，以及 `render.js`、`authoring.js`、`preview.js` 的集成差异和 `qa-mirror-preview.cjs`。未执行 GPU 或浏览器，未修改产品源码，未重做模型生产。

## 当前结论

原 P2 裁剪状态恢复缺陷已修复并由本审查独立复核原复现。该项现已闭合。未发现提交前事务、镜面 owner 释放或角色及存档边界上的其它实际阻断。预算字段的真实浏览器结果仍由总工在固定候选上执行，此报告不提前记通过。

## 已闭合的 P2 裁剪框恢复问题

以下保留最初发现与复现，修复复核见后文。

`prototype/src/company/mirror-render.js` 第125和128行在画布路径用 `getScissor() * DPR` 向下取整，在离屏目标路径保存 `target.scissor` 与 `target.scissorTest`。这两条路径均可能与进入反射前的实际 WebGL 状态不同。

第一种复现使用 DPR 1.5 和画布 `renderer.setScissor(3,4,20,21)`。锁定 r187 的 `WebGLRenderer.setScissor` 第859行执行 `multiplyScalar(...).round()`，因此原裁剪框为 `[5,6,30,32]`。当前反射 finally 后变为 `[4,6,30,31]`。

第二种复现先绑定一个目标，该目标配置裁剪框为 `[1,2,10,9]` 且开启 scissor test，再用 renderer API 改当前框为 `[7,8,9,10]` 且关闭 test。当前捕获仍保存目标配置，finally 后错误恢复为 `[1,2,10,9]` 且开启 test。

两种复现均用现有 CPU 测试的 `fakeRenderer` 与实际锁定 Three Reflector，通过初始化状态忠实模拟 r187 API 语义后调用真实 `createMirrorController.update`。未使用 GPU。第一种输出如下。

```json
{"beforeScissor":[5,6,30,32],"afterScissor":[4,6,30,31],"restored":false}
```

第二种输出如下。

```json
{"beforeScissor":[7,8,9,10],"afterScissor":[1,2,10,9],"beforeTest":false,"afterTest":true}
```

当前 `qa-mirror-render.mjs` 的画布替身将初始状态也设为 floor，因此未捕获第一种偏差。目标测试让配置和实际状态相同，因此未捕获第二种偏差。

建议保存当前 GL 的 `SCISSOR_BOX` 和 `SCISSOR_TEST`，继续按 device pixel 恢复。仅将 floor 改为 round 无法兼容 `setRenderTarget` 内部另一条 floor 路径。两种不同来源应各保留一个回归检查。

## 修复独立复核

复核时实际 `mirror-render.js` SHA256 为 `2dcb769ac7d0160bb808c71b1fa3ace62c8b37de24b558488ac86e8bc635ad86`，与总工交回身份一致。实际修复改为从当前 context 读取 `SCISSOR_BOX` 和 `SCISSOR_TEST`，将裁剪框存为 device pixel `Vector4`，恢复路径继续使用 `renderer.state`。这同时覆盖 API round 和目标绑定 floor 的差异，以及目标配置与运行状态的差异。

本审查未运行会写入其它证据目录的 QA 命令。使用修复后真实 `createMirrorController`、实际 Three Reflector 和现有测试替身，只在内存中独立重跑原两种条件。每种条件分别执行成功路径及实际 nested render 抛错路径，共四项。均 deepEqual 比较完整公开状态，包含 target、face、mip、viewport、scissor、scissor test、XR 和 shadow update。

| 条件 | 路径 | 原裁剪框 | 恢复后 | test | 结果 |
| --- | --- | --- | --- | --- | --- |
| DPR 1.5 画布 setScissor | 正常 | `[5,6,30,32]` | `[5,6,30,32]` | true | 通过 |
| DPR 1.5 画布 setScissor | nested render 抛错 | `[5,6,30,32]` | `[5,6,30,32]` | true | 通过 |
| 已绑定目标的运行状态异于配置 | 正常 | `[7,8,9,10]` | `[7,8,9,10]` | false | 通过 |
| 已绑定目标的运行状态异于配置 | nested render 抛错 | `[7,8,9,10]` | `[7,8,9,10]` | false | 通过 |

两条异常路径均继续给出 `mirror-renderer-reset-required`，未削弱终止帧和重建 renderer 的既有要求。查看 `company-mirror-render-v1/scissor-correction-v1` 的保留证据，`baseline-regression/report.json` 记录旧代码四个新增用例真实失败，`fixed/report.json` 记录修复后23项通过。后者为修复代理执行，本代理独立执行范围为上表四项。此次闭合没有 GPU 或浏览器执行，也未改产品源码。

## 预算证据进度

初读 `qa-mirror-preview.cjs` 时仅有最后主 pass 的 calls/triangles，缺少反射 pass 和提交耗时。已即时报告总工。审查期间总工新增 `lastReflection`，记录反射 calls、triangles、同步 CPU submission 毫秒，并新增十次 host submission 采样。该源码补充可覆盖原字段缺口，最终须执行相应固定候选并保留结果。本审查未运行该浏览器版本，未将这些指标认定为已测通过。

## 已核实现边界

- `render.js` 的 `install` 在旧场景释放前临时挂载候选并隐藏旧根，执行同步宿主预热。预热抛错会移除和释放候选，旧文档发布点仍在其后。`authoring.apply` 的 finally 会 discard 未成功提交的 handle。存储写入仍由单独 save 路径负责。
- 首次 shader 检查使用锁定 r187 的 `renderer.compile` 和 `currentProgram.getUniforms()`。后者触发实际 first-use link 诊断，错误在候选发布前拒绝。读取过官方本地 `WebGLProgram` 的 `onFirstUse` 和 `getUniforms` 实现。
- 进入 `renderer.render` 或 `renderer.compile` 的未知异常被标记为 `mirror-renderer-reset-required`。预览宿主随后创建新 `WebGLRenderer`，终止该操作或显示帧。代码没有仅凭 `resetState` 宣称私有 render 栈已恢复。
- 实例镜片 geometry clone、Reflector 专用材质和 render target 由 binding 持有。deactivate 清回调、移出场景并分别释放目标、材质及克隆几何。dispose 幂等，静态原模型仍由树拥有。树销毁先释放 mirror owner，随后处理剩余静态资源。
- 目标按可见性、朝向和主相机视锥惰性分配。显示更新最多选择一面并遵守宿主 frameId 与 30Hz，候选预热单独计数，交接可暂存旧/新两个目标。反射阶段隐藏其它镜面且禁用 Reflector 自动回调，避免递归。
- 反射像素与运行目标不进入公司文档，镜面包未加入角色控制、任务、占用或导航修改。功能兼容比较包含固定 mirrorSurface，轮廓仍为外观适配数据。存档现有资源内容 pin 保留。

## 审查时源码身份与限制

| 文件 | SHA256 |
| --- | --- |
| `prototype/src/company/mirror-render.js` | `85e5a5e0686ab8cbab2090068fa41b39ba47a18765650d0b9519bc66ad767e4a` |
| `scripts/company-platform/qa-mirror-preview.cjs` | `cf78bbe8563411db29277e2779745efbcaab46ec66927a33b0deac63e7432c59` |

现有 `evidence/company-mirror-render-v1/report.json` 显示 CPU 检查通过，本审查读取了报告与其测试源码，未再次运行会改写该报告的命令。模型独立几何审查由 `company_mirror_geometry` 执行，其消息报告165项通过，详见对应独立证据。本报告不把其它代理的执行说成本代理独立执行。

宿主 GPU 像素、浏览器关闭恢复、普通电脑性能、角色 C3 和用户视觉接受不由此次只读审查建立完成结论。真实 runtime/model 配置及 Hook 拦截未在本审查中核验。
