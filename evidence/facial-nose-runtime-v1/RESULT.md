# 鼻尖两态运行时接入

2026-11-15。仅原女/原男的 `none` 与 `tip-forward05-v1`（鼻尖向前0.5mm）端点。没有连续范围、负端点、鼻宽/鼻高、眼骨或人物动作改造；未修改 foundation 预热、main、草稿/UI 或公开指针。

## 实现与身份

`prototype/src/facial-geometry.js` 新增 `noseSample` / `expectedNoseRecipeSha256`。状态新增 noseSample/requestedNoseSample/noseAvailable/noseRecipeId/noseRecipeSha256，几何身份包含原base SHA、各域recipe SHA与参数。省略某域保留最新请求；`noseSample:'none'`仅复位鼻，嘴/眉原接口不变，`reset:true`全恢复。

从同一不可变原底求值：嘴宽仿射、鼻固定局部位移，然后计算Basis/全部绝对表达的面积加权法线；只写回激活嘴/鼻三角邻域并集。鼻单独17/15点法线域，嘴鼻共同516/511点；未激活域保持原normal。眉刚性片平移不改其法线。各域归零从原数组恢复，不保留旧形变法线。系数恒等的嘴点跳过乘加，保护原分量逐位不变。

鼻加载额外核原normal、全部原POSITION morph哈希和primitive/index/UV身份；固定向量必须只在实际Face_SKIN、沿-Z且不超过已制0.5mm，其保护点与法线邻域须和真实拓扑一致。每实例clone/共享该实例属性，prepareRender后再提交；取消、版本错误、资源或预热失败不覆盖已有几何。

安装器复制pose最终recipe原字节，没有再次编辑源。运行：

```powershell
node scripts/install-face-nose-workbench.mjs
node scripts/install-face-nose-workbench.mjs --verify
node scripts/face-nose-parameters-v1/runtime-check.mjs
node scripts/face-nose-parameters-v1/brow-regression.generated.mjs
node scripts/face-nose-parameters-v1/mouth-regression.generated.mjs
```

两个generated runner是既有回归的冻结副本，仅重定向报告，文件头记输入SHA；不是新的资产生产脚本。旧嘴/眉报告未覆盖。

## 实际CPU结果

使用真实原VRM属性构造Three对象、当前实际模块与独立源final VRM（含每shape NORMAL）；包含9个primitive与outline。女56、男54个表达全部检查，非只选Neutral。

| 项目 | 女最大误差 | 男最大误差 |
|---|---:|---:|
| 鼻端点Basis/所有绝对表达位置 | 1.1642e-10 m | 1.1642e-10 m |
| 鼻端点Basis/所有绝对表达normal分量 | 5.9605e-8 | 5.9605e-8 |
| 嘴±4%+眉+鼻组合位置 | 3.7253e-9 m | 7.4506e-9 m |
| 三域组合normal分量 | 5.9605e-8 | 5.9605e-8 |

数值比较门为位置3e-7m、normal分量1e-5，覆盖独立float32导出/运行时求和误差；这不是几何穿插或观感阈值。鼻保护区位置、normal邻域外原法线与0相对normal逐位相等。

三域独立复位、鼻关闭清掉其normal修改、原geometry精确恢复、另一实例不变、表情引用保留、owned geometry销毁均过。9个异常/竞态项通过：pending reset、dispose、新嘴请求胜出、503、错资源SHA、实际原morph被篡改、实际原normal被篡改、prepareRender期间reset、prepareRender失败。错误时原嘴/眉仍保留。旧mouth与brow受影响回归均过。

未运行GPU/VRMLoader真实加载、真实纹理/轮廓/混合表情/眼镜接触/编辑耗时及UI保存恢复。这些不能从源数值宣布通过，交根固定构建和QA验收。鼻源本身的几何法线变化角与相对作者normal的变化角不同，详pose源报告，不混称13°几何变化。

## 固定文件

- 测试模块：`2f08dc9076fa779c3396eada13f140e4ec55fae9a0335f41bee978de76ed555d`，副本 `source-tested/facial-geometry.js`。
- 安装manifest：`c510ed739779c423afc7aecbe1b84b01c8f8ba4b03c82610466798fe4892af05`。
- 女recipe：`351c825c39d5a9a056fdd9c783d9ace35b304963c8d06a74e2ccfb3bd3b36da6`。
- 男recipe：`323d584194c25af47169c1ffd1a20246033bca07e6be7d68ddb8794b25c7a3bc`。
- `runtime-check.json`、`brow-regression/runtime-check.json`、`mouth-regression.json`记录实际本轮结果与源码身份。

产品源码已冻结，未提交/发布；无browser/Blender/临时服务残留。
