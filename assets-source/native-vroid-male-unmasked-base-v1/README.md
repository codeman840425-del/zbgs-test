# 男性原生皮肤恢复的79骨派生基体

状态为 CPU 资源派生、独立读回及重复构建通过。新身份 `native-vroid-unmasked-male-79-v1`，用于后续男性装备适配输入。factory、覆盖、动作与视觉未验证。

产物 `generated/male-native-unmasked-79-v1.vrm`，SHA `7586d3bc0921f88e86b38f7cf2f6651e4be76c47bbe0dfad45020f9001806d81`，14,194,256 bytes。`generated/manifest.json` 保存资源身份、原始meta和完整来源，SHA `7f11fdee6e0d76ae563e67005f5613e2e8b6840291ff86f5bf3af2c3f32c226c`。

|输入|SHA256|
|---|---|
|原完整男性 VRM|a18a2d1138dbae7709b3fed3711a37b5b67888552655afe8a3dfd1398ffa58da|
|原男性编辑源 .vroid|c936b24182e8bb9951f94fd0aec91db1995eb73938ff496a0614fccadd3e0e6a|
|原生卸Tops donor VRM|dc7cf29714793106f3bdb01c5f44284af1b248c6046eb453e08fa5d78e60c84c|
|原生卸Tops编辑副本 .vroid|2ae919989e43f68b05e2c0813408910511d22027ddeb604d3ae88a9ad5660cb6|
|唯一复用Body PNG|cfd1860d2d6c04e33b5636c029dac535a69e35eacf30f6f4d66729a4fc2e1368|

所有路径、bytes和来源receipt在manifest逐项固定。未合并出单一可编辑 `.vroid`，制作依赖这两个已保留的原生编辑源及其已封VRM。此次未启动Studio、桌面、GPU或调用原生导出。

## 改动与实际核验

复用已封女性生成器的 `body`、`png`、`texture_references` 低层读取方法，女性脚本SHA固定并未修改。男性独立builder将原BIN完整保留，追加原生PNG和一个bufferView，Body image改指向新增view，并更新总buffer长度。原masked PNG仍留在不再引用的旧view中，保前缀的代价是额外文件字节，本包未压缩优化。

Body material8 / texture11 / image11只被mesh1 primitive0消费，实际纹理引用仅baseColor和MToon shade，两者共享同图。PNG为2048²，全部RGB与原图逐像素相等，原生恢复alpha全255。图片来自原生donor的完整PNG字节，未重新编码、补画皮肤或修改材质MASK。

独立 `verify.py` 没有导入builder或女性helpers，重新解析已写文件。还原上述三项JSON差异后整个JSON与原a18a相等；原BIN前缀、160原bufferViews、139个accessor独立解码字节、20张非目标图片全部相同。91节点、两套skin各79joint、IBM、mesh、UV、权重、morph及表达、humanoid、spring和全部材质/采样器均保原。

新schema标为 `native-vroid-male-unmasked-source-v1`；VRM内部meta仍是原meta，保onlyAuthor/personalNonProfit/noRedistribution/modification prohibited，未扩大授权或发布资源。manifest的新ID不改变meta含义。

## 重建与拒绝

```powershell
# 默认generated不存在时首次生成
python -B assets-source/native-vroid-male-unmasked-base-v1/build.py
# 从固定来源再生成到新目录，已有目录拒绝覆盖
python -B assets-source/native-vroid-male-unmasked-base-v1/build.py --out evidence/native-vroid-male-unmasked-base-v1/rebuild-fresh
# 独立读取，报告文件也需使用全新路径
python -B assets-source/native-vroid-male-unmasked-base-v1/verify.py evidence/native-vroid-male-unmasked-base-v1/rebuild-fresh evidence/native-vroid-male-unmasked-base-v1/readback-fresh.json
```

`qa.py` 已实际另建 `evidence/native-vroid-male-unmasked-base-v1/rebuild`，四个文件逐字节完全一致并再次独立读回。女性错误源通过 `--source` 输入，预期身份仍固定为a18a，实际在创建目标目录前失败。已有输出重跑也拒绝，四个原产物hash未变。负例调用/退出状态/错误全文均保留。本次CPU无运行失败，两个预期拒绝不算生产成功。现有QA证据拒绝覆盖，不直接重跑它。

实际工具为Python3.13.11、NumPy2.4.2、Pillow12.1.0；未新安装依赖。当前机器重复字节通过，跨平台字节确定性未证明。

## 下一输入边界

后续独立装备的 `compatibleAvatarSha256` 必须针对新7586基体重新核骨/IBM/rest/实际引用属性，再生成新manifest身份。旧a18a或女性的fit/覆盖/记录不自动准入。原衣物骨及spring仍在本体，所以本包只提供该原生骨架的适配候选，不代表任意新增骨衣物能力。

完整皮肤贴图仍可能包含原生内衣图案，alpha全255不代表已经审过皮肤观感、身体解剖闭合或穿衣遮挡。新基体的基础/穿衣、表情、动作、坐起、保存恢复和游戏视觉由后续包验证。这里没有制作装备、碰撞/覆盖数据、public文件或控制器。
