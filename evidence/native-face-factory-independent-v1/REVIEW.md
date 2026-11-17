# Face原生factory独审

源与三衣实际读取支持当前cc0843候选复用完整皮肤与原Top遮罩。三个GLB原POSITION/NORMAL/UV/JOINTS/WEIGHTS、indices、130骨顺序及IBM逐项保持，所有绑定名字/值与本候选源一致；节点层级/rest、MToon参数和图片保持。此核查不继承旧1nm动态门通过：生产包记录的归一化路径微差与原失败仍保留，未重跑姿态或接触。

Face Body实际indices对应的POSITION/UV/JOINTS/WEIGHTS与843ac精确相同（N可变化），完整Body PNG等于原生donor，旧Top mask字节相等；整图RGB精确一致，608383像素只改变alpha。Body base与shade同用image11。复用依据是这些实际内容，不是文件名或仅相同尺寸。

本次发现并反馈的源合同错误已由制作者修正：shorts原slot=shorts且covered=true，与实际bottom/不启用Top mask不符。旧manifest/build快照保留。新合同只有top覆盖，shorts+shoes恢复完整皮肤，不放松公共模块规则。

鞋底需分两种坐标：实际600鞋索引的原POSITION最低-7.442453409112204e-8m，恰巧等于整个共享数组最低值；这不证明用共享数组的方法正确。官方VRM加载器rest实际蒙皮+matrixWorld最低-8.449510756150829e-7m（源顶点6988）。新profile采用后者并另记raw值，不将0.77µm差当视觉严重性。

CPU覆盖实际消费v2 staging的manifest/PNG/装备entry：prepare不发布，top启用mask，shorts+shoes卸Top后恢复原map/shade；错误资源/未知装备/错体身份拒绝、commit注入异常保原状态；私有纹理与两实例释放互不影响。MToon颜色因子保持。解码使用真实PNG身份和CPU bitmap夹具，不是WebGL、阴影或视觉验证。

配色与配方独立4组通过：新Face只有原色，原色query/default recipe实际apply/capture一致；所有现有非原色发/肤/眼/唇都在set/prepare/recipe/query拒绝且不推进状态或I/O；错误请求保留已准备原色事务，两实例独立，reset有效。眉brown与旧843ac身份配方亦拒绝。没有继承male绿眼/棕眉、改袖、HairSet001、旧几何/接触/附件fit。

源check.mjs的旧3项仅证明注册前unsupported-avatar fail-closed，且固定期待该拒绝并wx落盘；注册后不能称其仍是可重复的运行验收入口。后续共享模块实际测试由本独审覆盖，新生产入口由root另补，旧blocked不得改成pass。

首次stage终核捕获source manifest 9fed→9803的换行字节漂移，而public/profile/admission仍9fed。stage.log保留，不自动换SHA放行。制作者恢复9fed并固定输出换行后，独立source build --check与stage --check均实际通过；辅助pixel-readback首次换行失败亦保留。最后color-policy仅LF→CRLF，归一化后SHA与已测文件完全一致。

最终stage脚本固定全部输入SHA，并在写入前核整个8件计划及目标冲突；每件用临时文件加不覆盖的原子link发布（不宣称整个目录在I/O故障下原子回滚）。独立临时目录首次stage8件、重复bytes/mtime全不变、最后一件目标冲突整批无任何新写、错误源hash不创建目标目录均实际过；临时资源已清除。真实public读取7业务资源/相对URL/全部SHA与profile一致，另staging-manifest为95c1523a。生产v1及v2未引用nested残留不属于本次profile的资源集合；正式构建只取固定plan8件。固定文件、重核及状态见closure.json。所有测试只写本证据目录，无Studio/GPU/生产文件更改。
