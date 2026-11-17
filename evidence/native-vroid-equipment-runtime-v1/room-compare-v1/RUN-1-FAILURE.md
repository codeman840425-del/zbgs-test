# 4cf / eeb 原生装备首次房间失败

实际固定commit `4cf6a23842cffc9be2017aa8bfc013a0081eae7f`，build `eeb7d4e0013d`。`capture.cjs --prepare`核原78912 VRM、原装备manifest及三件GLB与该commit逐字节相同，bundle实际消费15个固定源码输入。`--run`真实启动临时loopback服务和Chrome，房间身份通过，但独立adapter加载阶段失败，未获得衣物对照/步态结果。

原错误为 `Missing raw bone J_Sec_R_TopsUpperLegBack_end 1_01`，详见`run-1/report.json`。服务器和Chrome已关闭。run-1失败视频/截图原样保留，不借后续源码修复改标成功。

官方GLTFLoader会用PropertyBinding.sanitizeNodeName处理节点名，并在`node.userData.name`保留原名。旧adapter只按运行node.name查target和source。`name-probe.mjs`对原VRM及三件GLB的实际骨架做只读CPU装载，材料/图片及extension在内存中省略，仅诊断节点命名。每份130个bones，仅原node122 `J_Sec_R_TopsUpperLegBack_end 1_01`成为`J_Sec_R_TopsUpperLegBack_end_1_01`；manifest仍写原名，target和source两侧均受影响。全部original alias精确覆盖，不能只修target而漏掉独立衣物的source映射。

root授权共享修复只在`prototype/src/equipment.js`和`scripts/qa-equipment-mtoon.mjs`。提交`eae6c664`增加运行名+原名精确查找，跨骨别名冲突、多个source binding命中及重复source binding均拒绝。CPU17/17通过，另存`../cpu-name-alias-v1/`。其实际GLTFLoader小fixture复现含空格关节，属于CPU回归，不冒称原衣物完整视觉运行。

首个name-probe因Windows动态import未转换file URL在CPU入口前失败，修为pathToFileURL后完成。此为探针接线修复，不改变模型/manifest/运行时准入。原4cf固定树没有修改。GPU已释放给root，成功衣物采集须等待新exact构建并单独保存，4196未改。
