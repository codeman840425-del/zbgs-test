# 公司 C1 存档独立复查

定点 CPU 复查通过。首轮失败及输入 SHA256 已保留在 initial-failure-report.json、INITIAL-REVIEW.md，原 report.json 同样保留首轮结果。当前修复验证记录见 recheck-report.json。

复跑命令为 `node evidence/company-c1-persistence-independent-v1/recheck.mjs`，工作目录为 F:/gamemake-company-platform-c1。运行前后校对五个产品输入文件的 SHA256，输入保持一致。

- 同一存储适配器的两个 store 实例，以真实 SHA256 完成延迟复现 save/import 四种前后组合。全部使用相同 revision 的不同有效文档，旧操作均返回 revision-conflict，仅后发操作写入一次，恢复内容保持后发文档。
- 两个不同公司 ID 并发保存保持独立，均成功写入及回读。
- scale 和 kind 输入 toString、constructor、__proto__ 均得到对应 unsupported-scale 或 unsupported-kind，原有效字节及写入次数保持不变。
- 正常保存、同 revision 有效导入、独立新 store 回读保持完整文档与独立设备状态。公司身份错误、损坏 JSON 和同版本依赖内容变化均拒绝且保留原存档。

本轮未发现需要继续修正的上述 CPU 路径缺陷。只新增及修改本证据目录文件，未修改产品或提交 Git。

浏览器关闭重开和实际调用端时序仍未验证。测试覆盖同一模块实例、同一适配器对象，多标签页同时编辑属于实现已声明的支持边界之外。本轮未启动浏览器或 GPU。请求配置为 gpt-6.1-sol/high，实际运行模型、思考深度及宿主 Hook 拦截未取得独立核验。
