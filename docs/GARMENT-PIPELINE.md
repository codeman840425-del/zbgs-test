# 独立新增服装生产接口（当前体型试验）

本轮产物是 **深青及膝运动裤 `athletic-bermuda-v1`**，由许可允许修改的原短裤版型衍生。它有新增裤腿、真实裤口翻边与独立侧条几何，作为独立带权重GLB加载；不是原短裤换色或改名。当前残缺人体仍是旧代表模型，未被这项工作变成正式可捏人基模。

## 文件与身份

| 文件 | 用途 |
| --- | --- |
| `assets-source/garments/athletic-bermuda-v1.json` | 可读版型/间隙/长度/材质参数 |
| `scripts/garments/build-bermuda.py` | 确定性几何生成、权重转移与GLB导出 |
| `scripts/garments/inspect-source.py` | 原短裤实际焊接拓扑盘点 |
| `scripts/garments/requirements.txt` | 本次运行的numpy/scipy固定版本 |
| `prototype/public/assets/garments/athletic-bermuda-v1.glb` | 独立运行资产，145,520字节 |
| `prototype/public/assets/garments/equipment.json` | 装备ID/槽位/SHA/许可/骨映射/静止绑定清单 |
| `prototype/src/equipment.js` | 与动作控制器无依赖的通用装备加载器 |
| `assets-source/garments/build-report.json` | 导出统计、范围、源身份与许可 |

固定输入 `avatar.vrm` SHA-256：`12c2b97e95e700783a6a550dc0eee2d7880aeedccef9ae67bc4c5a2f0f2631a2`。

输出GLB SHA-256：`d21e897c1f475e74cf9b1f5c77a29831f986a547df58d9b0c2346b693d39dee6`。

## 为什么当前素材可做这项有界试验

实际原短裤primitive为470个带UV缝顶点、608三角；按位置焊接后316点、两条各12边的真实裤口，无非流形裤口分叉。来源不是简单柱体占位。生成保留其腰/臀/裆原版型，做一次表面细分，每条裤口得到24边，再增加12环延伸到静止y=0.49m（膝骨约0.5154m），形成及膝轮廓。裤口有3mm内折厚度与18mm折回；侧条是独立窄面，不借助原短裤贴图改色。

结果为1960个唯一顶点、3820三角、3个材质primitive，使用9个现有raw骨；1928点拥有多个正权重。每primitive共享同一位置accessor，部分检查器把三个primitive相加显示5880点，这不是5880个唯一坐标。原始权重最大和误差约1.23e−7；Three加载后检查约4.02e−8。

上段保留原版型权重；新增裤腿通过同侧实际腿部皮肤的邻近顶点转移权重，再平滑连接。没有只把整条裤腿绑到一个刚性骨。使用原VRM的实际raw辅助骨与inverse-bind矩阵，不把normalized骨直接冒充模型骨。

此方法只证明该版型、该体型可走通独立资产管线。没有自动生成任意衣型、自动缝纫、通用体型重适配或衣服自碰撞。

## 生成与校验

```powershell
# 首次环境需要时安装固定依赖，可放入独立venv。
python -m pip install -r scripts/garments/requirements.txt
python scripts/garments/inspect-source.py
python scripts/garments/build-bermuda.py
python scripts/qa-asset.py garments/athletic-bermuda-v1.glb
```

避免覆盖正在验收的运行目录时：

```powershell
python scripts/garments/build-bermuda.py --output-dir output/garment-rebuild --report output/garment-rebuild-report.json
Get-FileHash prototype/public/assets/garments/athletic-bermuda-v1.glb,output/garment-rebuild/athletic-bermuda-v1.glb -Algorithm SHA256
```

已实际重建并核对两份字节哈希完全一致。生成器首先核对输入SHA；模型替换后会拒绝继续，不静默沿用旧版型。输入VRM从未被生成脚本改写。

## 加载与装备接口

```js
import { createEquipment } from './equipment.js';
const equipment = await createEquipment({
  vrm,
  parent: vrm.scene,
  avatarSha256: '12c2b97e95e700783a6a550dc0eee2d7880aeedccef9ae67bc4c5a2f0f2631a2',
});
await equipment.load('athletic-bermuda-v1'); // ready之前预载
await equipment.equip('athletic-bermuda-v1');
equipment.unequip('bottoms-overlay');
// 角色真正卸载时调用；普通动作切换、暂停与reset不要dispose。
equipment.dispose();
```

- `list()`提供清单中名称/槽位/限制；`get(id)`提供已加载container/meshes/stats。
- `load`验证模型身份、声明骨映射、全部对应inverse-bind矩阵（容差1e−5）、GLB字节长度/SHA、实际蒙皮属性与权重和。
- 映射先使用manifest明确的raw骨名；缺失时只有manifest提供人形语义才尝试该语义raw骨。静止绑定不一致仍拒绝，绝不以猜骨名掩盖不同体型。
- 运行只附加衣服网格，不把导出文件的副骨架挂到角色；所有衣服Skeleton直接引用原角色raw骨。因此不需要新每帧动画调用或人物控制器修改。
- 每槽位请求版本防止旧异步equip完成覆盖新选择。unequip可取消尚未完成的装备意图；`equip`返回`applied:false`表示其请求已过时。dispose期间pending加载完成会释放新资源并拒绝请求。
- 原模型的body、短裤、上衣、材质和可见性均不由equipment修改。服装只显示/隐藏自己的container。
- `avatarSha256`必须来自调用方实际加载资产的已验证身份。不能传旧SHA来绕过新基模不兼容检查。

建议assets.js集成第3套时：`outfit===2 && !debugBody`调用equip，否则unequip；原裙仅`outfit===1 && !debugBody`可见。诊断基础模式隐藏附加新裤，但保留原衣片。应把所有服装预载放入ready之前，菜单不必等远程临时资源。页面名称明确为“新增裤装试验”。本代理未直接编辑assets.js/main.js。

## 已验证与未验证

独立静态测试候选为 **923d1e79baea**，在复制的原角色入口中注入上述接口，避免开发页HMR移除调试注入装备。它不是主代理最终构建ID。

实际截图：`output/garment-valid-front.png`、`garment-valid-side.png`、`garment-valid-back.png`、`garment-valid-sit-side.png`。均确认equipment容器visible。原始开发页的`garment-side/back/sit-side.png`曾在HMR后退回原短裤，**无效且不可用作新裤验收证据**。

初次服装腰部整体外扩7mm从T恤两侧露出，已按真实衣层关系把上腰间隙过渡到0.8mm；并未隐藏上衣或削减动作。最终站立三视图可见新裤膝部轮廓、翻边和侧条，坐姿跟随屈膝且未见大块露腿。坐姿T恤后侧下摆仍有小片深青暴露，仅凭截图不能判定是三角穿插还是原下摆开口；此项保留待主代理整合的完整走/坐/舞及三角检测。没有将静帧跑通称为所有动作服装验收通过。

实际负向与生命周期回归（`assets-source/garments/garment-runtime-report.json`）：

| 场景 | 结果 |
| --- | --- |
| 不同模型SHA | 明确拒绝，不尝试套到新完整人体 |
| 任一bind矩阵偏移1cm | 明确拒绝，要求重适配/重导出 |
| 延迟GLB fetch期间unequip | 请求完成后applied=false、容器不可见 |
| 延迟GLB fetch期间dispose | 完成后抛已释放错误，无新增衣服组残留 |
| 20次卸下/装备 | 复用同一geometry/Skeleton、只保留一个装备组 |
| 原蒙皮可见性 | 完全不变 |

这些测试分别人为延迟网络响应，未仅凭代码判断没有竞争。正式可重放入口为：

```powershell
# 在干净检出中先在prototype目录执行npm ci，并构建/启动待测页面。
$env:QA_BUILD='c14a9e3b4083'
node scripts/garments/qa-equipment-contract.cjs http://127.0.0.1:4191
```

脚本使用已锁定的Playwright和Vite传递依赖esbuild，不依赖临时分块文件名、不修改产品文件；测试侧将当前检出的equipment.js打成独立IIFE注入测试页面，对页面的实际VRM执行负向加载/延迟取消测试，另对页面实际预载装备执行20次复用测试。报告同时记录页面buildId与测试源SHA，避免把不同检出的加载器混淆为同一构建。需要本机Chrome；测试结束自动关闭独立无头浏览器。

已在主代理整合构建 **c14a9e3b4083 / 4191** 实际重跑全部通过，输出 `output/playwright/garment-contract/c14a9e3b4083/observations.json`。适配器测试源SHA为 `4708d0e20ac1b0977f798ca55ac0ad5cbac5e6e0897d2d98acf849c9a196c160`。

`scripts/garments/*.generated.js`全部是当时的临时诊断，不属于生产流程；可能含固定候选分块URL、依赖调试注入对象或对应截图路径。不要将这些文件直接用作新构建回归。可重复生产入口为build-bermuda.py，稳定运行合约入口为qa-equipment-contract.cjs。

## 许可与下一件服装规则

源作者 **pixiv Inc.**，源名 **VRM1_Constraint_Twist_Sample v1.0.1**，版权 `(c) 2022 pixiv Inc.`，来源固定提交 `ff42fae4fcee1fcbca2cd262c7f5f8cbddeaf5ab`；详见项目 `docs/ASSETS.md` 和 `docs/asset-source.json`。

源文件内的 VRM Public License 1.0 元数据允许修改再分发、企业商业使用、任何人控制，允许原资产再分发，不强制署名，禁止反社会/仇恨用途；具体完整字段保存在装备清单、GLB extras和build-report。源许可地址 `https://vrm.dev/licenses/1.0/`。生成版型包含源短裤衍生几何，**不能标为CC0，也不能因项目代码许可而把该几何改标MIT**。本项目仍保留作者与修改记录，不暗示pixiv为游戏背书。

下一件衣服需新增自己的源参数或DCC源、源身份与许可、独立GLB、manifest条目和适用体型；继续通过通用加载器，不把服装特例写进人物动作控制器。当前manifest对新完整人体必须拒绝，未来适配需重新制版/权重/绑定验证，而非只改compatibleAvatarSha256。
