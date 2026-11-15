# 038坐稳CPU高尾部：子步倍增与接触热点

固定构建 `038341558517`，目录 `experiments/m1-hand-release-integrated-v1/dist`。先复算既有 `perf-after/report.json` 的4429实际原始帧，再仅执行一次同build、同1440×900 room/UI、动态开启、原女性裙、skirt-sit-hold、无录制30秒detail。未改产品/速度/迭代/碰撞阈值，无新矩阵。实测RTX4090开发环境，普通PC未测。

## 既有原始帧已确认的倍增

|实际simulate调用数/帧|帧数|CPU P50 / P95(ms)|motion exclusive均值(ms)|达到整体CPU P95的帧数|
|---:|---:|---:|---:|---:|
|1|3515|4.6 / 5.4|3.8694|2|
|2|908|9.3 / 11.4|8.2377|234|
|3|6|17.5 / 19.7|15.0667|6|

整体CPU P50=4.7、P95=9.9、P99=11.6、max19.8ms。P95及以上242帧中240（99.17%）执行至少两子步，双子步CPU中位是单子的2.02倍。平均子步1.20772，不是历史其他build的1.8。motion exclusive占全部被测CPU总时长84.19%。同组每子步仍有成本变化，不能把全部长帧都解释成纯调用数。

源码 `main.update` 对当帧模拟时间执行 `max(1,ceil(simulated*120))` 次simulate，每次时长均分。原始行没有保存该局部simulated输入，不能用相邻preupdate frameMs逐位重算它，但真实calls已直接证明实际调用数。它是高尾部分组关系和代码相符的证据，不是改变步长的依据。

## 唯一detail短测：哪个部分贵

实际4761帧，全部sit、有效状态，pageerror0，identity前后吻合；平均1.07246子步。CPU P50/P95=4.5/8.8ms。这次分组比例、缓存/调度环境不同，**不把它相对旧9.9ms下降叫优化收益**（产品字节未变）。

整帧累计、单子步组的exclusive均值：

|字段|1子步帧均值ms|测量边界|
|---|---:|---|
|motionMs exclusive|2.6367|motion除嵌套handSurface callback；仍含手轨查询、骨/足解等|
|handSurfaceMs exclusive|1.1143|每子步2调用：false仅取引用，true同步humanoid/矩阵并equipment.update；合计不是两次独立皮肤更新|
|avatarMs exclusive|0.1285|actor.update扣除已包裹vrm.update；包含live层及部分矩阵|
|vrmMs exclusive|0.0842|vrm.update；不含前面callback的humanoid.update|
|garmentMs exclusive|0.00038|后置updateGarment；已被手查询准备时直接返回，不代表裙计算为0|
|renderSubmitMs exclusive|0.5235|Three CPU渲染提交，不是GPU完成|
|primarySimulateMs exclusive|0.0649|simulate扣除上述嵌套方法后的余量|

motion inclusive整帧均值4.0581ms；handSurface包含其中，不能再相加。detail里motion exclusive占CPU58.30%、handSurface24.42%，合起来约82.71%，与旧仅motion大项一致。outer garment近0由源码garmentPreparedForHands流程解释：真实裙更新已在motion→seatHandSurfaces(true)执行。

下表**仅每render最后一次模拟子步的单次fit**，不是整帧累计；左右已经包含在该一次fit里，不将左右累计fitElapsedMs相加：

|最后子步fit内部|均值ms|P95ms|
|---|---:|---:|
|totalMs|3.4422|3.9|
|railAlphaMs|1.7607|2.1|
|gridMs（两臂合计）|0.2154|0.4|
|skinMs（查询网格点）|0.0706|0.2|
|forearm contourMs|0.0539|0.2|
|jointHandTransformMs|0.0242|0.1|
|jointHandRailsMs|0.0066|0.1|
|diagnosticMs|0.0198|0.1|
|otherMs|1.2908|1.6|

每次fit的gridBuilds恒2、measureCalls恒9，tested candidateTriangles约48295。railAlphaMs包含query/区间裁剪/五次可见性与depth判定/最强见证等，并非只“alpha采样”。otherMs还含前置surface callback和骨解等，不能在该表另加整帧handSurface。不能据最后子步统计精确推算每帧总手fit。

## 唯一候选及决定

已核源码可证明的候选：同一次fit中，blend=1时左右outward都等于normalize(0,.5,1)，gridU/gridV逐值相同；三角点已在双臂循环前一次采样，后续arm求解不重采点。故仅在轴**精确相同**时复用第二次projectedContactWorkspace.build结果，有望保持query顺序及所有rail/alpha/depth/最终复查，不跨帧、不跳求解。

但测得两次grid合计仅0.2154ms，等成本假设下省一次约0.1077ms/fit（约fit3.1%，当前整帧约2–3%；这是上限量级估算，不是实测收益）。**否决把它作为当前主要成本优化实施；本轮不改代码。** 真正热点在逐轨查询及真实表面准备，目前没有证据证明另一个具体等价改写能显著省下它们。不建议为了有候选而继续加缓存、降频或删除五采样；下一工程若开展应直接针对已测热点另行验证，而非声称本轮已有收益。

## 插桩额外成本与边界

仅QA追加detailSampleMs包住postupdate读取getMetrics().handFitProfile，均值0.00993、P95=0.1、max0.2ms。它在原cpuUpdateMs结束后执行，故另报，不回填原CPU定义。内部阶段performance.now及额外callback计时仍包含在motion中；单次detail不能严格分离其总开销，不能用独立前后短测差值当插桩开销。计时分辨率约0.1ms，很多子项0不是没有工作。

before脚本、实际执行脚本、QA差异已保存；self-test通过嵌套inclusive/exclusive、异常清理、重复包装保护、停采样透传。所有Chrome及临时server退出，未录视频、未提交、未改产品。顾问编码完成后才启动本次独占短测。

## 复算与受控重跑入口

```
python evidence/hand-release-038341558517/perf-cause/analyze.py
python evidence/hand-release-038341558517/perf-cause/analyze.py evidence/hand-release-038341558517/perf-cause/detail/report.json evidence/hand-release-038341558517/perf-cause/detail-groups.json
```

实际执行命令（输出已存在时拒绝覆写，不应为复算重新测量）：
```
node scripts/run-fixed-check.cjs experiments/m1-hand-release-integrated-v1/dist evidence/hand-release-038341558517/perf-cause/run-detail.cjs
```
