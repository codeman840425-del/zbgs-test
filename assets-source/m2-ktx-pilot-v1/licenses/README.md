# 工具许可快照

编码工具固定 KhronosGroup/KTX-Software v4.4.2，提交4d6fc70eaf62ad0558e63e8d97eb9766118327a6。官方发行包本地保存于 tools，摘要在上一级 manifest。LICENSE.md、完整顶层 LICENSES、REUSE.toml 与实际 Basis Universal/Zstd/ASTC 声明一并保留。source-snapshots.json 记录逐文件来源、SHA和下载失败。

KTX 项目主体采用 Apache-2.0。Basis Universal 采用 Apache-2.0，随包 Zstd 许可为 BSD，ASTC 编码器采用 Apache-2.0。上游同时包含其他许可证以及 Ericsson etcdec 的专有 SLA，原文保留在 LICENSES/LicenseRef-ETCSLA.txt，对应原源码仅保留在忽略的 tools/license-source-etcdec.cxx。完整工具按官方发行包及这些声明保存。运行浏览器转码器继续采用项目 Three0.187.0 随包版本和对应声明，由运行实验记录。

首次 GitHub releases API 请求返回403 rate limit，使用公开 release/expanded_assets 的摘要和官方发行下载替代。最初按 LICENSE.md 旧路径读取 .reuse/dep5、lib/etcdec.cxx 和 external/zstd/LICENSE 返回404。随后读取锁定提交的实际树，取得 REUSE.toml、external/etcdec/etcdec.cxx 及 external/basisu/zstd/LICENSE，原失败记录保留。这些请求未使用账户凭据。
