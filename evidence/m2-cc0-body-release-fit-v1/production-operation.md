# 原生 VRM0 身体底色 2:1 派生

从工程根运行。新配方提供原 VRM、已核使用条件记录、所选底色 PNG 的 SHA-256，以及实际材质、纹理、图像、bufferView 和图元 ID。预期目标摘要可在首次生成后填入；已有摘要便逐项校验。产物和完整回执保留在工程的私有 `output/` 下。 [输入配方](production-replay-input.json) · [复跑结果](production-replay.json)

```powershell
python -B scripts/production/cc0_body_basecolor_release.py --operation --spec evidence/m2-cc0-body-release-fit-v1/production-replay-input.json --output output/m2-cc0-body-release-r01/ab9a-production-replay
python -B scripts/production/cc0_body_basecolor_release.py --operation --spec evidence/m2-cc0-body-release-fit-v1/production-replay-input.json --output output/m2-cc0-body-release-r01/ab9a-production-replay --check
python -B scripts/production/test_cc0_body_basecolor_release.py
```

该操作适用全不透明的 2048² PNG、VRM0 的同一身体主图和着色图、对应 glTF 基色及固定的 MASK 关系。默认用严格对齐。只有独占图像的配方可以显式设置 `exclusive-image-preserve-accessor-alignment-v1`。它核对原有 bufferView 范围和访问器对齐，将后续视图按 4 字节倍数整体平移，并逐字节回读其他视图。访问器共用图像、范围越界、视图重叠和未知扩展均拒绝。glTF 的四字节要求适用于 GLB chunk 边界及相应顶点属性布局，嵌入图像的条款对独占 PNG view 规定 MIME 类型。 [Khronos 对齐](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#data-alignment) · [Khronos 图像](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#images) · [Khronos GLB chunks](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#chunks)

固定制服样件仍由默认命令独立复验来源许可、签名制服和预算。新派生的 fit、目录登记及游戏验证仍需各自的证据。
