# 原生改袖Top的共用装备接口回读

2026-11-17，一次正式采集。固定源码 `8d718127c827296f11aa254cd409a9ffd473975d`，build `c3e35248dc55`，只读`experiments/native-material-init-fixed-v1`。自管临时loopback服务已关闭，4196及固定树未改，GPU窗口已释放。

## 输入和消费

目标仍为原78912女性VRM，SHA `78912a7a48e114107ccf16ecd7896edff2fe2664bbc25fb4f8a807fca68c01b3`。唯一新增资源为`native-vroid-78912-sleeve56-top-v1.glb`，688,784 bytes，SHA `75c113d68a7eab1e9f09178b4ddf5c03a9f9d237e0a66d79b0984f45bd5538b7`。新源manifest SHA `1ff75de76ed48c11f302154671b8150ec1026356274af9ecf1631f828c59b63e`。原Top/shorts/shoes继续使用既有原manifest及真实文件SHA。

`capture-v1/request.json`精确pin19个依赖和15个实际共用运行源码。只读验证custom包inventory、source-fit的三个源输入和作者CPU回执。`qa-catalog.json`是临时4件清单，原3项与新增1项分别与各源manifest深度相同，两份原清单字节不改；清单明确QA-only，不冒正式发布目录。重复ID、错误body身份负例均拒绝。没有复制裤鞋或修改绑定阈值。

共用createEquipment真实加载和equipSet提交原Top→新Top→原Top，底裤/鞋始终原版本。原内嵌三个衣物primitive隐藏，人体/脸/头发保留。四件准备后八个MToon surface/outline的alpha uniform为0.5，UV动画时间0。暂停第一次显示新Top，没有step，每个实际draw的六个材质（新Top、原裤鞋及各outline）GPU alpha均为0.5。

## 实际画面与恢复

已逐张查看原/新/恢复各正面全身、正面袖口近景、侧面，共9张静态图，以及最后整屏、袖口三联图和新Top纯视频的11个2fps代表帧。近景中新袖口外缘略收短，变化克制，原生款式仍清楚。未观察到新黑壳、描边丢失、衣件消失或明显新增破损。抬膝时原短裤上拱和发尾运动继续存在，不作为本次改袖新增缺陷或整体造型验收结论。

暂停切换期间没有motion step，恢复后的完整look state与切换前精确相同，包含四个资源SHA/可见性、mesh UUID、保留人体/发的geometry UUID与属性版本/材质身份，以及raw humanoid姿态。原Top恢复可见、新Top隐藏，原裤鞋保持可见。恢复正/近/侧图与前图分别仅2/5/1像素相差1级，未声称全部逐像素相同。新衣与原衣图的差异计数另存，不据像素bbox证明某个身体区域发生几何变化。

`capture-v1/run-1/custom-1x.webm`为新Top纯画布正常速片，SHA `3334ae669956b9a2a331ccc4a8d7714c783531beed1c0d6208162c54c8b47482`，1,022,460 bytes，VP9、1040×814、约29.97fps，媒体时长5.44秒。首RAF0开始录制，真实RAF与motion累计各5.5025秒，4个phase周期；最大frame delta42.4ms，没有50ms截断或变速。媒体首尾帧约63ms差单列。createMotion使用既有显式原地treadmill，未测导航。另存完整Playwright片含加载、暂停切换与诊断，不把整片都叫纯1×动作。抽帧阅读不等于逐帧或全动作观感验收。

新衣片结束后再次用真实equipSet恢复原组合，资源SHA和可见性检查精确通过。最后整屏的临时HTML badge没有重新draw刷新，仍写custom，属于夹具标签瑕疵，报告明确保留。该图不能单靠badge证明实际选择。恢复展示应看`original-restored-{front,cuffs,side}.png`及真实transaction状态，未为修标签重录。

## 适配边界

原生参数为SleeveLong66→56，沿作者已有制作而非新手造服装算法。源包记录700个baseline Top顶点到原Top739点的精确属性对应、1226个保留有向三角，39点/70面属于透明删除设置的拓扑差异，尚无逐删除面alpha分类，因此不宣称完整原Top拓扑等价。25个实际非零权重骨IBM/祖先变换相同，130骨中不影响本Top的Foot/Toe有≤1.192e-7差异，未改原1e-5装备检查阈值。

源Body不同导出有460点约0.125微米差异，位于y0.0147..0.2763m，低于Top最低引用y0.79359m；本次真正运行目标一直是原78912，没有换成该direct Body，也没有将这份Top适配扩大到整个派生人体。新衣实际运行的source-backed CPU依据见源包README/source-fit，本包没有重做或伪造它。

当前只是原78912配原短裤/鞋的单件替换测试overlay。未进完整factory、正式装备菜单或recipe持久化，未测坐起/跑步/其它下装/叠穿/多实例或全表情。原元数据及作者内部技术许可边界保留，不宣称商业分发授权。可能的公司后台轻录制未做全系统并发审计，本包不比较性能，更不代表普通电脑达标。旧v5全部原样保留。

采集脚本为`capture-v1/capture.cjs --prepare/--run`。重演须固定8d718/c3e及对应依赖，使用新空的同层输出目录；现有run-1拒覆盖，不为封包重复运行。
