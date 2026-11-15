# 男性短裤材质：配置化候选，尚未进入主运行时

这里只准备最小生产接入补丁。未改变 `prototype/src`、GLB、人物控制器或装备fit；正常1×A/B录像尚未执行。旧v4-reviewed在175三姿GPU诊断中的结果不能自动作为新加载路径通过。

## 为什么保留GLB，加一份recipe

现短裤 `m1b-uniform-shorts-v1` 使用KHR_materials_unlit。单改源纹理不能重现随实际蒙皮法线变化的v4色阶；导出PBR会改变灯光/材质模型，也不等效。完整重导GLB还会给未变几何制造新资源版本。因此保留原GLB、style/fit ID与源纹理，独立版本化材质recipe。以后如果改成真正源PBR，应另做实际A/B并产生新材质资源，不能覆盖这份记录。

- 原GLB SHA：`c8a1afd0742cbb99302abc107673744751a8cfd77c6c89df039b068054a947d0`。
- 男基模SHA：`62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff`。
- 原style：`m1b-tailored-shorts-v1`；fit：`beta-base-male-62b44b-shorts-v1`。
- recipe：`m1b-shorts-cloth-v4-review1`，1286字节，SHA `6307ada57e83d74a34305708e747f452c9bde9f4b18dc4caea150f83d9d32824`。
- allowlist实现：`cloth-normal-v4-review1`，源字节SHA `4539ac3f83bc5fb1fa9aa91dbfb7323a8f2e7084a5f762d9713d0ae36bcfb565`，复制已GPU检查的reviewed模块，锁Three187。此hash是实现版本；不把它等同原GLB版本。

recipe包含精确body/garment/style/fit身份、实现版本、两primitive材质名和数值设置。装备清单只给短裤增加optional `materialRecipes` pin；其他装备不改变。JSON按bytes+SHA检验，只有编译时allowlist实现可执行，不下载执行JS。独立builder验证原GLB和shader源hash，recipe/manifest可重复生成。

## 接口与最小diff

`src/material-recipes.js`是一个有限recipe适配器，不是编辑器或新服装控制器。`src/cloth-material.js`与reviewed实现字节相同。它们由equipment层使用：

```js
await avatar.setMaterialRecipe('m1b-uniform-shorts-v1', 'm1b-shorts-cloth-v4-review1');
avatar.getMaterialRecipeState('m1b-uniform-shorts-v1');
await avatar.setMaterialRecipe('m1b-uniform-shorts-v1', null); // 原材质
```

装备加载仍先完成原GLB hash、精确基模和inverse-bind检查。材质按请求另加载；默认原材质。每件装备、每实例独立请求序号、AbortController、材质clone和状态。网络错误/hash错误/错误fit保留当前有效材质、清掉pending并报告error；迟到请求不生效。原材料数组对象可完整恢复；dispose只释放clone，原贴图由原equipment生命周期处理，避免提前释放共享纹理。隐藏短裤切回长裤时，recipe选择保留在这件装备实例上，绝不应用到长裤；显式null才撤销。

补丁范围是equipment加载/释放及API、m1-equipment和foundation-avatar各两个透传方法，以及短裤清单的recipe引用。无main/motion/转向改动；此阶段没有新UI。后续用户入口只需要“原材质/布色候选”调用同一API，无需给单件衣服增加运动分支。`integration.patch`包含现有文件最小diff与新增模块/recipe；`build-receipt.json`保存补丁依据的主源码hash，若主文件变化需复审上下文，不能直接整文件覆盖。

材质原图/UV/alpha/weights/身体与几何完全不写。效果仍是固定world light方向的toon近似；UV band/stripe保留不等于识别所有口袋/缝线。没有改变裙裤轮廓、布料接触或修复网格缺陷的结论。

## 已运行的检查

`qa-material-recipe-candidate.mjs`：真实Three材质对象，两个实例独立、重复选择幂等、原数组/alpha/纹理/几何/权重不变；旧请求迟到、clear/dispose后加载完成不应用；HTTP503、hash错误、fit/实现/primitive/settings不匹配拒绝；第二primitive失败时已创建clone释放且无部分切换。

`qa-material-equipment-integration.mjs`：实际男VRM和两primitive短裤GLB经过候选equipment原SHA/骨映射/inverse-bind加载，默认不请求recipe、加载/恢复/缓存、dispose期间迟到请求不重挂节点均通过。Node仅将图像解码替换为1×1纹理fixture，实际几何、权重、骨架、recipe bytes及hash不替代；不能作为GPU贴图或动画验收。

报告：`node-checks.json`、`equipment-checks.json`。没有启动浏览器或Blender。

## 本地外观合同边界

现 `avatar-record-contract-v2.mjs` 是QA-only合同，沿v1 strict exact比对，无材质recipe字段。不能把当前candidate塞进v2保存，也不能保存原outfit记录后声称恢复了新材质。新模块`getState().active`公开单独的 `zbgs-equipment-material-selection-v1`：equipment/style/fit/body/garment/recipe/implementation ID和hash。该记录只描述当前实例的外观选择，不包含动作或任务状态。

**本轮未实现存档迁移/保存。** 默认/旧记录仍是原材质。正式持久化前应给现QA合同新增明确版本，校验此selection与manifest允许组合，并迁移旧记录为null；不覆盖旧v2证据。当前API提供所需精确信息，但不将“可序列化”冒充保存/恢复已通过。

## 重建、验证与待录制

从仓库根：

```powershell
node scripts/m1b-assets/build-material-recipe-candidate.mjs
node scripts/m1b-assets/qa-material-recipe-candidate.mjs
node scripts/m1b-assets/qa-material-equipment-integration.mjs
node scripts/m1b-assets/qa-material-recipe-fixed.cjs --plan
```

builder只写本独立目录，不自动安装到产品，也不启动构建/浏览器。缺源/旧版本hash/patch锚不唯一立即失败，保留原产品与上次候选；先核源码变化后再生成，不绕过pin。

待负责人把补丁接入独立固定build并分配窗口，再用 `run-fixed-check.cjs <dist> scripts/m1b-assets/qa-material-recipe-fixed.cjs`，显式 `QA_M1_BUILD`。脚本复用既有normal-user-chain/材质诊断方式：原材质与recipe各新页面，同固定room相机、普通任务路径和真实1×时间；长→短→长→短、站/坐起、完整技术舞、撤材质恢复长裤，全程录像及状态记录。只检查代码中的真实API，若缺接口直接失败，不能偷偷注入旧shader代替生产加载。

录像和自然度、alpha/接缝、连续坐起/抬腿时动态色阶观感都待实际观看。单件候选的成立也不代表M1B/M1通用验收完成。
