# 墙角吸声件

四款共享 0.35 × 2.20 × 0.35 米的静态墙角安装规格。原点在两面内墙的交线、设施底部高度。模型向 +X、+Z 伸入室内，斜面与圆弧正面朝房间。试装底高 0.20 米，顶部高 2.40 米。底高由房间实例保存。导航为角落保留 0.35 米正方形，实际几何有三角截面、圆柱或分片凹槽。

两张真实墙轨背面分别在 X=0 和 Z=0，沿另一水平轴 [0.12625, 0.16375] 米，局部高度 [0, 2.10] 米。侧轨、托臂和斜撑托起独立主体。主体底面当地高度为 0.16 米，背后有 24 毫米空隙的三角芯可用侧托承重。柱款的圆形底盖直接搁在两侧托臂上。项目记录安装与通行外观，尚无吸声或实际承载性能测值。

| 资源 | 构造与可改数据 |
|---|---|
| corner-absorber-triangular@1 | 三角实芯，斜面上为原有独立蜂窝毡块。可改饰面宽度和起伏。 |
| corner-absorber-column@1 | 圆柱带纵向沟槽、实体上下端盖与原织物纹理。可改槽数、槽深与颜色。 |
| corner-absorber-segmented@1 | 三块有厚度的独立角块，层间留通缝，由内部纵向连接件承托。可改 3–7 层、缝宽与两种材色。 |
| corner-absorber-upholstered@1 | 六块真实软包、接缝背板及原织纹覆盖斜面。可改饰面宽度和软包起伏。 |

## 制作与复核

在交付源码根执行。先依项目说明从 prototype/package-lock.json 安装依赖。每次试导选新目录。以下命令涵盖基础四款和另制五片款。

```powershell
node scripts/company-platform/build-corner-absorber.mjs --check
node scripts/company-platform/build-corner-absorber.mjs --output output/corner-four
node scripts/company-platform/build-corner-absorber.mjs --parameters assets-source/company-corner-absorber-v1/examples/segmented-five-tier-v2.json --output output/corner-five
```

清洁源码初次创建默认资源可使用 `--write`。普通改款复制 parameters.json，通过同一结构选择新版本或独立 ID。五片示例沿用三片 ID 并登记 @2，两道通缝增加为四道。项目支持时可用 `node scripts/company-platform/publish-room-appearance.mjs --publish assets-source/company-corner-absorber-v1/examples/segmented-five-tier-v2.json` 登记，再以 `--check` 核对。已存在文件会接受字节复核，发布冲突或错误参数保留旧版本。

给制作方的示例是「做一款五片式等候室角吸，保留两块墙轨和托臂；相邻块面深浅交替，五个实体模块间保留可见凹槽。导出后核上部是否有实体材料，沿两壁检查完整托面，再复核转向后房间的角位和门窗」。

## 配置和编辑房间

批量输入放在 `scripts/company-platform/batch-inputs/corner-absorber-rooms.json`。在源码根运行以下命令，即可生成有西侧服务门的唱播间与有南窗的出租屋，并从第一间取出角件的实测安装数据。

```powershell
node scripts/company-platform/batch.mjs scripts/company-platform/batch-inputs/corner-absorber-rooms.json output/corner-rooms
node scripts/company-platform/company.mjs validate output/corner-rooms/corner-studio/layout.json
```

布局将 `attachment.corner` 存为所属房间的西北、东北、东南或西南角，分别写作 `north-west`、`north-east`、`south-east`、`south-west`。新加角件只需给出资源、父房间和角名，默认底高 0.20 米。两侧支撑随房间旋转。更换造型使用 `replace-resource`；改挂使用 `attach-corner`，可同时给 `bottom` 指定安装底高（米）。下面的操作可把唱播间原件从西南移到东北并换成柱状。把数组存为操作文件，交给 `company.mjs apply`，指定新的结果文件。

```json
[
  {"type":"attach-corner","id":"corner-studio/ground/live/corner-absorber","parentId":"corner-studio/ground/live","corner":"north-east","bottom":0.2},
  {"type":"replace-resource","id":"corner-studio/ground/live/corner-absorber","resource":{"id":"corner-absorber-column","version":1}}
]
```

可在人类预览的“添加”面板选“墙角吸声件”，指定墙角后安装，也可在锁定镜头下左键拖到绿色墙角。红色角位会提示挡住支撑的门窗或占用物。选中原件后可从物品面板换款、更换安装位置或复制到空角。墙面自动剖切时，角件随最后一面支撑墙隐藏。

## 可移交来源

原件、出处及 SHA-256 位于 original/sources.json。本族制作时直接读取所附的三份签名 GLB。模型源和料自项目既有资产，使用说明在 original/PROJECT-SOURCE.txt。

- wall-shelf-side-bracket.glb 提供实体墙轨、托臂和斜撑。原作者参数位于 assets-source/company-wall-shelf-v1/parameters.json。
- wall-absorber-upholstered.glb 提供六块软包、缝隙背板和嵌入式织物 PNG。wall-absorber-honeyfelt.glb 提供独立毡块与嵌入式毡面 PNG。原作者参数位于 assets-source/company-wall-absorber-v1/parameters.json。布包及毡块保留原几何、材质和 UV。
- GIK TriTrap 的侧墙 L 托安装只用于确定承托原理。项目制作了自己的角件主体，未复制厂商模型或商品图。[GIK 原厂安装说明](https://www.gikacoustics.com/blogs/knowledge-base/mounting-bass-traps-corners)

共享几何检查位于 prototype/src/company/corner-absorber-geometry.js。检查器用实际可见三角面验证两块连续承托面、支承连接、正象限包络和面向室内的实体截面。房间运行方另负责墙面余量、真实门窗与实例所在角位。
