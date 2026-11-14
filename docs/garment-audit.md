# 用户截图与角色/服装链独立核查

核查基准：备份提交 `b8fea87`，工作分支 `fix/avatar-garment-locomotion`。当前实现岗位正在修改，因此下文把备份证据、原模型事实、当前修补和推测分开。核查未改动角色实现。静态复算命令：`python scripts/audit-garments.py`；输出 `output/garment-audit/source-inventory.json` 及锁定依赖的实际 shader/loader 源码。

## 五张输入图的实际内容

按用户文件实际内容编号，不沿用混淆编号。文件来自同一临时目录 `C:/Users/Administrator/AppData/Local/Temp/`，前缀 `codex-clipboard-`。

| 图 | 文件后缀 | 可直接看见的现象 | 尚不能从静态图断言 |
|---|---|---|---|
| 1 | `b49d9cef-e8d0-4939-ae9c-2083a9ef3670.png` | 蓝裙侧后方失去包覆，黑短裤和腿显露；头发边线呈断续点状。 | 具体动作帧、碰撞历程及造成折叠的单一约束。 |
| 2 | `ec3e1374-f6b7-40a6-92c5-78cd029992b2.png` | 坐姿蓝布主要堆到臀后，前侧短裤及大腿露出。 | 不能仅凭单图判定裙子为设计上的腰绑外套。 |
| 3 | `4b1642cc-453f-4701-ad7b-724a545e3ce5.png` | 正面蓝布大幅打开，腰下出现白色斜块，短裤暴露。 | 截图像素本身不携带 mesh ID；需同姿势材质隔离验证。 |
| 4 | `a4bac08d-79c8-4c89-9dfe-25c83bdbbc53.png` | 无蓝裙，两膝屈曲、腿形不自然，双脚靠近。 | 不能从静态图判断它是 idle、行走停帧还是过渡残留。 |
| 5 | `6c6a1d5d-7fcd-4bbf-8de9-a9ca3ed4762b.png` | **与图4完全相同**。 | 不能作为另一次独立动作失败的证据。 |

图4/5均为355×683、85,094字节，SHA-256同为 `fde556d2709d0daadb9735edd04c794061b569c31cd6a93b56fbdf342ab1c670`。图1–3尺寸依次356×681、515×651、333×467。

这些图没有版本、动作时间和控制输入，因此不能宣称每张已精确重放。同样，**没有证据把它们归到旧权重裙版本**：当前 CanvasTexture 的 UV/flipY 使绘制坐标靠底的两条线出现在裙腰，实际画面也符合；不能只看绘图 y 坐标就推断截图属于另一版本。

## 原始模型究竟有什么

`prototype/public/assets/avatar.vrm` 的 SHA-256 仍为 `12c2b97e95e700783a6a550dc0eee2d7880aeedccef9ae67bc4c5a2f0f2631a2`，身份为 pixiv `VRM1_Constraint_Twist_Sample v1.0.1`。直接读取其 GLB JSON，并与官方原装图核对：原装是白T恤、黑短裤、鞋、棕发，**没有蓝色裙或蓝色腰绑外套**。

原文件只有3个 glTF mesh，分为13个 primitives/13个材质。运行时 GLTFLoader 将多 primitive mesh 拆为多个对象；原 glTF primitive 序号与运行时名字不能混用。

| 原 mesh/primitive（零基） | 材质 | 顶点数 | 备份运行时对象 |
|---|---|---:|---|
| Body/0 | Body_00_SKIN | 5307 | Body_1 |
| Body/1 | Bottoms_01_CLOTH | 470 | Body_2 |
| Body/2 | Shoes_01_CLOTH | 600 | Body_3 |
| Body/3 | Tops_01_CLOTH | 717 | Body_4 |
| Body/4 | HairBack_00_HAIR | 883 | Body_5 |
| Face/0–6 | 嘴、虹膜、脸、眼白、眼线、眉、高光 | 4106合计 | Face分片 |
| Hair/0 | Hair_00_HAIR | 12868 | Hair |

所有这些 primitive 都带 `JOINTS_0`、`WEIGHTS_0`，但这不证明每个顶点都有多骨混权。详细属性和包围盒在输出 JSON；本次不将属性存在冒充完整绑定质量验收。

蓝裙则是 `prototype/src/cloth.js` 的 `createSkirt()` 创建的新 `GravitySkirt`，矩形布网卷成圆筒、腰环固定、逐帧 Verlet/距离约束/碰撞。其 `MeshToonMaterial` 和 CanvasTexture 由本项目生成，不在原 VRM 内；不能将它介绍为模型原配成熟服装。

## 短裤隐藏声明的纠正

备份 `assets.js` 用 `o.material?.name?.includes('Bottoms')` 查找短裤。但有 outline 的 MToon 网格材质实际是 `[baseMaterial, outlineMaterial]` 数组，数组没有此 name，因此 `bottoms` 列表为空，切裙时短裤没有被隐藏。`output/playwright/garment-diagnosis/materials.json` 在裙装场景记录 `Body_2.visible=true`。

这不是“短裤模型又加载了第二套”的证据，而是原装短裤一直存在。之前“切换已隐藏短裤/完全替换同一槽”的完成说法不成立。当前修补由负责人明确保留短裤作为内层，修复外裙包覆；不能靠隐藏短裤或身体让穿插看似消失。当前 source/文档后续应与该真实语义一致。

## 白色斜块：确定到什么程度

备份静态站 `http://127.0.0.1:4181/` 的 `scripts/qa-garment-diagnosis.cjs` 以同一固定姿势和镜头，保持所有网格可见，只将 Tops 主材质改红、Bottoms 主材质改黄。已独立查看以下两张输出：

- `output/playwright/garment-diagnosis/front.png`：裙腰下有白色三角片。
- `output/playwright/garment-diagnosis/identity-colors.png`：相同位置的三角片与上衣一起变红。

**这组实际复现的白片可确认来自 Body_4 / Tops_01_CLOTH，是原上衣穿出新增裙体，不能解释为蓝裙自身的白纹设计或 alpha 缺面。** 用户图3大白斜块与此故障类型一致；由于未重放图3的精确动作帧，不能进一步声称它的每个白像素都已逐点验证归属。当前负责人新增上衣/短裤变形轮廓碰撞代理，属于针对此根因的修补；完整走坐舞的修补效果需新视频验收。

## 当前实际动画与渲染链

依赖锁定：Phaser 3.90.0、Three.js 0.187.0、`@pixiv/three-vrm` / MToon 3.5.5。

1. `main.js` 导入 `assets.js` / `motion-source.js` / `motion.js`，Phaser 负责更新、输入与路径平移。
2. `assets.js` 用 Three GLTFLoader 注册 `VRMLoaderPlugin`，加载 `avatar.vrm`，得到 `gltf.userData.vrm`；调用 `createSkirt` 创建附加裙。
3. `motion-source.js::loadRetargetedMotions` 加载 `/assets/motion/UAL1_Standard.glb`，把 Quaternius 人形动作转换到 VRM normalized humanoid。
4. `motion.js` 用重定向 clip、动作状态与脚部修正计算姿态；`main.js` 每帧按路径移动量调用 `motion.update`，随后 `vrm.update(dt)`、世界矩阵更新和 `updateGarment`。
5. Three WebGLRenderer 渲染蒙皮人物、MToon base/outline 与新增布料。

**Rigby2D没有进入这条运行链。** `package.json`、lock、`prototype/src/` 无 Rigby 依赖或 import。`scripts/rigby-mcp-client.mjs` 是可手动启动的 stdio JSON-RPC 客户端壳，默认指向不存在的 `vendor/rigby2d/src/mcp/server.js`，本地未见成功的 `output/rigby` 记录。它既不是 Rigby 运行时，也不是绑定/网格实现；文件头自称“Official”不是已连接官方工具的证据。本次不能凭这些文件判断其他历史电脑是否曾运行过 Rigby，只能确认当前候选未调用。

## 发丝虚线、alpha、outline与深度

已核锁定包实际源码（不是泛泛查其他版本）：`prototype/node_modules/@pixiv/three-vrm-materials-mtoon/lib/three-vrm-materials-mtoon.module.js`，从包内 sourcemap 解出 `output/garment-audit/MToonMaterialLoaderPlugin.ts` 和 `mtoon.vert`。对应[官方3.5.5 loader源码](https://github.com/pixiv/three-vrm/blob/v3.5.5/packages/three-vrm-materials-mtoon/src/MToonMaterialLoaderPlugin.ts)与[MToon规范](https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_materials_mtoon-1.0/README.md)可交叉核对。

- 原 VRM **13个材质全部 `alphaMode=OPAQUE`、`doubleSided=true`**。Hair/HairBack 等有 worldCoordinates outline，宽度0.0008模型单位。备份实际 runtime 报告对应 `transparent=false`、`alphaTest=0`、`depthWrite=true`，base `side=2`（DoubleSide），outline `side=1`（BackSide）。因此目前不支持“透明 alpha 混合排序造成断线”的说法。
- MToon `_generateOutline`（解出源码323–336行）复制 base 材质、设置 `isOutline=true` / BackSide，并给同一几何添加两组相同索引范围。即额外一次背面膨胀轮廓绘制，渲染组会真实参与深度测试。
- `mtoon.vert` 97–111行沿蒙皮法线外扩 outline，且已含 `gl_Position.z += 1E-6 * gl_Position.w` 的防伪影偏移。不能直接认定“依赖完全没做深度偏移”；它有偏移但不能保证所有双面薄片和距离都不冲突。
- 当前抗锯齿请求 `antialias:true`，DPR上限1.5，透视 near=.05/far=60；细轮廓处于亚像素尺度时可能有采样锯齿/点状跳动。Hair/HairBack 的重叠薄片、双面base与膨胀outline深度接近也是可检验候选。**这些目前是原因候选，不是已经定位到唯一根因。**
- 角色 `receiveShadow=false`（投影开启），因此不能未经隔离实验就把身上所有点线叫阴影痤疮。普通材质/纹理颜色、轮廓深度、几何重叠、采样和截图缩放应分开测试。

建议在同一冻结姿势、镜头、DPR下只改一个变量：原样 → 仅关outline → 仅把原base改FrontSide → 恢复后提高采样分辨率。记录每个状态的材质数组、renderOrder、depthWrite和完整局部截图。此类开关仅用于定位，不能把关闭所有轮廓当成已完成最终画质优化；需要保留发丝轮廓和背面外观检查。

## 尚未证明的项目

用户图1/2准确路径与逐帧碰撞历史、图3精确姿态全部白像素归属、图4屈膝的具体动作状态、发丝点线唯一成因均未完全证明。原截图与当前cloth纹理一致，因此不应推给“必然旧版本”。本报告也未声明新碰撞代理已经通过所有服装动作验收。

## 完整人体/贴身练功服可行性专项（实际执行）

**结论：原 `Body_1` 不能直接作为完整人体基础模式。其胸腹中央缺少真实三角面；给它换成不透明练功服颜色不能补出表面。** 用户提出先用完整基础人体检查姿态的方向合理，但这份模型必须先补齐/更换完整人体源，不能发布缺面诊断模式。

执行 `python scripts/audit-body-surface.py`，直接解析固定哈希 VRM 的 `Body/primitive0`：5307个顶点、8864个索引三角形。对中心 `x=-0.08,0,+0.08` 的多组固定 y 做沿 Z 方向的三角形重心坐标求交，不按整层 y 顶点数判断，避免将同高度伸出的手臂误当躯干。

| 原模型局部静止坐标 y | 三条中心射线的不同 z 交点数 | 能证明的范围 |
|---|---|---|
| .85、.90、.95、1.00、1.05 | 每条均2个 | 这些臀盆/下腰位置实际有前后皮肤面。不能因此推定全躯干完整。 |
| 1.10 | x=0有1个，x=±.08均0 | 进入不完整区域。 |
| 1.15、1.20、1.25 | 九条射线全部0 | 中央躯干这些位置没有前后皮肤三角面，不能用手臂同高度顶点掩盖该事实。 |
| .75、.80 | 中心0，左右各2 | 两腿之间自然间隙，不当作躯干缺面。 |

详细交点三角序号与 z 值：`output/playwright/body-surface/geometry.json`。这是局部面覆盖检查，不是完整流形/水密性验证。

同时实际执行 `node scripts/qa-body-surface.cjs http://127.0.0.1:5173/`：独立浏览器页面暂停后重置为 VRM normalized Tpose，将 **Body_1** 替换为纯不透明深灰 `MeshBasicMaterial`（无纹理、无alpha、双面），仅诊断隐藏 Tops/Bottoms 和新增裙，保留头脸、头发与鞋。所有操作只存在于该浏览器页；截图完成后窗口关闭，未写产品源代码或新增可交付“缺面模式”。

实际目视证据：

- `output/playwright/body-surface/front.png`：颈/肩/手臂与下腰/臀腿之间中央胸腹为空，能看到后面的头发。
- `output/playwright/body-surface/side.png`：侧面清楚看到颈下到腰上之间贯穿背景，排除正面头发遮挡造成的误判。
- `output/playwright/body-surface/back.png`：记录同状态背面；长发遮挡较多，不单独依赖这张判断躯干完整性。
- `output/playwright/body-surface/runtime.json`：实际隐藏/保留的 mesh 与原材质名。

推荐下一步：在继续服装优化前取得或制作真正连续的胸腹/背部，并与原肩、腰和骨权重连接验证；或采用有明确完整人体源及许可的同类样板。当前裤下臀盆存在，缺失主要证据落在上衣覆盖的躯干区域。不得用外衣暂时挡住缺面后声称完整人体已就绪。
