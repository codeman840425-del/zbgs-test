# 男性原生Body有限覆盖输入

目标7586完整基体；本包只保存原男性a18a的原生MASK PNG和对应三件装备规则。完整原生基图为cfd186...，覆盖图为15ab2e...，所有4194304 RGB texel逐值相同。源/目标文件及装备清单的精确SHA在 `generated/manifest.json`。

仅Top `native-unmasked-7586-top-v1` 存在时使用原生覆盖图；对应shorts/shoes是已声明的有限集合项，不能用它们单独启用Top遮罩。没有位图合成、任意多mask并集或删除Body三角。male原生卸Tops后全alpha恢复与保留源几何的依据来自封存male-skin-recovery包。

此包初次封存时，公共覆盖模块仅批准女性源。男性覆盖输入的原始 CPU、重建与拒绝记录见配套 `native-vroid-male-equipment-v1/README.md` 与 evidence。

## 7586 身体法线共享

`normal-source.json` 记录原生 7586 VRM 和已接入工作台的覆盖清单的固定路径及 SHA256。生成器验证两个文件的字节、覆盖清单绑定的 avatar SHA 及 Body 原色 PNG，随后从该材质读取 2048×2048 的嵌入法线。实测 material 8、texture 12、image 12，法线 SHA256 为 `87c59675bc87f6abd33e719c3c9b117c6d738d9f9bdcb30ee86d110f21c5c6e9`。两个 7586 实例可共享这一图像；女性 FaceContour 的身体法线有独立身份。

从干净检出的仓库根目录运行以下命令。要写出新副本，将最后一行换为 `--write-new experiments/body-normal-pins-rebuilt.json`。

```powershell
python -B scripts/production/native_body_normal_pins.py `
  --batch assets-source/native-parameter-game-packages-v1/import-batch.json `
  --source assets-source/native-vroid-male-body-texture-fit-v1/normal-source.json `
  --check prototype/src/native-body-normal-source-pins.json
```

从 Git 读取的源输入独立生成两次，均与登记表字节一致。Node CPU 检查使用实际 GLTF/VRM 加载与记录恢复。固定的 7586 历史记录和新建记录作为独立实例挂入同一场景并共享法线图像。先释放一人时对方仍保留图像，最后释放时关闭一次，新记录序列化后可重新加载。测试位图提供尺寸、源字节摘要和关闭计数。GPU、浏览器显示及目标设备性能未测。
