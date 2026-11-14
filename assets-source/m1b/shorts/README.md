# M1B 独立露膝短裤 v1

这是当前男性完整基模上的新服装几何，不是原长裤改色或改名。原长裤、原身体、上衣和鞋均保留。当前结果仅完成源制作、真实 Blender 往返和离线绑定验证；运行时正常速度、坐起、裤口与腿部遮挡需单独验收。

- equipment ID：`m1b-uniform-shorts-v1`。
- style ID：`m1b-tailored-shorts-v1`。
- fit ID：`beta-base-male-62b44b-shorts-v1`。
- 兼容唯一基模：`62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff`。
- 最终资源：`prototype/public/assets/m1b/m1b-uniform-shorts-v1.glb`，SHA256 `c8a1afd0742cbb99302abc107673744751a8cfd77c6c89df039b068054a947d0`。
- 清单：原 `prototype/public/assets/m1b/equipment.json` 增加独立条目，不放宽 loader 的身体/骨名/逆绑定校验。

## 几何与真实腿部

用原男性长裤的真实臀部、裆部和裤腿表面，在实测膝骨上方 80 mm 截短，边界三角插值 UV 和骨权重。裤口世界 Y 为 0.656898 m，膝骨约 0.576898 m。增加向内 1.5 mm、向上 12 mm 的内翻裤口，保持真实腿洞，没有用封口面盖住膝腿。原有短截面上表面 832 三角，内翻边 96 三角；共 802 顶点、742 个多骨混权顶点、7 根绑定骨。

原 Body 仍有 7340 个索引三角。膝盖到小腿的露出范围有 824 个完全位于该范围内的皮肤三角，顶点/边中点/重心共 5768 次 UV alpha 采样全部 255。因此原腿部是被长裤遮挡，并非这些区域缺面或透明。这个采样不代替运行时逐画面观察，也没有更改 body visibility。

最终 Blender 导出后的上臀表面（Y > .75 m）496 个顶点，与原长裤的位置、UV 和按语义骨名展开的权重最大联合误差 1.195e−7。这只能作为座姿初值参考；不直接继承长裤“已通过”状态或宣布短裤座厚已标定。新裤口、姿态遮挡和身体接触仍单独测量。

## 可重复制作与真实编辑导出

安装 `scripts/m1b-assets/requirements-shorts.txt`；Blender 使用既有固定 4.5.9 LTS。从仓库根目录执行：

```powershell
python scripts/m1b-assets/build.py
python scripts/m1b-assets/build-shorts.py
experiments/tools/blender-4.5.9-windows-x64/blender.exe --background --factory-startup --python scripts/m1b-assets/save-shorts-editable.py
python scripts/m1b-assets/repack-shorts-editable.py
python scripts/m1b-assets/audit.py
python scripts/m1b-assets/audit-shorts.py
```

`spec.json` 与制作脚本是参数化源；`m1b-uniform-shorts-v1.blend` 是实际带权重、两材质和打包纹理的可编辑几何源。制作脚本重新生成原始短裤时会重建 blend，因此需要保留手动编辑时改用：

```powershell
experiments/tools/blender-4.5.9-windows-x64/blender.exe --background --factory-startup --python scripts/m1b-assets/save-shorts-editable.py -- --reuse
python scripts/m1b-assets/repack-shorts-editable.py
```

`--reuse` 打开已保存的实际 blend，不重建网格。导出两次到忽略的 `output/m1b-shorts/` 后，repack 读取这份真实编辑导出，提取几何/UV/权重，转换回源 raw skeleton 并重建精确绑定清单。未知骨名或材质拒绝。当前支持几何/UV/权重编辑，纹理采用固定原男性裤料和新裤口材质；没有宣称任意材质编辑导出。

两次重新打开 blend 的 GLB 导出 SHA 相同：`67d4bde5512fc6609a7bf5e55bf2c831c7db8b0f04cf9588b2c599e928cb07a5`。两份分别 repack 得到相同最终 SHA。绑定审计最大权重和误差 1.192e−7，静态蒙皮位置误差 8.919e−8 m。旧长裤/上衣/鞋输出 SHA 未变。制作函数已改成 main guard，导入 exporter 不会重写其他装备。

注意：旧 `build.py` 仍只导出原三件；完整重建时必须随后执行短裤步骤，不能只跑原脚本就声称新装备已重建。

## 来源与限制

沿用 `assets-source/foundation-male/source.json`、`LICENSE.md` 中旧 Base_Male 的来源与 CC0 声明及第三方整理限制，不扩大至当前 VRoid 预设。未修改身体、未复制女性尺寸、未新增动作控制器。重用男性统一装备入口的 outfit 2；精确身体之外的变体拒绝，不做自动体型适配。这是单个新短裤试件，不是衣库完成。

## 通用入口接入与离线回归

男性配置声明 outfit 0 长裤、2 短裤，女性保持 0 裤、1 裙。选择状态同步切换预加载资源；不支持的 fit 在改变状态前拒绝。`pants` 表面 getter 返回当前裤装，全部长裤/短裤 mesh 都登记 `assetRole=pants` 供可见几何探针采样；诊断基础模式只隐藏装备，完整身体与鞋保留。全套序列按角色已声明的 outfit 索引枚举，不把男性序列错误写成 0/1。

`node --experimental-vm-modules scripts/m1b-assets/qa-outfit-selection.mjs` 测试真实装备选择实现，加载器使用限定替身：长短裤快切、不可用 outfit 拒绝、基础模式恢复、身体不隐藏、错误身体 SHA 拒绝、重复 dispose 均通过，见 `selection-check.json`。这是状态回归，不是模拟一次可视验收。

独立 Vite 编译输出 `output/m1b-shorts/build-check` 通过，未生成正式候选 build ID；该编译目录不能作为固定发布证据。`shorts-room.json` 可传给既有 `qa-m1-run.cjs` 的 `QA_M1_CONFIG` 执行单套短裤全链。实际浏览器/三椅/画面检查等待协调窗口。
