# 为直播房间制作落地风扇和净化器

`fan-and-air-purifier` 接受塔扇、脚架扇、循环扇和净化器四种落地造型。四者使用同一地面安装合同，尺寸上限为 0.40 × 0.80 × 0.40 米。底面中心为原点，+Z 朝前。应把设备配置为房间或公共区域的独立设施，留出通往工位和房门的空间。在场景中替换外观时，实例身份、位置、朝向、电源、已选风速和阻挡范围应保持一致。

## 制作与导入

在独立接收包的 `source/prototype` 运行 `npm ci`。随后从 `source` 执行以下命令。制作目录内已有相同入口。四款原稿、中文生产提示、可编辑尺寸、材质和第三方来源见 [素材目录](../../assets-source/company-floor-air-v1/)。

```powershell
node scripts/company-platform/build-floor-air.mjs --check
node scripts/company-platform/publish-room-appearance.mjs --publish assets-source/company-floor-air-v1/examples/fifth-tower.json
node scripts/company-platform/publish-room-appearance.mjs --check assets-source/company-floor-air-v1/examples/fifth-tower.json
node scripts/company-platform/build-library.mjs --check
node scripts/company-platform/batch.mjs scripts/company-platform/batch-inputs/floor-air-rooms.json output/floor-air/rooms
```

第五款通过改变塔身宽度与格栅片数生成。可以复制该配方，给新款指定资源 ID 或新版本，再调整适用的几何参数。已有 ID 和版本出现内容冲突时，发布器会给出失败原因并保留原登记。两款外露叶轮使用 Kenney Furniture Kit 的 CC0 叶片几何，原件、许可和哈希随包交付，机壳、护罩、支架和控制面板由本项目制作。[Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit)

## 安装和状态

批次里的 `air-home` 是民房直播工位，`air-rental` 是整套出租屋，两者的楼层朝向不同。运行 `replace-resource` 选择同规格的新外观。下面这组操作可用于上述第二个房间。它把新款放在原实例的位置，然后将风速设为二档。

```json
[
  {"type":"replace-resource","id":"air-rental/ground/live/air","resource":{"id":"floor-air-tower-wide","version":1}},
  {"type":"set-state","id":"air-rental/ground/live/air","state":{"on":true,"speed":2}}
]
```

`speed` 接受整数 1、2、3。供电时正面电源灯亮，三个档位灯依次点亮。断电后四灯熄灭，恢复供电沿用保存的档位。脚架扇与循环扇有真实可见叶轮，绕轮毂的局部 Z 轴转动。循环扇保持原有仰角。运动直接消费宿主提供的 `clockSeconds`；静音、除尘、温湿度与经营收益均须由相应玩法实现。本包以外观、安装和显示状态供游戏使用。

## 校验

从含锁定依赖的源码目录运行 `node scripts/company-platform/test-floor-air.mjs output/floor-air/cpu-check`。浏览器脚本支持 `node scripts/company-platform/qa-floor-air.cjs PACKAGE BUILD OUTPUT --record`。请给每次复核提供空的输出目录。普通编辑器会显示电源按钮和整数风速控件。设备占用房门通道、悬空、模型超出包络或指定分数档位时，应能从校验回执定位问题。
