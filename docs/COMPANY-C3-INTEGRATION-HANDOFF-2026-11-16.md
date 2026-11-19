# C3 固定场景成果与角色接缝移交

2026-11-16。公司 C1/C2 生产和预览已有可复用成果，按用户连续长目标 v2 在阶段边界集中对接。本文是具体接口移交材料，不另建能力状态清单。用户的 Dota 举例不构成投影、画风或镜头角度要求。

## 固定交付

- 公司运行源码：`aff9dd8b3eeca02ecbb3e110f0b572a294a3e193`，构建 `0e3551c8d5eb`。
- 独立检出：`F:/gamemake-company-c2-fixed`。独立可编辑包：`F:/gamemake-company-c2-delivery-0e3`。
- 观看与下载：`evidence/company-c2-delivery-0e3-v1/index.html`；正常 1× 录像40.36秒。
- 完整包：同目录 `company-platform-0e3551c8d5eb.zip`，SHA256 `6675517ac978161091744d60a5feab45e386f34003823757e959c8c4e3fa47d6`。
- 源码及交付证据提交：`c9f8433886e02c7ae6965251302735e40db1f639`，远端已核对。C3 后续补丁不改此固定包或给旧录像换标签。
- 独立包实际依赖安装、同源重建字节一致、真实浏览器及完整多层恢复已核。不是离线依赖安装证明，也不是角色联调通过或普通电脑性能结论。

## 输入和所有权

公司入口 `prototype/src/company/render.js` 的 `createCompanyScene`，实际生产目录使用 `library-catalog.json` 与 `templates-extended.json`；`asset-library.js` 先准备所选层 GLB。不要用默认历史 `facility-catalog.json` 冒充含新素材的完整目录。

双工位代表为 `examples/c1-two-stations.json`；民房与住宅为 `examples/c2-small-home.json` / `examples/c2-rental-home.json`；多层由 `scale-examples.js` 生成。完整包的 `data/save.json` 绑定全部楼层、模板、资源及设备状态。两个工作点 `station-1/chair#seat`、`station-2/chair#seat`，小民房沙发为 `lounge/sofa#left`、`lounge/sofa#right`。

总工拥有 CharacterScene、导航执行、动作与姿态/身体适配、任务与 seat-lease、共享 main.js 集成、CAP/CURRENT 和最终固定候选。副总工拥有公司模块、素材/适配、布局、制作及 QA。共享代码不得用旧角色基线覆盖当前 M2 修复；公司数据的错误由副总工修，角色执行的缺口由总工修。

## 当前接口与缺口

| 接缝 | 当前事实 | C3 处理 |
| --- | --- | --- |
| 使用点身份 | resolveUsePoint/listUsePoints 返回可见层实际 Mesh、使用点/设施/楼层/房间身份 | 总工使 payload.usePointId 贯通原任务/租约和整个坐起离开过程 |
| 多角色 | 公司点各自独立，角色当前 reserveSeat 仍固定 room-chair-1，目标/碰撞还依赖全局 chair | 总工改为每个角色绑定自己的使用点，复用既有控制器与 seat-lease |
| 逻辑与显示 | navigation(floorId) 离屏可查，object 为 null；building 模式零室内网格 | 公司补纯数据使用点查询；角色任务不依赖当前观看位置 |
| 接触生命周期 | 切层/返回大楼会释放旧网格，返回产生新 Mesh | 双方约定最少接触资源保留/安全重绑定，角色租约仍为唯一事实 |
| 布局事务 | prepareChange/commit 二次核验；无关状态编辑保留相同座面对象 | 总工传 isUsePointBusy(id)，来源 seatLeases.forSeat(id)，更新受影响导航 |
| 保存恢复 | 完整 company-save@1 保存全部楼层和版本；整文档恢复忙碌时拒绝 | 角色/任务有效性由角色系统核对，不盲重建旧锁 |

独立 CPU 复现见 `evidence/company-c3-contact-audit-v1/`，保留原 aff9dd8 缺口，不冒称人物已通过。主树只读代码取样记录实际 blob；不能将正在变化的 HEAD 当固定集成版。

公司侧 additive 补充 `describeUsePoint(id)` / `describeUsePoints({floorId})` 已在 `9829761` 完成，并通过独立检查：稳定纯数据与世界坐标不依赖渲染，旧不完整资源显式返回缺字段，不发明默认目标。随后按总工回执补完整设施局部定义；当前针对逻辑、实际 Three 变换和切层的 CPU 检查通过，未写角色代码。该补充是 C3 新候选输入，不属于上述固定 C2 构建。

## 固定集成和最小真实验收

总工已发布并确认角色集成起点 `23c1140a01d26b6f1c10ac4f8064f366add3ba17` / `785be36def90`；具体回执保存在 `evidence/company-c3-contact-audit-v1/chief-seam-reply.md`。共享 main.js 及角色实现由总工独占，公司侧继续补接触资源 retain/release：只保实际座面/椅背所需几何与世界矩阵，角色取消/失败/销毁或实际离位时释放，观看切换不释放。仍沿唯一 seat-lease/任务事实。最终集成提交、公司补丁集合和新构建 ID 尚未形成，不虚构，也不将角色起点称为已集成公司版。

同一固定候选检查男女完整接近、坐下、起身、实际离开；双工位/双座位独立；同点争用、取消、失败和实际离位释放；转向设施导航及接触；忙碌编辑失败保旧；观看不改归属/任务/占用；重开恢复有效布局状态；真实角色受补光；新沙发与新布局沿同一链消费。按变化选择代表，不对全部批量产物重录完整矩阵。

只用现有角色运行/任务/租约，不增加第二套控制器、时钟或正式占用状态。浏览器普通功能检查与重型录像/性能测量分别安排；不触碰公开4196/4174或关闭他人进程。所有正式运行及录像绑定新固定候选。用户仍负责最终观看验收。

唱播房接入真实麦架时，场景提交本地使用点、完整父子变换及稳定的房间、设施和槽位身份。联合验收增加一个组合样例：空闲时移动并旋转同一麦架，安排两名角色竞争同一槽，在走近期间关闭重开。运行侧按新变换求接近及使用目标，依既有时钟恢复剩余预约期限，并验证最终释放。复用已有等价证据。打包器版本、角色包、场景包和清单哈希一同留存。此项等待双方固定版本联调。
