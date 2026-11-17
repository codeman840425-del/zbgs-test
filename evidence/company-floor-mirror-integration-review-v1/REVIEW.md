# 落地镜有界独立集成审查

2026-11-16。本轮仅写本目录，未改生产源码、资源、既有证据或状态文档，没有运行浏览器、GPU或git提交。核读 mirror-data/geometry/render、floor-mirror-samples、四款登记资源与生产provenance、315项几何报告、26项共享运行报告、数据5组以及浏览器dev-v1的6组实际结果。

当前有界审查没有剩余阻断。下述P2已由原几何agent修复，并通过本审查的同反例复核。最终固定源码构建、录像和独立交付验证由主包继续完成，本文没有把开发版证据改称最终版本证据。

## P2原始发现，已复核修复

镜框的闭合游离分量能够绕过支承校验。对四个实际登记GLB逐个用真实GLTFLoader加载，把一个闭合.02m立方体追加到 mirror-frame 的同一geometry，中心为 [.35,.15,-.2]。它位于总包络内，与框体、背板和共同支承完全分离，且处于镜片后方。四款均返回 continuousSupport=true。原GLB及登记字节未改，变异只存在于内存。

复现见 probe.mjs 与 probe-report.json，几何源SHA256为 `17849775166bb282d9550112b6100dd45afb29c4d6ffb4940ac21c9390c29018`。原四款在变异前均实际通过，并匹配资产SHA。

原因是 mirror-geometry.js 的 closedPositiveVolume 只检查总正体积和闭合边，允许多个闭合分量。validateFloorSupport约350–357行只要求整个frame有一处正面积背板接触，之后把整个frame排除出附加支承图。旧315项检查覆盖单独命名的悬空support及开放frame，没有覆盖同一frame内部混入的游离实体。

原审查建议按实际frame的每个连通实体核到背板/共同支承的接触，或用精确受限框体轮廓/厚度排除游离分量。现有四个登记资产没有由此反例发现游离部件。修复后的结果见下文复核记录。

## 已核接缝

identity-review.json独立读取当前资产与依赖。

- 与当前HEAD既有目录逐资源比较，原资源条目零变更，只有floor-mirror-round/full/arch/grid四个新增ID。四个旧墙镜和四个新落地镜的实际GLB长度/SHA及独立resource.json与catalog完全吻合。
- 落地生产源、生成器与全部dependencyPins匹配实际文件，包括墙镜原GLB/sidecar、原生成器/参数、Three/loader/exporter/MIT和两个合同。生产报告保留初次失败、定点修复、真实源参数变体及重复导出。verification.json报告曾在无evidence的独立目录复制完整Three和确切依赖并通过重建。本审查核其所需输入与pin，没有重复执行完整生产。
- floor-mirror-samples分别提供正面与yaw90布局，parent仍为room，实例y=0，共用真实南侧门口和公共area。数据检查核转向后.6×.8m阻挡、换款保ID/父级/变换/状态、复制实例及非法接地/转角/重叠/堵门拒绝。
- mirror-render只增加按mountRole选择平面位置、复制位置以及使用位置的世界锚点，共用原Reflector/controller。26项报告证明完整重基、yaw90、混合墙/地总1活动、同token/30Hz门、隐藏释放、恢复fresh、候选discard/坏shader保旧目标与峰值2。原墙镜23项运行回归也通过。
- install沿原临时候选挂载与旧root隐藏的preflight边界，成功才释放旧场景。owner清理仍在build失败、discard、替换、切层/building及scene.dispose统一执行。数据存档没有镜片像素。

## 浏览器dev-v1的证据边界

报告build为b84b9417839e，6组passed，pageErrors为空。分别覆盖四款独立浏览器重开保资源、主相机后方真实宿主物改变反射像素和镜头视差、yaw90镜片/障碍一致、四个非法布局操作保文档/原root/存档字节、墙地混合live=1及非聚焦/building释放、两层多轮切换和整份存档重开。

其中offscreen测试的before/red/blue/shifted哈希分别为3506772979/2680856686/4001041764/4237372334，实际颜色切换和镜像相机几何共同支持实时宿主反射。它是公司world中的诊断盒，不是角色C3。转向镜面世界位置[-1.974,.92,0]与+X法向正确，导航报告含既有角色半径膨胀，不能把导航hw/hd当原模型尺寸。

需要保留以下限制。

- 四款非零目标检查对RGBA所有通道计数，alpha也会计入，单独的nonzero>1000不能证明每款有有效RGB内容。它仍有真实目标及四款恢复证据，完整矩形款另有动态像素变化。根代理已决定在最终检查补RGB计数并已观看stand/turned/offscreen图片。
- 共享预算在该6组中证明同controller只有1活动目标和隐藏后0新增pass。每帧/30Hz上限主要由26项CPU报告支撑，没有在这6组内量测实际完整时间序列。
- dev-v1的失败保旧覆盖文档/布局准入失败，没有在此6组中注入真实renderer或mirror shader故障。根代理已补dev-v2共9组，待本审查复核其记录。
- 两层最终重开回到building呈现，因此顶层cost全为0。实际运行成本只能引用此前各组保留的per-pass快照，不能把0作为落地镜成本。
- 原ordinary-PC、物理抗倾倒/稳定性、真实角色接触及C3均未由这些检查覆盖。视觉最终接受仍归用户。

根代理将补真实cutaway隐藏断言。本审查不把“聚焦公共area”称为已经检查所属墙剖切对落地镜的全部行为。

## 修订复核

新几何源SHA256为 `7a975d5cf9a45f99c01e31c95445d2eccb0efda42f62eaa6947fee6eccf8bf36`。原几何agent按既有1e-6位置焊接边拆frame shells，逐shell核闭合、正体积和真实z=.012三角与指定back凸轮廓的正面积接触。新347项floor报告包含四实际和四合成的悬空分量、同背平面但XY分离、逆向shell拒绝，以及真实接背多分量正例。旧wall165项报告仍通过。

本审查没有重复全部347项，而是用原probe再次读取四个实际GLB。recheck/probe-report.json保存四款原资产通过、同一个悬空分量变异逐款报mirror-floor-support的结果。旧probe-report.json仍保留原四款假通过。四个GLB哈希与登记保持一致，P2关闭。

同时核读浏览器dev-v2与dev-v3的9组报告及对应脚本。dev-v3仍为build b84b9417839e，以下新增证据有效。

- 四款首次/独立重开均检查RGB通道，rgbNonzero为786432，已避免alpha-only阈值。非零背景本身只证明目标RGB可读，动态诊断另由颜色变化支持。
- 主相机后方盒子改红时，redPixels从72651增至75154，改蓝后回到72651，bluePixels从1024增至3527，RGB hash随颜色和镜头变化。盒子仍是宿主诊断物，没有被称为角色。
- 相机移到[1.5,1.2,7]，实际effectiveMode为cutaway且5面墙隐藏，落地镜仍active/fresh。随后详细模型隐藏与building使目标归零，不把墙镜wallBinding套用给落地镜。
- 真实宿主物体的onBeforeRender在反射相机内抛错，候选拒绝，旧root/文档/存档字节保留，renderer实例重建且target为null，之后恢复fresh图像。真实镜片shader故意改成非法GLSL也在提交前报mirror-shader-failed并保原，目标live=1。
- 真实GL canvas scissor为[5,6,30,32]/true，绑定目标后[7,8,9,10]/false，反射后逐值相等。
- 成本采样改在实际绘制状态进行。10个样本分别记录主pass47 calls/5384 triangles与反射pass27 calls/3816 triangles，目标live=1/peak=2。提交时间为同步CPU耗时，不是GPU完成时间、帧率或普通机性能。

这些浏览器检查采用旧开发构建b84，几何P2的新增门由新源码CPU证据覆盖。固定新源码构建及受影响宿主验证仍属于主包的交付步骤。没有给旧浏览器报告或图片换标签。

本次沿已记录gpt-6.1-sol/high请求配置。实际provider配置及Hook拦截未独立核实。
