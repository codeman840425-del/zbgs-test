# ui2_P1min_1110 · V1 网游化 UI P1 样板最小集（待策划审）

2026-11-10｜美术和动画岗｜依据 `策划/V1_界面与固定特效实施方案_20261109.md` §1、§2.3（只做表里「样板最小集要」的四行），以及 `美术/网游化界面方向_V1_20261109.md` §3 的底栏、操作条、镜头钮规格。风格接续 `ui2_P0_1109`（A 暖阳奶油；色板、描边 6px、按钮唇边和高光手法相同）。

**范围**：只做底栏 5 tab、中间大按钮、房间操作条（条 + 6 钮）、三种镜头钮。没做 P1 余件（在线点、换装槽、邮件/设置、人物面板条），没做 P2，没做角色动作、换装分件、走位、主房间、城市外景。
**没动的东西**：P0 包 `ui2_P0_1109/`（sha256 全部复核一致）、`dyn_v1_tangtang_1109/`、主目录 `美术/ui/ui_9slice.json`、主目录旧 UI、q6/测试/程序目录都没碰；没删任何已有素材，没写主台账，没打包外发。合规检查按 bo 的规定本阶段不做。

## 来源与额度
- 全部件：**自制脚本｜待策划审**（`_src/build_ui2_p1min.py`：SVG 形状经 cairosvg 渲染，再用 PIL 加阴影和外发光；@1x 与 @3x 各自按 viewBox 矢量重绘，不是位图放大）。
- 生图：**没调用** Seedream / gpt-image-2（矢量图标在 120 圆钮和 136 卡片上已经够辨认），所以没有 `raw_seedream/`。实耗 AFP：Seedream 0，gpt-image-2 0，合计 0。
- 贴图里**没有任何字**：tab 标签、「开播 / 下一步」、按钮名都由程序渲染。图标全部原创，不用真实平台 logo 或已有游戏 IP。

## 目录
```
ui/ui2/*.png              43 件 @1x + 43 件 @3x（透明 RGBA）
ui/ui2_9slice.json        只含本包新 key：ui2_actionbar_9s（字段同 ui_9slice.json）
ui/ui2_theme_p1min.json   schema ui2.theme.1 片段（extends default；不覆盖 P0 theme）
overview/ui2_P1min_overview_dark.png   深色底总览（Noto Sans CJK SC）
_src/  build_ui2_p1min.py · overview_selfcheck.py · write_meta.py · files.json · selfcheck_raw.txt
selfcheck.md  MANIFEST_sha256.txt
```

## 件清单（@1x 尺寸；@3x = ×3）
| key / 态 | 尺寸 | 说明 |
|---|---|---|
| `ui2_tab_{building,streamer,staff,deco,more}_{normal,selected,disabled}`（15 件） | 136×184（可视 128×176，四边各留 4px 阴影/光边） | 自带底的卡片。图标在上半区（中心 y≈66），下半区 y≈118–158 留给程序标签（textKey `nav.tab.*`：公司/主播/员工/装修/更多）。normal 是 cream 面加 apricot 唇；selected 是 coral 面加 honey 外光，图标放在 cream 圆托上并抬高放大，标签用 cream；disabled 去饱和。图标：公司=挂小旗的小楼，主播=话筒加星，员工=两个人，装修=油漆滚筒，更多=2×2 色块 |
| `ui2_btn_go_{normal,pressed,disabled}`（3 件） | 260×200 | coral 渐变大圆角钮，honey 内环和外光，角上有小星。文案在「开播」/「下一步」之间切换（`nav.go.stream` / `nav.go.next`），文字中心 (130,88)。pressed：面下移 4px、整体暗 8%；disabled：去饱和 |
| `ui2_actionbar_9s` | 360×180 | cream 圆角条，圆角 40，描边 6，底部 26px apricot 带，阴影在切片内。条高 180，横向拉伸；切片见下 |
| `ui2_actionbtn_{assign,stream,rest,repair,dress,gift}_{normal,pressed,disabled}`（18 件） | 120×120 | 120 圆钮加图标，无字。指派=人加 mint 箭头徽，开播=支架手机加直播红点，休息=弯月加小星，维修=锤子，换装=衣架连衣裙，送礼=礼盒。pressed：面和图标下移 4px、暗 8%；disabled：去饱和 |
| `ui2_cam_btn_{room_fixed,follow_zoom,overview_live}_{off,on}`（6 件） | 120×120 | off 是 cream 面；on（当前镜头）是 honey 面加 coral 内环和 honey 外光。图标：固定全房间=取景四角框里一间小房，推近拉远跟随=放大镜里一个人加跟随角标，全景/直播特写=横屏全景框叠竖屏手机加红点 |

## 九宫格实测（px，left/right/top/bottom）
| key | @1x size | @1x 切片 | @3x size | @3x 切片 |
|---|---|---|---|---|
| ui2_actionbar_9s | [360, 180] | 50 50 54 50 | [1080, 540] | 149 149 159 150 |

切片是脚本实测的：取和段首行/列相比像素一致（容差 1）的最长一段作为拉伸区。条高按规格固定 180，拉宽时角和边线不变；竖向也有 76px 的一致段可拉，但规格要求固定高。

## 接入备注（2026-11-10 策划已确认，写入 theme `layout`；贴图未重画）
- **底栏 y1700–1920**：不要为对称减少 tab。五档等距排开（卡片 136×184，边距 16，中心 x 84/312/540/768/996，卡片 y1718）。大按钮 260×200 中心固定 x540（x410–670），稍微叠在五档上方（y 约 1710）。总览图里左二右三的坐标只作参考，不作最终布局。V1 先用 tab 自带底卡片直接叠房间，暂不补整条砌台背景。
- **操作条 y1520–1700**：拉到 1040×180，x20；按钮 y1544，按显示的钮数均分。按选中对象过滤由程序做，隐藏的钮不留空位；升起动画 200ms（`motionMs.actionbar`）。
- **镜头钮 x940–1060 / y1380–1500**：V1 默认收起/展开，不改三颗常驻、不缩小贴图。收起时槽里只放当前 `_on`；点开后另两颗 `_off` 向上排（建议 y 1252–1372、1124–1244，不得超过操作条下沿）。再点当前钮或点空白收起；点某一 `_off` 则切换并收起。展开/收起约 200ms（`motionMs.camExpand`）。
- 色板沿用 P0 default.colors。灰 `#BDB2AA` 已合方案（D 档底；disabled 仍以去饱和为主），不返工。字体是 Noto Sans CJK SC。
- 台账：本批没合入 `美术/_pipeline` 主台账；合入时来源写「自制脚本｜待策划审」。
