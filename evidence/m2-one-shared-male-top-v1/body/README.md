# 同一男性身体与 A/B 既有五官

两份已在历史房间实跑并从新浏览器上下文回读的外观配方，只在 `geometry` 字段不同。两份配方都使用 `male` 基模 `62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff`、同一组发色和虹膜色，以及默认 `0 / pants` 装扮。历史房间版本 `026ab20 / 0fb420e5b124` 的同镜快照中，A/B 的 67 个骨骼矩阵、表达权重、相机和灯光完全一致。[外观 A](../../m2-character-presets-a-v1/room-36/recipes/male-a.v5.json) · [外观 B](../../m2-character-presets-a-v1/room-36/recipes/male-b.v5.json) · [历史房间报告](../../m2-character-presets-a-v1/room-36/report.json)

| 配方 | `mouthWidth` | `browSample` | `noseSample` | `eyeSample` |
| --- | --- | --- | --- | --- |
| A | `-0.12` | `none` | `none` | `aperture-width105-v2` |
| B | `0.12` | `height3-spacing3-v2` | `tip-forward2-v2` | `none` |

当前共用 `createFacialGeometry` 在从该 VRM 实际解码的 CPU 网格上应用两份参数。脸部皮肤图元有 278 个被三角形引用的顶点位置变化，最大 5.417 毫米。口部 100 个位置变化，最大 5.535 毫米。眉部 110 个位置变化，最大 4.243 毫米。眼白、睫毛和眼线也有顶点变化。`Body.baked` 的六个图元共用 7,855 行位置数据，A/B 的全部位置、索引、法线、UV、骨骼索引与权重逐字节一致。原装上衣、裤和鞋各自绑定的 10、9、6 个原始关节，逆绑定矩阵与该基模逐元素相等。[数值回执](body-proof.json)

回执的 `production.presets[].d02Edits` 可用作普通 D02 `create` 的 `edits`，请求同时提供 `bodyType: 'male'` 和各自稳定的角色身份。当前准入逻辑已核对两份五官参数及资源身份。原配方是 v5 外观文件，包含的原装上衣是 `m1b-uniform-top`，SHA256 为 `393a2a97e9a933c4f8170720cf1d5792a18f282166abf7e5ffbba0d0de1fc32c`。新上衣的独立装备声明、新签回读、动作与近景观感需要用新候选证据核验。本文的当前代码实测在 CPU 上完成，历史浏览器证据对应上述历史版本。

```powershell
node F:/gamemake/evidence/m2-one-shared-male-top-v1/body/verify-existing-face-presets.mjs --verify
```
