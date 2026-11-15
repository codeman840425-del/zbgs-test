# 前开箱褶：独立源版型试验，未通过

这是一个实际制作的失败源样件，不是ring cage重命名，不是17bd坐姿target再调参；未更改生产资源、`m1-skirt`、人体或控制器。ID=`m1-front-box-pleat-v1`，fit=`female-027bed-front-box-pleat-v1`，GLB SHA=`3aed00523b54c8608d686b0cd83a75781aa31ac616c046c1ed17ffda0299f1e3`。

## 几何改了什么

原源742render点/700面，样件771点/724面。沿已核准真实前中线边链76→64→62→60→58→54→55拆开左右外片，pin处零位移、至下摆渐增为每侧12mm搭接，层间距1.5mm；增加24个真实褶底三角，褶底采样原前片三角UV/权重，藏入原折褶深度6mm并缝到原三个腰pin。原61个焊接pin、后片位置、原材质纹理、原UV及原四骨权重完全保留；身体一字节未改。新骨架/IBM与原装备相同，精确主体SHA限制保留。

目的只是解除可见外片跨两腿的连续边约束，并保留真正的内层布面。现有逐点guide没有弯曲材料模型，版型拆开并不能保证坐姿自然；本次在站姿门已经失败，没有继续坐姿或追加补偿。

## 已执行与失败

- 重复Python导出两次字节SHA一致。节点/skin/IBM/material/image对原件检查通过。新权重和误差最大1.79e−7。
- 新褶底重心插值会超过4个源骨影响；取最大四项并归一后，最大丢失1.0696047%。本试验自定保守权重转移预算≤1%，因此记录失败，没有调整预算或重算参数谋求通过。原顶点权重未变。
- Blender4.5.9实际导入、保存、重开`.blend`：724面、12权重组、UV、真实armature修改器存在。Blender整理部分拆点后编辑网格763点，不能与GLB771render点混称；额外Icosphere是导入器骨显示widget，未当服装或导出。
- 用原10a072 solver离线求值实际175的60个站姿hips/thigh/椅前人体输入；原solver回放显示面最大误差2.38e−7米，原pin位移0。半径来自同一原实际人体标定，非重新膨胀。
- 全body/top三角与真实alpha过滤门：原最大267pairs，样件278；60帧有新增，共760pair-frame事件，仅top新增；移除120旧事件不抵消新失败。
- 760中300属于已知原上衣内部封口fan(face755/757)，460属于其他面754/865/891/892/893。**不能把总计数等同严重外露穿模，也不能把其他面统称封口后剔除。** 同静姿图和可见性诊断分开保存；原open-top/open-waist方案没有再造或合入。

GLB真实绑定/源保存通过不代表运行时接入通过。此次接触数据是原solver+新资源的离线求值，不是浏览器载入新装备；未通过站姿门所以没有正常动作影片或新画风验收。

## 可编辑/复跑入口

`parameters.json` + 原GLB + `build-front-box-pleat.py`是规范生成源。`.blend`包含可编辑网格、权重、UV与贴图；任意手改blend不会自动反写参数或静默改变规范GLB。`editable-pattern.obj`仅提供版型网格/UV，不含骨架。装备清单独立存本目录，未放入生产public。

```powershell
python scripts/m1-assets/build-front-box-pleat.py
& experiments/tools/blender-4.5.9-windows-x64/blender.exe --background --factory-startup --threads 2 --python-exit-code 1 --python scripts/m1-assets/save-front-box-pleat-editable.py
python scripts/m1-assets/pack-front-box-pleat-input.py restore experiments/front-box-standing-input
node scripts/m1-assets/qa-front-box-pleat-standing.mjs experiments/front-box-standing-input
$env:QA_SKIRT_SELF_CAPTURE='1'
$env:QA_SKIRT_OUTPUT='assets-source/m1/front-box-pleat-v1'
node scripts/m1-assets/qa-skirt-front-triangles.mjs assets-source/m1/front-box-pleat-v1/standing-derived-input
```

`input`保存完整60个原站姿输入gzip/SHA；不是仅单帧好图。`standing-derived-input`为可再生中间结果，不纳入版本。三角报告self模式只算该实际形状，newPairs=0不能当通过；真正差值看`standing-contact-comparison.json`。有限30Hz面交叉、alpha近邻采样，不含CCD/全自交/目标机性能。

许可继承原完整女性候选来源链，原manifest的`sourceLicense`原样保留；本次新制作的是局部版型，不声称官方原裙设计或新素材授权。原衣服和主体源均未覆盖。

## 同姿静图与可见性边界

`original-frame001.png` / `candidate-frame001.png`：双方同一实际175第1站姿、36°同相机、全部实际身体/上衣/鞋/脸与原纹理保留。采用离线纹理深度栅格诊断，没有房间照明/MToon描边，不是游戏GPU截图；不是用另一镜头遮掩。完整视图中外轮廓几乎不变，没有观察到新增大块露肤/飞片；局部搭接不能由这一静图推定坐姿消除横硬片。

`candidate-frame001-crossings.png`标出该帧13个新增pair的交叉点投影。5个内部封口pair被前层遮挡，普通图看不到。8个非封口pair中有3个在1mm深度容差内可能外露（face754两对、865一对），位置在腰前上衣层边；其余被其他前层遮挡。这个额外深度检查没有逐交叉点再复算alpha（原pair门已做alpha过滤），因此只称潜在外露；红点不等于严重视觉穿模或精确穿透深度。300内部封口事件没有从接触失败门中移除，460其他面也不自动归为外露。实际游戏动态可见性未测，因为站姿/权重门失败已按要求停止。

重放/静图脚本：`qa-front-box-pleat-standing.mjs`、`qa-skirt-front-triangles.mjs`、`compare-front-box-pleat.py`、`render-front-box-pleat-static.py`。输入打包脚本`pack-front-box-pleat-input.py`实际已执行pack→restore→60帧重放；11.02MB保留完整60姿势，不依赖只选一张图片解释几何。
