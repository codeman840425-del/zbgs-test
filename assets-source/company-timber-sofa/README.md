# 木框双人沙发参数源

本样件采用开放式木框、圆柱扶手与长立柱、细横梁、两块薄坐垫和两块分离倾斜靠背。几何与纯色材质均由项目新制，属于示意模型，最终画风仍待观看确认。

`parameters.json` 是米制可编辑输入。`build-timber-sofa.mjs` 用 Three.js 的 BoxGeometry、CylinderGeometry、RoundedBoxGeometry 构建全部网格，经 GLTFExporter 输出自包含 GLB。运行目录为工程根目录。

```powershell
node scripts/company-platform/build-timber-sofa.mjs
node scripts/company-platform/build-timber-sofa.mjs --check
node evidence/company-timber-sofa-v1/verify-disk.mjs
```

每次生产会独立构建并导出两次，比较完整 GLB 字节，再由 GLTFLoader 回读。`--check` 重新生成并比对已有产物。独立磁盘验证器读取实际输出文件，执行接触射线、足迹和材质槽核对。

模型基点为木框地面中心，米制 Y 向上、+Z 朝前，保持单位缩放。功能规格完整沿用 `lounge-sofa@1` 的 `footprint` 和 `usePoints`，其源文件 SHA 写入 provenance。左右坐点固定 X 为 ±0.48 米、Z 为 0.04 米，座高 0.47 米。接近点 Z 为 1.02 米、离开点 Z 为 1.15 米，单席容量、clearance、节点名称和 yaw 均沿用原合同。

新的视觉包络位于该固定功能足迹内。背板倾角变化时，生成器离线平移背板，使真实前表面通过固定接触锚点 `[±0.48, 0.72, -0.30]`。GLTFLoader 后的 CPU Raycaster 检查座顶和背面三角形交点。框架和倾斜背板的实际几何变化不修改功能坐标。

证据目录中的 `variant.parameters.json` 和 `variant.glb` 仅验证源修改链路。该变体改变木柱/扶手半径、靠背宽度和倾角，保持同一功能规格，未登记为第二美术款。

参数身份、有限数值、固定座高/坐点、支撑高度、背板分离、命名网格、重复导出和外观包络检查失败时，脚本在写产物前报错。回读矩阵分解采用 1e-6 数值容差核对单位缩放。GLB 无外部 URI、纹理、骨骼或动画。

当前证据覆盖静态几何和元数据。真实人物接触、坐下/起身、接近/离开、导航和正常速度运行仍待 C3 验证，浏览器/GPU 观感尚未验收。
