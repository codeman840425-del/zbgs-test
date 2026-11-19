# 耳饰版下次启动准备

下次正常启动的工作台配置已指向 `3c15a020d62a`，源提交 `e01413e3a763ee4552fc225bd791a2d5ebd16666`。先前的 `f4966554bcfc` 指针按原字节归档，SHA-256 为 `ab984702f10f78d3322e84ca5a4e3abbfcfb694c2a0d9db50c53f26175468a10`。本轮只运行了监听 OS 临时回环端口的发布服务测试。4196 和 4174 均未访问或操作，固定构建文件保持原样。[新指针](../../../delivery/appearance-workbench.json) · [原指针](../../../delivery/history/appearance-workbench-f4966554bcfc.json)

临时服务验证了根路径跳转、带原参数的跳转、工作台页面、构建响应头和完整构建摘要。旧配置与新配置的 106 条媒体路由状态、类型和长度一致；新图库的七个文件与现有证据逐字节一致。未列文件和路径改写均返回 404，关闭配置开关和用 Windows 目录联接替换白名单中的媒体目录也返回 404。[最终回执](report-02.json)

工作台可从外观区的耳饰下拉选择新款。固定网页没有直达该组录像的链接。待正常启动获准且新配置生效后，可访问同一 4196 服务的 `/reviews/paired-ear-style/`；本轮没有开启公开入口。[耳饰操作与录像说明](../README.md)

```powershell
python -B evidence/m2-paired-ear-game-v1/next-start/verify.py evidence/m2-paired-ear-game-v1/next-start/report-repeat.json
```
