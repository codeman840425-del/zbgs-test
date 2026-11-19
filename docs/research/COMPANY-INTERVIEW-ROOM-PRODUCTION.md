# 双人访谈房的制作与复核

制作 agent 可以从同一批次生成独立工作室和酒店层访谈间。两位受访者各有一把椅子和一支桌麦，共用一个远景机位。茶几、杯子、桌子和房间里的其他物件继续按各自实例编辑。酒店房门通向公共走廊。[两份制作输入](../../scripts/company-platform/batch-inputs/interview-rooms.json)

## 如何布置另一间

在批次项的 `interviewRooms` 数组里给每间访谈房指定 `regionId` 和 `portalId`。门可选同层连接或真实外门。用 `roles` 指向本房间的五个实例。主持席和来宾席分别使用 `hostChair`、`guestChair`，对应的两支桌麦使用 `hostMic`、`guestMic`，双人机位使用 `camera`。同一款资源可实例化多次。制作人可自行命名实例，麦克风和相机跟随各自实际安装的桌面。

`routes.host` 和 `routes.guest` 是房间局部平面上的折线。每个点按 `[x,z]` 记录，单位为米。首点落在选定门槛内，先垂直进门，再沿正交路径到达各自椅子的退出点。移动椅子后同步调整相应终点。整房变换保留房内坐标。此双人配方为同时进出留出两条独立净宽 0.50 米、净高 1.90 米的通道，并核对座前起身区。

两椅应能看向对方。现有双人配方允许座椅前向与对席方向相差最多 45°。桌麦的实体拾音部位位于本席座面上方，水平距离在 0.90 米内，且更靠近本席。取景检查从实体镜片向两处真实坐面取样，要求在水平 ±36°、竖直 ±22° 的取景范围内首先命中对应坐面。报告给出房内坐面、接近和退出点、镜片位置、麦头实测距离及具体被挡物件。上述数值用于这套固定双人构图。真人头肩入镜、实际音频和两人同时就座仍需各自的运行验证。

酒店等有公共区的房间，还会从相连区域的入口参考点实测至门外、穿过门槛，再接到两席各自的第一段室内路线。布置在门外的装饰也参与实体三角面检查。门宽允许时可从一侧进入，直线被挡时可绕行；同一房间还有其他连通公共区的门或真实外门时，检查器会尝试这些入口。外门从本层真实门槛开始。报告的 `publicAccess` 分别列出两席使用的门、公共区内折点和室内接续点。全部路线失败时返回 `room-door-unreachable`，其中包含尝试过的门以及门槛处命中的设施。

静态测量使用 0.20 米的正交网格，加入确切起止坐标，对每条边连续扫过 0.50 米宽、1.90 米高的空间。狭窄斜向路线可能需要调整布置。两席可以共用公共走廊，房内仍保留各自的独立路线。[门外封堵、部分遮挡、转向及备用门回归](../../scripts/company-platform/test-interview-public-door.mjs)

## 批量生成与接收

接入另一款桌麦时，可在资源的 `microphone.pickupNode` 填写原 GLB 拾音网格的名称。这个名称须唯一对应一个可见、带实际三角面的网格。显式填错会返回资源字段和实例 ID。已有桌麦继续按原稿中的 `head`、`grille` 或 `microphone` 节点识别。

在浏览器中打开房间后点 **机位取景**，即可沿实体镜头的方向查看两席、桌面和背景，再点 **房间全景** 返回。镜头预设包含椅边所需的横向余量；窄面板会调整垂直视角。独立工作室采用直铺木地板、细条纹背景墙和编织挂画，酒店采用人字木地板、扇纹背景墙和日轮挂画。这些饰面和挂件均可单独更换。

在可写接收副本的 `source` 目录中运行以下命令。第三个参数是新结果目录。单房修订后给批量命令追加 `--only interview-hotel` 即可单独重试。

```powershell
npm ci --prefix prototype --no-audit --no-fund
node scripts/company-platform/batch.mjs scripts/company-platform/batch-inputs/interview-rooms.json ../interview-results
node scripts/company-platform/check-interview-room.mjs ../interview-results/interview-studio/layout.json
```

规则保存在布局和游戏存档中。接收方可在交付包根目录运行 `node edit.mjs validate data/save.json`，或以 `node edit.mjs apply data/save.json OPS.json NEW_RESULT` 修改单件后写出新布局与存档。批量生成、独立编辑和正式打包均复核承载、朝向、取景和通路。浏览器预览用于选物、比较外观和观看构图。[物品与房间验收脚本](../../scripts/company-platform/qa-interview-rooms.cjs)
