# Face compact 独立审查与实际回归

最终本轮候选 `0fb420e5b124`，源 `422a23911784c0b7448841eb97839973901b0be5`；对照公开固定 `460b72813f68` / `6e4801f`。独立构建目录 `experiments/face-render-compaction-build-422a/dist`。源码整合后的提交由根另行重建核验，本文不提前继承该结果。

**工程结论：已消除明确的排序视觉回退；微差保留，非逐像素完全等价，非用户观感通过。** 既定24对同姿状态门、实际坏源拒绝/重试、v5十门及真实上下文失效/恢复门通过。所有本轮Chrome和临时服务均关闭，未更改产品或公开入口。

## 两个实际失败与因果修复

- `c371`：在等待装备装配期间先把root挂入scene，ready=false期间仍真实绘制9块canonical Face并上传源morph纹理；之后再传compact。`initial-c371`保留原记录。`45aa/d718`仅延迟成功挂场景，`initial-d718`确认没有canonical draw/2055宽morph纹理，先出现compact几何。不能因此称canonical CPU源已被释放；它仍用于严格身份与制作算子。
- `d718`：同姿男眼线上缘出现明确差异，最大148色阶。`sort-460-r2`与`sort-d718`实际读取renderer的透明绘制列表：原5部件共享SkinnedMesh.boundingSphere及z，候选因compact各自顶点集合而形成不同object sphere，排序从Brow→Highlight→Eyelash→Eyeline→EyeExtra变成EyeExtra→Eyeline→Highlight→Eyelash→Brow。两版geometry.boundingSphere相同，故原CPU geometry bounds门没覆盖这个对象级语义。
- `422a/0fb`在compact赋值前，对尚为null的SkinnedMesh sphere安装一次性wrapper；直到Three首次需要计算包围球时，才同步临时换用canonical几何和当时骨姿，随后在finally恢复render geometry及原方法/属性归属。已有非null sphere保留原引用/数值，未调用的wrapper在dispose/失败清理。它不是提前求球；未采用的eager-rest草案仅存CPU历史，没有成为该固定构建。`sort-0fb`恢复原顺序及逐值相同z=.6500036817533859；中心有约4e-17浮点计算差，不影响本例z/图。EyeExtra仍删除54个全零morph，未做shader/透明度/材质/排序阈值调参。`poses-0fb-two-r2`男原正面与闭眼45°首次对照均逐像素0差，支持对象sphere是该明确回退的直接原因。

## 同姿程序及画面范围

`poses-0fb`原F/M各6状态（原位、嘴−12%/aa、嘴+12%/happy+半闭、眼端点/全闭、四域+gaze、reset）×正/45°共24对。暂停后严格重放相同raw/normalized骨姿、时钟、相机和灯光；比较表达权重、真实private blink注册/系数/保护部件与geometry状态。所有字段逐值相同；reset回各自初始render geometry引用。实际male源字节改1位会被SHA门拒绝、保留当前女性，撤销route后真实重试成功。0pageerror/HTTP错误。

像素读取原1200×814 canvas PNG：18/24完全一致；剩6/24最大28变化像素、单通道最多1/255，逐图记录 `pixel-comparison-0fb.json`。未改容差将其变成全通过。额外460女mouth-plus-front重复0差；同0fb男closed-diagonal首次2图0差、完整24时14像素/1级，表明本环境同版重复也有微差，但不据此给所有差异作统一噪声豁免。

已实际逐张查看 `review-0fb/female-1..4.jpg` 与 `male-1..4.jpg`（覆盖全部24对和6张微差图），未发现新的结构/轮廓级变化、眼线上缘丢失、裂口或缺面。正常灯光与原眼皮形态照旧；截图不等于正常1×连续验收。大图切换入口为 `index-0fb.html`，历史d718失败页 `index.html` 保留。

## 最小实际接口回归

`v5-0fb/report.json`：既有10门全部通过。原F/M旧v4 .025保持原operator与SHA；新v5四域真实下载/文件选择回读相同；坏recipe SHA保旧；颜色跨geometry修改保持、复位恢复原贴图对象和像素；同源peer独立颜色；manifest/neutral一次503失败保旧后重试；male-jaw仍仅0/+4。compact只在原F/M，不能据此称派生也被压缩。

`context-0fb/report.json`：实际WEBGL_lose_context发生在detached body compile期间，失败保旧并清loading；真实context restore后重试男成功，再回女。最终lost=restored=1、compileStarted=compileSettled=3、contextLost=false、loading=false、error=null，0pageerror。该项是明确故障注入，不是自然故障发生率或性能测量。短恢复原片存该子目录。

## 保留的QA失败与源审边界

`poses-d718`保留JSON的−0/0表示差失败；r2两侧统一JSON表示，无数值容差。`repeat-460-female`保留过滤用例遗漏前序编辑导致revision2/5差；r2保留完整操作序列仅筛截图。`sort-460`及`poses-0fb-two`保留异步装备兄弟插入顺序不一致的旧按下标重放假设失败；最终仅对唯一非空名称建立双射，重名仍要求原位置，不放宽真实bone/camera/weights门。所有实际执行脚本快照均保留。

源审查确认：完整VRM SHA及各recipe/index/attribute hash继续从canonical验证；live/private blink在canonical上严格注册后才compact；映射按实际index验证；只对工作clone执行官方dispose；reset回compact引用，editor dispose后helper还原canonical，再由原deepDispose回收源。最终三产品文件与本报告附source-final快照绑定，所含helper明确是首次使用时计算的lazy wrapper。前桥接版本cpu-4覆盖22状态/111表达配置、5坏身份/6生命周期、497个几何逐次dispose；它不是最终lazy版本测试。最终cpu-object-sphere-lazy-1仍覆盖22状态/111表达配置及5身份拒绝，生命周期扩为9项，含首次调用前改变骨姿、原继承方法恢复、求球异常finally恢复、已有sphere引用保留、首次调用前dispose；533个跟踪几何各dispose一次。这两组CPU均引用prototype实际报告，不冒称我另跑全矩阵。

容量、正常live片和成本由prototype报告负责；本报告不把GPU纹理降低或短片0错误外推普通电脑、整体卡顿解决、动画自然度或无限生命周期。已接受的裙/舞封存范围不变，本轮停止扩测。
