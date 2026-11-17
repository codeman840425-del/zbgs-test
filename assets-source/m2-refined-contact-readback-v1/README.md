# 细分Face的inclusive接触接缝，prepare后停止

本包仅准备可复用官方接口、真实映射和输入读回，状态为 `prepared-stopped-before-real-contact-queries`。按最新造型反馈，当前目标不继续真实候选contacts或导出。没有扫描55单态或10混合，没有调用G、重新细分、重网格、改变旧strict证据或runtime。

## 官方接口与报告语义

复用已安装libigl2.6.3的 `igl.copyleft.cgal.intersect_other`。调用固定detect_only=True、first_only=False、stitch_all=False、slow_and_more_precise_rounding=False、cutoff=1000。输入为连续存储Float64顶点与Int64三角。实际返回5数组，index0为query-local triangle pairs，其他数组必须空，不能按Python doc虚构success第6项。cutoff是box遍历参数，原官方smoke已验证cutoff=1仍返回1100对，并非hits上限。

实际CGAL pyd SHA为 `43e7f5b1593b7b13ac1e0d15f09d65863dc67a148dcfab8abefff3d7ce04165e`，官方API前置和脚本均pin在spec。root的8项native smoke沿原证据消费，本包12项QA没有重复这些native调用。该copyleft模块沿现有离线工具许可边界，没有加入浏览器或游戏分发。

这是inclusive闭三角相交，包含共面、点和边接触。它与原strict内点谓词有独立schema和结果含义。检测只针对输入的浮点几何，不能把连续理想表面误差算作已解决，也不能由零inclusive/strict推定视觉通过。

## 完整原索引关系

原Face accessor21的2056点，经已封共同一级细分为7251点、54delta、12672子三角，映回3168原parent三角。原源 `group-21.npz` SHA为 `2bd020eebf3a6c654983d78e2fc3e999d245f7242644b4f30ea17b1862a8efc3`，provenance SHA为 `50db9908fb6f70f46795e52c994c9f34e782a26bddb1e2698fbd75f7a264136e`。九个consumer完整分区，全部child位置与source parent bary映射逐值相同，每parent恰4子片。

prepared/mapping.json和role-child-ids.npz给出完整role→global child查询索引，原parentMetadata、parentBary和source triangles继续引用原封包。`common.query`将官方query-local ID转换为真实global child ID，保每条native row及其parent消费mesh/primitive/原局部三角号。原生重复行也保留，另报数量。

比较必须先在同一child拓扑上做source/candidate差，再归并parent。QA特例保存旧child(0,2)、新child(1,2)映到同一parent组合时，parent集合不变仍保留新增child。不能用粗网格旧strict pairs抵消新inclusive子片。

每个hit分别记录同refined vertex ID的真实拓扑共享、原parent vertex共享、实际坐标精确相同的角点、整片坐标精确重合。这些是独立观测，既不焊接不同ID，也不静默过滤。detect_only没有返回相交几何，事件究竟是点/边/共面/穿越仍标未分类，不能用这些标签自行决定视觉准入。

## 真实输入与精度lane

数值输入固定到 `m2-refined-axial-evaluation-v1` 的最终spec/report/raw/closure/package。closure SHA为 `f1bf60c71ac8e7b82cf9368e73bf65e58f210ac111630f3ebde17612035598d7`，spec SHA为 `d1841604e12747257aff0a6828779d932258523e5a1b226c50e3f3f6baa62bfb`。原candidate ID仅溯源，没有runtime资产身份。

本次仅读三项已存数组。每项Face base、全部54 Float64 delta及Float32单态编码均按真实endpoint-record offset/count与自身已过数值raw逐项绑定，source同样核原端点和Float32baseline。不能只自pin一份faceGroup或只凭known-oh四个target放行其余target。QA中改target0一毫米、同步Float32且known-oh不变，仍被raw绑定拒绝。

source/candidate的四个corrected材质mask完全同，负EYE_Joy −happy×blink在两边都应用。新点不存在跨opposite lane共享索引。完整known-oh source/A按原式重组与producer保存值逐值相同。

- 实际消费lane比较sourceMixedBakedM与AEndpointMixBakedM。单target采用Float32 base+Float32 delta的Float32加法；混合按旧顺序对Float32组件作Float64有序加权和，不宣称GPU算术完全相同。
- 归因lane只比较known-oh的sourceMixedM、AEndpointMixM、BSourceMixThenGM，均使用producer保存的Float64定义。B仅known-oh额外7251个点，接触代码不会求G，也不会虚构所有55/10都有B。
- 未来55单态范围仍是mouth-skin，10混合范围为mouth-skin及white-skin/white-eyeline/white-eyelash三组。Body、衣物、头发、姿态和连续时间接触均不在本合同中。

## QA与预算

12项prepare QA已过，涵盖5数组形状、拒绝第6success项/非空重网格/非整数或越界pair、parent不吞新child、索引共享区别于坐标重合、native重复行保留、零hits不准入、source负补偿、未参与known-oh的target0篡改拒绝以及单态Float32加法。

入口如下，仅做prepare。当前目录已封存，重演应使用独立检出并归档该检出的prepared输出，保原pin身份。

```powershell
& experiments/tools/slim-core-2.6.3/.venv/Scripts/python.exe -B scripts/m2-refined-contact-readback-v1/prepare.py
```

真实候选native调用数为0。若后续有合格新目标并重新授权，建议每个已选case以600s/3GiB递归进程树、2线程为硬预算，保完成项并在超时停止。按现限定范围，每个共同source有55+10×4=95次query，每个A另95次；known-oh Float64 source/A/B归因另4+4+4次。多case可按完全相同输入复用source查询，B始终只有known-oh。实际耗时、峰值RSS和命中规模尚未实测，不能以cutoff裁掉hits达到预算。当前没有后台全扫入口或运行授权。

这份prepare保留成熟接口，当前不继续围绕已被用户拒绝的尖脸做接触优化。旧55/10失败、数值候选与造型反馈均保持原含义。
