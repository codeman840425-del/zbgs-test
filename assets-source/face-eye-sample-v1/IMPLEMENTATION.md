# 唯一眼裂宽+1%端点：选择、契约与失败边界

本候选独立于 `face-eye-parameters-v1` 只读结论，不回写其报告/哈希。只改变原男女Head绑定的眼裂相关几何，未改runtime/control、原source、眼骨、裙或舞。

固定输入：原男女body/blend SHA、只读study SHA；`spec.json` 锁 `selection.json` SHA。每侧24点眼口环及原眼角中点来自独立男女拓扑。Face_SKIN用原边图8 mm衰减；EyeWhite、Eyeline、Eyelash按实际材质同侧组统一系数1.01，所有非编辑点规范为scale1/center0。无以近点硬绑定透明根的步骤。source匹配按实际材质逐源点进行，处理Skin/White同坐标重复点，不把一个任意最近源顶点当整个缝。

强保护：EyeIris/EyeHighlight/EyeExtra/FaceBrow/FaceMouth、其他skin点、Body、节点rest/inverseBind、UV/权重、全部原表达映射。男原blink的虹膜/高光微小差分保留。Eye pivot不动，眼角中点X固定；源原形态内既有闭眼/眼角运动保留其语义。

每个绝对shape应用同一固定仿射：`xNew=centerX+(xOriginal-centerX)*xScale`。因此`deltaXNew=deltaXOld*xScale`；Y/Z不变。不是鼻/眉A=I的恒delta方法。Skin/White48对共享完全相同系数与中心。

实际选择女632点、男630点。男Basis中2个近中心点的理论位移约9.3 nm，Float32导出位移约11.2 nm，跨越预检使用的10 nm统计线；它们不是恰在固定中心。预检预测628点、实际计数630点，原预检spec不回写。完整逐点仿射残差与保护域才是正确几何门，原计数失败保存在initial-audit-count-boundary.json。最大Basis横移女约0.490 mm、男0.527 mm（主要为外围图层）；眼角各约0.183/0.187 mm。完整Face受影响法线邻域各660点。现有嘴/眉/鼻的非零位置域与本域均无交集，按各自受影响三角计算的法线邻域交集也均为空；逐点结果与所读recipe SHA在selection.json，不以“看起来不同区域”代替实核。

导出链：原blend→独立editable.blend→native addon raw与repeat→每个绝对shape独立法线整理→final与repeat。raw保留，final加入NORMAL形态；从原底fresh-check再执行同一链。邻域外保原作者法线，不能从原POSITION-only morph声称表情法线已正确。所有阶段身份分别记录；blend容器是否字节相同另报，不由VRM哈希推定。

recipe数据契约：`sampleId=aperture-width101-v1`、`sourceSpace=glTF mesh-local metres`、原base/position/normal SHA、每primitiveIndex/material/UV/index/targetCount身份、expressionNames及POSITION morph hashes、全点xScale/centerX、原源匹配（含同坐标候选）、位置保护/法线邻域、Skin/White48对、parameter交集、raw/final SHA与有限范围。仅原态和固定1.01两个状态；不是±范围，也不是当前runtime自动准入。

闭眼筛查：除全部原形态的位置/法线/三角门，另固定原虹膜的UV内部采样点，比较原态/候选0、半闭、全闭与左右单眼Close前方的实际Skin/White/Eyeline/Eyelash三角遮挡及原纹理alpha。点集不从候选重新挑选；不把原1mm级上下链距离强捏为0。该CPU方法没有真实投影像素/排序精度/材质shader、没有最终灯光与交互，因此只筛查新增露虹膜或透明遮挡变化，不能替代浏览器近景和半闭/单眼/注视回读。

停止条件：任何保护破坏、新增退化/翻面、repeat/fresh不一致，或筛查发现新增完全闭眼可见虹膜/明显层关系改变，均保留失败并停止直接准入，不扫比例、不移动pivot、不把用户当修图人员。即使CPU未发现问题，实际有纹理半闭/单眼/注视与透明根仍是运行前必要验证。
