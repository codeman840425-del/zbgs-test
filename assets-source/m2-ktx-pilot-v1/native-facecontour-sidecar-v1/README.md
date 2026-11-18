# FaceContour KTX2 发布旁车 v1

这是两份新 FaceContour 身体的 source-only Body map 压缩候选。它由仓库根目录的
`python scripts/m2-ktx-pilot-v1/prepare-facecontour-sidecar.py --encode`
从已锁定的 `body.vrm` 重新提取并生成；脚本会核对 body、coverage、材质、UV、采样器和 alpha 身份。

旁车保留原 VRM 及 PNG/Canvas 回退，不改写 VRM、不修改运行时 loader，也不改变工作台入口。Face、虹膜、眉和头发继续使用原 PNG。每个候选仍绑定自己的 body SHA，即使两份 Body PNG 与 KTX2 字节相同也不能合并身份。

当前证据只覆盖源提取、KTX validate/info 和重复编码哈希一致性。浏览器 loader 接入、染色/Canvas、资源释放、GPU 驻留、普通电脑、动作和人工视觉检查尚未通过；在这些证据完成前，旁车不能清除准入闸门的预算或表面任务。
