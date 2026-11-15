# Joy + 自动眨眼：最小运行时兼容方案（只读）

未改产品、冻结源或构建；未开GPU。读了 `eye-expression-overlap-study-v1` 及 `supplement`，并用实际原男女Face属性和当前 three-vrm 3.5.5 类做独立CPU语义fixture，结果见 `cpu-semantics.json`。

## 推荐：既有target、按实际primitive绑定的负贡献

保留 `ALL_Joy` 和现有 happy/aa/blink API，不新增或改写任何morph buffer。对精确原男女资产的四类实际mesh（Face_SKIN、EyeWhite、FaceEyeline、FaceEyelash）建立实例私有自定义 `VRMExpression`，其 `VRMExpressionMorphTargetBind` 指向**原有**EYE_Joy索引，bind weight=-1；该自定义expression本身取非负权重 `h*b`。ALL_Joy仍h、Close仍b、口型仍a：

`P = Basis + h*ALL_Joy + b*Close + a*A - h*b*EYE_Joy`（仅上述四类实际绘制primitive）。

Brow/Mouth/Iris/Highlight/Extra primitive不加入该bind。源真实索引核查：四类与受保护五类的引用顶点集合男女交集均0。补充报告EYE_Joy在Skin/White/Line/Lash有652/651点，女另有22眉点最大61.81µm；不绑定Brow即可**完全保留这22点**，无需接受微动眉或附加mask morph。MTH/EYE在眼周交集处保留原ALL中的MTH贡献，嘴宽支持域及FaceMouth不变。女ALL分区0.238µm求和残差也留在ALL中，不通过重建ALL丢掉。

库语义已实际核：`expressionManager.setValue(负数)`被saturate到0，直接设置负EYE expression不可行；现成MorphTargetBind的负bind coefficient不会被clamp，正weight×负bind可生成负target influence。Three相对morph的baseInfluence始终1，负influence受支持。fixture确认ALL/happy、Close、AA权重保持，受保护primitive修正位移精确0、连续两次manager.update不累加、设0与unregister前clear能恢复。无shape数量/索引/源哈希变化，四域geometry recipe继续使用原56/54数据。

## 为什么不选另两种做法

- 对所有mesh直接写负EYE：会连带女22眉点；不符合“只动实际眼部”。对全脸happy淡出也不选。
- 在VRM.update后逐点改POSITION或clone：要承担每帧buffer更新、morph叠加/法线/几何编辑与cpu采样先后，改变现不可变底合同，代价远高于现有权重bind。
- update后直接赋选定mesh.morphTargetInfluences[EYE]=-h*b，数值上也可做到，但该EYE原来无VRM组，manager不会替它清零；必须额外管每次刷新/关闭/卸载，容易残留。注册一个已有API的自定义bind把clear/apply纳入同一manager周期更小。无需重写ExpressionManager、添加控制器或给shader塞特例。

## 实施前准入与更新顺序

1. 起步仅原F/M精确SHA，核ALL/EYE/Close/AA实际target名与index、绑定100%、非binary、override none；校验修正四类实际mesh及outline全被找到。未知派生不因同名自动通过。
2. 实际load后的`morphTargetInfluences`若跨受保护/修正mesh共用同一array，必须拒绝该绑定方法或先另证安全；当前CPU fixture只模拟独立数组，不能冒充实际加载门。也检查其他绑定/动画没有占用EYE target。
3. live.preUpdate计算当前happy与自动blink后设自定义正权h*b，然后原vrm.update统一清零/应用；不在vrm.update之前读取上一帧target coefficient当h/b。dt=0仍从当前表达意图重算、无历史状态。gaze原顺序不改。直接绕过live的调试ExpressionManager.update不自动构成此适配链，应在QA明确实际调用路径。
4. 新expression名字实例私有、不得覆盖原组；不加入blink/mouth/lookAt override类别。退出happy/眨眼窗口时weight=0；dispose应先clearAppliedWeight再unregister。换几何仍是原mesh+原索引，所以新geometry的正确EYE delta自然被读取，不能缓存旧vertex数组。
5. 当前自动眨眼是两眼同b。不能把此全EYE target负补偿直接泛化成单侧blink，后者需侧域数据或另立合同。当前公开live API不提供单眼表情选择；单眼源诊断仍应保留原结果，不能称已修整个表情库。

## 必须验证，不能只以POSITION代数批准

- 原/固定四域编辑后的实际mesh引用索引上，b=0精确还原，峰值与过渡h/b正确；Brow/Mouth/Iris/Highlight/Extra、AA权重及口周最终位置保护。标准关闭/暂停/0dt/换体/重复update/双实例/销毁无残留。
- 原source POSITION-only与编辑后新增NORMAL各走真实shader。负EYE也会作用于它已有的NORMAL delta；它等价于有限法线target组合，不等于混合后几何重新计算出的真实法线。不得把POSITION保护当阴影通过。
- 男女1×完整0.18秒眨眼，happy+speaking同眼峰值、半闭/睁开、正/斜、眼端点原/开各一次，保原片对照。确认中央睫毛实际连续、嘴笑眉不脉动，以及新法线/outline不闪；保留原单blink已有轻微遮挡，不要求以面点数清零代替观感。

回滚范围仅实例自定义expression/绑定及其live一处设权；禁用时clear+unregister，原ALL/Close/AA与56/54目标、四域recipe及源文件全部原样。建议先隔离实现这一项，不追加R/E target或修改公开4196，实际观看后由root决定。
