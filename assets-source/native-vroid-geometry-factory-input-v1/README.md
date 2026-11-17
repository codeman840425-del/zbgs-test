# 原生脸体几何的皮肤与装备输入接缝

本包消费 [native-vroid-geometry-production-v1](../native-vroid-geometry-production-v1) 的 baseline、Face、Waist 三个真实女性 VRM，并使用已核准 `female-native-unmasked-130-v1.vrm` 的 Body PNG。三件输出只追加一个 Body image bufferView，保留每个候选自己的 POSITION、NORMAL、UV、JOINTS、WEIGHTS、IBM、morph、节点、材质和表达。`readback.json` 逐项确认全部 accessor 原样，只有 Body image11 改为 donor PNG。

输出资源如下。

- baseline unmasked `female-geometry-baseline-unmasked.vrm` SHA `6726a1d48228e462258779712fd1ec46b8258b6b9a172bf0ce50e5c6a8c943b5`
- face unmasked `female-geometry-face-unmasked.vrm` SHA `cc0843b8781e5897fdfce144d7d2d872f33f455b568a9d62165ad9b3a0ac00ce`
- waist unmasked `female-geometry-waist-unmasked.vrm` SHA `cf1574b243b3eb1d5803928598f62809c30938be67154d3956d346f39fa1ed5`

身体 PNG 的 baseColorTexture 和 MToon shadeMultiplyTexture 都消费 image11，UV 和尺寸与 donor 一致。这个动作生成了源级皮肤输入，不等于衣物、coverage 或运行时准入。

当前原生女性 top、shorts、shoes 和 sleeve56 top 的 equipment manifest 都精确绑定旧 `78912a…` avatar SHA。三个新输出拥有不同 SHA，因此旧 entries 不能直接复用。Face 变化虽未改变节点 rest，仍需以新 body SHA 独立核 top、shorts、sleeve 和 coverage。Waist 改变了 18 个节点及 Body POSITION，top/shorts/sleeve 的接触与蒙皮必须重算。Shoes 的直接几何影响较小，但 exact body identity、脚部权重与 floor 适配仍需独立 readback。本包没有伪造新 fit entries。

原三衣与改袖 Top 资源只作为依赖清单保留。

- `native-vroid-78912-top-v1.glb`、`native-vroid-78912-shorts-v1.glb`、`native-vroid-78912-shoes-v1.glb`
- `native-vroid-78912-sleeve56-top-v1.glb`

它们的原 manifest/fit、body SHA、coverage 和材质身份没有被重写。下一步应针对一个新体先做完整 equipment loader readback，再生成新的 fit/coverage 记录。旧眼镜、发型、配色和 runtime 控制器不在本包范围。

`build.py` 在写前核三份源 VRM、donor SHA、Body material 的两个纹理消费者和 image11，重复运行应使用新的空输出目录。没有 Studio、GPU、runtime、public、UI 或 Git 修改。
