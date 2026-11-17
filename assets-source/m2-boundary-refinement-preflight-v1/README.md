# 局部边细分前置：第一 API 检查失败，未执行真实原源

**本包未通过；按失败停止条件封存。** 实际 Blender 为 **4.5.9 LTS**，build hash `8bf95cbd38d1`，后台纯 CPU、未渲染。唯一 Blender 进程执行 1.208 秒，进程树采样 RSS 253255680 字节；限额 180秒/2GiB，未触发预算。采样不是瞬时峰值；外部 Python 仅作 watchdog。

第一项 `triangle-one-edge` 合成 API 检查执行 `subdivide_edges` 和 `triangulate` 后，在 `blender_worker.py:42` 检查旧顶点对象的坐标/骨权时，读取 `BMVert.co` 报 **ReferenceError: BMesh data of type BMVert has been removed**。异常由 `api_tests()` 向上传播，进程退出2。完整堆栈见 `generated/failure.json`，原 stdout 见 `execution.log`。

已证事实是**旧 BMVert Python 对象引用在此操作路径后不可读取**。本轮没有保存异常时完整 BMesh 几何读回，不能据此断言底层原顶点几何被删除、来源 ID 必然无法保留，或官方局部细分算法不可用。此前报告提出的“保原 BMVert 对象引用”接入假设没有通过实际 API 检查，不能继续用它冒称 old-ID 保真。

本次执行范围：

- 真实版本与源码输入 pin 已读回；本机 numpy 1.26.4。
- 第一合成 API 检查启动后失败；双边三角/独立 UV 共享边检查未到达。不能标为三项通过。
- **原 Body 源数组加载与唯一真实 41 边操作尚未到达；真实原源细分次数0。** `main()` 在 API 检查通过之后才会加载原 Body 并调用实际 refine。
- Face 既存 S/54targets 没有重新求值或加细；无 G、真实候选 contacts、资源导出、runtime/4196 修改。
- 未截骨权、未焊点、未手补网格、未重试、未扫描 triangulate 策略。旧全 Body 失败保持。

`spec.json` 保本次原始脚本、Blender 可执行文件、源 VRM 和全部预定输入 SHA；`tool-identity.json`、`run-report.json`、`failure.json` 与日志是实际运行证据。没有输出成功的 S-body/body-arrays/source-parent 产物，也没有将预测的7896点/12049三角记为实测。

实现使用已核 [Blender v4.5.9 BMesh subdivision](https://raw.githubusercontent.com/blender/blender/v4.5.9/source/blender/bmesh/operators/bmo_subdivide.cc) 和 [triangulate](https://raw.githubusercontent.com/blender/blender/v4.5.9/source/blender/bmesh/operators/bmo_triangulate.cc)，文件许可证 GPL-2.0-or-later；没有安装或分发新工具。后续若重新授权接续，应先定位 Python wrapper 生命周期和整数来源层/重新取得对象的关系，再做有界 API 检查；不能绕过旧点/属性保真断言。本包保持失败封存，不自行追加执行。
