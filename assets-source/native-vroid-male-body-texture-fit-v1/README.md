# 男性原生Body有限覆盖输入

目标7586完整基体；本包只保存原男性a18a的原生MASK PNG和对应三件装备规则。完整原生基图为cfd186...，覆盖图为15ab2e...，所有4194304 RGB texel逐值相同。源/目标文件及装备清单的精确SHA在 `generated/manifest.json`。

仅Top `native-unmasked-7586-top-v1` 存在时使用原生覆盖图；对应shorts/shoes是已声明的有限集合项，不能用它们单独启用Top遮罩。没有位图合成、任意多mask并集或删除Body三角。male原生卸Tops后全alpha恢复与保留源几何的依据来自封存male-skin-recovery包。

公共覆盖模块当前仍只批准女性源，本男manifest只是下一实现的source数据，未运行材质切换/恢复，更不代表factory或视觉通过。详见配套 `native-vroid-male-equipment-v1/README.md` 与evidence实际CPU/重建/拒绝记录。
