# 发尾随身体运动的对照

源码提交 `5b979355`，固定构建 `30b8750e69c3`。4196 的“检查 → 入座时的发尾动态对照”可播放两段影片。`before-trial.mp4` 两侧均开启动态，左侧原版，右侧试用上胸参考系。逐帧采集真实渲染器的侧面画面，按模拟时间 30 帧/秒合成。`room/room-produced-1x.webm` 是同构建的正常速度房间实时录屏。

### 重新构建与验证

1. 在独立目录检出 `5b979355`。进入 `prototype` 依次执行 `npm ci`、`npm run build`，把生成的 dist 放入交付指针的 directory。用当前工作区的 `python scripts/serve-appearance-workbench.py` 启动 4196，服务会核验构建身份。预览影片从本证据目录单独读取。
2. 运行 `node scripts/qa-native-hair-motion.cjs http://127.0.0.1:4196/ 30b8750e69c3 evidence/m2-native-room-current-v3/roundness-a/input-record.json output/hair-default`。另选新输出目录并追加 `--import-fit` 测适配版。第二份记录的目录名为 cheek-b。设置 FFMPEG 为支持 libx264 的 ffmpeg 路径可同时生成影片。
3. 设置 `QA_NATIVE_HAIR_CENTER=native-hair-upper-chest-v1` 后运行 `node scripts/qa-production-record-room.cjs http://127.0.0.1:4196/ evidence/m2-native-room-current-v3/roundness-a/input-record.json output/hair-room` 可重录房间并用新页面回读。所有命令均需新输出目录。

### 测量与限制

两份身体各有 873 个后脑发片顶点，均无弹簧骨影响；主发网格 24,794 个被绘制的顶点中有 17,064 个直接或间接受弹簧控制。每层最多抽取 32 个顶点，在独立页面恢复同一记录，对齐逐步模拟的任务和时刻，测量启用与关闭动态的头部局部坐标差。抽样峰值只表示摆动幅度。碰撞穿入距离、其他发型和普通电脑实测仍待验证。造成最大差异的原版坐入帧约在 8.27 秒。

第一轮原位修改关节参考骨时，three-vrm 3.5.5 的 setter 删除了其他关节仍需的共享缓存，见 shared-center-cache-failure.json。固定候选用源配置和身体哈希匹配，在弹簧管理器构造前拆分链段，仅切换 36 个影响头发的关节，全部 75 个关节的骨骼配对、参数与碰撞器保留。该适配由预览链接显式开启；现有角色记录还没有保存此试验选项。
