# 175a487d5ea3派生体实际回归

固定目录 `experiments/m1-integrated-contact-1/dist`。本轮实际加载两样件自己的VRM与装备，初末身份核对保存；未以原女性通过替代。紧凑报告、数值原报告、失败正侧图在 `evidence/m1-variants-175a487d5ea3/`。

| 实际执行 | 结果 | 边界 |
| --- | --- | --- |
| 两样件×基础/裤/裙，真实rAF .85行走三段、360转、坐起、再走、4秒技术舞 | 6条链全部到达终态，页面错误0，保存每体完整视频 | 原工具没有跑步；两条长视频尚未完整视觉审查，不能称自然度通过 |
| 两样件×基础/裤/裙×真实phase .05/.76/.79加速后停止 | 18项通过原gate；支撑峰2.734mm、ALL clamp峰8.33ms、raw步进48.354mm、脚底最低−1.041mm | 120Hz数值推进，未覆盖所有相位/转角/速度；不证明衣物表面无穿插 |
| 两样件×基础/裤×默认/转角/墙角椅 | 12项坐起完成，无采样顶点入椅体 | 30Hz真实顶点/椅盒；非三角CCD；不含裙装 |
| 裤座底 | jaw +.654mm；腰臀 +.717mm | 使用各自座厚，非复制原女性参数 |
| 表情/静态视线 | 实际aa/happy/blink及眼骨视线值；jaw589引用点变化，最大4.472mm；腰臀脸0变化 | 已看两体正侧静态图；不含连续语音/视线运动自然度 |
| 裙装最终手臂皮肤三角×显示裙面 | 两派生失败；原female参考起身也有掌指交叉 | 不得用原rail的finalClearancePassed覆盖独立几何失败 |

`scripts/qa-variant-acceleration.cjs`只替换既有加速QA的样件身份/外观数据，数值gate保持原样，并记录模板/合成源码hash。既有roomchain和face/seat脚本未被改造成新平台。

## 裙坐腕独立几何证据

`scripts/qa-variant-seat-arms.cjs`从实际已显示Body蒙皮中，按LowerArm/Hand/手指真实骨权重选择三角；每体选2790面，绑定表/每个交叉面索引与权重另用各体VRM离线逐一复核相符。采样发生在controller完整一步后的最终raw蒙皮，不是source clip或旧包络的拟合前姿态。独立检测使用双面有限边–三角交叉及材质UV alpha采样。

| 体型/路径 | 有交叉帧/100 | 峰值三角对 | 按实际骨权重分类的累计对事件 |
| --- | --- | --- | --- |
| jaw，默认null/legacy | 71 | 142 | 下臂1833；掌指4732 |
| 腰臀，默认null/legacy | 74 | 144 | 下臂2155；掌指4924 |
| 原female，自身校准profile | 15 | 74 | 下臂0；掌指666，仅起身 |

两派生的30个坐稳hold采样均有交叉，原female坐下/坐稳无交叉。该比较不是同体单变量A/B，不能把差异量完全归因profile；它证明了检测能区分前臂、掌指与动作阶段。完整逐面分类及实际世界坐标样例保存在 `actual-skin-classification.json`。

原female起身首交叉t9.100、sitProgress .86150；峰t9.200/.74432；末t9.5667/.23454。此范围校准profile有效且sitProgress>0，`fitSeatHands`的idleCache早退（必须!calibratedForearms且sitProgress<=0）不会触发。当前skinContactWorkspace每次refresh重采顶点，projectedContactWorkspace每次build重投影；没有本次证据支持“缓存了旧皮肤位置”归因。掌/指实际皮肤超出五条固定中线proxy才是需要进一步闭环验证的覆盖缺口。

截图已检查首发正面及峰值侧面：手掌/手指与裙前部空间紧贴/交错，裙前仍有明显硬折，上衣腹部也可见折块；未做材质隔离，不把所有黑块都归因同一网格。三角对数不是深度、面积或肉眼暴露像素的度量。交叉检测不覆盖共面重叠/完全包含、连续碰撞、GPU双线性alpha/MSAA；网格可见不等于每个相交面都在镜头中可见。不得仅凭计数称观感已改善或恶化。

原始详证：派生 `variant-seat-arms-1794702118402`，female参考 `variant-seat-arms-1794702194076`，均在 `output/playwright/m1/175a487d5ea3/`。此前更小记录 `...1794701988178`保留，不覆盖旧失败。

## 专属校准候选已生成，未集成

来源/命令/成本见 `assets-source/m1-variants/forearm-collision-v2/README.md`。新入口使用每体实际源VRM、原V1测量与V2裁剪，独立输出各自bodySHA、索引hash和profile；两次生成一致。用该入口重算原female，与现public v2逐字节一致。两派生本次前臂测量数据也恰好相同，因为局部修改不改变所选前臂面，这不免除独立身份和动态复验。

该候选仅覆盖LowerArm选择面，不包含完整手掌/手指。Root可按integration-plan复制资源并应用独立proposed-config.patch，在**相同派生体/衣物/动作**做null→own-profile实际三角对照；不能仅改SHA宣称适配，也不能期待它解决原female掌指起身缺口。

## 后续49b3d2a24f21同体对照

Root在 `experiments/m1-derived-contact-2/dist`真实接入专属profile，未修改本次前臂求值算法。不要与仅含greeting微修、未接profile的a697f3cea711目录混用。执行：

```powershell
node scripts/run-fixed-check.cjs experiments/m1-derived-contact-2/dist scripts/qa-variant-seat-arms.cjs 49b3d2a24f21 --forearm=own
node scripts/run-fixed-check.cjs experiments/m1-derived-contact-2/dist scripts/qa-variant-seat-arms.cjs 49b3d2a24f21 --forearm=legacy
```

两批均因尚存掌指交叉退出1，这是完整gate的真实失败，不是脚本崩溃。两body在同build/同衣物/同椅/同输入下各有100个采样，时间、动作阶段、sitProgress逐项一致。own实际遥测为calibrated-segmented-contours并指向各自bodySHA，legacy为legacy-uncalibrated-rails/null。文件profile SHA另行核对，不把运行时字段中记录的bodySHA误叫profile文件hash。

- jaw：legacy前臂1833对事件/53帧 → own 0；own掌指673对/15帧。
- 腰臀：legacy前臂2155对事件/56帧 → own 0；own掌指688对/15帧。
- own掌指均从起身sitProgress .86150开始；**整体接触仍失败**。只允许称此次离散检测下前臂问题消除，不扩大至掌指、全衣服或连续自然度。

源索引/各交叉三角实际权重重新独立核对一致：`scripts/classify-seat-arm-capture.py <capture-dir>`。检测器有限线段、双面、面内重心及端点/共面边界有针对性算术回归 `scripts/qa-seat-arm-probe-arithmetic.mjs`，不把该单测当实际几何通过。紧凑A/B回执、每步区域计数、原报告与关键图归档在 `evidence/m1-variants-49b3d2a24f21-forearm-ab/`；原始完整capture仍保留于output。
