glTF Validator：顾问独立安装，供agent按需读取现有GLB/VRM

用途：导出文件的轻量格式诊断；不是运行验收，也不是新项目门禁。
官方包：gltf-validator 2.0.0-dev.3.10，Apache-2.0。
安装位于顾问tools目录；package-lock.json锁定官方npm包版本与完整性。
安装命令：npm install --ignore-scripts --no-audit --no-fund
恢复安装：在本目录执行 npm ci --ignore-scripts --no-audit --no-fund
没有修改项目package.json/锁文件、全局Node环境或MCP配置。

日常唯一入口（可从任意工作目录调用）：
node "C:/Users/Administrator/Documents/Codex/2026-11-14/gamemake-advisor/tools/gltf-validator/check.cjs" "F:/gamemake/实际固定资产路径.glb"

支持：自包含二进制GLB及VRM。外部buffer/image依赖暂不支持，明确返回范围错误，避免未检查依赖却误用缓存。检查不改输入文件、不访问远端资源、不启动浏览器/Blender/GPU。
输出：stdout精简JSON，完整JSON写本工具reports目录。包括实际输入SHA256、工具版本、错误/警告/提示、未支持扩展、耗时及报告位置。输入前后比对SHA，变动时报错。
缓存：相同文件内容SHA256＋验证器版本＋检查策略复用旧报告，重复调用不再运行验证器。不以文件名或时间戳当内容身份。缓存仅代表该格式检查，不继承其他版本的视觉/组合/游戏验收。
退出码：0=未发现所支持范围的核心格式错误；1=发现格式错误；2=工具/输入范围错误，或消息截断且没有已报告错误。自动处理须读取status/truncated/scope，不能仅把0当资产全部通过。警告不会单独导致非零退出；保持官方诊断，不隐藏或批量降低严重性。
VRM扩展不在此版本supportedExtensions中，VRM人体/表情/弹簧骨等依然依赖现有检查。轻微穿模和动作自然度不是此工具判断范围。

限定使用方法
1. 只在新增或实际改变导出字节时，替代部分手工格式排障；不为历史全库补跑。本轮三个准确SHA已有报告，无需再核。
2. 不重复实现或执行现有asset_budget、fit、导出复现、浏览器回归；它们解决不同问题。不要增加一层全量检查矩阵。
3. 根据错误是否影响当前生产/加载定位；警告保留，出现实际问题时再判断，不追求零warning。
4. 工具接入不打断当前M2包，不升级项目依赖，不重导出冻结素材；Spector.js本轮未安装。

实测见pilot-2026-11-16/summary.json：
- 固定候选ae36ee9f440f，独立检出HEAD核为b8c20d3b9d53938be88f6285b3042942816b716c。
- 男体62b44b：0 error/16 warning，首次验证99.80ms。
- 女体027bed：0 error/16 warning，验证103.59ms。
- 连体e0cac5：0 error/1 warning，验证8.25ms。
- 男女人体警告涉及旧VRM扩展命名和运行时生成切线；VRM扩展不支持提示也完整保留。连体警告NODE_SKINNED_MESH_NON_ROOT；现阶段只保留诊断，不因新增工具要求重做已验样件。
- 内存中把连体POSITION的accessor索引改成越界值，4.95ms报告UNRESOLVED_REFERENCE，未写坏模型到磁盘。
- 同一连体再次调用缓存命中、报告mtime不变；三个原文件读取前后SHA一致。
耗时仅是本开发机单次验证器调用，不含进程启动/文件读取，不推定普通电脑表现或整个制作效率提升。
pilot.cjs只是本次安装验证留档，不加入项目持续回归，也不要求重跑。
