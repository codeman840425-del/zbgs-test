# 2.14 退役记录

用户明确授权在2.16已跑通后移除2.14。实际先用旧MCP另存 male-native-base-retirement.vroid，确认保存成功与非空文件，保存全部有效源文件的 SHA，再调用 exit(discard)。没有使用旧插件存在保存失败仍退出风险的 exit(save)。

官方卸载器目标严格限定 experiments/tools/vroid-2.14.0/app/unins000.exe，返回0。复查卸载注册仅剩2.16；旧17890/17891监听已消失；新7811仍可通过原 stdio MCP 返回 ready/currentFile/dirty=false。有效原生源、2.16原版及在用Bridge副本均保留。

递归删除三个残留工具目录的命令被自动审批策略拒绝，返回 blocked by policy。未改用其他删除机制绕过。before.json 是卸载前体积，不是已释放空间；after.json 明确剩余目录仍存在。待执行策略允许时再完成残留清理，不能称全部清理完成。

保留 retired-bepinex.log、uninstall.log、卸载退出码、源文件清单、实际状态回执。它们只记录工具生命周期，不改变历史2.14制作成功事实，也不把旧source的读回结果冒充2.16通过。
