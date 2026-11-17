# 官方三角相交接口：有限前置

先读官方实现，再对已安装 libigl 2.6.3 实际调用。8 项小样通过；没有加载角色、计算 G、修改原 strict 阈值、导出或替换工作台。不是角色穿插通过结论。

## 来源与实际接口

- [固定 Python bindings](https://github.com/libigl/libigl-python-bindings/blob/1336e57322356b6b7fa66119bccd658c6a127cdf/src/copyleft/cgal/intersect_other.cpp)：真实返回 IF、VVAB、FFAB、JAB、IMAB 共5项。文档列出的额外 success 与代码不一致，消费按实测 tuple。
- [固定 core](https://github.com/libigl/libigl/blob/f68f01c23ac82351e2543ce8c529b6d4c89fdf16/include/igl/copyleft/cgal/intersect_other.cpp)：双精度输入、detect_only 路径使用 CGAL::Epick。检测包含边界、共面接触，不等价于旧 strict 有限线段内点规则。只检测两个给定三角集合之间的交，不自动做每个集合自身自交。
- `detect_only=True, first_only=False`，不生成或消费重新网格化结果。`cutoff` 传给 box_intersection_d；实测 cutoff=1 仍返回全部1100个分离的对应交对，不是1000次命中封顶。
- [CGAL PMP 文档](https://doc.cgal.org/latest/Polygon_mesh_processing/group__PMP__intersection__grp.html)的 self_intersections 对共享拓扑点/边有特定定义；本包使用的是 intersect_other，不能借用那个函数的邻接过滤保证。跨材质几何重合不自动等于共享拓扑。

来源代码和本机二进制分开记录：报告固定已安装 native SHA 与包版本；本轮没有从上述提交独立编译并证明二进制逐字节一致。工具安装已有官方 wheel SHA 锁及独立恢复实测。

## 许可与使用边界

libigl 上述源文件标 MPL-2.0；已安装 wheel 同时附 LICENSE.GPL 与 LICENSE.MPL2，不能把整个 copyleft/CGAL 二进制统称 MPL。CGAL 按包有 GPL/LGPL/商业选择，参见[官方许可](https://www.cgal.org/license.html)及[包索引](https://doc.cgal.org/latest/Manual/packages.html)。本次仅使用本机离线检查工具，不复制 CGAL 二进制到浏览器或游戏发布包，不新增采购。将来若分发此工具二进制，需按实际组件保存相应源码、许可和通知，不能据本次内部实验宣布分发义务已经完成。

## 实际验证

`report.json` 保存具体顶点、输入身份和输出：分离、横向相交、共面面积重叠、仅边接触、仅点接触、2^-50 米正间隙、交点位于新增细分边、1100对检测。细分测试仅为固定合成三角，不重复生成角色源拓扑。

将 child pairs 映回 parent 只用于归并和追溯，不能自动判断穿透深度，也不能说明当前直三角与原粗面含义完全相同。新内部边上的命中可以被官方闭域检测记录，不需继续靠原边 t 推断。但这不解决“接触是否有害”，必须对原源、实际 A、归因 B 使用同一拓扑及相同检测规则，并保留旧 strict 对照。

后续原源与候选均记录全部实际 child pairs、原 parent、材质语义和已存在/新增差异；共面/点边接触不可悄悄丢弃。人体与衣物、蒙皮姿态、连续时间碰撞、本轮未列材料、视觉严重程度均不在此小样范围。

## 恢复

```powershell
& experiments/tools/slim-core-2.6.3/.venv/Scripts/python.exe -B scripts/m2-official-intersection-preflight-v1/check.py
```

已有 report 时拒绝覆盖。独立检出重演应先将旧报告归档到检出外，再执行；新结果不替代旧证据。解释器/依赖恢复见 `evidence/m2-slim-tool-restore-v1/README.md`。
