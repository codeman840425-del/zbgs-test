# 男性头部体积域前置验证

来源：evidence/m2-face-target-next-method-review-v1/executable-addendum.md。
只复用 SciPy 1.18.1 / Qhull 建域与 barycentric 变换；不写形变求解器，不调用 SLIM，不生成角色。
运行：`python scripts/m2-head-volume-domain-v1/run.py`。工具环境由 scripts/m2-slim-tool-smoke-v1/prepare.py 固定。
已有 generated 时拒绝覆盖；新检出目录可按记录重建。源身份与依赖固定在 spec.json。

本次只做男性一次共同规则：23个guide及全部域内眼发/颈/外框控制点不能遗漏；零体积、未覆盖或identity/已知仿射回读>2µm即失败。Qhull可因精度丢点，因此实际检查控制节点引用；不近邻删点，不QJ扰动。
不依靠测试仿射作为正式人体或保护通过。体积正向不能代替原三角、表情、衣物及真实截面验收。

官方依据：https://docs.scipy.org/doc/scipy/reference/generated/scipy.spatial.Delaunay.html
SciPy BSD-3 / Qhull许可和依赖通知沿 evidence/m2-slim-tool-smoke-v1/wheel-notices 保存；不使用TetGen/CGAL。
