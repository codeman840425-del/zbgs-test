# 两份 FaceContour 身体的运行时预算与头部挂点审查

两份完整角色记录已经包含各自 body SHA、三件装备的 SHA、麦克风握姿与口端 fit、眼镜镜腿 fit，以及可供关闭恢复的完整资源清单。现有运行时可以按 body SHA 自动检查这些身份。麦克风口端是每个最终身体独立测量的 32 点 FaceMouth seam 和 AA 位移。两份身体的 1,093 个手部引用三角及其 POSITION、JOINTS、WEIGHTS、逆绑定和 rest 依赖与握姿参考一致。眼镜 profile 已按最终 body SHA 登记，状态仍是 `fitted-candidate` 且 `verified=false`。

静态预算已用现有只读工具重新计算。

```text
python -B scripts/production/record_budget.py measure evidence/m2-native-batch-runtime-seam-v1/native-records-budget-input.json --source-root . --budget-version m2-technical-v1
```

结果 SHA-256 为 `d9c331d1164f3872d0444a22d8a2c63b56de95241874ad4d4d42c3dae1df9b6b`。两份记录均为 `over-budget`。每个选中造型估算约 20,330,3xx 文件字节、211,466,920 RGBA8 mip 字节和 40 个纹理对象。身体模型超出顶点、三角形、skin joint、纹理、SpringBone 和 collider 门槛。三件装备超出 jointSlots 或 maxJointsPerSkin 门槛，麦克风模型超出 primitive 门槛。普通电脑性能仍未测量。

可由共同契约自动检查的内容包括 body/accessory/profile SHA、资源字节长度、记录 `resourceIdentities`、麦克风握姿及口端来源、眼镜镜腿 profile 和三件装备绑定。每个身体仍需要浏览器 1×站姿和坐姿的镜框接触与发丝间隙、麦克风握持和口端朝向、讲话及坐姿接触、关闭重开后的 fit SHA 回读。预算超限和 `verified=false` 均没有被自动提升为视觉通过。
