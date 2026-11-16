# C3 公司场景接触接缝审查

审查时点为 2026-11-16。公司树固定提交 `aff9dd8b3eeca02ecbb3e110f0b572a294a3e193`，角色树采样提交 `23c1140a01d26b6f1c10ac4f8064f366add3ba17`。本目录的 CPU 复现实际调用 Three 场景构造、视图切换和 `seat-lease.js`，没有浏览器、GPU 或真实角色动作结论。

## 已复现缺口

1. `prototype/src/company/render.js:133-146` 只为当前 `floorId` 的派生使用点建立 `{chair, chairSeat, chairBack}`。`resolveUsePoint` 和 `listUsePoints` 在 `:207-208` 只查当前可见 `current.points`。`setView` 在 `:211-223` 对楼层或 building 视图调用 `build`，`install` 在 `:175` 先把新根加入世界，再对旧根执行 `disposeTree`。复现中先解析真实座椅 Mesh，再切到 building，使用点列表变成 0，旧接触对象与世界断开。返回原楼层时得到新的 Mesh 身份，旧引用不能继续作为角色接触目标。
2. `prototype/src/company/render.js:192-201` 的 `navigation` 读取 `current.derived.obstacles`，因此离屏楼层仍有逻辑障碍记录，但返回的 `object` 是 `current.facilities.get(o.id)?.root || null`。这可以支持离屏规划的矩形阻挡，不能提供角色坐下所需的真实 seat/back Mesh。`prototype/src/company/document.js:195-199` 只把使用点写入派生文档身份和世界坐标，未提供角色接触几何或稳定的资源保留句柄。
3. `prototype/src/company/authoring.js:11-18` 在视图切换后按当前视图 `resources` 预加载资源，building 模式明确返回空列表，因而接触设施资源也会被释放。随后 `authoring.js:25` 做缓存裁剪，`authoring.js:68-70` 执行视图切换，`:80` 的 dispose 同样只处理场景和作者会话，不通知角色租约或接触引用。
4. 角色端仍是单测试椅模型。`F:/gamemake/prototype/src/main.js:251-263` 的 `seatTargets` 从全局 `chair` 和 `motion` 计算目标，`main.js:918-920` 的 `reserveSeat` 固定 `seatId: "room-chair-1"`，`main.js:972` 与 `:986` 只检查这把全局椅的 `parent`。`setChairTransform` 还在 `main.js:270` 固定用该 seat ID 查询占用。真实公司使用点如 `station-1/chair#seat` 没有进入角色预留、接近、坐下或离开路径。
5. `seat-lease.js` 本身只要求任意非空字符串 seat ID，因此身份层可以承载公司使用点。复现已用 `room-chair-1` 和 `company/floor-1/room-1/station-1/chair#seat` 各自成功预留。缺口在角色控制器传入设施使用点和接触资源，而不是租约模块的字符串校验。

完整 CPU 复现脚本见 `reproduce.mjs`。脚本固定读取 `F:/gamemake-company-c2-fixed` 的公司 `aff9dd8b3eeca02ecbb3e110f0b572a294a3e193` 检出，并用 `F:/gamemake` 的角色提交 `23c1140a01d26b6f1c10ac4f8064f366add3ba17` 读取角色源码。输出目录必须预先不存在，例如 `node evidence/company-c3-contact-audit-v1/reproduce.mjs evidence/company-c3-contact-audit-v1/reproduction-fixed-run-02`。原先的 `reproduction.json` 保留不改。该历史文件没有记录当时实际输入文件 SHA，不能据此追溯原运行字节身份。固定复现输出及源码 SHA 见 `reproduction-fixed-run-02/reproduction.json`。

## 接口归属

公司副总工负责 `render.js`、`document.js`、`authoring.js` 和设施资源/布局数据。总工负责 `main.js`、`motion.js`、`behavior-tasks.js` 与 `seat-lease.js`。共享修改前由总工确定写入窗口。

公司侧应补一个从派生文档读取的稳定使用点合同，至少包含使用点 ID、facility ID、floor/room、世界位置/朝向、approach/seated/exit 语义点、接触资源版本及 seat/back 节点身份。该查询必须在 building 或其他楼层视图也可用，并区分“逻辑合同可用”和“接触 Mesh 已加载”。公司侧还应提供一个显式的接触资源保留/重绑定入口，例如按使用点 ID 的 `acquireUsePointContact`/`releaseUsePointContact`，由公司资源生命周期实现，不由角色复制第二套场景状态。

总工应让角色控制器接收稳定使用点 ID和上述合同，替换 `room-chair-1`、全局 `chair`、`seatTargets` 和全局 chair collider 的直接依赖。角色仍使用现有 `seat-lease` 和 `behavior-tasks`，只把 lease 的 `seatId` 改为公司使用点 ID，并在坐下前取得公司提供的接触句柄，在离开或销毁时释放。`motion.js` 需要消费设施提供的接触表面/姿态参数，继续由已有单一动画时钟驱动。

## 最小方案比较

| 方案 | 做法 | 优点 | 风险/代价 |
|---|---|---|---|
| 逻辑使用点查询 | 公司始终从派生文档提供使用点合同；角色只在当前可见楼层请求真实 Mesh | 离屏导航和任务规划稳定，释放显示资源仍有效，改动小 | 角色接近离屏设施前必须等待显式加载，不能在无接触资源时坐下 |
| 设施资源保留/重绑定 | active lease 对应的设施实例在换楼层时保留隐藏根，或切回时按稳定 ID 重绑新 Mesh | 已占用设施接触连续，适合切视图期间继续动作 | 要处理缓存裁剪、旧根销毁、资源版本和并发切视图，常驻内存上升 |
| 推荐的最小混合 | 逻辑合同永久可查。角色仅为 active lease 调用保留/重绑定。其他设施随视图释放 | 保留单一 lease/task 状态，兼顾离屏规划和真实接触 | 需要一条明确的 acquire/rebind 生命周期及失败原因 |

不要把 `navigation().obstacles.object` 当作接触 Mesh。该字段在离屏时可以为 null。也不要让角色重新创建椅子或维护第二套座位状态。

## C3 最小真实验证清单

- 固定同一公司候选和男女角色构建身份，记录目录、资源版本和源 SHA。
- 两个同层工作站分别以真实使用点 ID 完成接近、预留、坐下、保持接触、起身、退出和释放。检查坐姿高度、朝向、脚底/椅面、背部接触和视线。
- 第二角色争用同一使用点必须拒绝，使用点身份换成另一工作站必须可预留。
- 在持有 active lease 时切 building、其他楼层和返回原楼层。逻辑合同、租约状态和任务 requestId 保持一致，接触句柄按约定保留或重绑，不能引用已销毁 Mesh。
- 视图切换期间触发取消、超时、资源加载失败和角色销毁，确认 lease 只在物理退出或 owner dispose 后释放，失败不残留隐藏设施或任务。
- 更换设施资源或布局时，忙碌使用点拒绝变更。释放后变更可提交，角色再次查询到新版本的接触节点。
- 关闭并恢复公司文档后，用稳定使用点 ID 重新解析。历史 `room-chair-1` 仅作显式迁移兼容，不能覆盖新公司身份。
- 正常速度浏览器验证两实例隔离、走跑切换、坐起和最小附件使用。CPU 复现、导航矩形或无角色替身只能作为前置证据，不能代替本清单。

## 限制

本审查没有修改产品源码，没有运行浏览器/GPU，没有验证 `motion.js` 的具体接触姿态，也没有声称 C3 已通过。角色树在审查期间工作区无目标文件改动，哈希采样保存在父任务消息中。
