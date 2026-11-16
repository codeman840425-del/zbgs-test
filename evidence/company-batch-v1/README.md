# C2批量制作结果入口

实现为scripts/company-platform/batch.mjs，代表输入为scripts/company-platform/batch-inputs/sofa-rooms.json。复用已知显式请求配置gpt-6.1-sol/high，difficulty standard，理由为跨文件发布、确定性输出和失败重试隔离。实际provider配置和桌面Hook拦截未独立验证。

```powershell
node scripts/company-platform/batch.mjs scripts/company-platform/batch-inputs/sofa-rooms.json NEW_OUTPUT_DIR
node scripts/company-platform/batch.mjs scripts/company-platform/batch-inputs/sofa-rooms.json NEW_OUTPUT_DIR --only sofa-room-blue
node scripts/company-platform/qa-batch.mjs
node scripts/company-platform/qa-batch.mjs --representatives-only
```

输入使用company-batch@1，items为显式的{key,input,operations?}数组。input沿space.js的createScaledCompany合同，必须提供公司id。operations沿prepareCompanyChange，空数组可用。key为1..64位字母、数字、下划线或连字符，首位为字母或数字，Windows设备名拒绝。全批次先拒绝重复key、文件系统大小写冲突和重复公司id。拥有有效key的独立输入或操作失败仅影响该项。

每个结果在OUT_DIR/key下形成完整四文件目录。

- input.json保留最终实际输入及操作。
- layout.json为完整company-layout@1文档。
- save.json为完整company-save@1及资源/模板内容pin，decodeCompanySave可恢复。
- report.json记录前三文件的字节数/SHA、实际资源及模板pin、实际本地GLB字节/SHA、生产源码SHA和连接/静态摆放结果。

输出采用递归排序对象键、原数组顺序、UTF8、LF和末尾换行，不含时间戳、进程号或输出绝对路径。相同输入、源码和依赖在不同输出根中得到相同字节。CLI的运行摘要单独输出stdout，包含各项key、状态、结果目录或具体code/path/message。部分失败时进程退出码为1，其余成功目录仍完整可用。

## 实际代表结果

当前固定代表为timber-final-results/sofa-room-original与timber-final-results/sofa-room-blue，实际运行摘要为timber-final-run.json。前者使用真实lounge-sofa@1，后者通过输入sofaVersion:1创建同规格设施，再显式replace-resource到真实timber-sofa@1。第二项最终位置[-1,0,-0.5]、yaw=PI/2，fabric颜色#345c83、roughness=0.82。

两模型的footprint、全部usePoints、category、mountRole、stateDefaults和坐标基准/缩放声明经独立比较相同。模型分别为631292bytes/SHA a457c8e142f5745bb66140f0c15c1748cdcda63f536af5f119a16f7ee633116c，以及266968bytes/SHA fa72ac0c6ab944d2679ce824dcfe08834b715bc8472b23fc4daced3a9070dd96。模型外观与实际字节不同，批次没有缩放或重新导出模型。

旧lounge-sofa v1/v2输入保留为scripts/company-platform/batch-inputs/sofa-rooms-v1-v2-history.json，其final-results、final-run.json、较早representatives和原17项report.json均保持历史身份。当前主输入sofa-rooms.json与最终timber结果使用同功能规格的换模型流程。

## 发布、幂等与重试

每项先完成空间工厂、可选操作、连接几何、inspectCompanyPlacement、实际本地GLB字节核对和encodeCompanySave。失败项没有结果目录。成功候选在out内部独立stage目录写完四文件并sync，再在单key排他锁内以目录rename发布。

已有结果不会覆盖。全部四文件及精确字节一致时返回idempotent，缺失或额外文件、非普通目录/文件、输入或依赖/源码变化均返回output-conflict，并给出具体路径及缺失/额外项或实际与预期SHA。结果路径直接限制在out之内，已有junction或符号链接拒绝。

修正失败项后用同一个批次文件加--only KEY重试。已经成功的兄弟项不会被触碰。排他锁冲突返回batch-item-busy；普通异常会清stage和锁。进程被强制终止或主机中断可能留下锁，工具不会猜测并删除其所有权。应确认原发布进程已结束后再处理该残锁。原有完整结果继续保留。

## 实际验证范围

原v1/v2批次已执行17项真实Node CLI/文件系统检查，全部通过，结果保留report.json。覆盖两种实际GLB身份与最终外观/变换、save内容pin往返、幂等、独立目录字节一致、JSON对象键顺序、变化/篡改/额外/缺失文件拒绝、单项失败与独立重试、坏operations形状隔离、重复key/id、路径穿越、Windows设备名和大小写、junction拒绝、锁冲突与两个实际CLI并发。

换为timber后按授权仅执行--representatives-only的4项受影响检查，全部通过，结果为timber-recheck.json。实际验证两项完整输出及save pin恢复、全声明功能字段相等、字节幂等、单项失败和--only独立重试。无关17项基础范围未重复授予新版本结论。

各报告记录实际测试目录和对应batch源码SHA。测试输入和失败现场均保留在对应run目录。没有运行浏览器/GPU、实际渲染或角色导航，没有修改space、placement、存档或其他共享产品文件，也未提交Git或联系总工。
