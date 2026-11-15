# 既有事件的前掌roll v4：局部改善，整段仍失败

唯一候选`video-dance-forefoot-v4`，来自冻结v3。没有调整v3样条系数/权重，没有逐坏帧手改root，没有改变视频、检测或自动contact标签。当前完成离线实际VRM重放；未建游戏、未录屏、未宣称视觉通过。

只改`leftFoot.quaternion`、`rightFoot.quaternion`，其余53轨逐值相同；root/腿/踝XYZ、hips转体、手臂、脚趾local轨均原样。脚趾通过原parent继承新的足姿。141–144与207–210八帧完整原flight姿态保持，世界矩阵差0；v2/v3全部manifest核实不变。

## 唯一事件配置

`event-config.json`保留来源和人工标签SHA：左153–164来自既有“前掌支撑/抬跟”观察；右204–205来自新查看原生204–207帧的明确人工前掌/抬跟细化。206仍是模糊起跳；不伪造contact。原生裁图留ignored analysis，不入公开库存。

各明确前掌帧，以实际目标鞋skin求“前掌patch最低Y=0”的唯一标量几何根，固定0–60°括区，不扫角度/参数。保留小腿影响权重，不把鞋当无权重刚体。脚朝向的俯仰轴取当前踝横轴；root与踝XYZ不动。

左过渡148→153、164→171；右过渡200→204、205→207，按事件边界作唯一三次Hermite连接。外边界角度/导数0，内边界导数取已解支撑角的首/末差分。过渡只定义角曲线，不新加支撑标签。保留207原flight水平fallback，因此右脚必须在205→207释放新增俯仰，速度如实审计；没有因不适配继续改flight。

## 数值与失败

| 项目 | 女性 | 男性 |
| --- | ---: | ---: |
| 左/右最大新增toe-down角 | 7.47° / 12.78° | 6.14° / 10.42° |
| 最大新增相邻帧roll变化（右） | 7.73° | 6.30° |
| 最大新增二阶角差（右） | 10.40° | 8.48° |
| 相对v3新增旋转速度最大值 | 185.31°/s | 151.09°/s |
| 实际VRM位置对离线最大差 | 0.486µm | 0.580µm |
| runtime121采样lift | 5.105mm | 5.952mm |
| 所约束前掌段补偿后最大残差，含密采样 | 5.78mm | 6.63mm |
| 全部已知支撑的最差补偿后残差 | 33.46mm | 37.16mm |
| 721密采样补偿后最小鞋底Y | −0.907mm | −1.106mm |

205前掌悬空已由v3约38/42mm降到约6mm；新增右脚旋转速度峰值在206→207释放，来源是保持原flight足姿的边界。低于预先固定的新增15°/帧、二阶差15°、本地总step45°门，只能说没有触发这组工程异常界，不等于人体自然度已通过。世界足旋转还有约850–870°/s的既有转身峰，`acceptance.json`同时给v3基准，不能隐去，也不能把全部世界角速度误当本次新增roll。

**整段仍拒收**：最差变成148右脚，v3本来为33.27/36.90mm，本次是33.46/37.16mm，差别主要为约0.19/0.26mm的全段lift变化；该阶段不在明确forefoot细化区间，本轮未按坏点扩标签/补动作。全部已知支撑逐帧结果见`acceptance.json`，未知不参与伪准确率。不能仅选205改善宣称整段接触通过。

接触几何根针对前掌patch最低点；soft-min并非严格0，其他鞋顶点在少数键可有不足1mm的负值。实际VRM密采样也保留约1.1mm穿地；不是零穿插认证。脚倾斜真实程度、原source鞋形与目标鞋差异、足XZ滑动、膝/腕自然度尚未通过。

## 可审计产物与复跑

- `*-dance-forefoot-v4.json`、`dance-imports.entry.json`：新版本/新SHA，现成normalized loader可用。
- `*-forefoot-report.json`：每个源帧角度、toe/heel/全鞋高度、全部相邻本地/世界角step、原PTS、53轨与flight不变证明。
- `*-actual-vrm-ground-check.json`：73原键 + 121标定 + 721密采样的鞋高度与世界足四元数。
- `acceptance.json`：所有已知支撑残差、明确forefoot密采样、角速度/基准、`accepted:false`及失败点。
- `event-roll-comparison.png`：原v3与v4支撑残差及两脚新增角曲线。

```powershell
$env:OPENBLAS_NUM_THREADS='1'
python scripts/video-motion/forefoot-dance-events-v4.py
node scripts/video-motion/check-dance-forefoot-v4.mjs
python scripts/video-motion/report-dance-forefoot-v4.py
```

复跑会重建此派生包，已冻结版本应另存。本轮不再加补丁。该局部足姿改善有数值依据，值得在root安排窗口下作一次正常1×同源男女对照，只验证改善与新风险；不能以此放行30秒或本73帧整段。
