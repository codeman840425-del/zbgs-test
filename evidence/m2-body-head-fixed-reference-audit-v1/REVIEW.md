# 身体与头部组合的保护参考审查

完整身体组合应把“头部操作不额外移动 neck”与“最终 neck 相对原源是否移动”分开。旧 head-only 的 68 点、2 µm 阈值及通过身份保持原样。新组合使用新的 schema 和 method spec，保留全部原点，核 `F(P) - (P + B(P))` 的头部贡献，并另报 `F(P) - P` 与请求身体贡献 `B(P)`。这不是把旧 head-only 结果改名为完整身体通过。

此次只读原源、冻结系数的支撑定义和已有回执，未调用 B/G/F、未求导、未生成几何、未导出、未运行 Blender 或游戏。requested 配置沿已记录 gpt-6.1-sol/high，宿主实际 provider 与 hook 未独立核验。

原产品依据来自 `docs/research/M2-COMPLETE-CUSTOMIZATION-LONG-GOAL-v2-2026-11-16.txt` 第 4、5、6、10 节。身体、头脸独立修改及组合属于目标，身体变化需联查依赖，求值从不可变原源和完整最终参数出发，必须检查保护区和实际生效。该文没有要求所有新身体的 neck 表面永久保持原源坐标。`docs/AVATAR-CONTRACT.md` 第 15 行也约定不可变原底加完整参数求值，保骨架/表情绑定，并以新形变身份记录变化。保骨架不等于所有 neck 表面点都禁止请求身体体积变化。

原 v2 spec 有 8 个请求，每项完整 13 参数。9 个身体参数为 waistWidth/waistDepth、hipWidth/hipDepth、chestWidth/chestDepth、shoulderMass、upperArmRadius、thighRadius。4 个脸参数为 jawWidth、cheekWidth、chinLengthM、chinProjectionM。新草案内的 `originalEightRequestsMetadata` 与原 `variants` 逐值相同。旧 `body.py::body_displacement` 从原 `Mapper.field` 脸分支前抽出 B。既存 preflight 的男女 8 项 body gate 全通过，component error 和 distal displacement 均为 0，实际采样 body-only determinant 最小值为 0.6521809773。男包整体当时失败不改变该独立 body gate 的结果，也不证明新完整组合通过。

neck 原始来源是 `m2-head-volume-domain-v1/run.py` 的 `neck-preservation`，选择 domain box 内、原 neck 骨下 5 mm 截面以下的实际 Body_SKIN 索引。随后 head-only evaluation 明确 `headParametersApplied` 只有 4 项脸参数，`otherBodyParametersProvenanceOnly=true`。因此旧 `F_head(P)-P ≤ 2 µm` 是保持头部操作边界的合同。它没有同时求值并批准请求身体 B。

原男源 SHA 为 `62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff`。68 个 neck ID 全部属于 accessor 7、base endpoint，且被实际 Body_SKIN indices 引用。Y 范围为 1.4325816631–1.4500398636 m。按原 B 的 smooth 截止公式及源骨架，肢体项上界为 neckY−0.01，torso 项上界为 chestY+0.20，合并上界为 1.4463363791 m。56 个 neck 点低于该上界，这只是可能作用范围计数。

已有 `prepared-corrected/report.json` SHA `2921ac41482222bc31628425271233bc6f51569a429d88c689a0518bad0f75a2` 保存了实际原 68 点及 B/head/final 分解。本审查逐点核其原 source 坐标与索引完全一致，并只对保存数组做算术读回。36 个点 B 非零，最大为 0.000173985907654 m，原 ID 1758。保存的 final−original 与 B 数组完全一致，头部额外贡献全 0。该 173.986 µm 不是因数值“小”而豁免，它是已请求的身体贡献。若对完整 F 直接套原 `F-P ≤ 2 µm`，会拒绝上述本来没有额外 head 运动的点。

建议新结果完整记录以下量，并明确它们的参考源和用途。

- `bodyDisplacementM = B(P)`，引用原 body 方法、完整 9 项请求及原源坐标。
- `headContributionRelativeToRequestedBodyM = F(P) - (P + B(P))`，在同一原 68 点保 2 µm 门。
- `finalDisplacementFromOriginalM = F(P) - P`，报告真实整体变化，不能称为原源固定误差通过。
- `finalMinusBodyResidualM = (F(P) - P) - B(P)`，同一 68 点保 2 µm 门，并与 head contribution 交叉核对。
- 逐点保 positionAccessor、endpoint、sourceIndex、原 P、B、head、final，不删点、不重采最近点，也不由新 mask 替换旧 mask。零身体请求时两种参考必须退回旧 head-only 原源语义。

8 个 frame 角点也需要明示参考。它们来自旧 head domain 的人工 box corners，4 个低角 Y 为 1.4323847103 m，x 为 −0.1313586202/+0.1323762652 m，z 为 −0.1476608557/+0.1195009542 m。这些点落入 B 的可能支撑区。当前审查读到的新草案仍对 final frame 套原源 2 µm，可能出现与 neck 相同的参考冲突。本审查没有求值这些点的 B，具体位移未知。应保全部 8 角的 body/head/final 分解，并显式决定新组合检查的是 head 相对请求身体的边界固定，还是另有充分依据要求该人工角点的完整身体贡献也为 0。不能仅沿用旧字段名称推导后者，也不能删角点求通过。

没有发现当前男性身体与正式脸目标直接冲突的证据。G 的源 Y 起点为 1.4500398636 m，与 B 支撑上界间隔 3.703484535 mm。实际 Face_SKIN、FaceMouth、EyeIris、EyeHighlight、EyeWhite 的原 base 及全部 54 表达端点最低 Y 均高于 B 上界，其中 Face_SKIN 最低为 1.4934911728 m、FaceMouth 为 1.5036797523 m。因此该 B 不直接改动这些原脸端点，不与原 101 脸截面意图直接争用同一源区域。此结论依赖当前男源、当前 B/G 支撑及相加语义，不外推女性、其他身体场或 `G(P+B)` 的顺序合成。

新组合仍须自己的完整源/表达 F 与 JF、Float32 回读、真实 101、几何退化/翻面、接触、装备和游戏验证。支撑区域分离不能替代输出直三角、身体接触或动作检查。本报告不授权执行、不记录新候选通过，也不处理原 head-only 的已知混合口型问题。

机器证据为 `readback.json` 和 `saved-preparation-readback.json`。前者记录全部已读文件 SHA、原请求字段、68 ID、源支撑界、实际脸材质端点范围和既存 body gate。后者记录对既存准备数组的独立读回。复算脚本只读取上述输入，拒绝覆盖自己的结果文件。
