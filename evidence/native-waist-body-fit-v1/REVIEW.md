# Waist数据制作回执

真实Waist源、原生masked导出、旧Top遮罩与新三衣已核。manifest为46a868dd…，规则仅top覆盖、bottom/shoes不覆盖；固定新avatar cf1574，不替换旧Face身份。Body像素/UV/消费者与130骨绑定均实际读回。raw鞋底与官方loader rest分开量测，结果和方法在源包floor-readback.json。

一次生成后，重复build与--check实际bytes/mtime不变；末项输出冲突整批无其它写入；错源hash拒绝，临时测试资源已清理。源码、参数和所有数据位于assets-source/native-vroid-waist-body-texture-fit-v1，JSON固定LF。首个不正确的原JSON相等断言（texCoord显式/默认）失败保留，未写出资产；未放宽有效UV0与identity要求。

本包只交CPU生产输入；没有新增控制器、runtime准入、GPU、Studio或任何视觉/动作接触通过。衣物与体形是本Waist原生同源；同遮罩并不保证动作不穿模。完整pins见closure.json和package-files.json。
