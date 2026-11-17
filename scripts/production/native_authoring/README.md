# 原生参数批量制作入口

`runner.py` 读取一个固定模板及一组显式配方，调用已经安装的 VRoid Bridge 0.15。每条从模板的字节相同副本独立开始，已有文件路径不能作为新输出目录。制作前校验编辑源和参数证据 SHA。记录中的组类型在每次打开后重新解析为当前组 ID，再按明确的 bone 或 color 类型调用原生命令。

## 输入与结果

`facecontour-pair.json` 含两个稳定的配方 ID。两条采用同一女性模板 `311a1b…b4de`，同一 FaceShape 组的 ChinRoundness 与 ChinFullCheeked，以及相同的导出设置。原生 `09-face-params.json` 和 `28-face-correct-params-after.json` 给出的离散值是 .60/.78 和 .30/.48。两条交叉组合分别为 (.78,.30) 与 (.60,.48)，各改一个目标字段。现有 get_params 回执未报告这一控件连续合法区间。颜色字段使用同样的已观察离散值机制和 RGBA 0–1 表示。

单窗口串行执行命令（输出目录须为新路径）：

```powershell
python -B scripts/production/native_authoring/runner.py --execute-native --batch scripts/production/native_authoring/facecontour-pair.json --output output/native-facecontour-batch-new
```

输出目录有输入快照、Bridge 请求和响应、进入状态的恢复身份及汇总 result.json。每件有原模板副本、另存的 candidate.vroid、VRM1 candidate.vrm、冷开值、原生截图引用及实际文件 SHA。设值后和冷开后均比较该组未指定参数。实际检查的 plugin 与 Unity 版本取自 status；Studio 版本来自配方声明。退出 0 表示全部指定项完成原生阶段并恢复进入状态。导出后的几何、适配、资产登记和游戏验证由下游独立记录。

## 失败恢复与复查

进入时仅接受明确的主菜单或干净、已有磁盘文件的模型。参数/冷开/导出失败写该条结果；若正在操作自己的脏副本，先另存 failure-state.vroid，再恢复原文件或主菜单。活动文件不属于当前样件、恢复快照失败或原文件 SHA 改变时停止批次。中断后依据 recovery-entry.json、calls 的最后请求和现场 status 区分已保存阶段；核实状态再继续。重试时选原配方中失败的项目写到全新目录。

离线测试入口：

```powershell
python -B scripts/production/native_authoring/test_runner.py -v
```

作者固定实现的本机 `agent/skills/vroid-studio/SKILL.md` 及历史真实请求明确一时只操作一个模型、菜单前先保原、开新模型重读组和导出 settings。离线测试覆盖模板隔离、两个组合、颜色命令、失败保留、未授权联动、重开错误和恢复停止。在此实现任务中未启动编辑器、执行导出或检查游戏外观；独立真实生产结果以实际批次的 result.json 为准。
