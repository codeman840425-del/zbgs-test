# 唯一眼裂宽 +1%：可编辑源风险样件

完成男女各一个原源派生，离线几何及可重复导出检查通过；尚未运行或视觉验收。仅原态与固定 `aperture-width101-v1` 端点，不代表连续范围或负向范围。原 `face-eye-parameters-v1` 只读报告保持不变。没有修改 runtime/public、眼骨、原模型或旧五官生成器。

## 输入与可编辑输出

`spec.json` 固定原男女 blend/VRM、工具链、只读测量与选择文件身份。原源出处、许可和人物身份沿原 VRM meta 保留，仅 title 标识新派生。`selection.json` 保存原拓扑、实际材质域、眼角中心、每点系数、Skin/White 缝及已有嘴眉鼻 recipe 身份。

`generated/{female,male}-eye-aperture-width101-v1/` 分别包含 editable.blend、两次 native addon 原导出、两次最终 VRM、源顶点完整映射、全部表达映射及法线参考。`fresh-check/` 是独立从原 blend 重生成，非重开 edited blend 冒充重生成。

| 产物 | SHA-256 |
| --- | --- |
| female-eye.recipe.json | 19913f4c8ab2f6dd52cf112117e513d4292b17a0b1944873daca2a5f9f85df21 |
| male-eye.recipe.json | 3080a3d7bdf7891d287ccf1a7086aaacb1459793b6829b2906c95d504f4d761e |
| female final avatar.vrm | f47da9ba3906091feff8c1cf20537bf42ecc0ddacd6a82597a0d957ae9e768d6 |
| male final avatar.vrm | 391c55b35da032971517f37996d09d980c86d3749d9af88b50c049d7b6c079c4 |

两性 generated/fresh 的 raw/repeat/final VRM、mapping、normal-reference 均字节一致。原生 `.blend` 容器字节不同，原因未确认，不声称 blend 字节重现。`fresh-check/rebuild-comparison.json` 保留各自真实 SHA。

## 实际几何及表达门

Head 绑定的眼口环+8 mm 拓扑衰减 Skin、同侧 White/Eyeline/Eyelash 固定仿射；保持眼角中点、Eye pivots，不缩虹膜。所有绝对 shape 同一 `x'=centerX+(x-centerX)*xScale`，相对 POSITION delta 的 X 同比例变化，Y/Z 不变；未编辑点规范 scale=1/center=0。不是恒 delta 的眉鼻方法。透明层使用源材质分组，不以最近点冒认睫毛根。

- 女/男选中632/630点，最大 Basis 位移0.4904/0.5268 mm；眼角每端约0.183/0.187 mm。
- Basis及全部56/54 morph：逐点仿射最大误差4.76/3.77 nm；无新增退化或翻面，边长比0.9643–1.0234 / 0.9661–1.0241。
- EyeIris/Highlight/Extra、眉嘴及非选择 Skin 全部绝对 shape 精确保留，男原blink已有虹膜/高光差分保留。Body、UV、权重、indices、材质/图像、骨rest/inverseBind及表达preset映射保持。
- Skin/White 的48个同位对全shape保持缝合；原眼中心/pivot不移。嘴/眉/鼻与本样件实际位置域、三角法线邻域均无交集，逐域证据见selection。
- 首次审计计数失败保留 `initial-audit-count-boundary.json`：男1088/1293号点理论9.34/9.39 nm，Float32导出11.18 nm，越过10 nm统计线。没有改参数、身份pin或spec；审计更正为每点残差+实际变化必须属于选择集+保护域精确相等。预检628与实际630同时记录。

## raw/final 法线与风险

native addon原导出和原模型均为POSITION-only morph。最终步骤逐个绝对shape在完整Face拓扑上独立求面积加权法线，只写受影响三角邻域各660点，邻域外保原作者法线；新增 NORMAL morph，必须保留此后处理，不把raw直接当final。独立审计另用bincount累加复算，绝对normal误差门2e-7。

同shape原/新几何normal最大变化女2.205°、男3.553°。但最终重算法线与原静态authored normal比较，Basis最大19.495°/16.247°，全shape最大176.997°（女EYE_Joy）/148.138°（男ALL_Joy）。这包含原表情形变原本没有NORMAL目标与作者法线差异，不等于1%几何造成同等翻转；也不能据此消除渲染风险。实际灯光、闭眼、Joy等表情必须查看。

## 固定CPU遮挡筛查

`occlusion-screen.json` 与 `occlusion-screen-samples.json.gz` 保存56组原/候选结果和逐点位置/透射。每个原Iris/Highlight三角固定10个重心内部点、按原纹理alpha>=.5保留；双边同一采样点，在原坐标沿-Z正交观察，按glTF双面/背面规则、原材质alphaMode/alphaCutoff及UV双线性alpha求前方Head图层遮挡。测试open、full/left/right各0.5和1.0。

男女full blink及单眼已闭侧：原/候选的Iris/Highlight可见点（透射>.5）均为0。开眼、半闭与单眼未闭侧部分增加1个可见点；半闭男高光原有1点可见仍为1点。未发现新增完全闭眼露点，没有调比例或选点消除结果。

这只是稀疏表面采样，不是像素面积、真实WebGL或MToon验证；未模拟mipmap、排序/精度、灯光、透视及眼骨注视，三角边界使用严格内部判定。尚不能证明透明根无缝或注视合理。后续须同运行加载器男女近景：原/端点、半闭/全闭/单眼、注视及组合；CPU未发现阻塞仅支持这一步有界观看，不准入正式资产。

## 复跑

现有工具：Blender4.5.9 + VRM addon4.10.5；系统Python3.13.11、NumPy2.4.2、Pillow12.1.0；selection准备另需现有SciPy1.18.1。不用GPU，不新增安装。下列输出目录必须不存在；脚本拒绝覆盖原产物。

```powershell
& 'F:/gamemake/experiments/tools/blender-4.5.9-windows-x64/blender.exe' --background --factory-startup --disable-autoexec --threads 2 --python-exit-code 1 --python scripts/face-eye-sample-v1/build.py -- --out rebuild-check
python scripts/face-eye-sample-v1/finalize-normals.py --out rebuild-check
python scripts/face-eye-sample-v1/check-rebuild.py --out rebuild-check
```

现存固定generated的几何检查：`python scripts/face-eye-sample-v1/audit.py`；CPU筛查：`python scripts/face-eye-sample-v1/screen-occlusion.py`。它们重写派生检查结果但不改模型；audit也确定性重写recipe，冻结后先核字节再接运行。`manifest.py` 保存作者实际文件字节和依赖身份，`--verify` 只读验证。原始失败、日志及raw/final分开保留。
