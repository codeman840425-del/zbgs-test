# 038 男性长裤/短裤：受影响时钟边界实际回归

两套都实际加载固定038341558517原男性 `beta-base-male-m1b`，身体SHA `62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff`。原脚本硬编码女性及裙装，不支持body参数；独立副本 `scripts/qa-refresh-boundary-male.cjs` 仅改明确男性身份、pants0/shorts2及男性无裙手接触层的适用检查。未改产品或原女性脚本。

- 长裤0与短裤2各10任务检查全部通过：站起请求与重复请求不提前重置时钟、首tick消费动作、真实起身结束完成、随后走动完成、once舞开始与唯一完成等。
- 两装的approach、seated、rise-end、dance-end四边界，第一次refresh(0)和重复refresh(0)的左右前臂/腕世界位置最大差均严格0；动作、动作时钟、舞时钟、simulationTime、phase保持不变。
- 起身末、舞末raw→full冷重建位移均0，重复冷重建也为0；重置后未残留seed。两次pageerror均0，真实装扮开始/结束（reset前）均为指定index。
- 男性profile没有seatHandRadii，本次明确要求其handContacts为空；不是把女性两个校准手接触seed检查当作男性已通过。没有测男性皮肤×服装或衣服自然度。

原始实际状态与身份分别在pants/report.json、shorts/report.json。脚本每套执行后关闭Chrome及临时HTTP服务；没有重复全矩阵/录像/性能检查。

```
node scripts/run-fixed-check.cjs experiments/m1-hand-release-integrated-v1/dist scripts/qa-refresh-boundary-male.cjs 038341558517 <新目录> pants
node scripts/run-fixed-check.cjs experiments/m1-hand-release-integrated-v1/dist scripts/qa-refresh-boundary-male.cjs 038341558517 <另一新目录> shorts
```

## 038既有完整片抽帧

只顺序解码现有 `related-video/sit-rise-turn-technical.webm`，4fps全时段77帧、7页全部逐张审看（review/000–006.jpg）。坐入坐稳、起身、360转身、走到空地、技术舞和回idle完整，抽样帧未见新大幅肩腕翻折或人物位置突跳。裙在坐姿仍呈较硬的形状，不能据这套room小角色图判服装自然；毫米级手跳和单帧时序问题也不能由4fps排除。本结论是工程抽帧观察，不是正常速度连续观看或用户观感接受。
