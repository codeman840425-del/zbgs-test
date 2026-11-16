# 两块 NORMAL 预留独立审查

**结论：未发现本候选限定输出/身份合同的阻断，但实际对象检查确认混合编辑的normalSet缓存拆分退化，需作为集成改进条件。** 只有性能候选资格，没有集成、视觉或普通机通过结论。本轮只读源码、执行脚本和已有JSON结果，另作小规模真实GLTF对象身份读取；未重跑矩阵、GPU或Blender。

## 身份及范围

提交 `6497e29767668d6483c8e6eaff9f917c84e1d527` 相对父 `13526ff` 的产品差异只有 helper 的 parts 从六项改为 `FaceMouth_00_FACE` 与 `Face_00_SKIN`，其余为说明和QA。当前helper/facial/host原字节均与提交一致：

- helper `0b965c1d7c7226a242716d0c4586ef593197ca46e36c727dac001d3b97efe7a3`
- facial `c453e4d37e721f8479ea0acc5d2c0a35bf2354d687b6e11f183f9ae2876f2503`
- host `03b2f577f1dae742c8c0b1b4ef1ee733112588814caa5fcc876d7496aa6859cf`

两块范围不是凭名称猜测：已读 active-records 的执行脚本，其直接调用当前真实 createFacialGeometry，捕获 prepareRender(parts)，并逐 primitive 检查实际引用索引/Basis/54或56个shape。报告22次操作中，女四个嘴端点均[0,7]，男均[1,5]；眉独立一块且不生成normal morph，鼻仅Skin，眼四块、组合六块。因此只覆盖嘴的布局预备是有据的，不能推及全部改脸操作。

## 已有CPU证据核对

- equivalence 27例全部passed，原男女各预留2、jaw明确不预留；比较仍以0137为基底，缺normal按零relative delta解释，不冒称GPU布局相同。
- identity 10项全部passed，未知body、已有normal及错位置/morph/recipe身份失败关闭。
- real-loader原女/男各9实际几何，只预留2；16/15 expression案例通过。纹理解码stub边界已明确，不是实际画面或GPU法线检查。
- 原13526ff独立审查的首次scene前时序、每actor独立零buffer/key、原属性和身份保护、局部normalSets边界依旧适用；本次没有更改这些代码。

## 内存口径

报告原9块源、预留后9块源、2个编辑clone分别列出，数量与Three187公式一致。MAX_TEXTURE_SIZE≥8192时新增CPU backing/GPU基础存储各女3,682,560B、男3,552,768B；4096时各女10,997,504B、男10,603,008B，不能只拿3.5MiB推目标机预算。零属性每actor24,660/24,672B没有按预留块数减少。

本轮Brow不再预留，因此旧六块候选brow-only额外1.38/1.33MB常驻零数组问题不再适用于此单项。嘴clone复制的零normal会被计算结果替换，但临时分配、原源纹理保留、活动clone/预热对象及driver/program开销仍在。报告已明确不是VRAM实测；不能把增量降为三分之一写成整个角色内存降为三分之一。

## 集成必要条件

1. 该分支仍是0137基底，**不含已发布460的context guard，也不含34e shadow预备**。如决定集成，只移植本候选helper及必要首次render前hook/cache-key局部变更，不能整文件覆盖当前foundation/main。必须保留460换体context失效保旧/恢复重试能力。
2. 共享零布局仅在原男女精确SHA、首次任何render/compile之前安装；不能在已渲染geometry上临时增NORMAL，因为Three缓存不因stride改变而重建。
3. GPU对照应包含初始加载/首次稳定帧、换体、首次嘴改值、短稳定表达和实际资源容量；不得只以首改收益或CPU输出等价准入。与460对照时需明示不同shadow/context基底，最终集成收益不能直接继承。
4. 若进入集成，受影响检查限原男女加载/嘴修改与复位/既有组合、context等待生命周期；不因此重新展开舞蹈/裙或全部历史矩阵。是否值得集成由唯一GPU对照及实际代价决定，不追加预留集合扫描。

## 补充实质发现：眼/组合 normalSet 拆为两套

`keys.mjs`实际解析原F/M GLTF（纹理解码stub），读取实际normal属性对象及本候选helper，结合已保存真实activeRecords，未重跑solver。男女9块原geometry各仅共享**一个**normal BufferAttribute。预留两块改用targets数组key、其他仍用原normal属性key后：

- mouth−12仍1套；
- eye5的White/Eyeline/Eyelash为原key，Skin为预留key，共2套；
- 四域六块也成为2套。

`normalSets`因此多分配一套base+全部shape目标：女性 `2055×3×4×57=1,405,620 bytes`、男性 `2056×3×4×55=1,356,960 bytes`。多出的数组随活动geometry保留，且重复packed/affected delta填充。**不是整个法线几何求解翻倍**：baseNormals/targetNormals在primitive循环外仍仅计算一次。27逐输出门不会发现这种对象共享/成本退化。

若选择集成，需保留原已验证base normal属性的共享key语义，并仅将确认为零的预留delta视作缺失normal同义；不得把真正不同的非零normal形态混合。当前候选暂不改，mouth-only测量仍有自身范围；混合操作成本不能由mouth结果继承。

报告中“未构建/未GPU”是源包准备时状态；本审查没有核后续prototype测量状态，不替其更新历史标签。旧六块否决证据保留。
