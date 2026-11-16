# C2空间工厂与门户几何

实现为prototype/src/company/space.js，验证入口为node scripts/company-platform/qa-space.mjs。28项CPU检查通过，实际输入SHA和逐项结果见report.json。当前配置复用已知显式请求gpt-6.1-sol/high，difficulty complex，理由为四档统一层级、容量和跨区域门户几何。实际provider配置和桌面Hook拦截未独立验证。

createScaledCompany(input,catalog,templates)返回现有company-layout@1文档。inspectCompanyConnections(document,catalog,templates)返回capacity和逐层连接几何。所有设施沿prepareCompanyChange创建，模板与资源仍使用library-catalog和templates，空间模块没有角色、导航或渲染实现。

输入为id、name、scale、floorLayouts及floors。floors显式列出各层rooms，每房声明purpose，可提供stations、sofaVersion或furniture。缺省stations为0，rest的sofaVersion为1或2，work/training可显式选desk-chair。其他未列字段拒绝。floorLayouts为parallel/turned序列并按层循环，turned的第二工位实际变为[1.6,0,-0.3]及PI/2。

公司下生成floor-N，每层下有room-N和corridor-N，工位ID继续位于对应room层级。重复房间显示名已测试，所有实例ID保持全局唯一。floor的Y均为0，楼层是独立观看层。

| 显式输入 | 实际楼层 | 实际经营房间 | 实际直播工位 | 公共通道单元 | 档位工位上限 |
| --- | --- | --- | --- | --- | --- |
| single-room | 1 | 1 | 2 | 0 | 2 |
| rental-home | 1 | 3 | 2 | 3 | 6 |
| leased-floor | 1 | 10 | 5 | 5 | 20 |
| building-two-floors | 2 | 4 | 4 | 4 | 100 |
| building | 5 | 15 | 10 | 15 | 100 |
| maximum | 5 | 50 | 100 | 25 | 100 |

输入文件位于scripts/company-platform/space-inputs。对应最终布局和门户几何为本目录同名layout.json与portals.json。普通building样例为部分安装，maximum输入显式声明每层十房、每房两个直播工位。

## 布局与连接合同

经营房间为9×7m矩形。多房层最多五列两排，房中心Z为-5或+5，X步距9.2m。公共走廊拆为相接的9.2×3m area单元，独立于经营名额。single-room没有跨房连接。

floor.connections每项有id、from、to，每侧含regionId、edge、offset、width。edge为区域局部north/east/south/west，north对应-Z，south为+Z，offset沿局部+X或+Z。工厂门户宽1.4m，北排房south边接公共通道north边，南排相反，通道单元以east/west边相连。

分析返回每侧local与world的start、end、center、interior，以及world.normal。interior为边界向内0.35m，供root接现有静态placement端点检查。世界门户区间必须完整重合，法向相反，同一门户区间不能重复连接。区域内部不得重叠，所有同层房间及公共通道须处于同一连接图。

实际覆盖错位门户、越界或重叠区域、断开的通道/房间、重复连接、跨floor引用、非法父层级、重复ID、每层11房、每房3工位、全楼101工位以及旋转楼层后的独立世界坐标检查。出错输入保持原样。

## 当前边界

本轮仅CPU层级、资源引用与门户几何。门户开洞显示、障碍影响和连接点静态路径由root继续集成验证。楼梯、电梯、跨层移动、真实角色可达及经营业务均未实现或验证，未运行浏览器/GPU，未修改共享模块或提交Git。
