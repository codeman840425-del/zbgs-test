# 仅嘴部两块 NORMAL 预留：唯一局部候选

**实际索引依赖成立，CPU门通过；未证明换男570ms或首次改脸长帧改善。** 旧六块4f候选的成本回退和否决结论保留。本轮只把预留范围收窄为当前嘴宽真正激活的两个primitive，不扩范围、不叠shadow预备、不改作者源/公开recipe/几何算法，也不修改主树460。

源码提交 **6497e29767668d6483c8e6eaff9f917c84e1d527**，父提交13526ff；分支`codex/face-normal-mouth-reserve`，工作树`F:/gamemake/experiments/m1-face-normal-reserve-candidate`。该树保留既有node_modules junction，未npm ci/删除依赖。未构建、未GPU、未发布。helper SHA `0b965c1d7c7226a242716d0c4586ef593197ca46e36c727dac001d3b97efe7a3`，已核Git blob与实际文件字节一致。

## 不是凭材质名称推断

`active-records/report.json`由实际已准入`createFacialGeometry.set`及其`prepareRender(parts)`得到：原男女各11个端点/组合，共22次。每个primitive保留完整原始索引、索引SHA、引用顶点集合，以及所有54/56表达和Basis实际发生POSITION/NORMAL差异的引用点。

| 实际操作 | 女性primitive | 男性primitive | NORMAL布局与范围 |
|---|---|---|---|
| 嘴−4%、+4%、−12%、+12% | 0 FaceMouth，7 Face_SKIN | 1 FaceMouth，5 Face_SKIN | 四端点都只激活这两块，均有NORMAL morph；仅预留两块完整覆盖已准入嘴宽的布局 |
| 鼻旧0.5mm/新2mm | 7 Skin | 5 Skin | 仅Skin，已在两块内，但不因覆盖布局就承诺鼻部首改耗时 |
| 眉旧1mm/新3mm | 4 Brow | 0 Brow | 单独改眉没有NORMAL morph，也没有实际法线位移；无需为这个操作预留NORMAL |
| 眼旧1%/新5% | 1 White、2 Eyeline、3 Eyelash、7 Skin | 4 White、5 Skin、6 Eyelash、7 Eyeline | 除Skin外仍有三块首次新增NORMAL；本候选不保证其首改成本 |
| 大幅四域组合 | 0/1/2/3/4/7 | 0/1/4/5/6/7 | 六块都被当前算法赋NORMAL属性，其中眉在实际引用点仍为零变化。组合布局不能按嘴宽两块推断全部已预备 |

代码仅更改`face-normal-reservation.js`中经此证据支持的parts列表和说明。没有新增shape；原POSITION/normal算法、6块候选已有的首次render前hook、reserved cache key及全部身份门保留。旧4f提交完整保留，不回写其性能证据。

## 实际有限 CPU 回归

- `equivalence/report.json`：27个原女/原男旧新端点、组合及男jaw对照；与0137基底所有既有属性、索引、POSITION/NORMAL形态、bounds、状态一致。缺NORMAL与显式零relative delta按语义等价处理，不把GPU布局称为相同。预留实数由6变2，jaw仍不预留。
- `real-loader/report.json`：真实GLTFLoader/VRMLoaderPlugin解析，男女各9个Face几何，实际只预留2个；女16、男15项表达含混合权重，所有influences和原属性保持。纹理解码stub、没有GPU渲染，不能称画面通过。
- `identity/report.json`：男女各5项未知body/原有非零normal/错位置/错morph/错recipeSHA，10项失败关闭门通过；未绕过source/recipe验证。
- `cpu-cost/report.json`：固定四轮六块/两块交替Node CPU测量（本地文件fetch，无compile/GPU；不是浏览器请求时间）。预留函数中位女0.704→0.412ms、男0.466→0.312ms；首嘴−12%中位女84.05→79.00ms、男79.81→84.78ms。**没有稳定收益结论，男性仍有回退样本；不能据此声称570ms已解决。** 未继续增加轮次或扫方案。

## 原始与clone纹理容量

以下按本机Three187公式由实际全Face POSITION count/target count计算，CPU backing和GPU基础纹理存储**各自**承担一份；不是VRAM实测。outline复用geometry不翻倍。角色初始共9个Face几何，每primitive都持完整2055×56/2056×54数据，不能按嘴部索引数量缩小纹理。

| MAX_TEXTURE_SIZE≥8192 | 原9块POSITION-only | 旧6块预留后9块源 | 新2块预留后9块源 | 首改嘴2个clone（新旧均相同） |
|---|---:|---:|---:|---:|
| 女（bytes，各一份） |16,571,520|27,619,200|20,254,080|7,365,120|
| 男（bytes，各一份） |15,987,456|26,645,760|19,540,224|7,105,536|

因此新方案相对原9块基础的**增量**：女3,682,560bytes（3.51MiB）、男3,552,768bytes（3.39MiB），是旧六块增量的三分之一。不是原始纹理只剩三分之一；原数据、改脸clone和其上传仍存在。零NORMAL属性buffer依旧每actor共享24,660/24,672bytes，与六块相比这部分不减少；临时clone NORMAL数组分配仍存在。

纹理上限4096时stride2跨行padding：女原9块16,571,520→新源27,569,024bytes，旧六块49,564,032bytes；男原15,987,456→新26,590,464bytes，旧47,796,480bytes。对应新增约10.49/10.11MiB/角色/CPU或GPU各一份；首嘴clone另有14,680,064/14,155,776bytes。2048/8192/16384所有行宽高与完整数字保存在real-loader报告，不能忽略目标机纹理上限。

## 交给 root 的一次实际对照

候选仅源提交已固定，交root决定一次原男女首次载入/换体、首嘴−12%、短稳定讲话与现有端点操作对照。不对其他参数承诺首次预备收益；仍须观察初始成本、当前状态、纹理计数和首改长帧。公开460与候选的shadow/context guard基底不同，若用460作同页对照必须明示，不把它当最终集成归因。

本轮不再追加其他预留集合或参数。如果两块仍无实际收益或换体/内存代价不可接受，应保留否决并结束该替代方向，不能把CPU输出等价当性能通过。
