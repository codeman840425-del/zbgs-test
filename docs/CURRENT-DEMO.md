# 当前固定候选的启动与恢复

能力状态只看 [CAPABILITIES](CAPABILITIES.md)。`delivery/candidate.json` 只保存本地演示的构建指针，不是第二套验收表。当前源码提交aed9597生成269a73423c97；有限坐起手接触已修，但仍有裙形与完整观感缺口，不能称M1全部通过。

在仓库根执行 `python scripts/serve-candidate.py`，固定入口为 http://127.0.0.1:4192/ ，男性入口加 `?body=male`，选择“独立露膝短裤”。服务启动前核对完整源码摘要，缺失或错误构建会拒绝启动；占用端口时不自动杀死别的程序。

录像入口：`python scripts/serve-review.py --port 4174`，打开 http://127.0.0.1:4174/evidence/m1-current-review/ 。这两个服务仅绑定本机。正常使用无需启动Vite开发服务，不使用热更新验收。

新检出若没有固定产物：切到候选指针记录的源码提交，在 `prototype` 执行 `npm ci`，再执行 `npm run build -- --outDir ../experiments/m1-joint-integrated-1/dist`。从本次独立新检出已实际重建61文件并逐字节比对，证据见 `evidence/rebuild-aed9597/receipt.json`。未来源变更不能沿用这个构建身份。

旧942固定目录 `experiments/turn-candidate-14/dist` 保留，相关录像和源码未覆盖。需要交互复现旧版时，可停止当前演示服务，再显式用 `python -m http.server 4192 --bind 127.0.0.1 --directory experiments/turn-candidate-14/dist`；不把旧页面当最新修复效果。下一次恢复当前入口仍运行 `serve-candidate.py`。

手轮廓/关节包络和裙形实验另存隔离目录，未经对应效果与成本验证不会写入此指针。普通电脑实测、整片自然度、最终画风仍分别待验，当前服务器只是本地展示，不是多人服务。

前一abdb完整产物另保留在experiments/m1-material-recipe-1/dist，delivery/candidate.json的previous记录精确身份。269影片在evidence/hand-joint-269a73423c97，工程抽帧审查与用户连续观看结论分开。6bc诊断修复及少褶源实验均未替换公开269。
