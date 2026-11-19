# 公共会议与培训区

同一份素材库可以生成拼桌例会、分排培训、U 形讨论和围板研讨。每个房间和座位都有独立身份。整层仍有 16 个经营房，会议区占用独立的公共面积。

## 观看与改款

在接收包根目录运行 `node serve.mjs`，在它打印的本机地址后使用下表中的查询参数。进入房间后可切换俯视、房间全景和图文板近景。

| 场景 | 直达房间的查询参数 | 桌椅关系 |
| --- | --- | --- |
| 整层例会 | `?delivery=public-meeting-boardroom-floor&region=public-meeting-boardroom-floor/ground/meeting` | 两张桌拼成一张，四席相对 |
| 整层入职培训 | `?delivery=public-meeting-training-floor&region=public-meeting-training-floor/ground/meeting` | 两排共四席，面向同一块板 |
| 大楼二层 U 形会议 | `?delivery=public-meeting-u-building&region=public-meeting-u-building/upper/meeting` | 三侧围桌，朝向板的一侧留有开口 |
| 大楼二层白板讨论 | `?delivery=public-meeting-discussion-building&region=public-meeting-discussion-building/upper/meeting` | 三把独立座椅围向板前，保留讲解和进出空间 |

在前三个场景里选中桌前的一把会议椅，可以原位替换梯背、悬臂、底盘、横梁四种模型。它们共用 0.47 米座高，沿椅子本地左右两侧进出，坐面正前方留给桌沿和膝部。白板讨论区使用正面进出的普通座椅。图文是安装在板面上的可替换子件，其显示状态随存档恢复。

## 用其他 agent 制作

先在原包执行 `node verify.mjs`。制作时使用独立副本，在副本的 `source/prototype` 运行 `npm ci`，然后从 `source` 运行以下命令。

```sh
node scripts/company-platform/build-library.mjs --check
node scripts/company-platform/batch.mjs scripts/company-platform/batch-inputs/public-meeting-rooms.json output/meetings
node scripts/company-platform/company.mjs validate output/meetings/public-meeting-training-floor/layout.json
```

从示例复制一个批次条目，给新公司、区域及相关部件分配自己的实例 ID。楼层记录中的 `publicAreas` 用米指定矩形公共区和接哪段公共区墙。实际门口两端各留至少 0.10 米墙体。门口、桌椅摆位、讲位必须同时留出可通过空间。房间平移由宿主墙边、连接偏移和双方房间尺寸计算。样板的门宽为 1.40 米。

在条目的 `operations` 中放置桌、椅、板及板上的图文，在同一条目的 `meetingRooms` 中以实例 ID 指定 `regionId`、`portalId`、`tables`、`chairs`、`boardId`、`contentId`。讲位 `presenter` 使用区域本地的 `[x,z]` 米坐标。布局类型 `layout` 接受 `conference`、`classroom`、`u-shape` 或 `whiteboard-discussion`。如改变共用入口或设施成员，请更新制作配方后重新生成；同一份已保存布局可通过 `edit.mjs apply` 移位、替换兼容资源和切换显示。

验收从公共入口检查每席接近点、离开点和讲位，用实物网格检查坐垫接触、膝部净空、桌面与座位关系。将板翻向墙或用家具遮挡公告会被拒绝。报告中 `checks.meetingRooms` 按座位记录图文中心和四个内角的实际第一命中，以及测试眼位和板面视角。关闭图文时，保存原有关闭状态；几何校验使用同一布局的临时点亮副本。

眼位和膝部数据来源于既有固定角色记录在原房间的坐稳姿态，构建为 `d9140194fb84`。它们用于测算新布局中的空间与可视性。新会议区的实际男女走入、坐起和占用由总工在集成版本验证。图文的字号及游戏内远镜头观感留给观看验收。

会议形式参考 Steelcase 的会议空间和培训室规划。项目沿用自己的桌椅、图文和房间资源。[会议空间指南](https://www.steelcase.com/content/uploads/2024/07/2091523295pl_Steelcase_Meeting-Spaces.pdf) · [灵活培训室](https://www.steelcase.com/space-planning-ideas/workplace/meeting-spaces/flexible-training-room-apl00696)
