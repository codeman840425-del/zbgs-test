# FaceContour 发布旁车 KTX2 审查

KTX2 源样件固定在 `assets-source/m2-ktx-pilot-v1`，其四份资源来自旧 801 男女 VRM。试验的女性身体源 SHA 是 `027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95`，女性身体 PNG SHA 是 `ff84d277896e7fd0e365763e7426ca27a89aadd42f24880cfbed25ce8203c6da`，Body 材质名是 `F00_001_01_Body_00_SKIN`。两份新 FaceContour 身体分别使用自身 VRM SHA `825a82c944636971304ce50b7526b1410ea6f1c6b58bd36f166515295696a547`、`9592933507b3290100d82ac315e5ddac7b6e284f372a1368de9f424643846ddb`，Body 材质为 `N00_000_00_Body_00_SKIN (Instance)`，身体 PNG SHA 为 `5bf13646459131ce6455719c8be451eb71b04a53058293974f9ab9da8bdc585a`。旧 KTX2 文件没有一个可以按身份直接复用。

KTX 试验明确要求头发保留原始 PNG/Canvas 输入，压缩图在染色前恢复普通 Texture。新 FaceContour 改变后发几何，当前没有对应的新头发 PNG、KTX2 旁车、Canvas 回退或游戏运行证据。当前结论是保留 VRM、PNG 和现有材质合同，允许未来把 KTX2 作为显式版本化派生文件发布。此次没有编码新 KTX2，没有改 VRM、PNG 或 4196。

## 新身体静态预算

`python -B scripts/production/asset_budget.py check <body.vrm> --class body --budget-version m2-technical-v1` 对两体均返回 `rejected`。共同超限项为 38,661 unique position vertices、108,256 primitive vertices、54,950 triangles、390 joint slots、130 max joints per skin、126,179,680 RGBA8+mip bytes、102 spring joints 和 28 colliders。普通电脑性能仍未测。压缩文件大小不改变这些当前 body 几何、骨骼、动态和形态预算结论。

## 最小可复用旁车契约

后续如果继续评估压缩，派生资源必须带有 `sourceExportSha256`、原始图片 SHA、VRM body SHA、material name、image/texture index、UV/采样器、alpha 状态、KTX2 工具版本和解码器版本。发布入口应先检查这些身份，再把 KTX2 放在候选包旁边。运行时必须同时保留原 PNG/Canvas 回退，且为身体材质和头发材质分别验证 MToon 主图与 shade 图、alpha 边缘、换人释放和染色恢复。KTX 文件大小和编码成功不能替代 GPU、视觉或动作证据。

机器可读结果见 `native-batch-ktx-budget.json`，SHA256 为 `27be0f7211d9694a728ab72dd88397c2b6dfb7897acfde3cd6817445b5febb1e`。生成命令为 `python -B scripts/production/qa_native_batch_ktx_budget.py`。脚本只读检查两份新包与 KTX2 manifest，未调用编辑器或浏览器。
