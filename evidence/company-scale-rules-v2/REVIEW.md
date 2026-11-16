# 民房准入收尾

按用户最新收敛决定，最终产品变更仅为 document.js 容量表新增 small-home，允许 1 层、1 间经营房，沿用房内最多 2 工位的原上界。实际新住宅配置由目录代理的 c2-small-home.json 提供，面积 6 × 5.25 = 31.5 平方米，初始 1 工位。

曾进入工作树的 16 房、动态楼层和公共区工厂改动已撤回。space.js 当前 SHA256 为 cb1f98b56cf6da0a5cdf47e5a3697a74c807045289b2c35a646819001c6ce336，与原 company-space-v1 记录完全相同。原工厂继续消费原有技术输入，旧 10 房、5 层 50 房 / 100 工位规则保留。后续尺度要求由根目录设计记录管理。

复跑 `node evidence/company-scale-rules-v2/check-small-home.mjs`。四项必要检查通过，覆盖真实新住宅的准入、静态摆放、连接与 encode/decode 回读，超经营房数量原子拒绝，旧最大布局保持，以及移除 small-home 单行后 document.js 与已验证外观合同版本字节一致。report.json 保存输入摘要和未变检查。

工位 2 是继承的容量上界，实际样例只验证初始 1 工位。本包未新增楼层、公共空间或老板内容，未运行 GPU/浏览器，未提交 Git。
