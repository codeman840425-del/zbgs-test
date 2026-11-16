# C2完整依赖移交入口

实现为scripts/company-platform/package-company.mjs，打包模板位于scripts/company-platform/package-template。复用已知显式请求gpt-6.1-sol/high，difficulty complex，理由为安全文件边界、完整固定依赖和脱离原项目继续编辑。实际provider配置及桌面Hook拦截未独立验证。

```text
node scripts/company-platform/package-company.mjs FIXED_DIST BUILD_ID SAVE_OR_BATCH_RESULT OUT_NEW_DIR --source FIXED_SOURCE_ROOT
node scripts/company-platform/qa-package.mjs
```

--source可省略，缺省为工具所在工作树。SAVE_OR_BATCH_RESULT可为完整company-save、company-layout文件或四文件批次结果目录。OUT_NEW_DIR必须是新目录，既有目录直接拒绝。完成所有验证后在同父目录stage写全、逐文件sync与SHA核对、复查源码摘要，再以目录rename发布。普通失败清理stage与锁，强制进程终止留下的锁需检查其所有权后处理。

## 包内容

- viewer保存固定dist全部允许文件及对应company-assets，记录每个原始运行文件SHA。
- data保存原始输入、完整全部楼层save/layout和运行时实际完整catalog/templates，原批次四文件逐字节保留。
- source/prototype保存构建manifest列出的精确原始输入，包括全部company模块/数据、公司HTML与Vite配置、公司build-id脚本、package.json和锁文件。
- source/assets-source及source/scripts/company-platform保存使用中的模型参数、参数README、固定来源pin的generator、目录生成器、company CLI、batch、所有batch/space JSON输入及本打包工具与模板。
- source额外按精确路径收build-home-examples.mjs及两份公司制作标准/空间设计说明，当前home examples本身沿构建manifest复制。设计说明保留后续产品思路语义。
- 顶层README、serve.mjs、edit.mjs与transfer-manifest.json提供HTTP观看、全部模板版本下继续编辑和逐文件核验。

工具不带node_modules。package.json保持固定输入身份，移交README提供company专用重建命令。角色资产与原工程历史/evidence目录不进入包。

## 固定身份与边界

company-build-info.json只有输入路径和聚合摘要，工具按原构建算法重算path、NUL、原始bytes、NUL的SHA256，严格核对输入集合与BUILD_ID。每个源文件SHA另记入transfer manifest。runtime的所有company-assets必须和对应固定源字节一致。所有catalog内GLB和源参数/generator/功能合同来源的实际SHA均须符合资源声明。

保存使用固定preview.js实际导入的catalog/templates解码，因而支持templates-extended里的v2。任何楼层引用都保留，收集资源时没有当前楼层筛选。符号链接/junction、路径穿越、无关runtime文件、坏save pin、缺运行资源、缺固定源和已有输出均拒绝。

顶层edit.mjs使用包内实际完整catalog/templates与原始document、placement和persistence模块。它可验证save并把可选操作应用为新的完整layout/save目录。原始输入及固定viewer保持其既有身份。

## 实际证据

report.json记录14项CPU检查，全部通过。正例使用隔离源与实际Vite编译的明确minimal CPU viewer夹具，没有把生产dist重标为夹具。完整包有两层存档及template@2，包内全GLB、固定运行字节、producer参数和generator均经过实际SHA核对。

在这14项之后按根代理要求增加home示例生成器和两份精确文档路径，并同步CPU夹具复制清单。本次只读取和核对新增三文件的实际SHA，没有重复完整CPU套件，结果记录additional-source-files.json。最终生产打包会按相同copy/hash逻辑实际收这三项。

包内edit.mjs在脱离原工作目录且没有node_modules时完成验证和状态修改，仍保两层与template@2。实际拒绝检查包括错源码摘要、非当前楼层GLB缺失、明确的源GLB缺失路径、错误generator来源pin、manifest路径穿越、junction、无关角色runtime哨兵、错save依赖pin和既有输出保原。原四文件批次输入也实际打包并核对原字节。

当前实际production dist已是d372885f8ef0，请求81060c5d434c时得到package-build-mismatch，记录于live-production-identity.json。首轮夹具错误地假定dist仍为81060，报告保留initial-live-dist-fixture-report.json，后续据实际身份修正。隔离夹具另外实际验证source-digest不符的拒绝。

## 根代理后续步骤

根代理需完成最终生产源码冻结和独立构建，再以该固定source/dist及相符save执行本工具。随后验证源码重建字节一致和脱离原项目的真实浏览器加载/继续编辑。

本轮没有运行浏览器/GPU或干净npm ci。CPU构建使用当前已安装库，包内没有复制这些库。新机器无网安装依赖未测，HTTP观看按包内README执行。没有修改共享公司/角色模块、提交Git或联系总工。
