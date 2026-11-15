# 038坐稳成本：离线先验结果（等待唯一detail窗口）

原始证据perf-after/report.json，detail=false、4429帧。精确分组结果见baseline-groups.json，由analyze.py可复算。

|实际primarySimulate调用数|帧数|CPU P50 / P95 ms|motion exclusive均值 ms|
|---:|---:|---:|---:|
|1|3515|4.6 / 5.4|3.8694|
|2|908|9.3 / 11.4|8.2377|
|3|6|17.5 / 19.7|15.0667|

平均1.20772子步/帧，不能套用历史构建1.8。整体CPU P95=9.9ms；达到该值的242帧中240帧为2或3子步。各帧motion/actor/vrm/garment调用数等于实际simulate次数，render每帧1次。双子步CPU中位约单子的2.02倍；也存在单子步自身慢帧及每子步成本变化，不说仅有倍增一个原因。

计时口径：main.simulate包含motion、actor及garment；actor包含vrm.update。inclusive不可相加。exclusive仅扣除已包裹的嵌套方法，motion中的seatHandSurfaces在原detail=false未包裹，其raw同步和equipment.update仍计入motion。外层garment.update收到garmentPreparedForHands时直接返回，因此它接近0不代表没有做裙几何。render仅Three CPU提交，不是GPU完成。cpuUpdate是preupdate到postupdate，尚有未包裹部分、UI及计时开销。

源码每render用ceil(simulated*120)次推进，跨步作者动画/时间、手释放amounts/poseSeeds、VRM spring/live会变化，不能以坐稳为由跳第二子步或拿上一pose投影代替。detail=false尚无手fit内部归因；计划仅同038坐稳30秒detail=true，最后子步handFit绝不当整帧总量。
