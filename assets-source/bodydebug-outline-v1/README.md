# 中性人体诊断：禁止重复绘制描边组

当前结果：root 已局部合入共享源码，固定 `6bc09ad85c3d` 的专项浏览器回归已通过，尚未公开。详见 [RESULT.md](RESULT.md)。以下生成/待测方案保留为初始审查记录。目标基线为 `269a73423c97` 的 foundation-avatar，实际 raw SHA `b925b23c1114ec77f5eb24409d5c021e3282c03875b5645a1124cf71149ca4c0`；candidate `a70a0ac3afc4370cb62bd0671147e54fa8d2419ff0595c1d3fc1a83ec56fe639`。

当前 MToon loader 将 Body_SKIN 设成一个 mesh 的两组同范围索引，分别用 surface/outline 材质。bodydebug 把两份都替换为 DoubleSide 标准中性材质，描边扩张消失但两组仍可见，因此同蒙皮面重复画两遍。

`foundation-avatar.js.patch` 只做两行行为改动：map 回调接收 sourceMaterial，并让 `sourceMaterial.isOutline === true` 对应的中性材质 `visible=false`。仍创建同长度材质数组，保留完整 geometry、indices、groups、mesh 可见性、骨骼及原始 sourceMaterials；退出 debug 仍恢复原数组。未改穿衣 MToon 路径，也不包含 screenCoordinates 候选。

本目录 `prepare.py` 从精确 SHA 的共享文件生成 before/candidate/patch/manifest，不修改共享文件。补丁保留 CRLF，`git apply --check` 已通过。真正合入应由 root 在下一固定候选中应用局部 patch，不覆盖整份候选文件。

## 已执行的轻量回归

```powershell
python assets-source/bodydebug-outline-v1/prepare.py
node assets-source/bodydebug-outline-v1/check.mjs
git apply --check assets-source/bodydebug-outline-v1/foundation-avatar.js.patch
```

`node-check.json` 保存 5 项实际结果：从 before/candidate **抽取真实材料构造表达式**，使用实际 Three.Material/Mesh/BufferGeometry 运行；旧同索引两组均有资格绘制，新仅中性表面组有资格；表面颜色/粗糙度/双面不变；原材质可见性与 positions/indices/groups 不变；恢复原材质引用后两组重新可见；没有 outline 的单材质仍可见。

**此测试不是完整 avatar 工厂、VRM 蒙皮或 GPU draw-call 测试。** 不能把 eligible group 数量当成浏览器实测渲染调用。

## 初始针对性验证方案（现已执行，结果见 RESULT）

男女各用同身份 VRM、同固定 front 镜头/暂停姿态，执行 `dressed → base/debug → dressed`。269 原版与新候选分别留 PNG、实际材质身份及调用计数，不能用换人物/换相机替代。

1. 进入 debug 前后记录 Body_SKIN geometry UUID、positions/indices/groups 的字节 hash、所有 raw/normalized 骨 local pose、当前实际 skin 顶点。新旧同姿几何应一致，不能通过删面/移骨减少绘制。
2. 原 debug 两个中性组 visible=true；新 debug 仅原 outline 对应中性组 false，原 surface 中性组属性不变。实际 `onBeforeRender` 的该 mesh 主相机回调从两组变一组；同时记录 renderer.info 的真实 calls/triangles。全局计数含 shadow pass，不能硬套“总调用必减1”；当前 source WebGLRenderer 在 shadowMap.render 前 reset info，影子也会计入。
3. 新旧 debug 图像应保持完整体表、同遮挡/轮廓；记录像素差，不把一致性只靠单个渲染调用数字证明。若差异超色道1/255，应定位区域，不能直接宽松通过。
4. dressed 原始材质数组/对象身份必须恢复，原 isOutline 可见性不变；各候选自身 dressed 前后，以及269/新候选 dressed 同姿图像都应一致或仅已量化的1/255舍入。使用隔离补丁不得改变正常头发/脸/服装画面。
5. 重复两次切换，确认没有额外材质/几何累积；离开诊断后动作正常与否由新候选最小动作入口检查，而非这次 Node 检查继承。

本补丁修的是已证实的调试重复绘制，不修正常穿衣的点状描边，也不承诺能显著提高整帧性能。
