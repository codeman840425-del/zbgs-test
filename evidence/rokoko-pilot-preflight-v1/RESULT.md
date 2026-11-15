# 顾问Rokoko样件：根的接入前核查

这是隔离制作样件，不是公开候选更新。运行时038未变，但manifest和男女动作资源新增，不能只用038构建号标识整个样件；身份详见identity-reviewed.json。原identity-audit.json因只预期manifest变化而未通过，进一步entrypoint.patch确认index只注入录制harness；原失败保留，没有改资源冒充。

已核65份基线文件与根原固定版字节相同。候选仅修改index及动作清单，新增男女各一份30秒动作文件；没有更改游戏JS。两份动作的文件大小/hash、真实男女body、normalizedRig、鞋及原FBX身份均匹配。每件52旋转轨＋hips位移，共901采样点。录制harness另包裹simulate计时并切换固定front相机，不能把这些录像当默认room相机；这是采集层行为，不是新增动作的专用控制器。

实际查看顾问female-review-6.5.jpg与23.jpg；整体姿态可辨认，但23秒图下缘已截部分鞋底，因此该机位不能覆盖全段脚接触验收。仅两张图片不判自然度，需保留原片并补能完整覆盖动作空间的正常房间镜头。源FBX首参考T姿与30秒端点保留策略已读转换脚本，尚未独立重跑转换或验证连续足底。手碰衣、足接触以及是否存在其他强动作冲突仍待验。

正式集成前需归档许可、可移植转换脚本和输入、补完整源/目标影片审查，生成独立候选资源身份；不改旧038或4194。顾问正在制作完整对照片，根不重复其转换和合片。

后续可重跑脚本：scripts/pose-reference/audit-rokoko-pilot.py，传--pilot、--baseline、--output。首次脚本复跑发生在顾问追加vendor-source.html/FBX/Three副本之后，reproducible-audit.json因此严格返回false；两目标动作hash仍与先前一致。不是游戏JS被改或动作文件损坏，也不通过扩大白名单掩盖目录变化。待顾问冻结后，打包最小游戏资源与独立源viewer，各自固定身份。

核当前游戏源码的更正：没有任何contactWindows读取；motion.js舞蹈分支明确contact=false，舞蹈groundLift是121点采样求得的全段常量。导入资源不携带接触驱动能力，不能只补一个manifest字段就宣称修好。所有slip数值须结合contact是否存在；最终鞋底仍需真实runtime检查。
