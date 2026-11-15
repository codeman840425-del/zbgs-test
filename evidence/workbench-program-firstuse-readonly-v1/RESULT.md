# Three 0.187.0 首用预备：只读决策资料

结论：主色pass有一个可隔离验证的最小入口——在提交前，对staging材料真正持有的每个WebGLProgram wrapper逐个调用 `getUniforms()`，每个之间让出浏览器任务。它保留原诊断并填好uniform/attribute缓存，能尝试拆开一次性首用大块，但不能把单次驱动同步调用变成异步，也不能凭把耗时挪到预备阶段宣布优化。阴影没有公开的“仅编译实际内部depth variant”入口；需要一次限定的材质捕获/代理编译身份实验。未修改产品、Three或资产，未运行GPU、性能或浏览器。

依据：既有1188报告5个主色GL对象compile/KHR-ready与首次draw相同，没有第二次link；每个第一次infoLog仍36–57 ms。另2个depth对象在draw才link。报告没有证明驱动内部哪项工作导致阻塞，本审查不补造该解释，也不把KHR完成等同于反射/日志成本为零。

## 实际源码链（本机固定0.187.0）

| 本机文件/行 | 实际行为 |
| --- | --- |
| WebGLRenderer.js:1400、1462 | compile只遍历普通material做prepareMaterial/getProgram；非node路线没有shadow预备 |
| WebGLRenderer.js:1519、1533 | compileAsync只轮询materialProperties.currentProgram.isReady；不调用getUniforms/getAttributes |
| WebGLProgram.js:822、827 | onFirstUse中保留program/shader infoLog、LINK_STATUS、onShaderError/default错误报告 |
| WebGLProgram.js:911、914 | 然后deleteShader，创建WebGLUniforms、fetchAttributeLocations缓存 |
| WebGLProgram.js:921、938 | 第一次getUniforms或getAttributes才进入同一个onFirstUse，后续用缓存 |
| WebGLProgram.js:953、956 | isReady仅KHR completion轮询；无KHR时直接ready，并不保证无阻塞 |
| WebGLUniforms.js:1152；WebGLProgram.js:182 | uniform/attribute反射还查询ACTIVE数量、逐项名称和location |
| WebGLRenderer.js:2365、2585 | 实际draw路径获得这些uniform；因此compileAsync之后仍会首用 |

WebGLRenderer.compile返回materials，`renderer.properties`和`renderer.info.programs`虽可访问，里面programs Map与wrapper是**版本绑定的内部结构**，不是稳定公共预备API。本机源码/精确行摘录及SHA在source-evidence.json，不建议升级Three与此修正混在同实验。

## 主色pass最小实验入口

保现有“未提交几何、独立staging材料”的事务，在compileAsync完成后、实际几何swap前加一个有界预备阶段：

1. 从该事务staging材料的 `renderer.properties.get(material).programs.values()` 收集wrapper，以wrapper身份/id去重。不要只读currentProgram，不要把renderer全部历史program当作本次任务。prepareMaterial(:1369)会为透明DoubleSide且非forceSinglePass生成Front/Back两项，而compileAsync只等currentProgram；需对收集的每项再isReady轮询。当前5项是否有双面额外项由实验记录，不能假设。
2. 每个wrapper前检查事务generation/abort、avatar存活、renderer context epoch及p.program仍有效；`await`一次真实task/rAF调度，再复查。Promise.resolve/microtask链不保证画面或输入获得机会；idle回调也不能打断随后GL调用。
3. 单独计时 `p.getUniforms()`。这一调用同时填attributes，随后getAttributes应只是缓存读取，可作一次核对。保 `debug.checkShaderErrors=true`。不要先只读GL infoLog——它不填Three缓存，可能多查一次；更不能仅调用isReady。
4. 检查 `p.diagnostics?.runnable===false` 并拒绝事务；保原 `onShaderError` 委托/默认日志。该回调不一定throw，不能以Promise resolved当编译成功。若装临时捕获器，记录关联program并恢复原callback；优先不修改全局callback。正常成功可能没有diagnostics，这是源码的合法分支。
5. 之后再次检查取消/代次，再原子提交；失败或取消保旧几何。单次getUniforms内部不可取消，最多在每项之间取消，必须如实报告最大不可中断时长。

这不是“预算5 ms的函数”：一次p.getUniforms可能仍57 ms以上，for循环分片只避免多项累计。初始compile自身也同步构建/提交所有shaders，其CPU时间要单列。若单项仍超过体验门，结论只能是此方案不能达标；不能靠更换await名字声称消除卡顿。

## 阴影：真实可用入口与限制

`WebGLShadowMap.js:431` 的getDepthMaterial是闭包私有。:435承认公开object.customDepthMaterial/customDistanceMaterial；:443选择共享默认材质；:445–477按alphaTest/map/alphaMap、clipShadows、displacement、alphaToCoverage等建立缓存；:483–513复制side及贴图/clip参数。:546–566才把**实际配置后的材质**交给onBeforeShadow，然后同步renderBufferDirect。compile不访问这些普通阴影材质（只有node handler分支:1458会shadowMap.render），所以额外compileAsync同一main对象不补depth。

可用但不等价的入口必须区分：

- `onBeforeShadow(renderer,object,mainCamera,shadowCamera,geometry,depthMaterial,group)` 可在旧人物正常shadow pass同步捕获真正配置值/目标，不需要第一次画新几何。可保留原callback，立即clone实际material快照供候选SkinnedMesh代理编译；共享默认depth material随下一个物件改写，不能把其可变引用留到await以后当快照。回调不能await暂停draw。
- 代理把**候选geometry和真实skinning/morph布局**配实际depth快照，作为普通material调用compile；它不把customDepthMaterial字段当作compile对象。customDepthMaterial可让真实绘制选择显式实例，但引入它会改变产品材质所有权，本轮不建议为预热顺手永久替换它。
- `renderer.shadowMap.render(...)` 或整个离屏renderer.render会执行所有阴影draw/分配/状态变化，不是仅预编译，仍可能整段同步阻塞。不能先这样搬走370 ms再称优化。`renderBufferDirect`也会进入setProgram+首用+draw，不能当无副作用编译器。

**限定shadow实验**：仅捕获已观测当前PCF两个MeshDepthMaterial变体；用旧场景下一正常shadow pass取得实际配置，再在提交前创建两个对应候选代理。在正确shadow render target状态下同步调用compile、立即finally还原，然后异步轮询全部wrapper并按上述逐program首用。保留影子相机、贴图与alpha/clipping/side/depthPacking、morph数量/normal存在、skinning和lights counts；scene为实际depth的空fog/environment语义（真实renderBufferDirect传null），而不是盲套主色targetScene。有shared lights计数/内部RenderState差异的风险，因此**只有实际下一次shadow draw的cacheKey及GL program对象完全相同且无新link/first-use，才证明预备命中**。若两个条件不符，本次尝试判未命中，不能称同variant已保证。

此版本默认MeshDepthMaterial.depthPacking是BasicDepthPacking（材料源码:43），不要照旧教程硬写RGBADepthPacking。阴影target是实际WebGLRenderTarget，输出采用working color space/NoToneMapping，主屏为SRGB/ACES；仅把离屏target.texture.colorSpace设SRGB并不等同主屏变体，WebGLPrograms.js:179/217决定这一路径。灯数量、shadowMap.type、side、clip、材质defines/customProgramCacheKey、morph布局等也参与cacheKey，见源码:454–605。不做PointLight/VSM/新渲染路线扩展。

## 状态、取消与缓存生命周期

- 任何临时target切换必须同步try/finally包围compile，恢复getRenderTarget、activeCubeFace、activeMipmapLevel；禁止跨await持有“影子target当前绑定”，否则下一帧主画面会渲到错目标。若实验改viewport/scissor/clear/autoClear/XR/阴影更新开关，也必须保存恢复；更小的compile-only阶段不应改这些值。保持原camera/layers、clip平面、材质side/defines、scene环境/灯参数，不能把失败归为源几何。
- 不重挂原角色或原灯parent；候选代理只引用可共享骨架/纹理，独立material/geometry所有权明确，不运行VRM/live时钟更新。捕获callback需原样恢复，取消/人物更换/场景卸载均finally清理。
- wrapper不是拥有者，暂存到JS数组不阻止program删除。WebGLPrograms.js:641 acquire按cacheKey引用计数，:663 release到0就destroy；WebGLRenderer.js:1176由material.dispose释放其全部program。预备material必须保活至真实material首次acquire同program之后，或沿当前实现保活至avatar dispose；否则提交前dispose可能把已暖程序删掉。失败/取消只dispose本事务自有资源，不能p.destroy或手动usedTimes。
- 当前foundation-avatar.js:64/98的faceWarmPromise只创建一次，材料保留至avatar释放。这足以保住本次引用，**不等于后续换布局/影子参数/材质仍全覆盖**。future cache应以实际renderer/context与变体族验证有效，不以永久resolved Promise推断；本轮先测唯一首次编辑，不泛化缓存框架。
- context loss/restore时initGLContext重建program/properties（WebGLRenderer.js:1127），旧wrapper与warm-ready均失效；取消/代次与context epoch需同时拦截。浏览器销毁或context丢失时不能继续poll已destroyed wrapper。compileAsync无原生abort，丢弃结果/自有材料dispose只能做到协作取消，不承诺中断驱动。

## 一次后续试验及判定

选同固定1188首次嘴宽动作；不与prototype“只clone实际变形primitive”候选混合改变。仅加主色逐program first-use这一项，保完整GL对象/cacheKey/link/KHR/日志时间与提交标记。记录①compile同步块②异步等待总时③每个first-use块④预备期间旧场景帧/输入⑤提交后首draw及shadow剩余块⑥取消前中后和资源计数。需要最大主线程块、输入延迟和总时间，不只首draw改善。

若主色身份命中且有实际帧间让步，再由root决定是否执行上述仅两个已观测shadow变体捕获实验。两者可分阶段得到归因；不因为总时增加/移动而宣称优化，不关闭checkShaderErrors，不gl.finish，不以开发机结果代普通电脑。无GPU实际执行，本文件只提供后续一次决定所需的路径和失败边界。
