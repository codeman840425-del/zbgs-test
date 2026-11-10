# ui2_P2_1110 · V1 P2：直播 HUD 固定件 + 礼物补缺（策划已确认）

2026-11-10｜美术和动画岗｜依据 `策划/V1_界面与固定特效实施方案_20261109.md` §2.5、§3（对照 `策划/M2_改动包/美术配合/②礼物全表.md`，冲突以实施方案为准）。风格接 `ui2_P0_1109`、`ui2_P1min_1110`、`ui2_P1rest_1110`：A 暖阳奶油色板，描边 6px #7A4E3A，唇边、高光和外光手法相同。

**范围**：只做 P2：直播 HUD 5 个 key、3 个正式礼物图标（点赞手、路边小黄花、奶茶）、小蛋糕正式 M 时间轴。没做角色动作、换装分件、走位、主房间、城市外景；没重做试玩 7 套和 M3 10 套。
**没动的东西**：`dyn_v1_tangtang_1109/`、`ui2_P0_1109/`、`ui2_P1min_1110/`、`ui2_P1rest_1110/`、`gift_trial_M2_1104/`、`giftfx_M3_1105/`、主目录 `美术/gifts/` 和 `美术/ui/ui_9slice.json`，开工前后共 690 个文件 sha256 一致（见 selfcheck）。q6/测试/程序目录没碰，FxPlayer 没改。没删任何素材，没合主台账，没打包外发。合规检查按 bo 的规定本阶段不做；质量自检照做。

## 来源与额度
- 全部件：**自制脚本｜待策划审**。`_src/build_ui2_p2.py` 画 HUD 和图标（SVG 经 cairosvg 渲染，再用 PIL 加阴影和外光；@1x/@3x、256/@2x 512 各自按 viewBox 矢量重绘，不是位图放大）。`_src/build_cake_m.py` 写蛋糕 M 轴，并按 `FxPlayer_MT.ts` 语义用 Python 模拟出预渲染帧。
- 生图：**没调用** Seedream / gpt-image-2。三个图标脚本版在 256、96（托盘槽）、64 下都能认出来，所以不用生图，也没有 `raw_seedream/`。实耗 AFP：Seedream 0（flash 0 张），gpt-image-2 0，合计 0。
- 贴图里**没有任何字**：开播灯只有灯泡和电波图形，没写「ON AIR」，也没有平台名或 logo。人气档、弹幕、价格、干预卡标题都由程序渲染。图标全部原创，奶茶杯身没有字和标，不仿真实品牌或已有游戏 IP。

## 目录
```
ui/ui2/*.png                 21 件 @1x + 21 件 @3x（透明 RGBA）
ui/ui2_9slice.json           只含本包 6 个新 key（字段同 ui_9slice.json）
ui/ui2_theme_p2.json         schema ui2.theme.1 片段（id p2live，extends default；不覆盖 P0/P1min/P1rest theme）
gifts/gift_{like,flower,milktea}.png + @2x   256² / 512²，留边 ≥28 / ≥56
fx/gift_m/cake/fx_gift_m_cake.json           小蛋糕 M 时间轴 2.2s
fx/gift_m/cake/fx_gift_m_cake_seq_{0,1,2}.png/.json   预渲染图集（24 帧 768²，TexturePacker hash）
fx/gift_m/cake/textures_resolve.json         贴图只读来源对照
overview/ui2_P2_overview_dark.png            深色底总览（Noto Sans CJK SC）
_src/  build_ui2_p2.py · build_cake_m.py · write_meta.py · overview_selfcheck.py · files.json · selfcheck_raw.txt
selfcheck.md  MANIFEST_sha256.txt
```

## A. 直播 HUD 件（@1x；@3x = ×3）
进入 `cam.overview_live` 特写端时替换顶区（公司盘面隐藏），社交栏隐藏；全景端仍用 P0 公司盘面。

| 规格 key | 本包文件 / 态 | 尺寸 | 说明 |
|---|---|---|---|
| `ui2_live_onair` | `ui2_live_onair_{off,on,hot}` | 192×96（可视 168×72，四边 12 留外光） | 灯牌：左边灯泡，右边三道电波。**off** 灰牌灰灯，关播；**on** coral 牌 berry 灯加 berry 外光，开播中；**hot** berry 牌加 honey 外光和角星，开播且人气档 ≥ 3 时 on→hot（第一天经营规格 C-12 / `live.tier.up`）。程序接三态，已交贴图可直接用。on 可选整灯微呼吸（1200ms，程序补间） |
| `ui2_live_pop_tier` | `ui2_live_pop_tier_9s`（底胶囊）+ `_badge_{0..4}` + `_pip_{on,off}` | 360×64（横向 9-slice）/ 72×72 / 20×20 | 胶囊同 P0 HUD 胶囊手法。档徽 0 灰、1 mint、2 honey、3 coral、4 berry；心形加底部 N 个小点，3、4 档外圈加光芒，4 档加星（不靠颜色也能分）。4 颗 pip 亮 N 颗。档名走 `ui.live.pop.tier.0–4`（刚开播 / 暖场 / 热闹 / 火爆 / 出圈），文案走 `ui.live.pop.hud`。升档特效沿用 `gift_trial_M2_1104/fx_popularity/` 四档（1 confetti、2 sweep、3 heartrain、4 stagebeam），**不重出** |
| `ui2_live_danmaku_bg` | `ui2_live_danmaku_bg_{normal,gift,system}_9s` | 120×56（单行固定高，只横向拉伸） | cream 半透明（88–94%）胶囊，描边 3.5px（单行 56 高，已确认不用 6px；窗框/按钮仍 6px）。gift 是 honey 底加内圈 honey 线，system 是 mint 底。字由程序排，三态切片一致 |
| `ui2_live_gift_tray` | `ui2_live_gift_tray_9s` + `ui2_live_gift_tray_slot_{normal,pressed,selected,disabled}` | 240×200 / 144×168 | 托盘是 cream 95% 面板，带 apricot 托边。槽内图标区 cx72 cy66、96×96，由程序用 `gifts/gift_<id>.png` 等比叠入；价格 pill 在 x26 y124 w92 h28，数字程序排。pressed 下移 3px、暗 8%；selected 加 coral 双环、honey 外光和角星，pill 变 honey；disabled 去饱和。横滑和两端渐隐由程序 mask 做 |
| `ui2_live_intervene_card` | `ui2_live_intervene_card_9s` + `ui2_live_intervene_icon` | 192×192 / 80×80 | 模态小卡沿用 P0 窗框 token（圆角 24、描边 6、模态外光 honey 20%），本包自画：顶部 coral→peach 头带 44 高，底部 apricot 托边。top 切片 64 盖住整条头带。**没复制 U2 框**。角标是喇叭加小闪电。按钮用 P0 主/次钮，遮罩由程序画 |

### 九宫格实测（px，left/right/top/bottom）
| key | @1x size | @1x 切片 | @3x size | @3x 切片 |
|---|---|---|---|---|
| ui2_live_pop_tier_9s | [360, 64] | 32 32 32 31 | [1080, 192] | 96 96 96 95 |
| ui2_live_danmaku_bg_normal_9s | [120, 56] | 28 28 28 27 | [360, 168] | 84 84 84 83 |
| ui2_live_danmaku_bg_gift_9s | [120, 56] | 28 28 28 27 | [360, 168] | 84 84 84 83 |
| ui2_live_danmaku_bg_system_9s | [120, 56] | 28 28 28 27 | [360, 168] | 84 84 84 83 |
| ui2_live_gift_tray_9s | [240, 200] | 42 42 46 42 | [720, 600] | 126 126 138 126 |
| ui2_live_intervene_card_9s | [192, 192] | 48 48 64 48 | [576, 576] | 144 144 192 144 |

切片由脚本实测：取逐列 / 逐行像素一致（容差 1，跟段首比）的最长一段作拉伸区，再把 @1x/@3x 对齐成严格 3 倍（取两者较大值）。窗框类最低 48（同 P0），托盘最低 40。固定高件（人气胶囊、弹幕）只横向拉，竖向只留 1px 中线。

### 接入备注（2026-11-10 04:58 策划已确认，写入实施方案 §2.5 / §3 与 theme `layout`；贴图未重画）
- 顶区 y0–150：开播灯 x32 y28；人气档胶囊 x252–652 y28–92，徽章 x224 y24 压在左端头上，文字 x304 起，pip 中心 x556/578/600/622。
- 邮件 / 设置：按策划 11-10 口径保持 P1rest 位置，留在顶区右上，不改两行，不并进公司 5 槽。邮件 x896–968、设置 x976–1048，y16–88。直播顶区右沿 652，跟入口不冲突。全景端公司盘面照已定规则：有工种槽时资金胶囊收到 232、其余收到 136，盘面右沿 ≤ x880；没有工种槽时用默认宽。
- 弹幕：x32–712、y1040–1372，单行 56、间距 8，最多 5 行，新的在下。
- 礼物托盘：x32–920、y1392–1592。右沿留在 x920，避开镜头钮槽（x940–1060，y1380–1500）；下沿 1592 高于中间大按钮上沿（中心 y1710、高 200，上沿约 1610）。进入 `cam.overview_live` **特写端**时隐藏房间操作条（y1520–1700），把位置让给托盘；不要两行，不要并进操作条或公司 5 槽。全景端仍显示操作条、不用直播托盘。
- 干预卡：中心 x540，宽 720，最小高 480，y600 起。

## B. 三个正式礼物图标（本批新做）
| id | 显示名 | 造型（按全表外观描述） |
|---|---|---|
| `gift_like` | 点赞手 | 圆胖竖大拇指，四指圆胖叠在右侧，手腕一圈 honey 星光腕圈（三颗小星 + 点状光环 + 外围闪光） |
| `gift_flower` | 路边小黄花 | 五瓣 honey 小黄花，coral 花心带籽点，绿茎，叶子上挂一颗露珠 |
| `gift_milktea` | 奶茶 | 圆杯加封口杯盖，插 berry 粗吸管；奶茶色渐变，杯底 8 颗珍珠，杯腰是 peach 波点纸套，**杯身无字无标** |

规格：256² 和 @2x 512²，透明底，无字无标。脚本先在 4× 下量出包围盒（含阴影），再把整组矢量等比缩到 28…228 内，所以实测留边 ≥30（@2x ≥59）。@2x 是同一份 SVG 按 2 倍 viewBox 重绘的。
**合并时**：把本包 `gifts/` 的 3 对文件覆盖主目录 `美术/gifts/` 里的 item6 占位，覆盖前先备份；同名替换后 JSON 不用改。本包没有写主目录。特效直接复用 S1 模板 `gift_trial_M2_1104/fx_gift_trial/fx_gift_s1_lollipop.json`，程序换图标即可，S1 轴不重做。
**风格备注**：已有图标（蛋糕、金币袋、话筒）是 Seedream 生的厚涂小插画，本批三张是矢量平涂加渐变和高光，线色、描边粗细和色板一致，放进托盘槽也能认出来，但细节质感会平一些。策划已接受本批矢量版，不花约 180 AFP 补厚涂；质感差记上线前打磨，现图标不重画。

## C. 小蛋糕正式 M 时间轴 `fx/gift_m/cake/fx_gift_m_cake.json`
- 时长 **2.2s**，竖屏 1080×1920 设计，30fps 设计帧率。图层只用 rect / image / emitter / camera；缓动只用 backOut。字段格式对齐金币袋 M（`giftfx_M3_1105/fx/gift_m/coinbag/fx_gift_m_coinbag.json`），另加 `fallback`（指向 S2 轴）和 `beats`（节拍说明）两个只读说明字段。
- 节拍：0–0.45s 蛋糕从主播面前下方升起（y 0.74→0.50）；0.45s 落定，压扁回弹，出光环；0.48s 彩纸、星、心爆开，镜头轻抖 6px，奶油色微闪 10%；0.55–1.9s 樱桃上方小闪、四周闪光、心往上飘；0.6–1.7s 彩纸细雨；1.4–1.85s 蛋糕左右小摇一次；1.95–2.2s 淡出。
- lowres：发射数量 ×0.5，去掉 `rain`、`glowp` 两层；低档时播放器本来就会去掉 camera 层。
- 预渲染：24 帧 @24fps，768²，覆盖 0–0.96s（入场 + 爆点）。屏幕框 1000px，中心 (0.5, 0.52)，比金币袋的 0.46 低一点，因为蛋糕从更低处升起。分 3 页图集，每页 ≤2048²，不含全屏微闪和镜头抖动。
- **手机降档 / 关大特效**：沿用已交 S2 轴 `giftfx_M3_1105/fx/gift_s2/cake/fx_gift_s2_cake.json`（1.6s），原样保留，没改也没删。金币袋 M 2.2s 照旧沿用，没动。
- **贴图引用（本包不复制，没有新贴图）**：
  - `icon` → `../../../gifts/gift_cake@2x.png`：沿用主目录 `美术/gifts/gift_cake@2x.png`，写法跟已交 S2 蛋糕相同，不重出图标。
  - `rays / glow / glowp / ring / confetti / heart / star / sparkle` → `../../giftfx_m3_shared/fx_gm3_{rays,glow_warm,glow_pink,ring,confetti,heart,star,sparkle}.png`：只读引用 `giftfx_M3_1105/fx/giftfx_m3_shared/`。
  - 相对路径按合并后的主目录 `美术/fx/gift_m/cake/` 解析，跟 M3 包的口径一致（已确认）。FxPlayer 只按 basename 登记，只要 `gifts/gift_cake@2x.png` 与 `giftfx_m3_shared` 已经登记过就能找到。在本包目录里这些路径是悬空的，对照表见 `textures_resolve.json`。合并时把本包该目录拷进主目录，不在本包复制贴图。
  - 合并方式：把 `fx/gift_m/cake/` 拷进主目录 `fx/gift_m/`。

## 策划确认（2026-11-10 04:58，已写入实施方案 §2.5 / §3；贴图未重画，不补厚涂）
1. 礼物托盘用 x32–920、y1392–1592。特写端隐藏房间操作条，把位置让给托盘；不要两行，不要并进操作条。全景端仍显示操作条、不用直播托盘。
2. 开播灯要用 hot：关播 off、开播 on、人气档 ≥ 3 时 on→hot。程序接三态，已交贴图可直接用。
3. 弹幕单行高 56 时描边用 3.5px，可以；窗框/按钮仍 6px。
4. 接受本批矢量版点赞手 / 小黄花 / 奶茶，不花约 180 AFP 补厚涂。质感差记上线前打磨，现图标不重画。
5. 蛋糕 M 轴相对路径按合并后主目录解析、本包悬空、FxPlayer 按文件名登记，口径可以，同 M3 包。

台账：本批没合入 `美术/_pipeline` 主台账；合入时来源写「自制脚本｜待策划审」。
