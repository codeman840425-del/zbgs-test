# 公司配置与共享角色接缝

本目录是公司场景数据、设施实例和显示资源的所有者。人物移动、坐起、身体适配、行为任务和占用仍由既有角色平台执行。当前 C1 代码以首包固定源码 `c4b799d131dcb372ab3a740bff81e817a95ec626` 为基线；下述数据与 Three CPU 检查不代表真实角色已经接通。

## Agent 制作入口

在仓库根目录执行，输出文件必须尚不存在：

```powershell
node scripts/company-platform/company.mjs create output/company.json
node scripts/company-platform/company.mjs validate output/company.json
node scripts/company-platform/company.mjs apply output/company.json changes.json output/company-edited.json
```

示例 `examples/c1-two-stations.json` 包含两个独立组合工位，每个含桌、椅、显示器、键盘、桌面麦克风和补光系统。设备的父节点是桌子，椅子和灯是工位子节点。设施款式在 `facility-catalog.json`，组合定义在 `templates.json`；保存数据绑定明确 ID 与版本。

操作数组支持 `add-workstation`、`add-facility`、`copy-workstation`、`move`、`remove`、`replace-resource`、`set-state`。`document.js` 先在副本执行整组操作，检查后返回新文档；失败不修改输入。替换必须匹配模板部件角色、使用点与安装面。资源不足、身份/归属错误、越界或重叠等返回 `CompanyError.code/path/details`。

当前坐标为米制、Y 向上，实例 transform 为 position 与 Y 轴 90° 倍数 yaw；不支持实例缩放、倾斜或负缩放。C1 使用 9×7m 矩形单房与已验证 0.47m 座高。纯数据允许的 1–100m bounds 不是全部已验证的角色导航支持范围；任意房间尺寸、通路和多层的正式准入由 C2 实测收敛。

## 给总工的接缝

`createCompanyScene(world, document)` 只向既有 Three world 添加环境，不创建人物或推进时钟。共享运行入口持有一个实例：

- `resolveUsePoint(id)` 返回 `{id,facilityId,floorId,chair,chairSeat,chairBack,seatHeight,footprint,...}`。接触网格是真实 Mesh，`chair` 为设施局部基点；局部前向 +Z，当前椅实例按工位旋转 π 后面向桌子。世界朝向应读取世界变换，不直接取嵌套节点的局部 `rotation.y`。
- `listUsePoints()` 列出实际当前楼层使用点。首两个稳定 ID 为 `station-1/chair#seat` 与 `station-2/chair#seat`。
- `navigation()` 返回 `{floorId,floors,obstacles,regions}`。障碍携带实例 ID、真实物体和世界 x/z/hw/hd，区域携带世界 transform、矩形 bounds 与导航 inset；来自与显示及使用点相同的实例数据。
- `prepareChange(ops, guards)` 在场景外构造完整候选，`commit(handle, guards)` 在提交瞬间再次检查修订与真实占用。必须传 `isUsePointBusy(id)`，数据源为总工的既有 `seatLeases.forSeat(id)`。不用另造占用表。
- `discard(handle)` 清理未采用候选；`dispose()` 清理当前及所有候选。无关屏幕状态修改保留被角色持有的原座面对象，恢复后旧候选不能覆盖新状态。
- `save()/restore()` 是校验后的纯文档序列化与显示恢复；持久化交换文件使用 `persistence.js` 的带资源和模板内容摘要的 `company-save@1` 封装。恢复整场景时现有忙碌点拒绝，角色/任务/占用不从旧存档盲目重建。

总工需在原 `CharacterScene` 上扩展指定 `payload.usePointId` 的 sit 请求，并在原任务/租约中保持使用点身份。所选点应一致用于接近、坐稳、接触、实际离位及释放；两个角色不得共享一个全局 chair。设施配置提交后，既有导航执行者刷新障碍并重算受影响路径；公司模块不移动角色。

默认旧房间与 `room-chair-1` 可继续兼容。新模式的 `floor/chair` 引用来自本 provider，不再叠放旧房间。接入/共享 main.js、角色控制器和最终固定集成提交由总工负责；公司模块及 QA 在本独立树继续。

## 当前限制及证据

`qa-document.mjs`、`qa-render.mjs`、`qa-persistence.mjs` 是数据/实际 Three 对象/存储适配器的 CPU 检查。独立报告保留初次缺陷及定向修复证据。当前仍需真实男女对两个工位的使用、争用/取消/离位、游戏中变更及浏览器关闭重开。

补光暂定最多两个无阴影 SpotLight，屏幕状态改变真实材质；这是运行结构，不是 C3 已测灯光预算或角色受光结论。填充灯当前是程序灰盒，不计独立新模型生产闭环。C2 的房门连通、观看切层与规模准入，C3 的真实新素材、模板显式升级和成本移交继续按简报实现。
