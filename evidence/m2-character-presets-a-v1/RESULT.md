# A：已有四域一次选样（已封存）

固定运行时 source `026ab2013ee94a6eb72cbe5f5e8c347c49b65431` / build `0fb420e5b124`；新分支 `codex/m2-character-presets-a-v1` 仅增加选样数据、脚本与证据，没有修改 runtime、公共入口或素材。采用现有固定 dist，未生成新产品构建。

## 可观看结论

打开 `index.html`。原女、原男各基准 + A窄嘴/眼裂组合 + B宽嘴/眉鼻组合；只做这一次选择。

近景能够指出 A 嘴变窄，眼裂宽变化较轻微；B 嘴宽及眉位较明显，鼻尖变化在侧面较轻。房间正常尺度不足以区分成不同人物。已有四域组合足以展示局部参数制作与恢复，不足以交付新脸型、年龄库或六名新主播。没有因此再扫参数或扩大幅度。

同款短发具体是各基模自带 `hairStyle: original`，统一 black；不是女性bob或男性sidepart独立发型。统一棕色虹膜、原肤色、原唇色、outfit0。原男女皮肤源纹理本来不同，同选项不等于同一个皮肤资产。黑发连同眉色的变化是全样件共同控制，不能计作本体区别。

全部六片实际正常1×，每条约17.44秒：自然眨眼、口型A、微笑讲话、两侧注视、既有招手。六片trace比值 sim/wall 0.999960–1.000017；无暂停/快放、真实文档visible/focus断言通过，零pageerror；最终配方与原实际下载文件相同。已查看6个全活动区间2fps sheet，未见新增明显裂面、眼线/嘴部脱落，闭开眼与招手均实际出现。B笑口更宽是预期局部变化，不据此宣布美术自然度获得用户接受。2fps抽查不是连续人眼验收；原片完整保存。

## 交付与消费方式

- `static-2/recipes/*.v5.json`：6份由工作台UI真实“下载配方”生成的文件，含原base SHA、装备资源/绑定、palette及各实际geometry recipe SHA。
- `static-2/`：36张原同条件图及每张metadata；最终观看只用其中30张非room图。
- `room-36/`：6张补回真实room 36°投影/房间外参的图，使用相同实际v5与保存姿态。旧45°版本保留，不称实际游戏镜头。
- `live-3/`：6条正常1×原片、trace、实际口型/注视关键帧；各file SHA在report.json。
- `live-review/`：6条末18秒2fps覆盖约17.45秒活动段，6个表情sheet和6个招手全幅对照；原始解码帧可由脚本恢复。
- `sheets/`：12张同一缩放的三列全幅对照，无独立裁切；原图可点开大图。
- `gallery-check.json`：证据页36动态图片可加载、原图弹窗、文件实际下载逐字节一致。文件页按需读取独立原始base64数据再Blob下载以避开Chrome file协议仅打开JSON的问题；未改配方字节。

每份在新context、无localStorage、对应原版基模中，通过真实文件选择恢复并逐字段等于原下载；live也独立读取同一文件。文件恢复调用现有 `importAppearanceRecipe` → 共用actor的appearance/facialGeometry/equipment，之后由共用VRM表情与motion运行。工作台只是文件选择入口，不存在另一套人物/动画实现。没有新增永久actorId、主播库、招聘/头像/经营存档；这些外观配方还不是业务存档系统。作为制作数据可移交现有共用API，后续游戏业务保存入口未在本单实现。

## 选择与门

A嘴−12% + `aperture-width105-v2`；眉鼻none。B嘴+12% + `height3-spacing3-v2` + `tip-forward2-v2`；眼none。基准全0/none。没有新增连续范围，源算子和NORMAL门保持已发布口径。

同体静态每个角度均逐值核 raw骨/world、模拟时钟、全部expression、相机矩阵/投影、灯光；姿态用保存的实际节点按唯一名字双射恢复。静态为headless冻结诊断，不冒充正常时序片。live为有窗口真实visible/focus输入。相同body/source identity始终精确，源与compact渲染索引分开，原source合同未改。

独立审查在主区 `evidence/m2-character-presets-independent-review/RESULT.md`：6文件/36条件/源准入与6正常片抽查。顾问/用户画风接受未代写。本轮未测普通电脑性能，不重跑封板裙舞。

## 保留的脚本失败

`static-1`：male-a遇异步节点顺序变化，错误地按遍历下标配对。改为既有唯一名字双射；没有修改源或姿态门。`static-2`成功后发现room fov45不等于真实36，故仅按原文件/姿态补6room，不重新选样。

`live-1`：按钮文本误写“单次挥手”，实际“单次招手”，未命中。`live-2`：错误断言UI口型A >.9；原源码固定为.65，讲话峰.66。`live-3`改真实data-action selector并校验aa阶段==.65，先保存trace再断言。两次都是QA脚本问题；产品/配方未更改。失败raw/report不覆盖、不改标。

## 复跑

从项目根使用已安装依赖：

```powershell
node scripts/run-fixed-check.cjs experiments/face-render-compaction-build-422a/dist experiments/m2-character-presets-a-v1/scripts/m2-character-presets-a-v1/capture.cjs <new-output>
node scripts/run-fixed-check.cjs experiments/face-render-compaction-build-422a/dist experiments/m2-character-presets-a-v1/scripts/m2-character-presets-a-v1/live.cjs <new-live-output> <static-output>
python experiments/m2-character-presets-a-v1/scripts/m2-character-presets-a-v1/package.py <evidence-root>
python experiments/m2-character-presets-a-v1/scripts/m2-character-presets-a-v1/inspect-live.py <evidence-root>
```

脚本用项目固定Playwright1.58.2，OS随机临时端口，结束关闭browser/server。selection.json先记录，再一次执行选择；不能以重跑脚本扫描新参数。
