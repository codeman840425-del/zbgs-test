# ab074 工作台反馈修复

运行源：2084c43f8bab28befa8192a2f734abf3faaf8df8；固定目录 experiments/m2-appearance-workbench-v23/dist。Phaser3.90.0 / Three0.187.0 / three-vrm3.5.5。4196公开，旧bcade/v22保留；4174/evidence/appearance-repair-ab074/提供可观看对照。

## 已确认原因和修改

- 移动：近景的实际85%高度点击在有限地板之外，旧版无walk也无提示。原房间镜头可正常移动；未证实通用运动控制失效。新增明确房间入口、未命中/拒绝/暂停选目的地/继续/停止提示，camera事件同步按钮URL；招手中路线拒绝不会被成功文案覆盖。代码main.js、appearance-workbench.js。没有重写动作控制或改变路径速度。
- 虹膜：旧遮罩保护了局部彩色边缘，maxRGB混色又加重暗块；只换Hue的v2保留源亮斑产生荧光效果，已保留失败。v3使用真实UV mask、中性连续明暗底图，黑瞳alpha/独立高光眼白保护；原色还原原texture引用。源码facial-palette.js及contract；生产参数、脚本及source保存。并不声称新颜色已经用户验收。
- 几何：旧最大幅度过小；已真实制作原男女±12%嘴宽、3mm眉、2mm鼻、5%眼裂，并导出编辑源及表达形态。mouth新24mm过渡支持较大嘴宽；旧2.5%等仍原recipe与原算子。法线按所有活跃邻域并集重算，原网格不可变，每实例独立。
- 文件：v5显式识别新端点，原v1–4几何值与SHA保持；旧palette v1迁移到新v3并提示。未知身份拒绝，较新请求和失败回退有实际门。

## 证据与检查

- 最终10移动门：evidence/workbench-movement-final-ab074；包含真实地面/男路线/坐起/舞蹈中断/招手拒绝/暂停恢复与停止。
- 最终10配方虹膜门：evidence/workbench-v5-final-ab074；包含旧2.5%精确回读、新v5真实文件选择/下载、坏hash保旧、原色原引用与像素恢复、双实例/503重试/派生拒绝。
- 正常1×移动旧新采用同一执行脚本：workbench-movement-before-bcade-v2和workbench-movement-after-ab074。原视频与trace保留；34张2fps全时段抽查看到了误点提示→房间实际位移→暂停保持→继续→站定。抽帧不能证明0.5秒间的接触或自然度。
- 新男女五色及大幅几何完整UI、正侧面半闭/全闭/口型、正常讲话/注视录像：visible-face-final-ab074。静态放大同姿、相同视角、真实UI参数：visible-face-detail-ui-ab074。试验205b也保留，不替代ab074。
- source CPU旧11、最终合同17、独立6组合计算过。新10导出端点POSITION过；9个NORMAL门过。男−12%NORMAL一项1.105666e-5超过原1e-5，保留失败；nm量级位置舍入影响小面法线的独立见证见face-visible-runtime-v1。没有降低门槛或换身份。
- 两个全新检出npm ci/build，122运行产物逐字节同且源工作树干净，rebuild-visible-ab074。四源包精简Git导出221文件、缺90可重建重复输出仍核验过，face-visible-retained-verification-v2。
- 公开smoke实际4196版本/界面/移动与4174图片切换可用。原脚本把video preload正常ERR_ABORTED当失败，原report保留；精确两视频URL另206 Range/EBML核验过。见current-workbench-ab0743684fe6，不把该QA误断言称产品修复。

## 视觉与设备边界

工程已查看新旧关键图，以及正常录像的全时段低频抽帧：本次样件未见新增明显唇部断裂、全闭眼漏绿或前版彩色块；放大侧眉仍带原模型浮片结构，不宣称任意角度/所有形态贴面通过。原片由用户作连续观感判断。第一轮detail-ab074通过调试改色未同步表单，保留为诊断，已另以真实UI重拍detail-ui-ab074，不把错误标签图交作产品证明。

实测环境为现有高配开发机Chrome157/1600×1000，无头自动化+原生视频；未代表普通电脑或长期性能。旧首次切换/编辑长帧缺口不因这次检查变成已解决。裙装及30秒舞按用户要求封板，源和控制未改。

新虹膜、几何幅度及最终画风仍待用户；大幅样件不是任意连续编辑范围。男jaw只0/+4，女派生不获四域准入。没有扩衣库、完整M2/M3或真实服务器。

## 恢复

入口指针和回滚见delivery/appearance-workbench.json；最新备份见delivery/workbench-backup-ab074.json。固定源重建、源包核验命令见docs/CURRENT-FOUNDATION.md与各资源README。忽略的fresh/raw/repeat、dist、私有供应商视频/FBX不承诺已远程备份。所有canonical editable/final、recipe、生产与校验脚本纳入版本管理。
