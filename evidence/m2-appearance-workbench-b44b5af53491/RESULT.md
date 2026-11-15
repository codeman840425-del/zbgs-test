# b44 外观工作台实际验收（旧配色固定版）

固定身份 `b44b5af53491`，实际入口 `http://127.0.0.1:4196/?workbench=appearance`。本包不改标为后续配色构建。单浏览器串行、Chrome headless、1600×1000；主记录 `report.json` 保留原始失败，补充检查独立存于 `rapid-corrected/`。未改产品源码、发型或动作数据，未启动新服务，所有 QA Chrome 已关闭。

## 已实际执行

- 原女 original → female-bob-v1 → original；发型切换保留独立棕色。黑、棕、金发色和 original/warm/deep 肤色实际 UI 切换及 reset。
- reset 后原材质颜色、shade、map/shadeMap 引用、Texture Source 引用与完整纹理像素 SHA 均恢复；原发网格可见性恢复。不是仅 getState 值相等。
- 九个 face/half/full × front/side/back 实际按钮组合与 URL view 状态均通过；44 张原尺寸截图保留。
- 注入发型清单 HTTP 503 后，原发型保留、错误显示且 UI 恢复可操作；移除故障后原控件重试成功。
- 原女与实际 `loadComparison('female')` 第二实例分别 original/棕/暖、bob/金/深；材质对象不共享，操作 B 后 A 的颜色与 map/source UUID 全部不变。
- 五个精确身体身份加载并拍摄同相机脸部/半身正侧图；bob 对原男及三派生被拒绝；派生无 Rokoko 选项，未绕兼容门。形体/脸型变化较小，穿衣同镜头不等同裸体或同相位几何分析。
- 原女、原男的默认选择均为 `rokoko-5359146-30s-v1`。各真实正常 1× 完整播放一轮，约 5s 时 UI 暂停约 0.9s，舞钟完全不变；恢复后均到达完整 30s，任务 `completed`，结束 `idle`。原片包含加载、取景和主动暂停，不剪接、不改速、不称从首帧即开始动作。
- 所有实际页面 `pageerror = 0`。原片、帧轨迹、identity 收据与实际执行脚本均保留。

## 保留的 QA 假设失败与正确补证

原 `rapid API` 测试断言总 `assetRole='hair'` 网格数必须为 1，实际为 2，因此原报告 12/13，不回写成全通过。该断言不符合产品结构：`Bodybaked_5` 是保留的原发型，候选 `m2-female-neck-bob-v1` 是第二网格。

`rapid-corrected/report.json` 实际补测快速 bob→original→bob 并同时 black：第一请求取消，最新请求成功。raw head 下仅一个候选、精确 GLB SHA `3dcf01957d8ab72dfc128c6950f0e9600c2c7b801ea774a612058dc4b5d68110`；候选显示时原 Bodybaked_5 隐藏，恢复 original 后可见性反转，黑色保留。没有重复挂载。此项为纠正测试前提，未调整产品或放宽真实资源准入。

## 工程视觉抽审与未完成项

实际逐张查看 `female-review-2fps/000–005.jpg`、`male-review-2fps/000–005.jpg`，共 12 张、139 格，覆盖两片全时段。审查图只裁去 UI 边栏/页头，保留完整游戏画布与脚；完整 1600×1000 原片仍可全屏观看。2fps 抽审不是逐帧、连续 1× 人工观感验收，不能排除短于采样间隔的异常。

- 两片均能看到抬臂、交臂、交叉步、转身、结束回站立；未见新发型突然缺失、大块身体消失或动作片被错误串播。此有限视觉检查不等于全网格无缺面/无接触问题。
- 原舞已有交臂重叠（视频约 3–4s）及手臂/胸前衣物接触（约 24–25s）仍可见；本次只安装封存数据，不修动作、不升级为接触通过。
- 男性 `inspect-full-front` 在视频约 26.5–27.5s、28.5s 抬高手触及或短暂超出画布上缘。女性对应动作在框内。已报 root；这是动态取景余量限制，不能将本包镜头称为所有舞姿全身不裁切。
- bob 的侧/背长度变化清楚，耳旁有碎发贴耳；原/新前侧背图未证明耳部无穿插，也未做全网格接触门。
- `female-skin-deep.png` 的旧 deep 明显偏橙。技术换色与恢复通过，但不将其称为自然肤色定稿；root 已另做新配色候选，需另版证据。
- 女性腰胯与男女下颌截图已保留，外观差异有限，不以略有差异宣称显著多样性。
- 按 root 新指令不追加 b44 的近景讲话/gaze 视频；这些连续组合在本包未测，root 将在最终配色版本补录。本包的两段舞均使用原发型、原肤色，不伪称 bob 动态舞蹈已录。

## 录像窗口时钟（不是性能验收）

| 身体 | rAF 样本 | 窗口 wall / simulation | 最大舞钟 | 最大 rAF 间隔 | >33.333ms / >50ms |
|---|---:|---:|---:|---:|---:|
| 原女 | 5341 | 32.3964 / 31.4212s | 30.8633s | 6.6ms | 0 / 0 |
| 原男 | 5326 | 32.3174 / 31.3856s | 30.8641s | 18.2ms | 0 / 0 |

舞钟超过 30s 的部分为结束混合，资产声明时长仍为 30s。simulation 少于 wall 包含主动暂停，不能直接当降速或耗时比。此数据只说明这次开发机录制窗口，不代表编码文件 FPS、无录制性能、普通电脑或手机性能。

## 查看与恢复

`index.html` 提供单画面大图选择、原/新发型正侧背、五体型脸部/半身和两条原尺寸视频（原生全屏控件）。`summary.json` 保存视频 SHA、帧时间和原始/gzip trace SHA；原 trace 均保留，gzip 解压逐字节验证。

首次实际脚本：`executed-script.cjs`（同根 `scripts/qa-m2-appearance-workbench.cjs`）；rapid 补证：`rapid-corrected/executed-script.cjs`（根 `scripts/qa-m2-appearance-rapid-check.cjs`）。原脚本的固定 build/身体 SHA 与输出防覆盖保留；不能将换端口后的新构建冒充 b44。本页后处理可用 `python evidence/m2-appearance-workbench-b44b5af53491/package-review.py --decode` 重生成审查图，不重复浏览器操作或影片。
