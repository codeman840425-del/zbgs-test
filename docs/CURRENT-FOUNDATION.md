# 当前角色基础工程恢复入口

更新2026-11-17。M2未完成，M3未授权。完整规格docs/research/M2-COMPLETE-CUSTOMIZATION-LONG-GOAL-v2-2026-11-16.txt；CAPABILITIES是唯一能力事实。不要重做已验源/衣物，拒绝的怪异批次不得换标签通过。

## 最新固定交付

- 工作台固定http://127.0.0.1:4196/?workbench=appearance，source b27eb47bf57df0058d210318e521e7751fde60e3，build193bbbf64323，experiments/native-pair-fixed-v1/prototype/dist。delivery/appearance-workbench.json；上版f2df保delivery/history/appearance-workbench-f2df648c612b.json，c3e及更早树同样保留。4174历史媒体，4195封M1，不新增常驻端口。
- 外观菜单男女各有“原生可编辑候选 · 接入验证”：female843ac/native-female-843ac-v1、male7586/native-male-7586-v1。仅自己的原发原色/独立三衣，女有改袖Top。未验发肤眼唇配色UI禁用。旧男女样件保留，15失败批次只在检查区，不称八预设完成。
- 固定构建npm ci/build过。native-workbench-193b-v1真实菜单旧女→新女→旧男→新男→旧女，无新document加载；基础/穿回/衣装、禁用提示和证据入口过。4196 HTTP身份回读在native-workbench-release-193b-v1。
- native-{female,male}-room-193b-v1分别真实factory（非overlay）穿衣/基础保鞋原发/穿回、配方同页和关闭后恢复、走停/接近椅子/坐起/离开家具后短舞/idle，1×原片各约35秒。女配方136993B，男81119B。root看静态与男性全片71个0.5s帧；正常速度人工自然度、近景接触仍未验。女落座长发外扬保问题，基础不是裸足验收。不要据这两段说新源全部动作/表情/装备/双实例隔离通过。

## 已实际跑通的制作链

- Studio2.16.0+BepInEx IL2CPP be.791+mcjo79 Bridge0.15，experiments/tools/vroid-mcp-bridge-0.15.0/app-2.16，7811内部桥。后台call.py已证，不需桌面。froz6469独立lab只补表情/customitem，不替主桥。
- 女原.vroid311a1bd0/VRM78912a7a，男原.vroidc936b241/VRMa18a2d11在assets-source/vroid-bridge-study-v1/generated。源25女参数保存冷开已核；其余工具枚举不当全部可用。源/许可meta不静默改，当前仅内部技术候选，VRoid内置素材不是CC0。
- vroid-expression-study-v1：Joy眉毛100→65保存/冷开/导出且同房间表情证据已封。vroid-customitem-study-v1：袖长66→56保存customitem、新进程应用与冷开，direct/reused VRM同6a32481e。不要重复这些原生操作。
- 原生独立衣物v5已修骨名清理映射/MToon首次update(0)，86d4各4cycles1×与原嵌衣对照通过限定检查。新袖GLB75c113在原78912和新843ac各自fit，不共用假SHA。
- 女完整皮肤843acca：保原160nodes/130skin，只换原生卸Tops恢复Body PNG5bf136；男7586d3bc：保91nodes/79skin，换男原生PNGcfd186。两者都有原source+donor.vroid与离线build、独立读回/重建/错源拒绝；没有合并后的单一.vroid，不声称原生工具可直接重开派生资源。
- 新男包native-vroid-male-{preflight,skin-recovery,unmasked-base,equipment,body-texture-fit}-v1已封。实际原生卸Tops保存/冷开/导出18请求完成后恢复原窗口。男独立三衣79骨/IBM/材质实际loader三姿CPU最大约21nm、误源/坏绑定拒绝；sourceFloorY=-1.1503509525979781e-6。原生PNG与三衣CPU包root逐核159文件SHA/index字节。
- 公共body-texture-coverage与独立admissions数据只放女843ac+003e/男7586+c432两对；保持sampler/MASK/装备规则/owner/prepare提交检查，男女CPU隔离/延迟/过期prepared/未知清单拒绝过。独审发现旧调用方ids数组别名，已复制快照修复；原失败和修后结果在native-body-texture-multi-source-v1/ids-snapshot-fix-v1。模块新SHAb102d83c，admissions f97da841。不是任意新图可进。
- stage-native-factory.py女、stage-native-male-factory.py男固定SHA导出public，相对URL保持原manifest，错源/冲突写前拒绝，重复执行不改一致产物。普通衣物没有新增人物控制器。

## 已修问题与保留失败

- a462/build58f坐入失败：曲线碰椅角clearPath吞afterWalk。dcf/build7871首修可坐入，但独审发现桌边浅角度10s/1200次无进展。f749/buildf2df及当前b27/193b补recover小角度pivot与无进展失败退出，独审反例一次恢复约2.77s完成，失败/取消释放、新请求、开放960子步等值过。原报告和录像都保，不能把CPU当脚步视觉通过。
- 7871-v1舞蹈在椅旁被拒而旧脚本未断言；v2改真实任务先离开家具再确认dance状态，保失败而不改空间门。
- UI f2df-v1误把history.replaceState的framenavigated当页面刷新；v2和193b以document请求+window身份核，未改产品来迎合测试。

## 接续主包

1. 新男女factory基础入口已可用，继续补本次新源自己的近景表情/实际接触和双实例GPU隔离，保既定轻微穿插尺度，不重开封女裙与原30秒舞。
2. 以已验原生可编辑源继续真实面部/体型/发型/配色制作样件和衣物适配，优先解决共用接口，不恢复自拟截面批量怪预设。完整八代表及M2 v2其它必需项仍欠，不缩范围、不直接开M3。
3. 自适应关节：Mink原作者例与VRM69raw/54normalized CPU FK回读过；还没有人体限位/碰撞代理/短舞优化通过，不改封30秒舞。
4. 原生编辑工具是可替换离线producer，游戏运行不需要Studio。关闭工具后自主修改能力逐项验证，VRM不等于完整捏人参数。官方guidelines的生成输出应用许可与个人自用例外分开核，不为旁问重写编辑器。

## 恢复、并行与备份

- 当前已核远端21741e203b9251be138b097e9c021cf0e98ca5c3，包含b27/193b男女源/独立装备/公共覆盖与实际房间、UI证据；ls-remote与本地一致。核验回执随后记录于native-workbench-release-193b-v1/remote-backup.json。
- 已知requested配置：face_target_feasibility=gpt-6-astra/high；asset_budget/http_transport_review=gpt-6.1-sol/high；派工JSON保难度理由，provider/hook实际拦截未独立暴露。当前三者有界包已交，不假称仍在跑。
- 桌面未接管；MCP导出窗口已释放。2.14卸载成功且17890/17891关闭，3旧目录清理被自动策略拒绝约2.09GB残留，保evidence/vroid-214-retirement-v1，不绕过或称全清。
- 公司副总工边几e1b独立交付已收，角色本轮不stage公司dirty，不改公司职责；C3/普通机未验。普通电脑目前无设备，不用4090或限速代替通过。
