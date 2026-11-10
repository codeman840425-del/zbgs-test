# ui2_P0_1109 · V1 网游化 UI P0 皮肤件（待策划审）

2026-11-09｜美术和动画岗｜依据 `策划/V1_界面与固定特效实施方案_20261109.md` §2.1–§2.2、`美术/网游化界面方向_V1_20261109.md` §3–§4、`程序/美术方案归档确认_20261109_MT.md` §3。
范围仅 P0；未做 P1/P2、角色动作、换装分件、走位、主房间、城市外景。**未合入主目录**：没有改 `美术/ui/ui_9slice.json`、没有覆盖主目录旧 UI、没有改房间底图、没有删任何已有素材，没有写主台账，没有打包外发。新 UI 不沿用 U2 窗框（只参考 U2 线宽 6px 与色板，未复制其贴图）。

## 来源与额度
- 全部件：**自制脚本｜待策划审**（`_src/build_ui2_p0.py`：SVG 形状经 cairosvg 渲染 + PIL 阴影/外发光；@1x 与 @3x 各自矢量重绘，不是位图放大）。
- 生图：**未调用** Seedream / gpt-image-2（缎带折角用矢量画出，质感够用），故无 `raw_seedream/`。实耗 AFP：Seedream 0、gpt-image-2 0，合计 0。
- 徽章档名字母（D/C/B/A/S/SS）是唯一画进贴图的字，字体 Noto Sans CJK SC Bold。其余贴图无字。

## 目录
```
ui/ui2/*.png            37 件 @1x + 37 件 @3x（透明 RGBA）
ui/ui2_9slice.json      21 个九宫格 key（字段同 ui_9slice.json：file/size/left/right/top/bottom/@3x）
ui/ui2_theme_default.json      schema ui2.theme.1，正式默认皮肤
ui/ui2_theme_placeholder.json  schema ui2.theme.1，纯色块，不引用任何贴图、不含 U2 框
overview/ui2_P0_overview_dark.png  深色底总览（Noto Sans CJK SC）
_src/                   生成、自检与 meta 脚本（可复跑）
selfcheck.md  MANIFEST_sha256.txt
```
注：本包 `@3x` 是 @1x 的真 3 倍（旧 U2 包里的 `@3x` 实际是 1.5 倍）。程序按 json 里的 `size` 读，不受影响。

## 件清单（@1x 尺寸；@3x = ×3）
| 正式 key / 态 | 文件（ui/ui2/） | 尺寸 | 说明 |
|---|---|---|---|
| ui2_hud_company_funds · normal / warn / crisis | `ui2_hud_company_funds_{normal,warn,crisis}_9s` | 240×64 | 常态 cream 底+棕描边；预警 coral 描边 6px，现金照常显示；危机/破产 berry 底，字用 cream。「欠 {n}」（`hud.company.funds.debt`）由程序渲染，没有烘进贴图 |
| ui2_hud_company_scale | `ui2_hud_company_scale_9s` + `ui2_hud_icon_scale`(48²) | 168×64 | 数字胶囊，小楼图标 |
| ui2_hud_company_streamers | `ui2_hud_company_streamers_9s` + `ui2_hud_icon_streamers` | 168×64 | 话筒图标 |
| ui2_hud_company_jobs | `ui2_hud_company_jobs_9s` + `ui2_hud_icon_jobs` | 168×64 | 只有皮肤；无工种时程序隐藏 |
| ui2_hud_company_power | `ui2_hud_company_power_9s` + `ui2_hud_company_power_badge_{D,C,B,A,S,SS}`(64²) | 168×64 | 盾形徽章：D 灰 #BDB2AA、C mint、B honey、A apricot、S coral、SS berry；右侧分数程序渲染 |
| 资金图标 | `ui2_hud_icon_funds` | 48×48 | 硬币叠，无货币符号 |
| ui2_win_normal_9s | 同名 | 192×192 | 圆角 24，描边 6，阴影边 12 在切片内；切片 48/48/48/48 |
| ui2_win_modal_9s | 同名 | 192×192 | 同上，加 honey 20% 外发光和顶边 apricot 标题插槽带；切片 48/48/48/48；标题栏位置见 theme `titleSlot` |
| ui2_titlebar_9s | 同名 | 480×96 | coral→peach 竖向渐变缎带，两端燕尾和折角；横向拉伸，竖向固定高 96（中间只留 1px） |
| ui2_btn_primary_{normal,pressed,disabled,alert} | `…_9s` | 320×112 | coral；pressed 下移 4px、暗 8%；disabled 去饱和；alert 是 normal 加右上 berry 红点 |
| ui2_btn_secondary_{…4 态} | `…_9s` | 280×88 | cream 面 + peach 底唇，态同上 |
| ui2_btn_close_{normal,pressed,disabled} | 同名 | 72×72 | 圆形，描边 #7A4E3A，× 线 6px |
| ui2_btn_back_{normal,pressed,disabled} | 同名 | 72×72 | 圆形，左箭头 |
| ui2_toast_{info,success,warn}_9s | 同名 | 360×88 | 左侧圆形图标（info 是点+竖条，success 是勾，warn 是竖条+点，都是图形不是字），图标放在 left 72 的角区内；文字从 x=88 开始 |

## 九宫格实测（单位 px，left/right/top/bottom）
| key | @1x size | @1x 切片 | @3x size | @3x 切片 |
|---|---|---|---|---|
| ui2_hud_company_funds_normal_9s | [240, 64] | 32 32 31 31 | [720, 192] | 95 95 95 95 |
| ui2_hud_company_funds_warn_9s | [240, 64] | 32 32 31 31 | [720, 192] | 95 95 95 95 |
| ui2_hud_company_funds_crisis_9s | [240, 64] | 32 32 31 31 | [720, 192] | 95 95 95 95 |
| ui2_hud_company_scale_9s | [168, 64] | 32 32 31 31 | [504, 192] | 95 95 95 95 |
| ui2_hud_company_streamers_9s | [168, 64] | 32 32 31 31 | [504, 192] | 95 95 95 95 |
| ui2_hud_company_jobs_9s | [168, 64] | 32 32 31 31 | [504, 192] | 95 95 95 95 |
| ui2_hud_company_power_9s | [168, 64] | 32 32 31 31 | [504, 192] | 95 95 95 95 |
| ui2_win_normal_9s | [192, 192] | 48 48 48 48 | [576, 576] | 144 144 144 144 |
| ui2_win_modal_9s | [192, 192] | 48 48 48 48 | [576, 576] | 144 144 144 144 |
| ui2_titlebar_9s | [480, 96] | 66 66 47 48 | [1440, 288] | 197 197 143 144 |
| ui2_btn_primary_normal_9s | [320, 112] | 43 43 55 56 | [960, 336] | 128 128 167 168 |
| ui2_btn_primary_pressed_9s | [320, 112] | 43 43 55 56 | [960, 336] | 128 128 167 168 |
| ui2_btn_primary_disabled_9s | [320, 112] | 43 43 55 56 | [960, 336] | 128 128 167 168 |
| ui2_btn_primary_alert_9s | [320, 112] | 43 43 55 56 | [960, 336] | 128 128 167 168 |
| ui2_btn_secondary_normal_9s | [280, 88] | 43 43 43 44 | [840, 264] | 128 128 131 132 |
| ui2_btn_secondary_pressed_9s | [280, 88] | 43 43 43 44 | [840, 264] | 128 128 131 132 |
| ui2_btn_secondary_disabled_9s | [280, 88] | 43 43 43 44 | [840, 264] | 128 128 131 132 |
| ui2_btn_secondary_alert_9s | [280, 88] | 43 43 43 44 | [840, 264] | 128 128 131 132 |
| ui2_toast_info_9s | [360, 88] | 72 44 43 44 | [1080, 264] | 216 131 131 132 |
| ui2_toast_success_9s | [360, 88] | 72 44 43 44 | [1080, 264] | 216 131 131 132 |
| ui2_toast_warn_9s | [360, 88] | 72 44 43 44 | [1080, 264] | 216 131 131 132 |

切片由脚本实测：取逐列/逐行像素一致的最长一段作为拉伸区（容差 1）；窗框按规格保底 48。按钮四态用同一组切片，换态不会跳。按钮、toast、titlebar 是固定高件，竖向只留 1px 中线。

## 接入备注
- 顶栏排布：y 0–150，左右各留 32，顺序 funds / scale / streamers / jobs / power，间距 16（theme `topbar`）。图标叠在胶囊左端（x+8, y+8），数字从 x+64 开始。
- 动效时长与曲线按界面方向 §4 写进 theme `motionMs` / `motionEase`，全部由程序补间，不出序列帧。
- 色板见 theme `colors`；新增 `gray #BDB2AA` 给 D 档和占位 disabled 用（**待策划审**）。
- 台账：本批没有合入 `美术/_pipeline` 主台账，合入时来源写「自制脚本｜待策划审」。
- 完整性：见 `MANIFEST_sha256.txt`。
