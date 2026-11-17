# Face 派生女性三衣源接缝

本包从 `female-geometry-face-unmasked.vrm`（SHA `cc0843b8…ac00ce`）按已验证的原生 equipment exact-extraction 流程拆出 top、shorts、shoes。每件 GLB 保留原始 130 骨顺序、IBM、POSITION/NORMAL/UV/JOINTS/WEIGHTS、MToon 图和原 primitive，未重算权重或修改 mesh。三件资源的独立 SHA 见 `equipment.json`。

生成入口是 `build.py`。输入 SHA 在写前固定核验，`build.py --check` 已在内存重建并逐文件通过。`negative-wrong-source.json` 记录把 waist 派生替作输入时被固定 SHA 拒绝。原 equipment source 的 asset metadata、原生授权边界和本次 Face 派生 source lineage 均保留。

`verify.mjs` 已实际用 Three 0.187、VRM 3.5.5 和 MToon 插件完成 rest、walk fixture step 10、sit-rise fixture step 60 的 CPU 读回。原衣物与独立 primitive 的权重归一化存在既有路径差异。top 最大约18.737nm、shorts约6.899nm，shoes为0。三件共用原 source 的5次 normalize 与独立资源一次 normalize 对照，48个权重分量最大差 `2.9802322387695312e-8`。这保留为技术读回结果，不冒称视觉或接触通过。

Face 派生只改变脸部几何，衣物 fit 仍因新 body SHA 需要独立验收。此包生成的是同源 primitive 拆分，尚未做新 body 的 garment coverage、recipe、factory、游戏运行、表情近景或动态碰撞。Waist 派生不在本包中，旧 equipment 文件不能跨 SHA 复用。改袖 Top、HairSet001、颜色和其它附件不在范围。

CPU 证据见 `evidence/native-vroid-face-factory-equipment-v1/result.json`，其中 plain loader 的 MToon 缺失和官方 MToon 读回均保留。没有 GPU、Studio、runtime/public/UI 或 Git 修改。
