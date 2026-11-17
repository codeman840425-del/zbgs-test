# 两份原生 FaceContour 配方的游戏输入

从仓库根运行 `python -B scripts/production/native_body_package.py`。输入与源 SHA 在 `scripts/production/native-body-package-v1.json`。同一构建器逐条读取原生编辑源和导出身份、回读配方、依赖差分、同模板基线、完整皮肤来源及原生上衣遮罩。成功后发布每个候选自己的目录，重复运行会逐文件比对既存产物。三衣的 URL 与骨骼清单取自本角色，`import-batch.json` 可交现有 `scripts/production/native_import.py --batch ... --output output/<新候选目录>`。

|候选|游戏身体 SHA256|衣物与覆盖|
|---|---|---|
|下巴圆度 A|`825a82c944636971304ce50b7526b1410ea6f1c6b58bd36f166515295696a547`|自己的上衣、短裤、鞋；只上衣启用覆盖|
|面颊丰满度 B|`9592933507b3290100d82ac315e5ddac7b6e284f372a1368de9f424643846ddb`|同一提取方法，对本体重新读取绑定|

两个候选均保持原生源全部 146 个 accessor、骨架、morph 与动态定义。身体遮罩在两个原生导出中均可逐字节溯源；完整皮肤与遮罩的 RGB 相同，仅 608383 个像素的 alpha 改变。每件衣服都与身体中的原始 primitive 比较了实际属性、索引、权重、关节顺序和 IBM。两体分别用 Three r187/VRM loader 读取 600 个鞋顶点，raw Y 最低均为 −7.442453409112204e-8 m，CPU 静止蒙皮后最低均为 −8.449510756150829e-7 m。

`recipe.json` 保存原生批次的具体参数项，`profile-candidate.json` 记录该文件及原生导出的 SHA、角色和装备身份、实测 sourceFloorY。`provenance.json` 记录模板/源/导出/遮罩/派生体的对应关系、授权 meta 以及需复核的受影响依赖。

`python -B scripts/production/test_native_body_package.py -v` 使用两份真实源，在临时目录验证逐字节与 mtime 重跑、共用导入器消费两包、正确 SHA 但来自另一候选的输入被拒、失败项重试保留成功项、现存文件冲突保原及错误遮罩拒绝。3 项测试全部通过。此包仅验证离线几何、覆盖和绑定。实际动作、持物与眼镜/发际适配、镜头观感、性能及角色记录恢复须用游戏侧候选另验。
