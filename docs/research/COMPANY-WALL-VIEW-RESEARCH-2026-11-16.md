# 公司多墙体观看纠正

用户明确否定所有墙统一显示成矮围栏。旧实现把2.8m物理墙的显示缩到18%（约0.504m），并裁切挂墙物；这只是方便测试看家具，不能作为建筑观看交付。旧失败画面保留在 `evidence/company-mixed-preview-dev-v1/03-floor-1.png`。

## 查证的游戏做法与技术边界

- [EA官方客服：The Sims 4墙体观看](https://forums.ea.com/discussions/the-sims-4-gameplay-en/invisible-wall-problems-/8639777)：当前查看楼层有完整、剖切和隐藏墙体选项，观看选择与房屋实际结构分开。
- [The Sims 4官方手册](https://eaassets-a.akamaihd.net/eahelp/manuals/the-sims-4-ps4-na.pdf)，第11页和第15页：俯视、楼层切换、墙体剖切是独立观看操作。该手册不公开具体遮挡算法，不能据此声称采用了游戏内部实现。
- [原The Sims架构设计文档](https://donhopkins.com/home/TheSimsDesignDocuments/Ch09-Architecture.pdf)，Views章节：室内查看关注目标可见性，提出动态剖切并将室内外、楼层、屋顶显示区分；具体算法当时仍待定。这是历史设计意图，不是现行Sims4实现证据。
- [Unity官方Cinemachine Deoccluder文档](https://docs.unity.cn/Packages/com.unity.cinemachine%403.1/api/Unity.Cinemachine.CinemachineDeoccluder.html)：其主要办法是调整相机以保持目标视线。当前楼层需要固定构图，因此不直接照搬自动移动相机。

## 当前工程采用的最小方案

完整墙始终保留2.8m几何和原变换。默认自动剖切按当前相机至被查看房间内部的视线判断遮挡，隐藏相关墙段；其余墙段保持全高。房间聚焦围绕该房间，楼层总览围绕当前层的房间与公共区域。共享墙两侧和挂墙物必须同步处理，不能留下背面的重复墙或悬空挂画。另提供完整墙体选项以检查建筑比例。

这是本工程依据上述观看原则选择的简化算法，不宣称是任何商业游戏的同款算法。首版使用明确隐藏，暂不增加全场半透明、复杂摄影或玩家装修编辑器。镜头变化只改显示，不能改布局、阻挡、通路、设施身份、设备状态或接触资源。

本轮需实际查看：三房公共厅整层、多房聚焦、相反方向镜头、完整墙体与自动剖切来回切换；并比较所有物理及保存数据。真实人物动态遮挡沿C3集中联调，不用静态房间采样冒充人物遮挡已经通过。
