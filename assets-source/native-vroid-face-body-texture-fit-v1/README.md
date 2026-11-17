# Face 派生 Body texture / floor 输入

Face 派生基体 `cc0843b8781e5897fdfce144d7d2d872f33f455b568a9d62165ad9b3a0ac00ce` 使用原 843ac 完整 Body PNG。Body material 的 baseColorTexture 与 MToon shadeMultiplyTexture 仍消费 image11，UV/尺寸/PNG RGB 消费语义已由几何 factory 输入核对。原生 Tops masked PNG `dc375769…f68a8c` 从既有 `native-vroid-body-texture-fit-v1` 原样复制，未做三角近似、阈值扩大或透明像素重算。

`profile-candidate.json` 给出新的 face avatar SHA、三件 face equipment IDs 和两个明确的地面数值。`sourceFloorYRaw=-7.442453409112204e-08` 是鞋 GLB 实际 indexed POSITION 顶点的最低值。官方 loader rest/world 读回为 `runtimeRestFloorY=-8.449510756150829e-07`，二者不能混称。旧 mask 的字节身份与来源明确记录。face equipment 的 GLB、SHA 和 bindings 在 `native-vroid-face-factory-equipment-v1`。

通用 `body-texture-coverage` CPU 检查结果是 `admission-blocked-new-avatar-identity`。当前共享 admissions 没有 face 派生 SHA，因此任何覆盖事务都 fail-closed，材料颜色/map保持不变。该结果记录的是正确阻断，不能称覆盖通过，也没有修改 admissions/runtime。待 root 明确注册新身份后，才可用同一 manifest 做真实 prepare/commit/dispose 回归。

原生完整 Body PNG、旧 mask 与 Face geometry 的 RGB/UV/消费者关系保留。此前首次生成/CPU blocked 检查是历史证据，`cpu-check.json` 仍明确写着当前 admissions 未注册 Face SHA，不能当注册后覆盖结果。没有 Studio、GPU、public、UI 或 Git 修改是本次生成范围说明。游戏接触、表情、服装视觉和覆盖运行仍未验。

当前可重复入口如下。

```powershell
python -B assets-source/native-vroid-face-body-texture-fit-v1/build.py
python -B assets-source/native-vroid-face-body-texture-fit-v1/build.py --check
node assets-source/native-vroid-face-body-texture-fit-v1/check.mjs
```

`build.py --check` 在已有输出上只做字节核对，不重写文件或修改 mtime。错误源 SHA、旧 mask、Body RGB、base/shade image11 消费者和 indexed 鞋底输入会在写前拒绝。`check.mjs` 当前只验证未注册新身份的 fail-closed 行为，注册后应由独立审查重新执行真实 coverage transaction。
