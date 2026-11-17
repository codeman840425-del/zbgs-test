# 边几生活小物可编辑源

目标规格为 side-table-life-items-v1，四 designId 为 cup、bottle、tissue、pen-notebook。固定功能以 docs/COMPANY-SIDE-TABLE-LIFE-ITEMS-CONTRACT-v1.txt 为准。

original/ 保留 Kenney Food Kit 2.0 原ZIP、CC0 License、cup/soda-bottle原GLB/OBJ/MTL和原512 PNG。cup及杯式笔筒保完整杯体/内腔/把手，瓶保原body/collar/cover装配。原PNG包含渐变，原UV/原opaque材质及sampler保持。纸盒/薄纸、三支笔和A6笔记本属于明确的原创补制，未从旧立书源冒称提取。

parameters.json记录来源和依赖SHA、真实尺寸适配、有限原创recipe与统一提示词。scripts/company-platform/build-side-table-life-items.mjs是生产入口。源几何借GLTFLoader读取，正确变换法线和原TANGENT/UV；PNG按既有公司生产器的4字节对齐BIN/image-bufferView模式嵌入，保其实际字节长度和SHA。原Uint8索引仍按UNSIGNED_BYTE5121保存，不改几何。

运行 node scripts/company-platform/build-side-table-life-items.mjs生产四GLB/resource/collection和CPU报告。附加 --check重建后逐字节比较正式输出，不读写evidence。作为模块import不写文件。

CPU通过局部GLTFLoader纹理占位解析器只读取geometry/UV，报告会明确nativeTextureDecodeChecked=false。它同时核原PNG嵌入字节和原attributes/index拓扑，但不代替真实浏览器纹理解码、UV/原色画面、ImageBitmap生命周期、事务/复制和关闭恢复证据。运行时继续使用既有asset-library/image-ownership。

第二输入 tissue.paperTopY=.125，正式输入=.135，仅改变真实薄折纸几何，其他三GLB字节保持。同输入重复导出字节一致。保before参数/GLB/资源读回。初始杯GLB的Uint8索引分派错误与原失败文件保在production-v1/initial-candidate，修正后文件在corrected-index，不能给原失败改标签。

纸采用.0002m实际薄挤出，从盒内底穿过实槽，保薄纸语义。原源有据的埋入把手/瓶颈接口按实际外壳与接触检查，不强制每个内部edge-component重造为独立闭壳。四款均为静态，不提供液体、开盖、拿取或抽纸状态。普通机、C3和视觉验收各需独立证据。
