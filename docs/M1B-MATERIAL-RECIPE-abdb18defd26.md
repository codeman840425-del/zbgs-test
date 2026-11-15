# 男短裤材质recipe：abdb18实际运行结果

固定 `abdb18defd26` 的真实装备API已完成原材质/recipe两段正常1×链；原图alpha、几何和恢复检查通过。**材质仍是候选，未获用户观感验收；没有修复裤装几何或宣称自然布料完成。** 当前能力状态仍只查CAPABILITIES，本报告是该版本证据。

紧凑归档在 `evidence/material-recipe-abdb18defd26/`：两段 `normal-chain.webm`、原分辨率站/坐/恢复图、summary、原report gzip、build-info、实际recipe及SHA清单。完整输出与全时序抽帧在 `output/shorts-material-recipe/abdb18defd26-1794702908477/`。没有修改固定产物或把旧175诊断overlay改标本版。

## 实际运行

Chrome真实页面，1440×1000、headless；固定room相机 `[5.8,4.5,7.8]` 看向 `[0,.65,0]`，两段各全部rAF记录只有一个相机状态。前置短暂停姿仅用于同姿态几何对照；正式动作全程1×，无reset、传送、advance、simulate或姿态注入。通过实际 `avatar.setMaterialRecipe` 加载recipe，未注入shader。原材质与recipe各独立新页面，素材和动作相同，但不是逐帧相位对齐的两部电影。

每段包含长→短→长→短，站立、真实路径至椅/坐下坐稳、起身、真实路径到舞区、完整技术舞结束，最后卸下recipe恢复原材质并穿回长裤。四个行为任务均completed；技术舞任务约8.069秒，含原7.2秒动作及进入/退出。有效状态记录各约25.63/25.47秒；录像约28秒，含载入和前置检查。

运行时pageerror/console error均0，未观察到shader编译/程序报错或白色失效材质。这里未读取GPU timer query或`gl.getError`，不是性能/所有驱动兼容性验收，更不能代表普通电脑达标。

## 数据与资源保持

- 真正短裤两primitive及完整body在暂停同姿势下，position/normal/index/UV/skinIndex/skinWeight字节和实际posed顶点SHA切换前后一致；整段结束静态属性仍一致。
- 原1024×1024图像RGBA SHA `021972c5518d489ae5ca8c66a21890cf7023e12851485dc0a48cf602a2449823`，alpha SHA `7a172027bf692974b400d48bf30935f80bd43da1a4f68892c7be4dc642b7ec39`，原、候选、卸下后三次一致。alphaTest仍0.5；内裤口材质没有map，不伪造一份贴图证据。
- map/alphaMap/透明及side属性保留，卸下后原material及数组引用恢复。候选的两个clone实际触发dispose；原material与共享texture在卸下时dispose计数均0。后续整个页面关闭由页面生命周期释放，不能把上述0误解为永远不释放。
- 实际active record校验recipe SHA `6307ada57e83d74a34305708e747f452c9bde9f4b18dc4caea150f83d9d32824`、implementation SHA `4539ac3f83bc5fb1fa9aa91dbfb7323a8f2e7084a5f762d9713d0ae36bcfb565` 和原GLB `c8a1afd…`。首尾实际男基模SHA及served/runtime固定build一致。

## 已看见的改善与仍在的问题

两片以2FPS完整解码，共57+56帧、10张全时序sheet，已逐张检查；另对比原分辨率站立和坐稳图。站立图中原短裤前片黑色硬折/烘焙纹理的对比降低，recipe布面更均匀。正常全景动作里未见材质闪白、衣片消失、长裤被短裤recipe污染或卸下失效。

裤脚的硬边、胯部和坐姿轮廓仍是同一几何；shader不会让折片、贴腿程度或穿插自动改善。固定room镜头中人物和裤区较小，舞蹈帧的细小褶皱难以充分分辨，不能从“任务跑完”推出自然度通过。这里是完整时序抽样检查，非全部编码帧逐帧检查，也没有新增接触三角/连续碰撞验收。2FPS中看到的转向、收步和舞段动作形态不属于本材质工作的新修复。

仍沿用固定world-light色阶近似，UV带/竖线保护不等于语义识别每处口袋/缝线。当前存档v2无recipe字段，未测试或实现保存迁移；没有新增正式UI入口。用户选择与必要的近景自然度判断仍由后续可观看候选评审决定。

脚本 `scripts/m1b-assets/qa-material-recipe-fixed.cjs` 可对显式固定版本复跑；`package-material-recipe-evidence.py`仅打包本次abdb已完成结果，原运行和视频SHA保留，不重新标记成其他构建。
