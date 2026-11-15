# 眼裂宽 +1%：待固定构建的最小运行验收

状态：只读准备，未执行浏览器、未修改产品。仅原 female / male，`none` 与 `aperture-width101-v1`，不扩派生、不扩范围或正负连续参数。实际运行字段、草稿新 schema 与固定 build 尚待根代理提供；不把预期字段当已接入。

## 已核实的复用接口与时序

- 复用 `qa-m2-nose-sample.cjs` 的 build/资源原字节身份、同姿相机、geometry hashes、单域复位、草稿与同源 comparison 实例工具。新入口拟为 `scripts/qa-m2-eye-sample.cjs`，输出按真实 build 独立命名；不改鼻脚本或旧结果。
- `live-presentation.js` 的 `preUpdate` 每步重写 happy/口型/blink。自动双眼 blink 周期 3.6 秒、闭合段 .18 秒；它不能产生定量单眼半闭诊断。`postUpdate` 再调用真实 lookAt；`foundation-avatar.update` 为 preUpdate → vrm.update → 世界矩阵 → postUpdate。
- 原 VRM 表情资源明确含 Blink/Blink_L/Blink_R；运行时应先枚举 actual expressionManager 的 blink/blinkLeft/blinkRight 映射和绑定，缺失直接报告，不用自写变形替代。
- 现 UI 注视只有“看向镜头”，command gaze 接受世界目标。数值边界必须从每体实际 lookAt range maps 读取，不把任意 ±角度称源边界。
- 原导出端点/recipe 提供 sourceVertexMap、primitiveIdentities、expressionNames、sourceMorphPositionSha256、保护区及独立 NORMAL。位置转换是 mesh-local affine X，但运行回读以独立导出资源为比较真值，不只按运行公式自证。

## 最小序列

1. **身份与同姿中性**：两体各核 build、原 body SHA、实际 eye recipe/端点 SHA。无发、原配色、中性，不装新附件。先稳定再暂停，锁 simulationTime、全部骨矩阵、相机外参和表情权重；原/新 front、side、45°同姿图。不允许切样件推进时钟。45°明确为 QA 相机。
2. **有限静态闭眼诊断**：中央注视共 7 状态：全开；双眼 .5/1；左 .5/1；右 .5/1。每状态旧/新分别记录有效表达值、morph influences、实际眼/头骨矩阵及眼周最终皮肤点。先保存表达值并暂停，清理三个 blink 通道后设置指定通道，调用现 expressionManager.update、矩阵刷新及 render；不调用会覆写 blink 的 actor.update。这是直接表情诊断，不冒充 UI 或自动眨眼。每对图后恢复表达状态，断言非眼骨/时钟/相机相同。中央7态主要正面图，侧/45°只补全开及全闭，避免相机全排列。
3. **原注视边界**：沿实际 lookAt 配置到左/右/上/下边界，不修改 eye pivot/range。根已核源映射水平内/外 8°/12°、上下 10°；运行时仍记录实际 range map、世界目标与眼骨输出，不将输入角直接当输出角。每边只比原/新全开与双眼全闭，记录实际输出眼骨四元数；半闭已由中央诊断覆盖，不再做全笛卡尔积。另保存“看向镜头”的实际近景 worldTarget 作为产品代表值。若有局部可疑露虹膜，仅保留具体失败近图，不扫参数。
4. **真正 1×**：男女各一条约 12–16 秒原/新短片，中性 → 自动 blink → 微笑讲话 → 看向镜头/左右代表注视 → 复位，保证原/新各至少一次真实自动闭眼峰值。实际 rAF 表达权重/时钟与 pageerror 采样；不注入诊断 blink，不录30秒舞。完整原片与全时段抽帧分开，后者不代表连续人类观感验收。
5. **源→运行和保护**：原/新 positions、morph POSITION、NORMAL 与独立端点按源顶点/primitive身份映射比较；记录最大差、索引、单位和阈值来源。UV/index/skin权重/骨 rest 与 inverseBind、虹膜/高光/非编辑域应按已声明保护合同保持原字节（原 blink 中虹膜自带的运动不能误判被编辑）。静态7闭眼取实际最终皮肤与同输入导出端点回读，不能只查 basis。法线邻域按 recipe 特许区域单列，不能要求整个 normal 完全不变。
6. **四域组合/独立复位**：eye + mouth ±4% + 现 brow/nose 同时存在；分别复位一个域，结果与对应其余三域从原底重新组合的 bytes 相同。全部复位恢复原 geometry 引用/position/normal/morph、原 appearance/服装选择；不借此次扩大颜色/服装矩阵。
7. **草稿与隔离**：新版保存/关闭page重开恢复四域。旧 v3 保 mouth/brow/nose、eye=none；v2 保 mouth/brow、nose/eye=none；v1 保 mouth、其余none。旧 schema 带未来 eye 字段必须按新合同拒绝；错误 eye recipe SHA 拒绝并保持当前 geometry/appearance/outfit。男女各自草稿不串；实际同源 comparison 一次 eye 修改/复位，主实例字节及状态不变。仅本地存储，不称云存档。

## 视觉裁决与不能声称的内容

上下眼皮选点“零缝”只是局部几何量，不等于闭合遮挡通过。必须看正常 alpha/material 下是否露虹膜、眼白细缝、眼线/睫毛悬浮或剪断、眼角撕裂、鼻梁旁阴影异常；单眼要看未闭那眼是否受影响，注视要看高光与虹膜仍位于眼球。保留原基模已有异常与本样件新增差异，不删除眼白/睫毛、改变遮挡阈值或调小动作。+1%差异很小，不假称显著改善或任意眼型已支持。

每阶段保存检查输入、实际状态和失败；第一次关键准入/同姿/保护失败即停止依赖步骤。此次不重录舞蹈、不进行整机性能测试，不继承普通PC通过。最终正常片需要 root/用户查看，源和数值通过只是中间结果。
