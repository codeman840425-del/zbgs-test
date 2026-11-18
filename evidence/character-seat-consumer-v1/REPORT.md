# 正式角色消费者的设施请求接缝

## 已观察的失败

组合测试的正式角色源码为 `cfca0dd13af69418dc063d6715c43523184195f9`，游戏构建为 `fe2e58489bbb`。公司固定包能查到 `screen-partition-studio/ground/live/sofa#left` 和 `#right`，并能分别保留真实座面和靠背。正式 `record-consumer.html` 加载两个人物后，调用人物 `controller.requestBehavior` 得到 TypeError。该入口目前具备已签外观读取和生命周期验证。正式双座、房间动作及设施恢复仍待接通。 [组合测试报告](F:/gamemake-test/formal-round/combination/REPORT.md:24) · [native-01 API 调用](F:/gamemake-test/formal-round/combination/evidence/native-01/observations.json:980)

同提交工作台收到左座的 `payload.usePointId` 后显示任务完成，但最终位置约为 `[2.6497, 0, 1.3119]`，占用登记在 `room-chair-1`。右座请求和第二人争用左座均返回 `seat-unavailable`，两个真实座位查询均为 `null`。请求序列化保留了真实 ID，根因在座位选择和后续求姿。 [native-01 工作台请求](F:/gamemake-test/formal-round/combination/evidence/native-01/observations.json:2591) · [native-01 双座争用](F:/gamemake-test/formal-round/combination/evidence/native-01/observations.json:2810)

## 角色侧的最小接入

1. **给正式宿主注入真实房间控制器。** `record-consumer-demo.js` 的 `consume()` 调用已有 `prepareRecordedCharacter(..., {createController})` 接缝，从签名记录恢复完整人物后挂入房间。宿主按活动角色 ID 和当前实例对外转发 `requestBehavior`、取消与状态查询，并在现有每帧循环调用同一控制器的 `simulate(dt)`。外观专用入口可继续用 `instance.update()`。房间宿主只走一条帧更新链。`CharacterScene` 目前依赖工作台场景初始化和全局房间对象，需抽取共用控制器或将其房间依赖显式注入。 [正式宿主](F:/gamemake/prototype/src/record-consumer-demo.js:31) · [每帧更新](F:/gamemake/prototype/src/record-consumer-demo.js:90) · [实例准备与控制器注入](F:/gamemake/prototype/src/character-record-consumer.js:31) · [CharacterScene](F:/gamemake/prototype/src/main.js:764)
2. **让请求与整段坐姿共用一个使用点绑定。** 用 `requestBehavior()`/`startBehavior()` 在替代活跃任务和产生新副作用前检查显式 ID，从房间 provider 得到身份、版本和可用姿态。排队执行时重新查验。将选中的绑定传给 `reserveSeat()`、`action()`、`updateBehavior()` 和 `simulate()`，驱动接近目标、转身、骨盆接触、服装碰撞和退出。将座面高度纳入 `createMotion` 的实际坐姿输入或按现有体型适配范围拒绝该座椅。路径与碰撞读取演员楼层。显式请求无 provider 或身份过期时明确拒绝且保有当前有效任务。未指定 `usePointId` 的旧工作台按钮可继续走演示椅。 [现有接近点](F:/gamemake/prototype/src/main.js:253) · [预约与请求入口](F:/gamemake/prototype/src/main.js:922) · [对齐和服装接触](F:/gamemake/prototype/src/main.js:1774) · [坐姿高度求值](F:/gamemake/prototype/src/motion.js:1539)
3. **复用预约生命周期。** `createSeatLeases()` 的键已经支持任意 `seatId`，角色在本地房间可注入同一协调器。接入外部权威租约时，预约、入座、退出、取消和销毁均使用该权威，房间编辑也读同一占用。保留接触资源另有句柄，路不可达、取消预约、销毁等失败路径成对归还。任务完成后继续占用。站起已经开始仍保持占用，确认骨盆离开所绑定座位后释放。销毁先停止/移除活动角色根节点和碰撞，再释放该实例预约及接触句柄，复用 `disposeRecordController` 及 `character-record-batch` 的迟到结果回收。由实例世代约束清理，避免同一人物 ID 的旧准备结果释放新实例。 [预约状态机](F:/gamemake/prototype/src/seat-lease.js:17) · [现有物理退出检查](F:/gamemake/prototype/src/main.js:994) · [消费者销毁钩子](F:/gamemake/prototype/src/character-record-consumer.js:49) · [批次迟到回收](F:/gamemake/prototype/src/character-record-batch.js:75)

## 依赖房间提供的合同

- **身份与版本。** 按稳定 `usePointId` 查询，返回一致的 `facilityId`、`roomId` 和 `floorId`，及房间文档修订、资源及适配版本或内容哈希。给同一候选请求/恢复提供可比对的版本，获取接触或预约时校验身份仍有效。无关编辑可继续保留有效的既有绑定。native-01 中可见资源 ID/版本、文档 revision 与世界位置/yaw，完整嵌套变换及适配绑定仍要按实际联调合同验明。 [native-01 公司姿态字段](F:/gamemake-test/formal-round/combination/evidence/native-01/observations.json:111) · [C3 合同](F:/gamemake/docs/CHARACTER-COMPANY-C3-SEAM-2026-11-16.md:17)
- **姿态、几何与编辑。** 独立于观看楼层返回有限、可用的完整世界变换与米制座面、接近和退出定义，提供对应座面/靠背的 retain/release，以及角色导航所用楼层障碍。接近坐标需结合足底/骨盆适配。设施移动、删除、替换或整房恢复在提交时通过同一租约关口检查。镜头/可见层切换期间仍有效的几何由接触句柄持有。正式接收方只有拿到这些输入才可证明真实设施入座。 [离屏接触与编辑约定](F:/gamemake/docs/CHARACTER-COMPANY-C3-SEAM-2026-11-16.md:19)
- **保存与恢复。** 租约 token 属于运行时。房间另存演员 ID、签名角色记录 SHA/修订、有效座位/版本及需要恢复的逻辑姿态。开档先在场景外核验并重新取得接触绑定和租约，失败时回收候选。外观签名记录有自己的独立版本和资源身份。 [角色记录字段](F:/gamemake/prototype/src/character-record.js:11) · [正式重开观察](F:/gamemake-test/formal-round/combination/REPORT.md:25)

## 最小失败到通过的接口用例

在正式宿主挂载 A、B 两个已经验证的记录。给 A 发 `{requestId:'formal-left', kind:'sit', payload:{usePointId:'screen-partition-studio/ground/live/sofa#left'}}`。推进角色时钟，直到坐稳且任务完成，再给 B 发同形状请求指向 `#right`。房间 provider 对左右分别给出两组 pose，真实发布环境还需验证体型适配。native-01 静态接近点分别是 `[1, 0, 0.5]` 和 `[1.96, 0, 0.5]`，可作为区分输入。预期 A 在左侧，B 的右座可预约，两者最终各自占用，演示椅始终空闲。第三人申请被占的左座应被拒。A 起身和确认离开之间左座保持不可申请，实际离开后只释放左座。再用未知 ID 或过期版本重复，须在走路或派生租约之前明确拒绝。补上这一条完整请求后，记录关闭重开需独立检验重新取得原设施与失效情况。 [左侧输入](F:/gamemake-test/formal-round/combination/evidence/native-01/observations.json:111) · [右侧输入](F:/gamemake-test/formal-round/combination/evidence/native-01/observations.json:195)

在本项目根目录运行：

```powershell
node evidence/character-seat-consumer-v1/reproduce.mjs
```

复现从 `git show` 读取锁定源码与已有 CPU 夹具，使用已安装的 Three.js。正式消费者断言缺少 `requestBehavior`。工作台断言使用真实 `CharacterScene`、路径和租约逻辑，简化 rig 把接近/坐稳边界直接交给控制器。实得演示椅接近点 `[2.65, 0, 1.3047966166784228]`，A 左座任务显示完成，B 右座为 `seat-unavailable`，仅演示椅占用。接口期望夹具用现有租约协调器证明按左右不同 ID 可独立预约，离开后只释放左座。通过的范围限于夹具的预约状态。实际正式宿主、外部 provider、版本失效、姿态接触及开档恢复仍需候选验收。 [复现脚本](F:/gamemake/evidence/character-seat-consumer-v1/reproduce.mjs)
