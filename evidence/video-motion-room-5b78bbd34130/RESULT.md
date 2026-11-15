# v3 支撑清理实际回读：执行完成，动作未验收

独立构建`5b78bbd34130`，基于与v2录像相同的固定runtime `4958e6b60d8d97545b9332311958431aae0b20e2`。仅加入新资源ID `video-dance-support-v3` 的manifest entry与男女文件；原v2字节及主线不动。构建/source-copy-receipt保存了输入SHA，实际录制脚本复用`qa-video-motion-room.cjs`，起点Z1.4、空间半径1.5，未绕开任务准入。

`report.json`实际男女身份、avatarSHA、构建ID、动作ID均通过已有门；两次正常1×动作完整播放后task completed并返回idle，pageerrors空。动作3.003秒，完整媒体含约0.5秒前待机与后回idle。真实trace记录lift女性4.915284796mm/男性5.691315831mm，与离线复算一致，未冒充关闭runtime lift。

观看`index.html`：真人原片138–210 + 当前男女录像；正常1×共用播放/暂停/seek。源片仍留ignored analysis，未复制或裁剪。固定事件offset女性0.505700s、男性0.502900s，使用danceMix≥.999且动作1.5–2.5s的各165个trace样本；残差最大1.2/2.6ms。编码帧中位18ms，最大间隔48/26ms。残差不是画面对齐精度，MediaRecorder起始PTS与记录时钟约一编码帧不确定，非拍摄标定。完整媒体入口保留前后待机，不能因为共同范围只3秒而声称裁剪或变速。

实际浏览器完成全程三片1×播放，随后138/144/153/164/171/190/200/205/207/210十处暂停seek核查。`comparison-browser-check.json`记录三片rate=1、末端时间与seek状态；源片截图只在`analysis/dance-reference-v1/support-v3-review/`，不进入公开素材库。肉眼查看了153/171/205/207三画面：交叉步、背向转体、右支撑→后跳的源片阶段保留；205源片是右脚支撑、左脚摆动，目标仍有明显高度与腿姿不匹配。角色画面使用原room相机，人物很小，不能仅凭这个视图宣称毫米级接触通过，也没有通过脚滚动/摩擦/手掌质量。

候选支撑门失败继续保留：205右脚经runtime lift后女性37.61mm/男性41.67mm，详见`../../assets-source/video-dance-support-v3/README.md`。原v2整段63/70mm上抬减到约5/6mm，可以保留这项因果结果及候选做对照，但不能发布为合格舞蹈。不是30秒任务完成。

## 已保留的证据页操作错误

最初暂停抽帧使用Playwright range.fill遇到Malformed value，随后改为对已定位滑块赋值并dispatch input。最初临时http.server不支持Range，seek后媒体回0，页面的completed标志不足以证明正确时间；该次JSON明确保存为`comparison-browser-check-invalid-no-range.json`，不可当验收。改用项目已有`serve-review.py` Range服务，并增加源片起点/终点/每个seek实际currentTime断言后重跑通过。动作资产和原游戏录像未因此重录或改动。当前截图为最后有效结果，旧无效截图被有效检查替换，失效原因保留于此。

临时浏览器和两个服务均已关闭。恢复观看：

```powershell
python scripts/serve-review.py --port 8797
# 浏览 http://127.0.0.1:8797/evidence/video-motion-room-5b78bbd34130/index.html
```

独立构建位于`experiments/video-dance-support-v3-room/dist`，不修改delivery指针；可复跑安装命令：

```powershell
python scripts/build-video-motion-candidate.py --asset-dir assets-source/video-dance-support-v3 --output-dir experiments/NEW-UNUSED-DIRECTORY --runtime-dir experiments/rebuild-152-4958e6b/prototype
```

复跑录制必须使用新证据目录，指定`QA_VIDEO_START_Z=1.4`，原录像不覆盖。
