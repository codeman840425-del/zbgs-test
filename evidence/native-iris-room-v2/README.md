# 原生虹膜独立配色实际验收

固定源码 f13bb4a2 / 构建 cb4272c3b10c，原生男7586、唯一绿#4f7a4a。Studio制作的PNG独立加载到共用factory；没有第二人物驱动、运行时不连接Studio。

实际UI换色无页面重载，错误颜色/版本保旧，独立原生长发+虹膜配方关闭页面后恢复。旧女绿色切原生女被正确拒绝，恢复原色后可切。测试V1错误期待直接切换，失败原样保留。新女未继承绿色支持。

source-comparison为同姿静态完整原生导出与独立纹理回读；original/green近景及blink/mouth/smile端点可看。live-face-1x.webm为12秒正常速度，使用游戏已有讲话、微笑、眨眼、视线时钟；无独立驱动。完整24张2fps辅助检查：未见虹膜丢失、眼白染绿或眼纹滑移，口型/眨眼同时运行。仍有原候选面部/牙齿风格，未获得人工自然度验收；不能据此宣布全部脸型/表情组合通过。

环境：Windows开发机Ryzen9 9950X3D + RTX4090，Chrome157，1440×1000，DPR1；普通电脑未测。iris深色RGB也按原生制作改变，保结构不等于每个瞳孔像素颜色不变。

重建：独立检出 f13bb4a2，在prototype运行npm ci及npm run build；使用scripts/qa-native-iris-room.cjs，参数为dist与全新证据目录。源/导出/冷开命令在assets-source/native-vroid-iris-study-v1；scripts/stage-native-iris.py固定SHA提取并拒绝冲突。实际开放范围仅男7586 original/green，不以单颜色替代完整原生配色能力。
