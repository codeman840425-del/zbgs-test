# 83a7372f41b4：810姿态严格等价，坐稳成本改善

只审查/执行QA，未修改产品。基线a491efde53fb，候选83a7372f41b4；root改动为全opaque实际alpha snapshot一次认证+保守有限数学guard，以及固定rail depth提取。5个alpha/depth采样、depth(-.008,.3)、碰撞/动作/半径/频率均保留。

## 真实姿态等价

原F、jaw、waisthip各270姿态，旧新各采一套，共810个同姿比较。各体实际资源bytes/declared SHA与runtime/served build起止校验；不可将原F配置复制给派生冒名。沿已有站2秒→坐4秒→起3秒轨迹，每个30Hz观察之前4个实际1/120秒controller子步。动态关闭仅为排除春骨初始化噪声。

所有记录字段严格逐值相同：全部humanoid normalized/raw局部变换及world矩阵；全部显示裙742点及法线；每体按Hand/LowerArm语义独立选128个真实皮肤点；全部handContacts除计时键。不存在放宽容差。三体comparison.json通过，pageerror0。没有重新宣布原有身体/上衣交叉消失，也不是全动态视觉/任意材质保证；仅最后观察帧比较，非CCD。

## 当前真实坐稳30秒无录制

RTX4090、Chrome157，1440×900、room/UI、原F裙、dynamics ON/full，1秒预热排除，无录像/节流/GC。使用原qa-m1-current-perf.cjs（SHA20d52e07c63e0338129a8d9dad4996dedf6289542509a6abe12350d81dd69060），仅skirt-sit-hold30秒、detail=false。

|指标|a491|83|
|---|---:|---:|
|帧P50/P95/P99/max ms|10.4/12.3/16.5/29.8|6.1/6.2/9.1/14.8|
|场景CPU P95 ms|12.0|5.2|
|motion P95 ms/帧|10.6|4.4|
|平均真实子步/帧|2.010|1.026|
|sum motion / sum子步 ms|4.606|3.770|

减少约0.836ms/子步的实测motion成本后，当前165Hz附近节奏从多为2子步回到多为1子步，帧成本出现进一步改善；不能把每帧下降全部当成单次求解下降，也没有降低模拟频率/跳过接触。两项改动一起测试，未单独归因alpha与dot hoist。

83共4889帧全sit，0pageerror、hidden/paused/background/非1×/缺失计时均0；>33.34ms/>50ms0。renderer136calls/51998三角/45纹理/89geometry，JS heap非VRAM。旧case在同脚本run后，新case独立sit；不是随机交叉A/B，不作精确硬件长期收益保证。普通PC未测。

## 证据与复跑

旧新各三份完整gzip姿态在evidence/rail-alpha-equivalence各build目录，身份/selection/完整数据未裁；comparison.json及执行脚本归档。成本完整逐帧report在evidence/rail-alpha-83a7372f41b4-perf；旧基线evidence/front-skirt-a491efde53fb-perf不改标。无新视频，因为几何严格相同；用户对a491的原话“瞬间闪动明显改善，请加紧进度”仅在单独4片hash回执范围内，不扩大整裙通过。

复跑姿态：run-fixed-check.cjs <对应dist> scripts/qa-rail-alpha-poses.cjs <build> <新目录>；比较脚本qa-rail-alpha-compare.py默认上述已归档目录。成本：QA_M1_BUILD=83a7372f41b4，QA_PERF_CASES=skirt-sit-hold，QA_PERF_SECONDS=30，QA_PERF_DETAIL=0，QA_M1_RUN_ROOT=<新目录>，用run-fixed-check包裹qa-m1-current-perf.cjs。所有Chrome/临时server均已关闭，资源窗口已归还prototype。
