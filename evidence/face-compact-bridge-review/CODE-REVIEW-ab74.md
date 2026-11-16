# ab74 canonical/compact 桥接独立审查

**当前阻断：c371首载实际先渲染canonical9块，再渲染compact，原morph纹理仍驻留；需要延后挂载的独立修复后再准入。** 不是源几何/表达输出不等价。实际单页证据 `initial-c371/report.json`：doc-start捕获__debug赋值后立即包装renderer.render及WebGL2 texStorage3D，ready=false时9×2055先渲染/分配，随后9个compact各分配；textures38→53、geometries84→98。诊断有开销，不作耗时结论。Chrome/临时server已关，24对截图尚未运行。

提交ab74c8a68138a551806bd4850be70f3dc3ee65de三产品文件与cpu-4快照核读；public assets、package/lock、main/context guard、shadow helper对6e4801f无Git差异。19文件换行修复保留旧失败且未改pin，最终CPU是精确原Git资源字节。

除首载挂载时序外，限定当前源路径未发现另一个实质阻断：

- 完整VRM SHA在loader先验；canonical保持原对象/数组，source recipe门依旧对canonical执行。render替换前和后续apply均检查预期几何对象，不能把陌生render geometry偷偷当source。官方工具只接working clone，canonical不交给它dispose。
- 精确new→old由源index排序唯一值建立，count/range及每个渲染三角的反向映射均核验；不是按位置近似匹配。各实际属性/形态投影值由CPU门另核。Body、衣服、骨架、UV/材质、源asset/recipe身份不改。
- livePresentation先在canonical上执行眼闭兼容的严格索引/目标数/保护mesh admission并注册私有表达，再compact，最后editor。该模块update仅读manager表达并写原mesh influence；其实际available在CPU setup有断言，mixed时确实调用blink.update，不只是比较普通expression数组。GPU仍需记录系数与保护区画面。
- apply先完整canonical计算再compactEdited，prepareRender接compact；请求取消/warm失败释放本次compact，稳定旧显示不换。reset回初始compact；卸载editor释放编辑体→helper回挂canonical/释放初始compact→既有deepDispose释放canonical，保留context guard。CPU已覆盖pending reset、warm reject、完整actor dispose中晚完成、失败保已有改脸、双actor隔离、派生不压缩。
- cpu-4实际22编辑状态、111表达配置、全部映射shape及getVertexPosition(<1e-12m)、5身份负例/6生命周期、497个追踪几何各dispose一次。纹理解码placeholder，不能代GPU/driver释放或真实视觉。男EyeExtra删除54个全±0目标为语义等价，非缺失buffer字节等价。

内存必须包括未显示canonical CPU数组、compact源/活动编辑体、mapping、canonical计算临时值与working clones；理论纹理16MB→1.8MB不能当总内存收益。此次初始化实证还显示，在延后挂载前实际旧纹理也存活；不能通过释放canonical几何伪称源已不需保留。修复需维持root矩阵校准、attachToScene=false调用方原语义及失败清理。
