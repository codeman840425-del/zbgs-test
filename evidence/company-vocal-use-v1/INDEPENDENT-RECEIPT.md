# 唱播双房独立接收与再发布边界

融合接收方核验了固定构建 `c2263e74556c` 的原清单 `2f36e3dc92939fdb93f4c99902196ed6b5e7ec4312cceecb7f48c1237d073c57`。2,160 项文件齐全，独立构建的 607 项查看器文件逐字节一致。两房站位、旋转后的局部变换、实际音头、阻挡与旧椅房回归均有独立实测。真实角色接入由总工验收。[融合接收记录](F:/gamemake-test/native-studio-round/independent/vocal-use-c2263/RECEIPT.md)

同一工作室存档做了两个独立修改，一份删除站位声明，另一份把眼位参考值从 1.640 米改到 1.645 米。原包编辑入口及携带原批次的重封入口均能查出差异。按独立新作接收同样的裸存档时，两份都能生成完整包。第一份命名工作室缺少用点清单，而默认工作室仍有自己的清单。第二份命名工作室根据新眼位生成清单。两份成品的文件完整性校验都通过。历史构建的清单没有按房声明是否继承既有站位合同。[带来源的实测](F:/gamemake-test/native-studio-round/independent/vocal-use-c2263/gates/author-replay/report.json) · [删声明的裸档](F:/gamemake-test/native-studio-round/independent/vocal-use-c2263/gates/declaration-entry-controls/remove-vocal-declaration.json) · [改眼位的裸档](F:/gamemake-test/native-studio-round/independent/vocal-use-c2263/gates/declaration-entry-controls/change-authoritative-eye-reference.json)

当前角色包只接已经固定的椅房。交接唱播时，应以所选命名房的存档、槽位和来源为准。房间编辑中空闲麦架旋转后可以保存；完整唱播发布还要验读谱视角、拾音、门路和取景。已有 0.10 米平移通过完整测量，独立 90° 旋转可验证槽位跟随，完整唱播测量以相应布置的发布结果为准。

本机复核的独立原始数据摘要为 `e9c2206a0c60d466b1953ec6bce2c0a2715cb97c5ad1b37f7634b3a79874fa68`，带来源回执摘要为 `885ca6e9b02df396207e973ba01a533dabfcd9d800a0e2c057a5dafc06b5723e`。删声明及改眼点两份裸档测试回执摘要分别为 `c15e20a7f32bc6b717cf7bcde0773e45964bf5816b583297ae651081154cdb7b` 与 `6b6658b37d00f17e1a0c052ff9283a3c7f27430a4c6df0910e9ba5cac33c590b`。
