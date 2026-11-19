# 直播器材推车

四款资源共用固定安装尺寸，宽 0.70 m、高 1.00 m、深 0.50 m。开放车使用圆管立柱和护栏，器材箱车有两段带包边和锁扣的箱壁，多层工具车增加浅抽屉与拉手，展示车使用交叉支撑和后挡板。推把、轮子和抽屉在本版运行时保持固定姿态。移动和旋转使用公司的设施摆放控件。

## 装载合同

| 承载面 ID | 实际网格 | 上表面高度 | 可用宽 × 深 | 净高 |
| --- | --- | --- | --- | --- |
| lower | cart-lower-deck | 0.30 m | 0.52 × 0.36 m | 0.34 m |
| upper | cart-upper-deck | 0.82 m | 0.52 × 0.36 m | 0.36 m |

两块承载矩形的中心均为本地 x=0、z=0，前方为 +Z。生产器先核对两块真实层板的拓扑，再从各面上方投射九条射线，并检查从前方抵达各层的整个装载空间。模型包围范围贴合安装尺寸，四只轮胎各有独立地面命中点，每轮保留原轴承和轮毂。层板支撑的实体截面及每只轮的检测回执见 `collection.json`。例如现有 `tabletop-radio-kenney@1` 可放在 lower，`digital-clock-shelf-flat@1` 可放在 upper。

## 源资产与适配

Innerscene Corp 的 Roll Platform 原 GLB 内嵌作者、CC0 1.0 声明和四张 PBR 图片。制作器读取原版 27 个可绘制部件，独立适配原底盘和推把，再按四角重排完整轮组，保持轮胎和轮毂的圆形截面。原件、字节摘要、下载地址和内嵌许可声明在 `original/`。输出使用项目制作的承载层、叉片连接柱、转接板和各款上架。复产全部从工程内读取。[原作者模型与使用条件](https://www.innerscene.com/tools/library/3d-parts/roll-platform-platform-cart-8c87f71c)

## 离线复产

在已安装项目锁定依赖的公司制作或接收检出中运行以下命令。试制目的地必须是新的目录。输出包含运行 GLB、资源卡和源清单的镜像路径。

```powershell
node scripts/company-platform/build-equipment-carts.mjs --check
node scripts/company-platform/build-equipment-carts.mjs --write
node scripts/company-platform/build-equipment-carts.mjs --output output/equipment-cart-rebuild
node scripts/company-platform/build-equipment-carts.mjs --parameters assets-source/company-equipment-cart-v1/examples/open-service-v2.json --output output/equipment-cart-open-v2
```

`parameters.json` 定义四种上架结构、框架/层板/装饰颜色、可编辑板厚和资源版本。板厚可在 18–35 mm 内调整，两层板的上表面高度固定。所附 v2 配方将开放车的 25 mm 层板加厚至 32 mm 并换成灰蓝色。覆盖已登记版本会被拒绝。子件身份、存档和房间进出由场景集成验证。
