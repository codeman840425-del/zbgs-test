# 原始男体派生版三件装备适配

`source-male-ab9a-release-v1` 使用 `/assets/source-outfit-release-v1/equipment.json`。三件新的装备 ID 为 `source-outfit-release-uniform-top-v1`、`source-outfit-release-uniform-pants-v1` 和 `source-outfit-release-flat-shoes-v1`。所有 GLB 仍走原 `/assets/raw-male-equipment-v1/` 下的绝对 URL，原始 `ab9a` 继续作为文件 `extras.sourceSha256` 和来源数据的身份。[静态适配报告](report.json)

适配器注册前比较了两份实际身体的 71 个节点、两套各 67 条逆绑定、VRM 骨骼语义和 15 个保留表面的索引、顶点、形态、材质及纹理。三件 GLB 重新逐项对照原选择面及新体实际 raw 绑定。现行装备层的 CPU 读回表明，3,107 个装备顶点在新旧身体静止蒙皮后逐点一致。错体在装备下载前拒绝。浏览器视觉、动作中的穿插及接触仍待相应验证。[加载器读回](loader-readback.json)

从仓库根复算：

```powershell
python -B scripts/production/stripped_outfit_equipment.py --body-sha256 cf1118a2a8d8fca8ccc094e51d051f660ec12ffdbdda4c8ecaad407b55cef9d4 --check
python -B -m unittest discover -s scripts/production -p test_stripped_outfit_equipment.py -v
node evidence/m2-source-outfit-release-v1/fit/verify-runtime.mjs
```

初次生成使用 `--write-new`，已有不同内容会拒绝写入。
