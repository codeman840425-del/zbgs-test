# 鼠标与鼠标垫

办公鼠标、游戏鼠标、拇指轨迹球和大桌垫组合共用 `mouse-pad` 桌面安装规格。原点是桌面接触面中心，+Y 向上，+Z 朝使用者。兼容占位为 0.28 × 0.065 × 0.22 米，整块桌垫需要有桌面支承并留出使用面积。环境分支仍记录 0.020 米高度为待核实初值。生产包络经真实壳体、滚轮和轨迹球验证，采用 0.065 米上限。

四款的 USB 展示口位置都为 `[0, .014, -.095]` 米，朝 `[0, 0, -1]`。四块独立框件和实体背衬给现有同桌连线提供真实几何端点。鼠标、垫面和橡胶底各有实体网格和各自的材质槽。

办公款采用 Kenney `computerMouse.glb` 的 71 个原三角、UV 和 PBR 材质。保留原截面，转向 180°，按配方缩放至 63 × 26 × 117 毫米，再贴合垫面。独立鼻架支撑 USB 口，按键曲面随真实鼠标壳贴合。原 ZIP、GLB 条目和许可证均按 SHA-256 固定。 [Kenney Furniture Kit 2.0，CC0-1.0](https://kenney.nl/assets/furniture-kit)

游戏款采用窄腰与抬高的掌托。轨迹球款有非对称实体壳、可见球体和独立球槽。大桌垫款采用低背鼠标、双色叠层和满幅织边垫。按键、滚轮、轨迹球和线口为固定外观。

从项目根目录执行以下命令。每次试导选择新目录。

```powershell
New-Item -ItemType Directory -Path output/mouse-pad-assets -Force | Out-Null
node scripts/company-platform/build-mouse-pads.mjs --check
node scripts/company-platform/test-mouse-pad-assets.mjs output/mouse-pad-assets/geometry
node scripts/company-platform/build-mouse-pads.mjs --output output/mouse-pad-assets/compact-candidate --parameters assets-source/company-mouse-pad-v1/examples/compact-mat-v2.json
```

另存配方，填写新 ID 和版本，编辑垫外轮廓、壳体截面或饰面，再用同一生产入口导出。示例 `mouse-pad-compact-mat@2` 采用短身壳体、切角垫和窄拼边。试导目录包含 GLB、资源描述、`collection.json` 和实网格检查报告。配方变化需要新资源版本，旧版产物可用 `--check` 逐字节验证。
