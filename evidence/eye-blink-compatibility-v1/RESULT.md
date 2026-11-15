# Joy × 双眼自动眨眼局部兼容候选

独立固定 **084c61578262**，`experiments/m2-appearance-workbench-v16/dist`。公开4196不变；未声明视觉通过。

变更仅新增 `prototype/src/eye-blink-compatibility.js` 与live接线。实例私有Expression使用非负h*b、现有MorphTargetBind系数−1，指向已有EYE_Joy；只绑定实际Skin/White/Eyeline/Eyelash四类mesh。原happy/Close/口型不变，Brow/Mouth/Iris/Highlight/Extra五类不绑定。原56/54形态、源资产和四域几何配方未修改。没有新增负setValue、形态buffer、眼骨或每帧几何改写。

`cpu.json`来自真实原VRM字节→GLTFLoader→three-vrm→foundation/live链；仅贴图解码与renderer.compileAsync用Node替身，不包含GPU灯光/alpha验收。原男女+已登记女jaw/waist、男jaw五身份均通过；派生的EYE_Joy delta与原家族逐值0差。每角色9个Face influence数组不共享，两个实际加载实例之间亦独立。28组原态/眼端点与四域几何组合的峰值/半闭/睁开/中性眨眼检查，所有受保护实际引用索引的蒙皮位置与混合法线精确不变；原ALL/Close/AA系数及几何指纹不变。

正常live时间链也实际执行，补偿在原preUpdate设表情后、vrm.update之前更新。0dt重复不累加、不改时间；dispose先clear再unregister，重复建立不留target贡献。6项错误准入（未知SHA、primitive共享数组、跨实例共享数组、EYE已被使用、目标数错误、happy override不符）拒绝补偿且不修改源。独立单眼blinkLeft/Right明确skipped保原行为，**不能称此方法已覆盖单眼组合**。

调试（不添加UI面板）：`a.livePresentation.setEyeBlinkCompatibility('legacy'|'fixed')`。静态对照先通过真实manager设置happy/blink/口型，再调用`a.livePresentation.refreshEyeBlinkCompatibility()`；方法实际读取权重、更新私有Expression并manager.update，保留时间和源表情意图。正常运行仍由原actor.update驱动，默认fixed。

后续QA必须比较男女完整材质的同姿峰值/半闭和1×眨眼讲话，观察中央睫毛、眼角、眉笑嘴稳定性以及新四域形态的normal/outline。CPU位置代数正确不证明真实灯光或阴影正确。单独关闭本适配可回原表达行为；发布及最终结论由root处理。

复跑 `node scripts/qa-eye-blink-compatibility.mjs --out evidence/<new-output>`；已存在cpu.json拒绝覆盖。被测模块和执行脚本快照/哈希均在本目录。
