# 限定真实触发：跑到终点立即请求坐下（持麦、裙装）

旧7a86c24e34aa / 新038341558517；原女性、outfit1、动态/全修正开启。预先装麦speaking=true，热身120步后从[-3.8,0,2.2]、yawπ/2以2.4m/s跑向[3.8,2.2]，真实任务completed后立即action(sit)。固定1/120秒，不录像、不性能结论。

两版各1241步、10.341667秒：装麦站讲120，跑544，二次寻路及坐下547，坐讲30。跑任务均completed，末态sit且麦仍加载。时间/root/jogPhase逐步差均0。

**该真实组合仍未激活实质非零手避让。** 新版全部步骤最大garmentProjection为5.53456e-9m；旧版为0。脚本以1e-6m区别实质投影与浮点噪声，仅作为诊断触发，不改产品/碰撞阈值。故没有非零投影tick的皮肤门；不得写成“非零避让与持麦争用通过”，不再人为摆手或扩矩阵。

在跑完请求坐前、坐姿blend首次≥0.5、坐稳、坐讲结束四个固定姿态，最终avatar/live/equipment更新后的完整源手/掌指skin×显示裙三角，两版均0非共面有限边交叉。身体原geometry在切回穿衣前保留；alpha用该源geometry面索引。此门不是连续碰撞、共面/封闭体穿透或视觉验收。

两版最终腕最大位置差左0.000003661mm、右0.000005820mm量级（精确值见sit-trigger-comparison.json）；不会将原短链左腕5mm差移除。最终握点和单位化握姿误差沿原门通过。未发现需要近图记录的最终皮肤相交，所以没有额外截图。

live仍在motion之后更新持麦臂/指，handContacts仍只是前置solver记录；本结果仅确认此具体真实组合/四姿最终皮肤，无一般控制优先级安全保证。源/产品未改，Chrome和两个临时服务均退出。

重跑：
```
node scripts/run-fixed-check.cjs experiments/hand-scope-worktree-1/baseline-dist scripts/qa-mic-skirt-sit-trigger.cjs 7a86c24e34aa <fresh-output>
node scripts/run-fixed-check.cjs experiments/m1-hand-release-integrated-v1/dist scripts/qa-mic-skirt-sit-trigger.cjs 038341558517 <fresh-output>
```
