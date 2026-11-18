# 既有短发的批量派生适配源

本包复用现有female-bob-v1与male-sidepart-v1的确切GLB，按实际目标VRM逐一生成显式character-hair-fit-v1 sidecar。原有发型、原版legacy身份和配方保持各自记录。源GLB保留原来源身份，targetBodySha256由实际目标字节决定。

```powershell
python -B scripts/m2-preset-short-hair-fits-v1/build.py --batch-root .
```

输出在ready/<preset>，每个成功目标有fit.json、manifest.json、fit-report.json，保守预检拒绝目标仅有FAILED.json。准备完整目标文件后才将stage重命名为正式目标目录，重复产物必须同字节，已有不同状态/内容拒绝覆盖。ready/manifest.json只汇总源sidecar结果，runtimeAccepted均为false。root负责正式发布、catalog准入和游戏验证。

源门核真实目标SHA、原始raw骨架与IBM、原HAIR顶点/法线/UV/拓扑/权重、材质与图像，并保上头/后头/非皮肤头部及其作者morph端点。实际变化的身体/面部三角在中性与单独作者morph端点分别对既有hair检查。旧pair保留，新增pair先写明确几何诊断。该保守拒绝可供root按真实纹理alpha、接触深度及实际运行分类，非零计数自身没有视觉验收权。

初次实际8目标中6组通过源门，male-wide-muscular与male-round-stocky的中性Face新增7/8严格pair，待alpha/深度分类。零新增不代替动作、表情组合、透明贴图与连续接触验收。head-only保护区是按实际权重和头局部坐标计算的几何区域，未冒称完整语义耳区标注。

spec.json锁定原始身体、source GLB和manifest SHA。沿existing纯segment_hits函数检查，提取函数AST以避免执行历史写源/发布代码。原female/male作者editable源与参数仍归既有源包，本包不重跑旧writer，不改几何或控制器。失败卷发另包封存，不参与本包family选择。


按root依据实际透明证据的方向，2组另生成conditional目录，status为source-contact-candidate。原ready/FAILED保留。条件方法逐个检查中性与54作者endpoint的全部新增pair，仅当正深度UV区域的保守双线性像素footprint在正/翻V方向均全零alpha，才输出带精确contactEvidence SHA的候选fit。它们的385/440个pair实例均透明，最大局部平面深度0.338/0.734mm。原VRM/MToon MainTex与用于测量的GLB base PNG字节一致。深度是裁剪投影棱柱内的面片平面量，实际shader/outline、组合表情和动态接触仍由root验收。

```powershell
python -B scripts/m2-preset-short-hair-fits-v1/build.py --batch-root . --out assets-source/m2-preset-short-hair-fits-v1/conditional --contact-policy transparent-source-texels --only male-wide-muscular male-round-stocky
node scripts/m2-preset-short-hair-fits-v1/qa-runtime.mjs
python -B scripts/m2-preset-short-hair-fits-v1/qa-source.py .
```

8目标实际GLTF和contract读回均过。10项source/writer检查包括严格与条件payload重复字节、真实原VRM正例、错SHA/错family拒绝、冲突文件保留、失败目录避免混入成功文件、实际GLB节点与cap几何变更拒绝、真实接触几何配人工不透明图的负例。qa目录保测试产物与有意损坏的输出，供回归失败观察，不进入publisher。首次alpha分析误取Face primitive0而索引越界，已改按真实失败记录的mesh/primitive定位。
