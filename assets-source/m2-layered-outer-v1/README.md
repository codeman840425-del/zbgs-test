# 男性开襟无袖短马甲：失败的源制作样件

基于 `05063935353e5c74cf971940351b1b49ce99f333`，独立目录保存。没有修改身体、原衣物、动作、公共装备清单或发布入口。此件已经实际制作和导出，但**静态叠穿未通过，不安装为已验服装**。

## 实际制作

输入为原男性 `62b44b…` 的真实上衣躯干网格。参数见 spec.json：裁去袖、领、前中心；下缘 1.12 m，前 V 开口，沿原法线外移 8 mm，内面离外面 2 mm，补真实厚度边。保留 891 个原始面参与重裁，输出 3384 个三角面；真实 9 骨蒙皮，全部 1016 个外层点有多骨影响。裁切按原 material 坐标插值 skin/UV，4 权重截断最大丢弃量 0.0091081（约 0.91%），不宣称原绑定权重逐字不变。

独立 styleId `male-open-vest-v1`，fitId `male-open-vest-original-fit-v1`。仅原男性；layerWith 明确指向 `m1b-uniform-top`，待验下装为原裤/短裤。没有 body coverage，没有 rigid 挂点冒充蒙皮，没有 cloth。

`generated/editable.blend` 是实际可编辑蒙皮源，保存后两次重新打开并导出。`rebuild` 从相同输入/参数重新构造并另存源，三份导出文件与 generated 对应字节一致：

- 参数构造 GLB：`f7e8b686191680d277b046e17625b72237c377a9d5e528750fcdf95264ff200f`。
- Blender 实际源导出 author-export / repeat：`f30d10d8762283c93de8e06f5dfc2098c8e1fdd37e14af032ac04a8165384f98`。
- Blender 导出因属性拆点由 2032 点变为 2320 点，但每个三角顶点位置与参数导出完全相同，顺序相同；不是两个 asset SHA 等同。author-equipment.json 使用真实 Blender 导出 SHA，并标 rejected。

## 实际失败

在原 raw-bind T 姿态：Body、裤、短裤均 0 对；与原 top 有 167 对（不是领带），自身非邻接 1088 对。进一步有限线段/三角内点判定都为严格穿过，未用重复面或轻微接触豁免。

- 自交 482 外/内、268 外/外、338 内/内；rim 参与 0，重复源三角 0。
- 548 对来自几何相接但 authored normal 分裂的原接缝，例源面 223/26 的同位置法线相差 70.69°。8 mm 各自法线偏移把这个几何接缝分叉。
- 540 对源面无共同位置；对应的全部 1088 对中，原来严格相交 40、原仅接触 536、原不交 512。源未改 top 自交 10 对、裁后未偏移 18 对，不能把新增数量都归于原资产。
- 167 top 对为外层 91、内层 76，集中肩/腋附近约 y=1.32–1.45 m。实际源正面肩口有细条内层漏出、袖窿边线不齐。没有依据称可运行叠穿或本方法通过。

`source-audit.json` 保原 BVH 对，`contact-diagnosis.json` 保全部 strict 见证与源面对应。最小点到面距离只是诊断，不等同全表面最小间距。源图使用原人体/衣物材质的标准 glTF 导入渲染，不是游戏 MToon/房间或动作验收。

## 最小结构替代（本轮未实施）

不要复制高密上衣的分裂渲染法线做外壳。下一次可用标准 Blender 三块干净裁片（左右前片、后片）和明确肩/侧缝：先在几何层焊接接缝、定义袖窿，再生成连续几何法线及厚度；原上衣只作为内层空间参照，skin 由原躯干三角转移并保存对应。需要真正处理原肩袖褶的外层包络，不是再调外移距离或全衣缩放。新结构仍必须实际导出及验叠穿/动作。

## 复跑与恢复

Python 使用已有 numpy；Blender 4.5.9，2 线程，无额外插件。新输出名必须不存在，不能覆盖本次 generated/rebuild。

```powershell
python scripts/m2-layered-outer-v1/build.py --out fresh
experiments/tools/blender-4.5.9-windows-x64/blender.exe --background --factory-startup --disable-autoexec --threads 2 --python-exit-code 1 --python scripts/m2-layered-outer-v1/save-editable.py -- --out fresh
experiments/tools/blender-4.5.9-windows-x64/blender.exe --background --factory-startup --disable-autoexec --threads 2 --python-exit-code 1 --python scripts/m2-layered-outer-v1/audit-source.py -- --out fresh
```

`python scripts/m2-layered-outer-v1/verify.py` 只核保存身份，成功不代表准入；加 `--require-admission` 对本失败样件返回退出码 2，错误指向源门报告。

diagnose.py、finalize.py 和 render-source.py 明确针对保留的 generated，不自动重定向。finalize 只生成候选身份/静态绑定检查，失败源不因此准入。首轮导入误把 Blender 的 Icosphere 骨显示辅助网格算为服装，失败脚本/日志已保留；修正仅限定选中的真实服装和骨架，未改几何参数。首次预览缺 world 的脚本环境失败也保留日志，随后仅建立预览 world。

来源继承 `assets-source/foundation-male/source.json` 及既有 m1b 合法源记录：第三方发布的 VRoid beta 基模，保原出处/使用条件与其限制。新裁片为本次本地派生，不宣称原作者出品或新资产普遍 CC0。provenance.json 保存原记录。
