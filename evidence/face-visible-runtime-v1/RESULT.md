# 可见五官端点：冻结接入结果

产品文件已冻结。精确字节快照、公共配方、安装器与执行脚本见 `frozen-source/manifest.json`；不构建、不提交、不修改发布入口。独立审查见 `independent-review/RESULT.md`。

## 接入合同

原女性/男性嘴宽保留原连续 [-.04,.04] 与旧 recipe 身份；仅新增离散 -.12/+ .12，使用独立 24mm 作用域源配方。中间 .06 等未验值拒绝，旧 .025 不放大。男下颌仍只 0/.04，其余三域未扩权。眉新增 `height3-spacing3-v2`，鼻 `tip-forward2-v2`，眼 `aperture-width105-v2`；旧 sample ID 仍加载原资源。

所有域共同从不可变原底求值；POSITION 组合后按实际法线邻域并集计算。新嘴/鼻邻域女8、男4点重叠，不以最后域覆盖。缓存按 actor/sample 分离，异步请求使用局部选定配方；仍保留取消、prepareRender、恢复与销毁。getState 提供 mouthEndpointValues/browSamples/noseSamples/eyeSamples；原 range/legacy 语义不变。

配方 schema/rules v5 允许新样件，v1–v4 按原能力读取并拒绝混带新端点。既有几何字段不增加新必填项。旧 palette 成功恢复时明确提示新版瞳色渲染且颜色选择不变。root 的 UI/main/虹膜修改不由本报告重新宣称通过。

## 实际 CPU 结果

- `contract-final/report.json`：17项通过，直接绑定最终四模块 SHA。独立解析源配方的六组男女新四域/旧嘴混合，全部绝对表达 POSITION 差0，NORMAL 最大5.684341886080802e-14；旧实现全buffer字节等价、文件恢复、错身份、非法值、实例、取消、失败、reset/dispose 均覆盖。
- `legacy-source-final/report.json`：11项旧端点通过；POSITION 最大9.080395102500916e-9m，NORMAL 最大8.597970008850098e-6。
- `new-source-final/report.json`：10项 POSITION 通过（最大9.313225746154785e-9m）；NORMAL 9通过、1未通过。原 POSITION 3e-7m / NORMAL 1e-5 门未改变。
- 未过项是 male-mouth88、FaceMouth 的 ALL_Sorrow（target2）、v314、Y normal：1.1056661605834961e-5。不得称全部源端点精确一致。
- `reference-1/male-mouth88-normal-witness.json`：邻面388/389，源导出与解析配方位置相差约0.87–2.60nm，独立重算法线重现约1.107032e-5差；解析配方等价不覆盖 Blender final 门失败。未补偿源点或放宽门。
- 原失败 `new-source-1/first-failure.json`、初次完整诊断与相应模块快照原样保留。contract-1 对 appearance-recipe 的 CRLF 身份不重贴；最终 LF 版已在 contract-final 真正重跑17项。
- 安装器 `--verify` 与独立审核通过；旧 public 五包14文件与原 Git 基底字节不变。

## 真实回读边界

root 已对试验205b90fac0ef做男女四域、正常1×讲话/注视、移动和配方回读。该构建不是最终源码身份：其后新增眉样件准备通过 pinned 新嘴配方进一步验证不可变原 morph/normal，并做无语义清理。最终版本仍须由 root 独立检出构建，对受影响新样件及资源身份加载做实际回读；本报告不将205b结果换标。

原始几何、UV、材质与表情数量不变不等于自然观感通过。大幅眉侧视、闭眼/注视、嘴腔等视觉范围以 root/QA 固定实际证据为准；本次不追加 GPU 或参数扫描。

## 复跑

```powershell
node scripts/install-face-visible-workbench.mjs --verify
node scripts/qa-facial-primitive-source.mjs --out <新的旧源证据目录>
node scripts/qa-face-visible-endpoints.mjs --out <新的新源证据目录>
python scripts/face-visible-reference.py <新的独立参考目录>
node scripts/qa-face-visible-contract.mjs --out <新的合同证据目录>
```

新源端点脚本按上述保留的 NORMAL 失败返回非零，不能将它误报成10项全过。所有输出目录使用新路径，不覆盖冻结证据。
