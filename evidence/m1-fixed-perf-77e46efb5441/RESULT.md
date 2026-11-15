# 77 固定版开发机持续性能短测

九类各一次30秒有效样本；无头Chrome、1440×900、detail=0，无录像/CPU限速。9/9实际状态与计时覆盖门通过，0pageerror。不是普通电脑或手机通过，用户目前无普通电脑，缺口保留。

| case | frame P50/P95/P99/max ms | CPU P50/P95/P99/max ms | >16.667 / >33.34 / >50帧 | moving / run / peer % |
|---|---|---|---|---|
|base-walk|6.10/6.40/6.80/14.80|1.40/2.00/2.50/14.60|0/0/0|83.8/0.0/0.0|
|pants-walk|6.10/6.20/6.50/10.30|1.30/1.70/2.20/5.70|0/0/0|84.0/0.0/0.0|
|skirt-walk|6.10/6.30/9.30/23.10|4.10/5.30/9.10/22.80|7/0/0|83.3/0.0/0.0|
|skirt-sit-hold|6.10/9.30/10.70/32.00|4.70/9.20/10.50/31.10|3/0/0|0.0/0.0/0.0|
|skirt-sit-rise-switches|6.10/7.70/11.40/26.90|4.10/7.50/11.00/26.70|11/0/0|13.2/0.0/0.0|
|pants-run|6.10/6.20/6.50/9.20|1.40/2.00/2.50/5.60|0/0/0|71.8/45.8/0.0|
|skirt-run|6.10/6.90/10.50/23.10|3.80/5.90/10.10/22.90|4/0/0|72.3/46.0/0.0|
|dual-pants-walk|6.10/6.50/6.90/37.60|2.30/3.40/4.60/37.40|2/1/0|83.2/0.0/84.9|
|dual-skirt-pants-walk|6.30/11.80/14.70/26.90|5.50/11.50/14.40/26.70|21/0/0|81.9/0.0/83.9|

## CPU分项（每render帧exclusive平均ms）

下面只移除已插桩子调用的嵌套时间，不代表完整CPU/GPU分解。raw inclusive不可相加；每子步avatar包含vrm等调用，motion包含其衣面/VRM同步。dual时同名timer累积两角色，simulate仍为主scene对子步的一次调用。

| case | simulate自身 | motion | avatar自身 | vrm | garment | render提交 |
|---|---:|---:|---:|---:|---:|---:|
|base-walk|0.094|0.505|0.230|0.064|0.000|0.542|
|pants-walk|0.083|0.438|0.143|0.096|0.000|0.539|
|skirt-walk|0.083|3.401|0.135|0.090|0.000|0.590|
|skirt-sit-hold|0.075|4.274|0.149|0.094|0.000|0.554|
|skirt-sit-rise-switches|0.084|3.553|0.139|0.093|0.000|0.546|
|pants-run|0.091|0.492|0.158|0.110|0.000|0.592|
|skirt-run|0.094|3.055|0.146|0.097|0.000|0.646|
|dual-pants-walk|0.167|0.960|0.285|0.155|0.001|0.815|
|dual-skirt-pants-walk|0.225|5.453|0.390|0.193|0.001|0.888|

## 状态与预算边界

- 基础模式按既有脚本关闭dynamic；裤/裙开启dynamic，故不是只换一件衣物的成本A/B。样本含转向、终点停止及250ms轮询空隙；两跑步档实际speed>1.5只约46%，不能称30秒全程匀速跑。双实例两者均有实际移动。坐稳全部帧sit，切换样本实际包含sit/stand。
- 本机Chrome 157.0.8103.51 headless，WebGL实际ANGLE NVIDIA RTX4090/D3D11；Windows11，WMI CPU名称9950X3D但本环境暴露8核/8逻辑，物理内存约66.16GB。浏览器deviceMemory32是浏览器暴露值；不能用WMI AdapterRAM截断字段声称4090仅4GB。
- 两裙裤实例CPU P95=11.5ms、P99=14.4ms，已接近16.667ms参考整帧预算，且本timer不含全部浏览器/GPU完成成本。双裤有单帧37.6ms；不能据多数帧低于预算宣称稳定60FPS或目标设备达标。
- 无头帧间隔中位约6.1ms不是显示器呈现帧率；preupdate→preupdate只测wall pacing。cpuUpdate为Phaser preupdate→postupdate跨度，含场景/Three CPU提交与UI，排除后续Phaser render、浏览器layout/composite、GPU完成。
- summary保留inclusive/exclusive P50/P95/P99、实际调用数、子步分组与资源计数。detail0无handFit细分，未把最后子步handFit当整帧。子步按实际dt决定；不能将两子步帧直接比较一子步归因函数退化。
- garment计时只包裹公开updateGarment方法；接近零不代表裙几何免费。真实衣面刷新还会由motion内部seatHandSurfaces及avatar更新触发，这些仍在相应CPU跨度内；detail0不分离其具体成本。
- 资源为每case结束renderer几何/纹理/绘制调用和JS heap快照，不是VRAM或泄漏证明；同页九case累积已加载缓存，未强制GC。
- 已协调agent无构建/编码/Blender；既有用户Chrome进程未关闭，不能保证整机绝对隔离。自测PASS。只执行一次，不扫参数、不优化、不比较不同浏览器模式或历史版本收益。

## 复跑与证据

执行前运行 `node scripts/qa-m1-current-perf.cjs --self-test`。设QA_M1_BUILD=77e46efb5441、QA_PERF_HEADLESS=1、QA_PERF_DETAIL=0、QA_PERF_SECONDS=30、QA_M1_RUN_ROOT为新目录，移除QA_PERF_CASES筛选后：

```powershell
node scripts/run-fixed-check.cjs experiments/m1-motion-identity-integrated-v1/dist scripts/qa-m1-current-perf.cjs
```

原大report无损gzip保留；本summarize.py可从report.json.gz复算。实际执行脚本、build-info、hardware、self-test、execution日志及manifest归档。浏览器及临时服务已关闭，无产品改动。
