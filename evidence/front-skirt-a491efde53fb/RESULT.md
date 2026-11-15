# a491efde53fb：旧跑动大跳显著降低，裙装尚未整体通过

固定 `experiments/m1-skirt-anatomical-support-v1/dist`，build `a491efde53fb`；原female/body实际bytes SHA `027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95`。各入口开始/结束均核runtime/served/实际身体身份。候选未发布，公共4193/f7保持不变。

## 实际正常速度三档

同f7/7f：1440×900浏览器、1011×748 canvas、固定room、dynamics ON/full corrections/裙outfit1，真实速度滑条与同7.6m安全路径，完整未剪1×录像。任务均完成、0pageerror。18个实际前下摆点与同索引原蒙皮点<=60Hz采样；约3.18 Jog距离周期含启停，不称3个满速稳态周期。

|速度m/s|最大实际裙边步变mm|同点源蒙皮mm|max边伸长比|max法线角°|sim/wall|
|---|---:|---:|---:|---:|---:|
|1.8|44.29|34.47|2.388|109.81|0.999748|
|2|29.59|22.94|3.205|96.94|1.000671|
|2.4|35.18|27.32|3.205|104.87|1.000865|

旧故障phase .30–.36/.80–.86范围：2.0由125.56降14.74mm，2.4由142.18降17.32mm；新对应源分别6.06/16.67mm。全段新最大29.59/35.18mm转移到其他相位，不是“全部抖动归零”。1.8仍约44mm，未判视觉通过。不同rAF落点可能改变最大值，不能将微小差异当精准改善比例。

直接使用当前skirtLateralAxis helper复算原实时fixture，无符号方向最大相邻变化1.203827°，原方向85.244°。真实helper及输入SHA在actual-helper-axis-fixture.json。硬覆盖断点已另被7f连续union解决，但7f实际仍133/141mm，说明两项原因必须区分。

## 完整相关动作

related-video-v2/sit-rise-turn-technical.webm：正常1×坐下→坐稳→起身→360°转身→实际走到空地→完整7.2秒技术编排。所有实际任务completed，19.3954秒墙钟，sim/wall .996912，0pageerror。未改动作/步速/IK、未在记录中reset/瞬移；初始坐前位置在录像前设置。

第一条related-video/在椅边发舞蹈，被真实insufficient-dance-space拒绝，原片/日志保留；这是测试选择空间不合适，不是新产品错误，也不作完整舞蹈通过证据。v2补上真实步行到空地。技术编排不是专业舞。

## 真实表面风险：不能称接触已通过

f7与a491各259个相同模拟样本：120Hz真实controller simulate；run/rise20Hz、其他10Hz取最终raw/live/equipment表面。7732个body、2280个top三角全保留，与实际显示裙做空间格广相+原有限边/三角相交+实际纹理nearest alpha。逐样本root与jogPhase完全一致。

- body新增/删除交叉对均0；但原来的胸/脊柱/腰封和部分手指交叉仍存在，因此绝对surface门为false。
- run新增Top1220、移除1083 pair-events；坐入245/229、坐稳44/20、起身44/25；转身0/0；技术舞2/2。不能只用总数认定严重或安全。
- 新增run中1030对是非cap上衣×非cap裙；实际交叉线中位1.743mm/max28.460mm。坐稳44对均非cap，线中位.732mm/max2.633mm；起身中位1.267/max12.470mm。技术舞新增两对最大.250mm。
- 交叉线是完整三角几何线长，不是穿入深度或完整alpha裁切；不自动视为有意接缝。门不含CCD、自交、共面重叠或闭体穿入，因此不能因没有新增body就宣布腿接触安全。

最大新增Top具体样本：row14，t=.7083333333333333s，jogPhase=.037302367852919655，top面785/裙面621。独立重放85个1/120秒并以实测三点核对：新top及裙0误差，旧top0误差（旧裙相应点与新最多60.469mm差）。contact/row14-witness提供角色相对正/右侧，同pose同相机旧新近景。腹前黑片/白色小孔旧f7和新a491都可见，不能归为此次新增；新旧裙上缘/褶皱和前摆轮廓有变化，仍待用户看实际片判断。

旧contact/peak-front.png、peak-side.png名称是世界+Z/+X镜头而非角色正侧，已在screenshot-provenance.json纠正。两版峰值都为row91、t4.608333s、stage approach-sit但mode walk、sitProgress0、485对；不是坐稳图，也不是采样结束恢复后的图，不用于解释新增Top最大差异。

## 视觉与交付边界

index.html包含f7/a491两档2.0/2.4同步1×完整片、相关动作原片、精确新增风险静图。同步以真实walk命令为0，保留rAF/解码约一帧偏差，不是逐姿态严格同帧。工程已看row14旧新四张静图；正常片与密集抽帧是不同证据，不替用户宣布观感通过。边伸长仍可达3.205、局部法线变化大，裙整体形态/拓扑缺陷未解决。

未据开发机RTX4090给普通PC达标声明。这里的rAF带录像/轻探针，不能代替无录制成本。本轮待root另行两项30秒成本测量。

## 重跑和恢复

三档：设置QA_SKIRT_BUILD=a491efde53fb、QA_SKIRT_AXIS=anatomical、QA_SKIRT_SPEEDS=1.8,2.0,2.4、QA_SKIRT_CORRECTIONS=full；用run-fixed-check.cjs包裹qa-front-skirt-flicker.cjs，输出必须为新目录。qa-front-skirt-analyze.py输出实际稀疏顶点摘要。qa-front-skirt-contact.cjs参数为URL/build/新目录；qa-front-skirt-related-video.cjs同参数；qa-front-skirt-witness.cjs依赖已归档新Top witness，重放精确85步。各已执行脚本与完整gzip输入、截图、视频、manifest保留。

表面离线技术舞使用controller.action直接驱动，测试局部身体/裙关系；不等于任务空间准入通过。真实任务空间准入及完整播放以related-video-v2为准。表面记录与原速片分开，避免重探针拖慢画面。
