# 原生眉色与组合外观真实验收

源码3ead0c0e，固定build cd3c55ef101b；原生男7586、棕眉#3a241e、绿虹膜#4f7a4a、独立HairSet001长直发。与游戏相同factory和时间驱动，不连接Studio。

UI独立棕眉/复原、错误颜色/版本拒绝保旧、快速往返、组合v9配方关闭页面后恢复、真实旧v8绿眼+长发文件恢复眉original再恢复v9均实际通过。未改动作控制器；仅body切换颜色传参接通新字段。旧人物依旧眉随发色，新男独立眉不再被旧染色覆盖。

同姿同镜头原生完整导出与独立棕眉比较，眉眼区域280×110像素全等。blink/mouth/smile为诊断端点；live-face-1x.webm为12秒1×真实讲话、微笑、眨眼及视线。完整2fps联系表保24帧，未见眉毛丢失/重新染回/眼白串色。原生候选脸型/口腔风格不因此获得人工观感认可，非任意表情组合保证。

Windows开发机Ryzen9 9950X3D + RTX4090，Chrome157，1440×1000，DPR1。普通电脑未测。原生发色两个制作入口均未进入导出，保失败；眉色成功不能代替发色。

源在assets-source/native-vroid-hair-color-study-v1；scripts/stage-native-eyebrow.py确定性提取并拒绝错源/冲突。通用事务CPU/独审见native-eyebrow-independent-v1及native-palette-part-iris-regression-final-v1。复现从3ead0c0e独立检出npm ci/build，然后运行scripts/qa-native-eyebrow-room.cjs <dist> <新证据目录>。
