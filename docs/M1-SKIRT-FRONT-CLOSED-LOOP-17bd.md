# 前片目标闭环：拒绝17bdb176154c

本次把已失败的唯一 `seated-front-v1` 目标接入隔离检出，实际跑了正常1×完整坐下、坐稳、起身。**不合入，不继续调整15个控制点。** 能力状态以CAPABILITIES为准。

## 版本和范围

- 原对照：`175a487d5ea3`，solver `10a072d3ceecaeb798f5025c19387e7b7a65ee6ad1adf2f9fbb67507b6184e86`。
- 隔离候选：`17bdb176154c`，solver `4ec063dd1aa0fccb960a075c9af3f0a56f63b3be8147c654b8b0d982c90eab62`。
- `experiments/rebuild-1b1da81/prototype`仅改这一源文件；新输出`experiments/seated-front-candidate-1/dist`。共享prototype仍为原solver。之前失败安装输出`experiments/seated-front-isolated/dist`仍是175，不能当候选。
- 相同female SHA027bed60…、裙06530562…；同椅approach、root/yaw，full corrections、authored手目标、dynamics=false。真实手接触按各自裙重新计算，没有注入旧手姿。与既有dynamics=true影片不直接比较。
- 开拍前按原输入方法，传送到真实chair.approach并离线60×1/60秒settle；之后完整链只由真实rAF 1×推进，无advance、无中途reset。

## 实际采集与检查

四条完整正常速影片：原版room/close分别1206/1193个rAF状态，候选1148/1146；所有采样rate=1、paused=false、document.hidden=false、camera匹配，控制台/page错误0。时钟/加载长度略不同，不把视频播放头当相同动作时刻。全时长3fps抽帧共139帧/13张sheet已逐张查看，另查看全尺寸关键图；这不等于逐显示帧人工观看或高频闪烁通过。

此外对候选重新捕获270个30Hz实际body/top/裙姿势，包含新手拟合，非旧body面替代。两构建root/hips/source裙逐点完全相同；候选实际显示裙与此前离线目标回放最大差0.0000002384米，证明安装的是原失败候选，没有偷偷修改形状。

| 几何项 | 原175 | 候选17bd |
|---|---:|---:|
| 全部实际body/top与裙alpha过滤三角相交，单帧最大pair | 408 | 417 |
| 相对原版新增pair-frame事件 | — | 6714，涉及121帧 |
| 新增腰躯干上衣事件 | — | 6307 |
| 新增真实重算手/指事件 | — | 407 |
| 30Hz相邻显示帧最大世界点位移 | 46.70mm | 50.78mm |
| 顶点720相邻显示帧最大位移 | 33.31mm | 49.50mm |

原离线旧手姿比较的844手指事件，不能继续作为闭环数量；现在是407。6307上衣事件不变，确属真实腰躯干权重，不是袖口；没有新增腿/脚/骨盆皮肤事件。原有相交照样计数，没有剔除腰封口或隐藏身体。

**83.286mm是第82帧顶点720的“候选减原版”同帧形状差，不是83mm单帧突跳。** 上表另列真实相邻30Hz帧位移，含正常人体运动，不能直接解释为不连续跳变。

探针是离散有限边/三角交叉、真实GLB alpha近邻采样；不含CCD、完整共面/内含体分类，也不等于GPU双线性透明覆盖。分类器仍返回`reject-direct-contact-regression`，没有放宽门槛。

## 可见结果与边界

近景坐入约0.72秒和坐稳时，原前缘尖锯齿明显变为较平整的横向裙片；但候选像一整片硬板搭在双腿上，不能视作自然布料。起身中段仍有前片重新收拢、折回侧片的过程。room镜头人物较小，细小交叉难辨，不能凭远景不显眼判通过。

腰下方黑色折叠/层叠边在原版和候选均可见；原版坐入图胸腹处的小浅色尖点在候选也存在。当前相同深色材质的正常近景，**不足以将新增6307事件逐一判为外露穿插，亦没有依据将其全部当作有意的内层设计重叠**。没有看到候选新增的大块肤色外露，不等于腰接触合格。该处结论保持“真实腰上衣交叉退化，可见性部分未分解”；不凭计数自动声称新增6307处肉眼可见。

## 可复跑入口与证据

紧凑包：`evidence/skirt-front-17bdb176154c/index.html`，含四视频、关键全尺寸图、完整report压缩包、build信息、控制源/两个solver、SHA清单。19MB，附双方各7个真实完整body/top输入姿势；仅7姿势不能重现整270统计。全270原输入仍在`experiments/skirt-offline-corrective/front-input-{build}`，完整哈希写进子集capture。正常片与离线270输入分开记录。

```powershell
python scripts/m1-assets/install-skirt-front-candidate.py experiments/rebuild-1b1da81
# 在该检出prototype目录运行，new outDir不得覆盖旧175
npm run build -- --outDir F:/gamemake/experiments/seated-front-candidate-1/dist
$env:QA_M1_BUILD='17bdb176154c'
$env:QA_M1_ASSET_SHA='027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'
node scripts/run-fixed-check.cjs experiments/seated-front-candidate-1/dist scripts/m1-assets/qa-skirt-front-fixed.cjs
# capture脚本拒绝覆盖已有输入，重采须先明确保留旧目录
node scripts/run-fixed-check.cjs experiments/seated-front-candidate-1/dist scripts/m1-assets/capture-skirt-front.cjs
```

离线实际自体检查用`QA_SKIRT_SELF_CAPTURE=1`、`QA_SKIRT_OUTPUT=<各自输出目录>`调用`qa-skirt-front-triangles.mjs`；它的reference/candidate在该模式是同一实际捕获，单份报告的newPairs=0不是改善。双方真实差由`compare-skirt-front-closed-loop.py`生成，再用`QA_SKIRT_CLOSED_LOOP=1`分类；分类预期非零退出，表示保留失败。恢复孤立源码用installer的`--restore`，不会写共享运行时。

## 只读后续选择：一件前开褶源版型小样

仅建议一个源层替代：保留当前腰带/61pin/后片，将前部跨双腿连续褶片改为**有真实内搭褶底的前开箱褶**，以重叠而可分开的左右前片释放坐姿横向拉伸；它是独立版型，不是给旧目标再加姿态补偿。原742render/381焊接点、长瘦面P95比6.796、硬拆法线及33前下摆点的结构已核实；本轮低频目标把它们压成横板，说明只改坐姿target不足。

这需要编辑实际源网格、UV接缝、蒙皮和新的装备SHA/fit版本；不能改身体/动作、偷挖人体、放大碰撞或把内搭片当遮挡补丁。先离线做单一版型并检查站姿body/top真实三角门，再安排同样坐起；不直接恢复已失败的原生cloth、细分ring cage或新guide参数。成本高于15点target，需一次源编辑/导出与一次实际链，尚未制作；现逐点guide仍可能把新片推硬，因此**不能保证单靠版型消除横硬片**。若站姿或腰接触仍失败，即停，不扩衣库。
