# 原生Joy单参数的同镜头近景回读

2026-11-17。固定4196 build `83decd027116`，同一房间renderer/灯光/透视相机。输入为已冷开保存的两原生VRM1，baseline SHA `48b08e0548a4ce58298fa1f2cc18b02c79d65b7cb4b0f4a199dffc5019689c8d`，candidate SHA `b839ed1429213a6e4bc1d4db450b358cc2c03effb2da3e5ca405c554f10b113b`，各15,143,100 bytes。原生制作记录称只改Joy眉毛参数100→65，本包核输入SHA并观察渲染，不重做制作或重标旧VRM。

`capture.cjs`复用78912测试的已封loader，SHA `7ff841d8bad5862265fc5145d0118deb02b8f3c90133f21f67c2734204b53b54`。仅在测试bundle表达接口增加0..1显式权重，调用官方expressionManager；相机在renderer调用前固定，避免工作台相机跟随覆盖。两case相机position/target/fov/aspect逐值相同。模拟暂停于共同初始姿态，肩臂保原初始姿态，以隔离眉眼变化；本次没有站走或完整factory接入。原服务、生产runtime和资产未修改。

## 实际观察

已逐张查看两源各5张canvas图和回中性屏图，并查看眉眼原像素裁切对照和两片段各15张代表帧。happy权重1时，新样件眉毛上提幅度较小，两个可见外侧眉段相对baseline较低；权重0.65时同方向差异仍可见。两者happy1都闭眼笑并张口，happy0.65都保留半闭眼和较小张口，未观察到此次眉毛修改造成眼白露出、眉片断开或口腔漂离。

像素读回保存全部原始差异，另列每通道差异大于2的范围以定位主要变化，不将小差异删除或称几何证据。neutral和aa解码像素完全一致。blink共13像素相差1级，肉眼未见变化。happy1主要差异1020像素、bbox `[389,235,644,253]`；happy0.65主要差异749像素、bbox `[389,241,644,258]`，均位于可见眉段。最大通道差分别162/161，属于眉毛移动的边缘像素。全差异bbox也包括远处少量1级差异，见`review-readback.json`。

两段按实际performance.now/RAF用3.5秒执行neutral保持→1秒升至happy1→保持→1秒回neutral→保持，每case记录578次调用，权重回到0。完整正常速度录像分别为`baseline/normal1x.webm`（7.84秒）和`candidate/normal1x.webm`（6.24秒），包含各自加载与静态采集，起始时间不同。未调整播放速率或压缩时间。抽样可见闭眼和眉上提后回到中性，没有观察到回中性残留；回中性屏图已实际查看。4fps抽样不等于逐帧动态验收。

## 范围和恢复

该包证明原生单表达制作结果在同房间相机下产生可见眉毛差异，并在所测neutral/blink/aa未见额外明显变化。没有声明正式审美通过、全部表情/混合正确、说话时序或装备适配通过。额前刘海遮住部分眉段，未见部分不作结论。此次仅test overlay，原actor隐藏、候选自身VRM骨架/表达真实加载，未注册factory/profile、保存配方或发布素材；原许可元数据未改。

重跑需新的独立输出目录，现入口对既存case目录拒覆盖。命令为 `node evidence/vroid-expression-study-v1/runtime-close-v1/capture.cjs`，它固定消费原source SHA和旧loader SHA。本次已运行一次，不需为了封包再采集。GPU/浏览器窗口已释放，CPU读回脚本为`review.py`。
