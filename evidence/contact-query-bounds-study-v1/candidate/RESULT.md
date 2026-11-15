# 单文件二维包围盒预筛候选：900efdf24c88

基底提交5f4250a3ce5d958de16d31ba3ce9a8724cea28a8 / 038341558517。独立源码与构建位于 `experiments/m1-query-bounds-candidate/prototype`（dist在其下）。主线prototype/src未改。逐构建输入与git archive原字节比较，只有src/forearm-contact-workspace.js不同；motion精确原038、无诊断插桩。详见input-diff.json。

唯一变更：每build预计算各三角投影AABB/数值适用guard；每query只计算一次rail AABB/guard。在原cell候选去重处先保留原candidateStamp标记，再做保守拒绝；余下次序与原候选相同。原prepared interval、5个alpha/depth样本、阈值、solver和子步完全未改。没有跨帧复用skin或接触结果。

Guard与study一致：三角投影/clip常量/rail全有限且绝对值≤100；三角span为[1e-6,10]、rail span≤10；abs(den)>max(1e-12,span²*1e-6)。不适用则保留旧路径。AABB严格分离超过1e-6+64*EPS*maxAbs才剪枝；这是宽松保留候选边界，不改变原接触容差。缓存对象每次先valid=false，防止旧有效状态污染退化输入。

## 已执行的范围

- 8160真实rail、9姿态，原212837个cell候选→61551；剔除151286（71.08%）。
- 33626原nonnull完整保留，lo/hi/start/end与浏览器原捕获逐值一致（assert.deepEqual，无容差），原candidate顺序和去重也检查。
- 9组×22条198条额外workspace真实query A/B：原点、近正100界、负100界、两侧界外、近退化、小于原面积阈值、病态、精确退化；并含正反方向与微米边界±epsilon。
- 单独非有限/超界rail纯guard保留、亚微米gap保留、明显分离拒绝、重用对象valid失效检查通过。不调用Infinity原cell循环。
- npm run build成功，固定build900efdf24c88；Vite只提示原大chunk警告。

未运行浏览器角色等价、性能、录像或全矩阵；不能从候选数减少推导CPU收益，不能继承视觉通过。没有新solver/删碰撞/降频，不使用用户“轻微穿模可接受”修改精确回归标准。根代理将独立审代码并安排后续。

## 复跑与恢复

已安装根prototype锁依赖后：
```
node evidence/contact-query-bounds-study-v1/candidate/check.mjs
```
离线输入与旧helper来自上层study归档，candidate.mjs是candidate.js的精确字节副本，仅扩展名便于Node ESM；check不依赖活动实验源码。

重建独立候选：
```
python evidence/contact-query-bounds-study-v1/candidate/prepare-isolated.py <fresh-target>
```
然后在fresh-target/prototype执行npm ci、npm run build。脚本先核base038及helper原bytesSHA，再替换单文件并核900ef。当前构建实际复用了根已安装同锁依赖的node_modules junction，没有新安装记录；可恢复入口用npm ci，不伪称本轮做了新检出安装门。

移植仅portable.patch与单helper字节；不整文件覆盖motion/main。source.json pin原/新helper SHA，build-info.json pin完整输入摘要。
