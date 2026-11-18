# 已发布蒙皮款式的候选登记

素色中筒袜共用 plain-crew-socks-v1 款式 ID。基础女性和基础男性各有自己的装备、适配、原始骨和逆绑定矩阵，每件袜子有 6 个绑定骨和 1,132 个带权重顶点。每条候选的 fitManifest 指向实际身体的源 fit，coverageManifest 的 bodyCoverageMasks 片段为空数组，与装备的 preserveOriginalBody 配套。女性基模自带的腿部表面保留。本次只登记既有资产。

制作端在仓库根目录执行以下命令即可验证正式矩阵和源文件。若需要从另一份矩阵生成候选，追加 --matrix 和 --output 两个路径，输出须为新文件。工具复用现有装备验证器读取 GLB，核对源清单、装备成员、材质文件所带蒙皮、原始骨/权重和鞋、下装的逐件配对。它只接受当前已验证的保留身体、无额外遮罩、仅蒙皮的出版格式。

~~~powershell
python -B scripts/production/register_equipment_style.py --spec assets-source/m2-socks-layer-v1/spec.json --publication prototype/public/assets/m2-socks-layer-v1/manifest.json --label 素色中筒袜
python -B scripts/production/test_register_equipment_style.py -v
node --test prototype/src/character-production-query.test.mjs
~~~

registration.json 保存源输入及真实查询结果。从原有 8 行矩阵两次生成，或者使用当前 10 行矩阵重新生成，三次输出的 SHA-256 完全相同。已验证拒绝不同内容覆盖同一款式、错误 GLB 和修改后的装备成员。运行查询只返回女性 pants-socks，男性 shorts-socks 和 pants-socks；其他身体的可用列表保持原登记。两条候选的批准状态均为 candidate。此包没有进行 GPU 测试。
