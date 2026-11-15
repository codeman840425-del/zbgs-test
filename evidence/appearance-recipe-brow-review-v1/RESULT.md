# 眉样件配方 v2 独立只读复核

2026-11-15。对 `3988ec1` 的眉扩展做有界审查；未修改产品源码、未运行浏览器/GPU、未重复旧嘴宽全矩阵。

**本轮没有发现需要阻断的眉/v1-v2 状态错误。** 13 项 CPU 用例通过。实际调用当前 `appearance-recipe.js` 与 `facial-geometry.js`，使用原男性 VRM 的真实 Face 属性/所有 morph、实际安装配方及真实 `getEquipmentRecipe` 闭包；颜色接口与 await 延迟使用可控 fixture。因此此结果是事务/数据语义证据，不代替女性/男性纹理与 UI 的游戏验收。

## 已核语义

- v2 保存嘴宽、眉样件及两个独立 recipe SHA，保留实际原 base SHA；没有把形变后的几何冒称新源 VRM。
- 合法旧 v1 读取时只把缺省眉解释为 `none`。不修改传入原记录；下一次保存产出 v2。原存储槽仍为 `zbgs:appearance-draft:v1:<bodyType>`，该后缀是槽地址，并非记录 schema。
- v1 携带新眉字段被拒绝；v2 缺眉字段或 `none` 带非空眉身份被拒绝；眉/嘴版本错误不改变已有眉嘴。
- 配方恢复是完整状态恢复，因此旧 v1 会把已有眉样件恢复原位，这是预期读取语义。单项 API 编辑和在 v2 配方中分别置零均保留另一域。
- 颜色失败、服装赋值后 UI 失败都能恢复先前眉嘴、颜色和服装。
- 在几何或颜色等待期间，新的眉请求不会被旧恢复回滚；新的嘴请求保留最新完整参数向量。取消的旧恢复可已完成部分域，这沿用现有 revision 合同，不声称跨 await 的全局原子事务。

## 版本边界

旧 v1 仍须满足当前精确身体、色板、装备资源/绑定等身份要求；没有声称迁移所有历史不完整草稿。新 v2 也不保证可被旧程序读取。错误版本保留当前外观，不能为了“兼容”省略资源校验。

`appearance-workbench.js` 只读核到：恢复前设置 busy，恢复后 sync；眉选择发送 `browSample`，嘴宽复位仅发送 `mouthWidth:0`。本轮未跑 DOM/localStorage/热切换的真实浏览器交互；由 QA 当前固定版任务覆盖，不混为 CPU 已过。

## 重复执行与证据

```powershell
node evidence/appearance-recipe-brow-review-v1/check.mjs
```

- `report.json`：13 项实际函数结果和源码 SHA。
- `source-tested/`：本轮读取的源码冻结副本。
- `appearance-recipe.js` SHA：`728e4c5ee29c5f19841672071721dd35b7fdbf233bc88f19902f6bb3327bc1f1`。
- `facial-geometry.js` SHA：`f35353492151bb7d12d72928b48406d91d7648faf4aa10b470a3479775c7f644`。

没有提交/发布修改；没有后台进程残留。
