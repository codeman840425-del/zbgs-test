# 公共装备 MToon 有界独审

修后在本次CPU与调用链范围内无剩余阻断。原纹理释放失败保留，未把源码检查当作视觉验收。

## 两项已修复问题

- 首次代码读审发现裙装手面预采样以0秒调用stateless装备更新，并可能跳过随后真实dt。root现将材质推进独立为updateMaterials，foundation在vrm.update后用同一dynamics时钟调用一次。初版CPU源SHA已含该修正，旧问题是代码读审和调用序列witness，详细澄清另存，不能称为旧完整avatar执行。
- 官方MToon把贴图放在uniform.value中，旧顶层Object.values扫描没有释放它们。实际adapter在cpu-v2复现共享Texture释放0次，修后cpu-v3共享map/shade/outline释放1次，数组中另一贴图也1次。原8/9失败及修后12/12均保留。

## 实际检查范围

实际GLTFLoader+官方3.5.5插件读取内存合法蒙皮GLB，plain仍为MeshStandardMaterial，unlit仍为MeshBasicMaterial，MToon生成独立surface/outline材质。Set使重复mesh/item引用每个材质只推进一次。原VRM.update消费构造时materials数组，不遍历后来附着装备，实际VRM对象检查未推动独立装备材质。

实际adapter验证隐藏时保持UV相位、重新显示续进、双实例相位隔离、销毁幂等、surface/outline/geometry各释放一次、销毁后不推进。旧unlit cloth recipe切换及恢复通过，MToon走该MeshBasic专用配方明确拒绝并保原材质。

## 精确身份

| 文件 | SHA256 |
| --- | --- |
| `prototype/src/equipment-material-loader.js` | `343405e061dcbe9fe954508f4adc6bd114214fac1d2c4bd0290b0febcf0629d7` |
| `prototype/src/equipment.js` | `f2c732e489d2b1706c40de9df4f18c3a2c20497ff081c9ffbd3515f7227f2732` |
| `prototype/src/m1-equipment.js` | `00549d85801dbb160df05c029156349e7a4999af31d0fdcc7d105e9b90900d95` |
| `prototype/src/foundation-avatar.js` | `d7d77305ad6fdff53342ffea1a2531670fca7591874d341c9181bb86845a8a18` |
| `prototype/src/motion.js` | `22cf4adaa1b5cb0839150c1e6ce00cd33b895c28f737b6b60343081ee34308fb` |
| `prototype/src/material-recipes.js` | `be6ab537823b6c74ca68bef889cfe2e887bf19eeceed4ea49243ac16902ab1cd` |
| `prototype/src/cloth-material.js` | `4539ac3f83bc5fb1fa9aa91dbfb7323a8f2e7084a5f762d9713d0ae36bcfb565` |
| `prototype/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js` | `bfc0f3bd49ee5b706b3055d366759e881f20dee32be344c4c8f586600f223434` |

## 限度

没有运行浏览器/GPU、解码真实贴图或评判实际衣物外观。基础房间调用顺序为源码审查，CPU只执行真实loader/VRM/装备adapter及material recipe。纹理数组检查为受控CPU uniform夹具。实际native衣物、透明/描边可见效果、动作完整过程和普通机性能仍由root固定构建验证。未编辑生产文件，未git提交。

复测命令需新输出目录。

```powershell
node scripts/qa-equipment-mtoon.mjs evidence/native-vroid-equipment-runtime-v1/cpu-fresh
```
