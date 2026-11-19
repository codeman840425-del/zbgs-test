# 公共洗手区双房交付

固定源码为 `1639240fdf237ce49d0dcde7ec52d3a6468fa224`，游戏查看器构建为 `0b6988290fcc`。独立楼层和大楼二层各有一个实际连通的公共洗手区，使用不同墙面和站位。每个楼层保留 16 间经营房。正常速度录像长 51.64 秒，1600 × 900，25 帧/秒。[观看录像](browser/public-washrooms-normal.webm) · [二楼全景](browser/direct-entry.png) · [从门口看导视牌](browser/public-washroom-building-entrance-sign.png)

## 接收和复产

正式包已核对清单内 2,390 个文件。接收方将锁定的 npm 缓存复制到独立工作副本，离线安装后重建，661 个运行文件与封存查看器逐字节一致。原包清单 SHA-256 为 `89500ce9d8158fec12035db01230f09e7fd87658e3dbe7a6d0ca534261ddb7ed`。[正式包](../../company-workspace/deliveries/public-washroom-v1/README.md) · [制作与观看说明](../../docs/research/COMPANY-PUBLIC-WASHROOM-HANDOFF.md) · [文件和录像身份](identity.json)

两份房间输入共用资源、图文面和发布命令。接收方实测将西壁盆台台板从 32 毫米改为 40 毫米，并给二楼安装了更宽的箍壳皂液器。使用普通命令重新登记、装进各自房间、保存并冷读，再对照原包的所有文件。原四款盆台和四款皂液器都在同一套规格下可换。[接收方回执](receiver.json) · [四款盆台](basin-looks.jpg) · [分配器制作](dispenser-production.json)

## 房间实测

- 两房分别检查大厅、楼梯公共区、1.40 米门口直至盆前站位的连续通路，复核盆台触地、龙头下方凹盆、墙镜背面与实际镜面朝向、皂液器的可达按压件及出口净空。按压件移到同墙远处时返回 `washroom-dispenser-reach`，保留场景、实例位置与已保存文件。13 个错误输入均保住原有批次。[实物与事务回执](room-admission.json) · [界面拒绝提示](browser/public-washroom-building-rejected-reach.png)
- 两处洗手区分别走人用界面替换四对造型，关闭浏览器进程再开，共八次冷启动恢复。二楼换款时一楼的保存文件保持原值。从全新浏览器直接打开二楼链接，零次点击即进入对应区域。[浏览器回执](browser/report.json) · [二楼直达记录](browser/direct-entry.json)
- 开发初版给二楼选错观看方向，剖切了挂有镜子和皂液器的近墙，门旁导视牌也是空白的。固定版从内侧展示两面墙，入口正面能看到龙头图标及“公共洗手区”。[原来的取景](before/building-cutaway.png) · [原来的空白牌](before/building-empty-sign.png) · [固定版本近景](browser/public-washroom-building-station.png)

以上为静态实物、布局、编辑事务和软件渲染浏览器验证。实际人物使用、经营逻辑、水流和普通电脑性能另行验证。
