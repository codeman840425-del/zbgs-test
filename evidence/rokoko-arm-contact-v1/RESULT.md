# Rokoko 30 秒动作：手臂局部穿插诊断（冻结 v1）

用户已有限认可动作方向与连贯，仅要求调整显眼手臂穿插。本报告不撤销该判断，也不把轻微/隐藏交叉升级为新硬门。没有修改动作、人物、裙装或运行时。

## 实际输入与范围

- 实际运行：`analysis/rokoko-portable-rebuild-v1`，038341558517 runtime + 精确新 Rokoko 清单（不是原038资源组合）。原舞蹈/电影均保留。
- 男女各7时刻：3 / 6 / 6.5 / 13 / 19 / 22 / 23 s；120Hz实际游戏 simulate 后，采最终 raw skin、实际服装与原完整body诊断索引。正常穿衣覆盖索引保留，没有为捕获改变显示身体。截图另用近景相机；矩阵在capture中，不冒称原电影镜头。
- 原实际30秒电影/三联在 `../rokoko-30s-advisor-v1/`。本次观看全段低频时间表及指定近图，不宣称逐帧看完或重新录制整段。
- 全14帧 handContacts=[]、handReferenceSurfaces=[]，页面错误0。现seatHandSurfaces仅裙装outfit1返回裙面；女裤0/男短裤2没有躯干或上衣避碰。这不是本次运行中意外关闭修正。

## 明显问题与原因

|时刻|实际图中问题|真实几何支持（F/M有限非共面交叉对）|
|---|---|---|
|3s|交臂时两前臂合成一条，边界穿过；不是仅正常前后遮挡|左右臂skin互穿91/105；且前臂与上衣躯干区域相交|
|13s|右手（正面图左侧）进入腰侧背心，仅指端/局部手臂露出|右手-body73/64，右手-top146/108|
|22s|左侧前臂靠胸/身侧进入衣面|左前臂-top57/56|
|23s|右上臂/前臂收拢到衣侧，局部皮肤与背心交界破损|右前臂-top72/88；完整近侧图可看腋侧衣片与手臂关系|

数量用于定位，非严重度评分。肩袖连通附近、衣下身体、全包裹体积/共面情况需区别；本探针没有把所有零交叉作为接受标准。top各组材质信息已保存，但本次有限三角探针不做纹理alpha采样，不将裸计数视为全可见。衣侧及交臂结论来自实际正常材质图和对应穿过面共同支持。

源Rokoko Newton 3s本来有交臂意图，13s手在腰侧；没有证据要求改动作含义。骨架相同旋转移到窄肩/不同臂长的目标，会改变空间关系：

- 按现髋高比例缩源后，左右上臂根间距：F 396.8→217.4mm，M 439.8→295.6mm。
- F 上臂/前臂长分别为同比源86.8%/76.6%，M78.5%/80.3%。rest臂向差约2.7–4.8°，肩段rest方向也不同。
- 3s左右前臂骨中线最近距：源同比F42.5/M47.1mm，目标F8.04/M11.02mm。骨点本身不提供皮肤厚度，却足以解释真实skin交臂重叠增大。
- 实际游戏raw骨相对hips与目标JSON FK，7时刻最大差F16.5/M19.2纳米；这是数值核对结果，不是人体真值精度。没有发现游戏层额外扭臂或normalized/raw重复翻转。
- 右腕相对upperChest目标与同比源差约94–165mm。这不是应直接平移这么远的修正量，而是整条肩/臂rest比例差的合成。原源骨架/视频没有目标服装厚度信息，不能声称源皮肤完全无穿插。

## 最小下一件（已获root限定实施）

只制作新目标动作资产的两个局部窗口：3s交臂、23s靠身；F/M同一方法。原时间、根、腿、躯干轨保持，不改控制器。依据目标真实表面和臂长做最小上肢轨道适配，保交臂次序/手势，补偿手局部旋转以保原世界腕朝向。窗口边缘必须连续，最终真实skin及正常材质图验证。代理只能帮助求解，不能替代最终实际皮肤。先两个窗口，不把全30秒或13/22s未修问题称通过；方法两次无实质改善则停。

## 重放

1. `node scripts/run-fixed-check.cjs analysis/rokoko-portable-rebuild-v1 evidence/rokoko-arm-contact-v1/capture.cjs`（会重写同名诊断，复跑请先另存输出目录；临时端口/无头Chrome随脚本关闭）。
2. Blender4.5.9 `--background --factory-startup --disable-autoexec --threads 2 --python-exit-code 1 --python evidence/rokoko-arm-contact-v1/skin-crossings.py`。直接使用已存实际skin，无新GPU捕获。
3. `OPENBLAS_NUM_THREADS=1 python evidence/rokoko-arm-contact-v1/arm-proportions.py`。精确原数值子集在arm-inputs.json.gz；不依赖顾问私有路径或重新转换。

`capture-report.json` / `skin-crossings.json` / `arm-proportions.json`分别记录身份、有限面证据和比例/FK。`female-contact-sheet.jpg`、`male-contact-sheet.jpg`索引近图。`source-newton-*.jpg`来自已有源机器人复录，仅本地参考，不新增公开授权。浏览器与临时server均已关闭。
