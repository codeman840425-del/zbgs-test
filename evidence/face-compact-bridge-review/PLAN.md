# Face-only canonical/compact 桥接：独立审查及有限GPU计划

状态：只读准备；尚无桥接代码审查结论，未运行浏览器/GPU/Blender。基线应为公开460/6e4801f，候选须确切提交独立构建。

## 已核官方可行性证据

已读 `official-vrm-compaction-feasibility-v1/check.mjs` 与 `face-only/report.json`。真实GLTFLoader/VRMLoaderPlugin、官方removeUnnecessaryVertices，纹理解码stub。逐渲染索引映射检查POSITION/NORMAL/UV/skinIndex/skinWeight/全部现有morph，保留三角次序、groups/drawRange/bounds、mesh/skeleton/bind矩阵及expression影响值。Face父节点遍历断言仅9个Face mesh；Body等对象不换geometry。现有editor拒绝压缩几何是预期的身份门，不应删除校验来“修复”。

男性EyeExtra被官方删除的全零形态包含−0，证据只支持所有引用分量数值为零、表达语义不变；**不能称属性存在性/字节相同**。还需实际GPU确认该primitive没有因无morph布局而错误显示。官方dispose旧geometry事件不是CPU数组被删除，保留canonical所有权/生命周期应明确。

## 提交后源码必查

1. 先完整资源SHA与canonical属性门，再建立精确new→old索引映射；不能把compact属性冒充canonical哈希，也不能按顶点位置近似反查或只用材质名绕身份。检查索引范围、顺序、每个语义和shape数，不丢口腔/睫毛/权重。
2. canonical只作CPU计算/配方验证，compact才作为最终显示。改脸算完后按同一映射投影到相应primitive；apply/reset/失败/新请求取消都不得把canonical全量网格意外挂回，亦不得丢旧source保护门。原身体/装备/骨架/表达bind仍是原对象。
3. 表达绑定仍指原mesh及原shape索引，不能combineMorphs/重排；全零目标被删的EyeExtra单列处理。当前blink兼容模块的目标mesh与源形态访问需核，不可只看expressionManager值相同。
4. canonical、compact源、编辑compact clone、等待中的prepareRender候选各自所有权清楚；官方utility已dispose旧geometry，后续dispose不应造成跨actor资源释放。失败恢复/actor切换与460context guard完整保留；异步晚完成不得挂旧网格。
5. 新geometry在首次render前就绪，不修改已上传geometry布局；不混入零NORMAL或shadow实验。预算计canonical CPU、映射、compact CPU/GPU纹理、编辑临时全量结果和活动clone，不能将16→1.8MB纹理容量当总内存/总耗时收益。

## 最小实际同姿GPU脚本方案（待fixed build）

复用 `qa-m1-common.verifyCandidate`、`run-fixed-check.cjs` 的固定身份与临时服务清理，及 `qa-face-selective-browser.cjs` 的pause/实际facial.set/表达刷新/canvas截图实现；新单文件参数化base/build/out，拒覆盖。**不直接运行旧19组脚本**，其reset断言canonical geometry引用恢复不适合新的canonical/render分离，应改为candidate原始compact引用恢复，并另外核canonical不变。

两固定build依次加载，原女/原男各一页。每body从基线保存完整raw骨局部变换、root、sim时钟、camera world/projection、灯光/阴影与材质状态；候选暂停后重放同一骨姿，不推进时间。每图记录并严格比较实际骨world矩阵、相机/光、expression与influences、几何状态；不成立则不做像素归因。截图由实际renderer完成，所有配色初始original，发型/衣物一致，保持既有颜色管理、AA和shadow，不人为关闭昂贵分支。

每body仅6个状态，每状态正面与45°两张：

|状态|固定表达/用途|
|---|---|
|初始原位|neutral，原色/眼口/outline/EyeExtra|
|嘴−12%|aa=1，口腔/唇边与normal|
|嘴+12%|happy=.65、blink=.5、aa=.5，半闭与微笑|
|眼5%|blink=1，闭眼/睫毛|
|四域组合|现有合法端点，实际右侧gaze输出+blink=.5，眼骨/轮廓|
|全部reset|neutral，compact原引用恢复及原图复现|

总计每build24张（24对），不拓展全表情/注视笛卡尔矩阵。固定canvas输出保存原图、差异图和变化像素/通道最大差；不事先放宽像素阈值，发现差异先定位是同姿门失败、shader/透明排序还是实际几何。截图只能证明这些固定姿态，不能代表动画自然度。

另仅一次错误source身份请求：通过精确资源请求route返回改字节内容，确认hash失败、旧人物/配方/compact引用保留，撤销route重试；不伪造资源SHA。CPU还应由实现者覆盖canonical attribute篡改，不能以网络SHA失败替代该门。

若根要求动画观察，沿真实live API加男女各一短讲话/自动blink/注视，固定1×并记录真实时钟；不能用诊断expression写入冒充live播放。无需舞蹈、服装、全动作矩阵。性能由prototype独占另测，与截图/像素诊断分开。
