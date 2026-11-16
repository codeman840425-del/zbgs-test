# C1原失败定向复核

本轮继续已知显式请求配置gpt-6.1-sol/high，任务难度complex。只复核三项原失败及受影响的桌面承载与局部装配，10项检查全部通过。原始失败保留在initial-report.json。

合法非前缀部件ID现在可正常复制，实际局部修改、设备状态、新旧父子身份及使用点保持独立。桌子替换键盘返回incompatible-replacement，存档椅子槽改键盘返回incompatible-template-part。

以隔离的合成目录元数据输入测试了桌面高度变化、桌面缩小和缺少承载面，均拒绝未适配的附属设备并保持原文档。相同承载契约替换可提交并保留局部编辑。设备安装点浮高或XZ越界被拒绝，合法局部修改在父桌旋转后符合独立计算的世界坐标。

输入SHA和逐项结果见recheck.json，复跑命令为node evidence/company-c1-document-independent-v1/recheck.mjs。本轮未重跑无关busy、CLI或其他已通过范围，未修改产品、提交Git或使用浏览器/GPU。

通过范围为声明承载面上的安装原点高度和XZ边界。完整设备几何是否全部位于桌面上、真实支撑、人物可达与浏览器运行均需相应后续证据。合成目录输入不代表新模型制作通过。实际provider配置与桌面Hook拦截仍未独立验证。
