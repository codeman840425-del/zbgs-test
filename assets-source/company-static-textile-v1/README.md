# 沙发收放布艺

四款共用 `static-textile` 资源合同，使用现有 `support-surface` 挂载。放在沙发真实扶手托面 `textile-rest` 上，保留两座的固定使用点。统一安装包络为 0.40 × 0.15 × 0.36 米，原点为接触面中心，+Y 向上、+Z 向前。较小的实际网格也使用同一挂载包络，以保持替换、转向及恢复行为一致。

- 滚边抱枕保留 Kenney `pillow.glb` 的 50 个原三角、UV 和 PBR 材质。把直立姿态绕 X 轴放平，在原背面落座，另加滚边和中央扣。
- 流苏折叠搭毯使用一条真实厚度相连的织物带来回折叠成三层，露出织边和下垂流苏。
- 弹力褶边沙发罩保留 Kenney `tableCloth.glb` 中独立布件的 14 个原三角、UV 和 PBR 材质。调整部件尺度后加入压缩基底、褶边和弹力滚边。
- 半卷桌垫有完整薄底、可露出的垫面和有开口的多层卷芯。桌垫在本组中作为收放软装展示在沙发托面。

两项 Kenney 部件的原包、GLB 条目和许可证已按 SHA-256 固定。 [Kenney Furniture Kit 2.0，CC0-1.0](https://kenney.nl/assets/furniture-kit)

### 用自己的款式制作房间

在独立交付包的工作副本先运行 `npm ci --prefix source/prototype`，然后进入 `source`。下面的配方将十二组流苏的旅行搭毯登记为新款，再把它放入直播间的宽扶手沙发。可将配方复制到自己的制作目录，修改设计 ID、版本和几何参数，批次通过 `resource` 选用对应版本。

```text
node scripts/company-platform/publish-room-appearance.mjs --publish assets-source/company-static-textile-v1/examples/travel-throw-v2.json
node scripts/company-platform/publish-room-appearance.mjs --check assets-source/company-static-textile-v1/examples/travel-throw-v2.json
node scripts/company-platform/batch.mjs assets-source/company-static-textile-v1/examples/travel-room.json ../my-textile-studio
```

房间用 `parentId` 指定沙发实例，`attachment.surfaceId` 选用 `textile-rest`。制作工具读取该款沙发的扶手高度，自动对齐软装。需要偏移时可提供局部 `transform`，超出扶手承载面会返回 `invalid-support-fit`。

### 核对或试制模型

从项目根目录执行。试导及报告位置需为新目录。

```powershell
New-Item -ItemType Directory -Path output -Force | Out-Null
node scripts/company-platform/build-static-textile-collection.mjs --check
node scripts/company-platform/test-static-textile-geometry.mjs output/static-textile-geometry
node scripts/company-platform/build-static-textile-collection.mjs --output output/static-textile-variant --parameters assets-source/company-static-textile-v1/examples/travel-throw-v2.json
```

`parameters.json` 是默认四款产物的源配方。复制对应设计到项目内的新配方，填写新 ID 或版本，修改布片、缝边、折线或配色后用同一个生成器导出。示例把搭毯改为窄幅、三道条纹和十二组流苏，输出单独的 `static-textile-travel-throw@2`。试导结果包含可组合的 `collection.json`、GLB、资源描述及 CPU 报告。实际固定造型与接触由 CPU 回读验证，布料仿真、沙发包覆及角色实坐不在本组范围内。
