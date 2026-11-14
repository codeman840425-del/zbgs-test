# M1C 直播表现模块

实现仅在 `prototype/src/live-presentation.js`，不控制根位移、经济系统或资产身份。主流程集成由root维护。当前是开发候选基本能力验证，不是所有动作/体型/附件已合格。

## 接口与时序

```js
const live = createLivePresentation({ vrm, root, bodyType });
live.preUpdate(dt, { action }); // motion完成后，VRM更新前
vrm.update(dt);
root.updateMatrixWorld(true);
live.postUpdate();              // 真实raw手/头挂点与gaze；内部再同步矩阵
```

精确顺序：源动作及脚/裙手接触 → live normalized右臂/手指与face → VRM normalized转raw → live raw socket/gaze。旧foundation face写入必须关闭，由此实例独占这些表情值；主流程已经实际这样接入。这里不会去改根位置或启动动作片。

- `setExpression('neutral'|'happy'|'aa')`：现有VRM表情。
- `setSpeaking(bool)`：五元音程序示范，**非音频口型/语音识别**。保留happy情绪及独立眨眼。
- `setGaze(worldVector3OrArray|null)`：眼睛注视世界目标，不自动转身体。按当前raw头求值，随后更新世界矩阵。
- `setAccessory('mic'|'glasses',bool)`：Promise。manifest和GLB首次需要时才加载；每件严格检查真实byteLength+SHA256。
- `canPerform(action)`：`{allowed,reason}`，mic请求/加载期间拒绝dance。主流程动作入口也需调用，不能仅让UI按钮看似禁用；已集成。
- `getState()`：每实例表情/时钟、程序口型标记、注视、附件请求状态、错误、实际尺寸/拟合方式和握持残差信息。
- `dispose()`：abort未完成请求，废弃过期结果并释放已加载资源，恢复该层占用的lookAt状态。

每slot有单独版本。旧异步请求成功后若已被新装卸/销毁取代，结果直接释放，不会覆写新选择。mic与glasses独立；没有共享动作时钟或全局挂点对象。

## 握持与眼镜定位

右臂按当前人体的UpperArm/LowerArm实际长度求两骨目标，右手/指关节使用VRM humanoid语义，无硬编码原骨名称。麦克风+Y对齐真实手的食指—小指掌宽方向，grip在真实raw掌部位置；骨层握持在走/坐/起/讲话后统一覆盖，避免空手摆臂继续争夺。装卸权重平滑进入退出。

源Talking会动画手指，因此完全卸下时不写手指；持麦时捕获本帧authored四元数，向固定握持目标混合。主motion恢复全部normalized authored pose，避免Mixer缓存跳写残留补偿。这不是“原动作没有手指动画”的假设。

首次实际检查发现眼骨是内部旋转轴，直接骨中心前移会将镜框埋进脸。现以当前实际虹膜几何两侧中心定间距，以该高度脸前表面定前后位置，只进行一次拟合；之后以raw head局部挂点随动。当前源族材质EyeIris/Face语义用于采样，其他来源若无对应材质仅fallback，不能继承通过。男女实际测得虹膜中心距82.99/84.59mm，对应镜框scale1.2968/1.3218；并未复用女性数值给男性。

## 实际验证

运行 `node scripts/m1c/qa-live.cjs http://127.0.0.1:5173/`，`QA_LABEL`可选独立输出目录。最终开发报告在 `output/playwright/m1c-live/contract-final/`。两个实例均 `injected:false`，使用真正集成模块。

- 每人600个120Hz走/坐样本，无IK触达夹限、无pageerror；另执行起身、站立及讲话、gaze、装卸。
- 每人正/侧/背站姿与正/侧坐姿截图，眼镜和麦克风可见。
- 乱序on/off/on最终on；完全卸下后附件节点0。
- 故意返回错误GLB字节，生产SHA/长度校验确实拒绝。
- 网络加载中dispose，Promise返回cancelled，附件/容器节点均0。
- 完全卸下后12个右指关节的本帧authored四元数在live.preUpdate前后零改动。

`prototype/public/assets/m1c/runtime-fit-observations.json`仅记录本次测量与源码hash，不是加载的偏移配置，也不将`fit.verified`自动改为true。正式固定构建的完整正常速度录像/性能/双实例路径由集成任务另验。

## 未通过与限制

这是有界持麦层，并非通用手抓取或掌皮碰撞系统。当前正常镜头能握持，但手掌/每根手指与麦克风真实三角没有完成全程碰撞证明；thumb姿态仍应人工审看。眼镜镜腿与耳部的精细接触、其他脸型适配未通过。持麦舞蹈明确拒绝。程序元音并不根据真实录音发音，不应包装成音频驱动直播。

附件几何由独立素材任务生成，来源/CC0声明及三次重复导出在 `assets-source/m1c-accessories/`；本模块未更改附件文件或其manifest SHA。
