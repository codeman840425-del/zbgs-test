# 组件组合与房间操作

实现文件为 `prototype/src/company/document.js`，复跑入口为 `node scripts/company-platform/qa-authoring-operations.mjs`。本轮补齐了工位拆分、一般组件组合和解组、组合复制、房间和公共区域创建与字段编辑、声明材质槽的外观覆写。全部操作仍通过 prepare 独立候选及最终 derive 校验，输入对象保持不变。

## 操作合同

- `unpack-workstation {id}` 删除工位包装，将直接部件重挂房间并保持世界变换。桌面设备继续跟随桌子，所有实际设施 ID、资源、状态和外观保留，移除原工位成员的 stationId 和 partKey。
- `group-facilities {id,parentId,memberIds,transform?,name?}` 创建 assembly。成员可为 facility 或 assembly，选择根之间不得互为祖孙。目标为同楼层、同房间或同公共区域的 floor、room、area、assembly，成员重挂后保持世界变换。模板必需成员需先拆分原工位。父节点在成员内部时拒绝环。
- `unpack-group {id}` 删除组合包装并重挂直接子组件，保留后代局部关系及所有设施世界变换。`copy-group {id,newId,transform?,name?}` 在原父节点下生成独立 ID 的副本，保留内部局部变换、状态、外观和设备依附，生成 ID 会避让已有节点。assembly 不计直播工位容量。
- `add-room` 和 `add-area` 使用 id、parentId、bounds、可选 name/transform，房间另有 purpose，默认 streaming。`set-room {id,name?,purpose?,bounds?}` 只接收列出的直接字段，公共区域仅可改 name/bounds。bounds 保持 width/depth 旧形状，可选 shape=rectangle，尺寸仅支持 3 至 20 米，旧 1 至 100 米范围外输入会得到明确 invalid-bounds。公共区域不占经营房间数量。
- `set-appearance {id,appearance}` 完整替换外观，{} 清空。appearance.materials 是按槽 ID 索引的对象，值只允许 #RRGGBB color 及 0 至 1 的 roughness。槽来自 resource.materialSlots 对象映射，未声明可编辑槽的资源拒绝覆写。真实节点及材质解析由渲染层检查。

## 验证与边界

`report.json` 记录八组有输入 SHA256 的 CPU 验证，覆盖旋转父层下真实世界变换保持、嵌套组合复制、设备依附和独立状态、原子失败、已有 ID 避让、模板保护、跨区域与跨楼层拒绝及 busy 回调拒绝。

原 qa-document 的十五项检查通过。为将证据写入授权目录，使用 `qa-document-snapshot.mjs`，只将原脚本输出目录替换为本目录的 original-qa。原检查逻辑及导入未改，结果见 original-qa/report.json。

外观 CPU 检查使用现有程序资源的两份明确材质槽声明夹具。真实渲染不在本轮验证范围。grouped-example.json 移除夹具外观覆写后以磁盘真实 catalog 再次校验，可供后续预览接入。

未启动浏览器或 GPU，未修改渲染、存档、catalog 或角色模块，未实现 C2 多层连接与算法，未提交 Git。尺寸限制是静态创作输入范围，角色导航、姿态、接触和观感均待 C3 验证。本轮请求配置为 gpt-6.1-sol/high，实际运行模型及宿主 Hook 拦截未获得独立核验。
