# 旧半平面按需计算候选 6fb6c051aacd（待独立审查/实际收益）

独立源码/固定dist：experiments/m1-query-shortcircuit-candidate/prototype（dist在其下）。基底提交5f4250a3ce5d958de16d31ba3ce9a8724cea28a8 / 038341558517。98个构建输入与原git archive逐字节对比，只src/forearm-contact-workspace.js不同。main/motion及原5sample代码精确原版；没有900ef的bbox或24b的诊断插桩。主线prototype/src未改。

有限域常量guard在每次prepareProjectedInterval开始先false，然后从新7常量重算；不缓存任何skin、query结果或跨帧接触。新的interval读取该flag，并对4个rail参数执行有界比较，域内沿原三个半平面顺序按需求值，更新lo/hi后用原1e-9判据提前结束。非有限/超界/缺metadata回原preparedInterval完整公式；denominator与parallel原1e-12阈值不变。

**开销限制：** 当前4个rail有界比较仍随每次interval调用执行，没有新增rail缓存；只避免重复扫描7个三角常量。原研究的除法减少20.27%没有计入这4次abs/比较、额外分支以及JIT差异，不能据此宣称CPU收益。是否有实质收益交根代理相邻环境实测裁决，未做调参或第二优化。

## 实际已执行

- 8160条真实rail / 212837旧候选逐一重放，旧query候选列表和顺序完全不变。
- 33626旧nonnull返回lo/hi/start/end逐值相同；其余旧null仍null，无容差比较。
- 独立薄楔原坐标及移回原点均保留倒序短区间与原5sample结果0.02800000000014552m。
- NaN/Infinity三角或rail、Number.MAX_VALUE、极小/退化den、2^100域边/域外、signed zero、metadata缺失fallback均与原返回严格一致；prepare guard true→false→true重用检查通过。
- npm run build成功，build6fb6c051aacd，只有原Vite大chunk警告。

**null scratch边界：** 提前null时未计算的start/end槽不保证与原一样。当前唯一产品caller `motion.railClearance` 在null即continue，不读这些槽；nonnull全部计算并严格一致。没有宣称任意第三方caller的scratch副作用等价。源证明/公式计数见上层RESULT.md。

未跑浏览器角色等价、性能、录像或全矩阵，未合入/未提交，不继承视觉或普通PC通过。900ef失败原包保持拒绝，未覆盖其身份。

## 复验/恢复/移植

根prototype锁定依赖已安装时：
```
node evidence/contact-query-shortcircuit-study-v1/candidate/check.mjs
```
脚本使用自包含原/新helper字节副本与归档真实fixture、独立witness，不依赖活动实验源码。`.mjs`仅Node模块扩展名，字节与对应`.js`相同。

```
python evidence/contact-query-shortcircuit-study-v1/candidate/prepare-isolated.py <fresh-target>
```
然后fresh-target/prototype中npm ci、npm run build。先核原038及helper字节SHA，再装单文件并核6fb。当前实际构建复用根同锁node_modules junction，没有伪称执行过新检出npmci。

待审移植只有portable.patch的单helper差异；完整source/hash、input-diff、equivalence与build-info均保存。当前没有新常驻服务/后台进程。
