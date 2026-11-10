# ui2_P1rest_1110 · V1 网游化 UI P1 余件（待策划审）

2026-11-10｜美术和动画岗｜依据 `策划/V1_界面与固定特效实施方案_20261109.md` §2.3 后四行（在线点、换装槽、邮件、设置）和 §2.4 人物面板条，以及 `美术/网游化界面方向_V1_20261109.md` §3 / §4 的相关条目。风格接续 `ui2_P0_1109`、`ui2_P1min_1110`（A 暖阳奶油；色板、描边 6px、唇边、高光和外光手法相同）。

**范围**：只做 P1 余件，即在线点、换装槽、邮件入口、设置入口、人物面板条。没做 P2（直播 HUD、礼物补缺），没做角色动作、换装分件、走位、主房间、城市外景。
**没动的东西**：`ui2_P0_1109/` 和 `ui2_P1min_1110/` 的 MANIFEST sha256 全部复核一致；`dyn_v1_tangtang_1109/`、主目录 `美术/ui/ui_9slice.json`、主目录旧 UI、q6/测试/程序目录都没碰。没删任何已有素材，没写主台账，没打包外发。合规检查按 bo 的规定本阶段不做；质量自检照做（见 selfcheck.md）。

## 来源与额度
- 全部件：**自制脚本｜待策划审**（`_src/build_ui2_p1rest.py`：SVG 形状经 cairosvg 渲染，再用 PIL 加阴影和外发光；@1x 与 @3x 各自按 viewBox 矢量重绘，不是位图放大）。
- 生图：**没调用** Seedream / gpt-image-2（矢量件在 24/72/160 和 32 高条上已经够用），所以没有 `raw_seedream/`。实耗 AFP：Seedream 0，gpt-image-2 0，合计 0。
- 贴图里**没有任何字**：槽名、条名、数字、设置选项都由程序渲染。锁是图形，没写「锁」字。图标全部原创，不用真实平台 logo 或已有游戏 IP。

## 目录
```
ui/ui2/*.png              39 件 @1x + 39 件 @3x（透明 RGBA）
ui/ui2_9slice.json        只含本包新 key：15 个 ui2_panel_*_9s（字段同 ui_9slice.json）
ui/ui2_theme_p1rest.json  schema ui2.theme.1 片段（extends default；不覆盖 P0 / P1min theme）
overview/ui2_P1rest_overview_dark.png   深色底总览（Noto Sans CJK SC）
_src/  build_ui2_p1rest.py · overview_selfcheck.py · write_meta.py · files.json · selfcheck_raw.txt
selfcheck.md  MANIFEST_sha256.txt
```

## 件清单（@1x 尺寸；@3x = ×3）
| key / 态 | 尺寸 | 说明 |
|---|---|---|
| `ui2_dot_online_{on,off,busy}`（3 件） | 24×24 | 外圈 line 色加 cream 细环，内点：on 是 mint 加高光，busy 是 honey 加一道短横，off 是灰 #BDB2AA 加中心凹点（除了颜色，形状也能区分）。on 只出一帧静态，呼吸由程序补间（alpha 0.6→1，1600ms 往返）。只用在世界层门牌和社交栏头像上，**不进顶栏** |
| `ui2_slot_{outfit,acc_top,acc_hair,acc_eye}_{empty,filled,selected,locked}`（16 件） | 160×160（可视 148×148，四边留 6px 阴影/外光） | cream 圆角卡加 apricot 唇。**empty**：内托是虚线框，淡类别剪影（衣服=连衣裙、头顶饰=贝雷帽、发饰=蝴蝶结发夹、眼饰=圆框眼镜），灰稀有度条。**filled**：内托留给程序叠物品，左上角是类别小徽，稀有度条默认 apricot。**selected**：filled 加 coral 双环、honey 外光和角星。**locked**：整卡去饱和，中间一个灰锁图形，灰条。底边稀有度条是 pill：x24 y134 w112 h8，2px line 描边 |
| `ui2_btn_mail_{normal,unread}` | 72×72 | 72 圆钮（同 P0 关闭/返回：描边 5、唇 6），信封图标加 coral 心形封蜡。unread 在右上加 berry 红点（cx57 cy14 r8.5，cream 环加 line 外圈） |
| `ui2_btn_settings` + `_pressed` / `_disabled` | 72×72 | 同上手法，mint 齿轮，无字。pressed：面下移 3px、暗 8%；disabled：去饱和。参观权限三选（所有人 / 好友 / 仅自己）由程序用 P0 件组成，不出单独皮肤 |
| `ui2_panel_{boss_energy,boss_fans,streamer_fans,streamer_heat,streamer_stamina}_{empty,full,low}_9s`（15 件） | 200×32（横向 9-slice，固定高） | **empty** = 底槽：6px 描边胶囊加灰槽（耗尽/空就是变灰；任何数值下也作底槽用）。**full** = 语义色填充层：精力 peach、粉丝 coral（老板侧和主播同色）、热度 honey、体力 mint。**low** = 告急填充层：berry 加浅莓色细光边（低于 20% 时用）。填充层和底槽同画布同原点，直接叠，填充实体在 x9…宽−9、y9…23 |

**稀有度条色（2026-11-10 策划已确认）**：V1 默认 4 档：N apricot `#FBE3C8`（贴图里烘的就是这档）、R mint `#6FD3B0`、SR berry `#FF5C8A`、SSR honey `#FFC845`；空槽 / 锁定用灰 `#BDB2AA`。其他档由程序在 `rarityStrip` 矩形上按档色重画同形 pill，坐标写在 theme 的 `layout.dressSlots.rarityStrip`。以后若经营档名不同，只改映射，不重画槽。

**面板条合成规则**：底槽横拉到条宽 W；值>0 时叠填充层，比例≥0.2 用 `_full_9s`，<0.2 用 `_low_9s`，填充宽 = 18 + 比例×(W−18)。填充宽小于 33（切片 left+right+1）时，先用最小宽件再裁切，避免端头挤压变形。数字由程序渲染。不改顶栏资金色。

## 九宫格实测（px，left/right/top/bottom）
| key | @1x size | @1x 切片 | @3x size | @3x 切片 |
|---|---|---|---|---|
| ui2_panel_boss_energy_empty_9s | [200, 32] | 16 16 16 15 | [600, 96] | 48 48 48 47 |
| ui2_panel_boss_energy_full_9s | [200, 32] | 16 16 16 15 | [600, 96] | 48 48 48 47 |
| ui2_panel_boss_energy_low_9s | [200, 32] | 16 16 16 15 | [600, 96] | 48 48 48 47 |
| ui2_panel_boss_fans_empty_9s | [200, 32] | 16 16 16 15 | [600, 96] | 48 48 48 47 |
| ui2_panel_boss_fans_full_9s | [200, 32] | 16 16 16 15 | [600, 96] | 48 48 48 47 |
| ui2_panel_boss_fans_low_9s | [200, 32] | 16 16 16 15 | [600, 96] | 48 48 48 47 |
| ui2_panel_streamer_fans_empty_9s | [200, 32] | 16 16 16 15 | [600, 96] | 48 48 48 47 |
| ui2_panel_streamer_fans_full_9s | [200, 32] | 16 16 16 15 | [600, 96] | 48 48 48 47 |
| ui2_panel_streamer_fans_low_9s | [200, 32] | 16 16 16 15 | [600, 96] | 48 48 48 47 |
| ui2_panel_streamer_heat_empty_9s | [200, 32] | 16 16 16 15 | [600, 96] | 48 48 48 47 |
| ui2_panel_streamer_heat_full_9s | [200, 32] | 16 16 16 15 | [600, 96] | 48 48 48 47 |
| ui2_panel_streamer_heat_low_9s | [200, 32] | 16 16 16 15 | [600, 96] | 48 48 48 47 |
| ui2_panel_streamer_stamina_empty_9s | [200, 32] | 16 16 16 15 | [600, 96] | 48 48 48 47 |
| ui2_panel_streamer_stamina_full_9s | [200, 32] | 16 16 16 15 | [600, 96] | 48 48 48 47 |
| ui2_panel_streamer_stamina_low_9s | [200, 32] | 16 16 16 15 | [600, 96] | 48 48 48 47 |

左右切片是脚本实测的：取逐列像素一致（容差 1）的最长一段作为拉伸区，同一条的三态取最大值，换态时不会跳。条高固定 32，竖向只留 1px 中线（同 P0 固定高件的做法）。

## 接入备注（2026-11-10 策划已确认，写入 theme `layout`；贴图未重画）
- **邮件 / 设置**：留在顶区右上，不改两行、不并进公司 5 槽。邮件 x896–968，设置 x976–1048，y16–88，间距 8，右边距 32。有「其他工种」槽时资金胶囊收到 232、其余到 136（9-slice 可收），盘面右沿最多到 x880；没有工种槽时用默认宽。邮件按下由程序按 72 圆钮规则补：下移 3px、暗 8%。
- **在线点**：社交栏头像右下角，或世界层名牌左侧。玩家自己的点跟社交栏头像走。
- **换装槽**：物品区 x19 y19 w122 h106（程序等比放入）；类别名走 textKey `dress.slot.*`，默认不显示。稀有度 4 档见上，已确认。
- **面板条**：精力 peach、粉丝 coral（老板侧与主播同色）、热度 honey、体力 mint；低于 20% 用 berry 告急；空/耗尽用灰底槽。
- 镜头钮、底栏、操作条按策划 11-10 确认的口径执行（P1min theme 已改），本包不涉及，也没改 P1min 贴图。
- 色板沿用 P0 default.colors；灰 #BDB2AA 已合方案，本包沿用。字体 Noto Sans CJK SC。
- 台账：本批没合入 `美术/_pipeline` 主台账；合入时来源写「自制脚本｜待策划审」。
