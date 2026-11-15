# 男性偏侧蓬松短发 v1

这是**原男性**头发源的一个独立几何候选，不是女性头发改名，也不是换色或换脸。实际完整材质近景可见顶部更高、轻微偏侧；没有新制作真实分缝，产品名称用“偏侧蓬松短发”，技术 ID 保持 `male-sidepart-v1`。

## 身份与原始结构

- 精确基模：`prototype/public/assets/foundation/base-male-roundtrip.vrm`，SHA256 `62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff`。
- 原可编辑完整男性源：`assets-source/foundation-male/base-male-candidate-editable.blend`；本候选从该制作链固定运行 VRM 提取实际头发。
- Body mesh0 primitive5，材质 `M00_000_HairBack_00_HAIR`，250点/408三角；所有使用点精确100% `J_Bip_C_Head`。头发无morph、男性原secondaryAnimation两组列表为空。
- 原默认头发完整保留在 `original-head-local.glb`。新旧身体、脸、服装和动作完全相同；未修改 public/src。

## 唯一作者操作

`build.py` 是可重复生成源，`parameters.json` 记录固定操作参数：Y≤1.665m的发际、耳侧、颈片精确不动；上冠沿连续smoothstep抬高和轻微侧偏，峰值抬高基准31mm、横移22mm，前部偏重。110点变化，实际最大位移37.970mm。原拓扑、UV、贴图保持；法线重算。没有物理、碰撞代理或逐帧控制。

GLB 是单普通 Mesh、identity根；已用**原男性自己的 Head inverseBind**转到 raw-head bind local，直接挂 raw head、局部位置零/旋转identity/scale1。没有SkinnedMesh，也不应再次加bind位移或VRM0翻转。fit.json保存原头骨矩阵及绑定规则引用；build-report包含原/新顶点供核查。

`manifest.json` 为 `character-hairstyle-v1`，URL `/assets/m2-male-hairstyle-v1/male-sidepart.glb`，asset SHA256 `fb5fd49352b7bab0e6d2c0ec3f6e565f0004062e4a8975f1afcd93fb24dd48fd`。兼容仅原male62b44；男jaw及其他体型尚未加入。换发只隐藏原精确HAIR primitive/group及其实际描边，绝不隐藏整个Body或Face；卸下恢复记录的原可见状态。发色可以继续由运行时独立材质实例处理。

## 实际验证

- `views/{original,candidate}-{front,side,back}.png` 六张实际Blender完整材质同镜头近景已查看，脸/眼/额/耳无遮挡，候选顶部轮廓明显变化。Blender glTF材质不是游戏MToon完全等价；本包不宣称游戏已验。
- 颈部 Body 非共面有限三角交叉0→0；Face 75→75，新增配对0。这保留原帽缘/皮肤接触，不把历史交叉隐瞒为全0。此探针未过滤透明贴图、不处理共面/CCD，实际图与数字分开。
- 生成器实际重跑后asset、manifest、fit字节相同。
- `editable.blend` 保存完整原人物上下文及原/新发型，纹理打包；实际重新打开并导出 `editable-export.glb`，三角顶点位置在1µm精度一致。不同导出器二进制不同，不伪称字节相同。
- 未验证完整跑坐舞、抬手碰头/帽子/附件、派生体型。刚性短发没有摆动物理；本轮轮廓不是最终美术批准。

## 重建与编辑

项目根目录执行：

```powershell
python scripts/m2-male-hairstyle-v1/build.py
& experiments/tools/blender-4.5.9-windows-x64/blender.exe --background --factory-startup --disable-autoexec --threads 2 --python-exit-code 1 --python scripts/m2-male-hairstyle-v1/preview.py
& experiments/tools/blender-4.5.9-windows-x64/blender.exe --background --factory-startup --disable-autoexec --threads 2 --python-exit-code 1 --python scripts/m2-male-hairstyle-v1/export-editable.py
python scripts/m2-male-hairstyle-v1/check.py
python scripts/m2-male-hairstyle-v1/check-head-space.py
```

可在保存的blend编辑 `Hair_candidate`，再用导出脚本单独输出head-local GLB。该脚本不覆盖冻结manifest和源candidate；编辑后须作为新版本适配、不能沿用旧SHA。脚本复用女性工具结构，实际输入、作者操作、绑定和兼容均为男性专属。

## 来源与许可

沿既有 Base_Male：OpenGameArt发布者hecko、VRoid Project原作者，声明VRoid Studio0.14.0基模；原文件与记录保留，见 `provenance.json`。历史beta基模发布按既有CC0依据使用，不将当前任意VRoid素材自动认作CC0。原`.vroid`没有恢复；此blend是由已保存VRM重建的可编辑项目。
