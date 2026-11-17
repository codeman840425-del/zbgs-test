本包对照原 `m2-head-cage-feasibility-v1` 的一次诊断，只换成固定 skin-domain 实测响应。原包的 plan/generated 保留原字节。LP、笼约束、笼位置回读及 SVD 函数直接 import 原包，新增入口负责真实新 schema、旧新输入差异和执行身份。

输入核对发生在第一个实际 LP 前。原 sourceLandmarks、requests、controls、控制角索引/符号、weights 描述、源身体和其余非声明字段须逐值相同，原目标/响应 AST 与原 Head 代码摘要也保留。新 bounds/rest/响应可变化，实际新域的全端点 identity 和必要 active 点包含记录保留。非声明差异会输出失败并停止实际求解。

条件与原 LP 一致。每个附着地标坐标误差 ±2mm，前 Y 链/宽/深非负，c 为自由符号，t>=0。弱条件允许笼退化，成功只记 `proxy-feasible`，仍需后续真实几何门。八请求各一次，求解时间限60秒，无 cap、容差或正则化扫描。

```powershell
python scripts/m2-head-cage-skin-domain-feasibility-v1/run.py prepare --source-root F:/gamemake-representative-head-cage --source-commit EXACT_COMMIT
# 将源码、输入和plan固定为提交后
python scripts/m2-head-cage-skin-domain-feasibility-v1/run.py execute
python scripts/m2-head-cage-skin-domain-feasibility-v1/qa.py
```

QA 通过原四维 Tensor 的独立 einsum 读回全部坐标残差，并读实际笼坐标和欧式控制位移。它只读已保存的结果。若不可行而无 primal，保留该事实，不构造 t、系数或残差。

本包没有 Blender、实际变形/表情验证、VRM、public、运行控制器或浏览器产物。数值可行性和全表面几何可行性各有自己的证据范围。
