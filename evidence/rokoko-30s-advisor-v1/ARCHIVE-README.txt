冻结交付 v1
以 FINAL-ARCHIVE-MANIFEST.json 中逐文件SHA256和用途为准。manifest自身不递归纳入哈希。
观看入口：review/index.html；最终5片：comparison-30s.mp4、four-way-30s.mp4、female-30s.mp4、male-30s.mp4、rokoko-newton-30s.mp4。都为连续30.000秒/900帧/30fps，原速度不变。
输入→输出：input精确30秒MP4 → 已完成云任务 → vendor-output原始FBX → retarget-rokoko.mjs + reference/assets-source/video-target-adaptation-v1/男女normalized-rig → candidate-rokoko-v1/assets/motion/m1c/男女motion与dance-imports → 固定038341558517游戏运行时 → capture-harness.js → capture-v1男女wide和vendor-source原始录制 → package-final.py → 最终影片。
游戏JS未改；candidate的index包含隔离录制harness，dance-imports增加候选。manifest包含候选全部资源，game-baseline-manifest另记录65原始资源。旧窄镜头、旧静止Newton、package-comparison旧流程均不作最终交付证据。
可移植限制如实保留：retarget-rokoko.mjs和inspect-fbx.mjs引用 F:/gamemake/prototype/node_modules/three；Python脚本存在本机FFmpeg/字体路径，依赖PyAV与Pillow。锁文件已归档；尚未声称在新路径完整重跑通过。总工可在自己的归档副本参数化路径并验证，不覆盖这批冻结原件。
源FBX t=0为参考T姿势，转换保留原FBX，在衍生动画0时刻沿用t=1/30首有效姿势，其余时间戳不动；最后一帧保持到30秒。游戏进入动作的过渡保留，不假装首0.3秒与源姿势逐帧一致。
质量：流程跑通，最终观感待用户。用户已明确接受动作连贯时的轻微穿模，零穿模不是硬门槛。不要因少量穿模再次无限调参；明显跳姿/肢体突变/持续滑步另审。source与target接触问题需分开；当前dance contact关闭使slip0不具验收含义。
来源与账号边界详见SOURCE-AND-USAGE.txt。此归档为内部证据，不是批量生产/发布许可或M1统一验收通过证明。
